/* eslint-disable func-names */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiState } from '@/context/ai-state-context';
import { useSubtitle } from '@/context/subtitle-context';
import { useChatHistory } from '@/context/chat-history-context';
import { audioTaskQueue } from '@/utils/task-queue';
import { audioManager } from '@/utils/audio-manager';
import { toaster } from '@/components/ui/toaster';
import { useWebSocket } from '@/context/websocket-context';
import { DisplayText } from '@/services/websocket-service';
import { useLive2DExpression } from '@/hooks/canvas/use-live2d-expression';
import * as LAppDefine from '../../../WebSDK/src/lappdefine';

interface AudioTaskOptions {
  audioBase64: string
  volumes: number[]
  sliceLength: number
  displayText?: DisplayText | null
  expressions?: string[] | number[] | null
  speaker_uid?: string
  forwarded?: boolean
  turnId?: string
}

interface UseAudioTaskOptions {
  managePlaybackCompletion?: boolean
}

const TOOL_STATUS_ONLY_RE = /^\s*(?:<tool>\s*)?\[[^\]]+\]\s*(?:<\/tool>\s*)?$/i;

const isDisplayOnlyToolStatus = (options: AudioTaskOptions): boolean => {
  if (options.audioBase64 || !options.displayText?.text) {
    return false;
  }
  return TOOL_STATUS_ONLY_RE.test(options.displayText.text);
};

/**
 * Custom hook for handling audio playback tasks with Live2D lip sync
 */
export const useAudioTask = ({ managePlaybackCompletion = false }: UseAudioTaskOptions = {}) => {
  const { t } = useTranslation();
  const { aiState, backendSynthComplete, setBackendSynthComplete } = useAiState();
  const { setSubtitleText } = useSubtitle();
  const { appendResponse, appendAIMessage } = useChatHistory();
  const { sendMessage } = useWebSocket();
  const { setExpression } = useLive2DExpression();

  // State refs to avoid stale closures
  const stateRef = useRef({
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  });
  const isMountedRef = useRef(true);
  const backendSynthCompleteRef = useRef(backendSynthComplete);
  const playbackCompleteAckInFlightRef = useRef(false);
  const currentTurnIdRef = useRef<string | null>(null);

  stateRef.current = {
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  };
  backendSynthCompleteRef.current = backendSynthComplete;

  /**
   * Stop current audio playback and lip sync (delegates to global audioManager)
   */
  const stopCurrentAudioAndLipSync = useCallback(() => {
    audioManager.stopCurrentAudioAndLipSync();
  }, []);

  /**
   * Handle audio playback with Live2D lip sync
   */
  const handleAudioPlayback = (options: AudioTaskOptions): Promise<void> => new Promise((resolve) => {
    const {
      aiState: currentAiState,
      setSubtitleText: updateSubtitle,
      appendResponse: appendText,
      appendAIMessage: appendAI,
    } = stateRef.current;

    if (currentAiState === 'interrupted') {
      console.warn('Audio playback blocked by interruption state.');
      resolve();
      return;
    }

    const { audioBase64, displayText, expressions, forwarded, turnId } = options;
    const isToolStatus = isDisplayOnlyToolStatus(options);

    if (displayText) {
      const renderedText = displayText.text;
      appendText(renderedText);
      appendAI(renderedText, displayText.name, displayText.avatar);

      if (audioBase64 || isToolStatus) {
        updateSubtitle(renderedText);
      }

      if (turnId) {
        currentTurnIdRef.current = turnId;
      }

      // Only real audio playback should be reported as playback start.
      if (!forwarded && audioBase64) {
        console.log(`[PLAYBACK] notifying backend audio task accepted: ${renderedText}`);
        sendMessage({
          type: 'audio-play-start',
          display_text: displayText,
          forwarded: true,
          turn_id: turnId,
        });
      }
    }

    try {
      if (audioBase64) {
        if (expressions?.[0] !== undefined) {
          setExpression(
            expressions[0],
            undefined,
            `Queued transient expression: ${expressions[0]}`,
          );
        }

        const audioDataUrl = `data:audio/wav;base64,${audioBase64}`;
        const live2dManager = (window as any).getLive2DManager?.();
        if (!live2dManager) {
          console.error('Live2D manager not found');
          resolve();
          return;
        }

        const model = live2dManager.getModel(0);
        if (!model) {
          console.error('Live2D model not found at index 0');
          resolve();
          return;
        }
        console.log('Found model for audio playback');

        if (!model._wavFileHandler) {
          console.warn('Model does not have _wavFileHandler for lip sync');
        } else {
          console.log('Model has _wavFileHandler available');
        }

        if (LAppDefine && LAppDefine.PriorityNormal) {
          console.log("Starting random 'Talk' motion");
          model.startRandomMotion(
            'Talk',
            LAppDefine.PriorityNormal,
          );
        } else {
          console.warn("LAppDefine.PriorityNormal not found - cannot start talk motion");
        }

        // A real audio segment should immediately replace the temporary tool-status layer.
        if (displayText) {
          updateSubtitle(displayText.text);
        }

        const audio = new Audio(audioDataUrl);
        audioManager.setCurrentAudio(audio, model);
        let isFinished = false;

        const cleanup = () => {
          audioManager.clearCurrentAudio(audio);
          if (!isFinished) {
            isFinished = true;
            resolve();
          }
        };

        const lipSyncScale = 2.0;

        audio.addEventListener('canplaythrough', () => {
          if (stateRef.current.aiState === 'interrupted' || !audioManager.hasCurrentAudio()) {
            console.warn('Audio playback cancelled due to interruption or audio was stopped');
            cleanup();
            return;
          }

          audio.play()
            .then(() => {
              console.log(`[PLAYBACK] audio element began audible playback: ${displayText?.text ?? ''}`);
              sendMessage({
                type: 'audio-play-began',
                display_text: displayText ?? undefined,
                forwarded: true,
                turn_id: turnId,
              });
            })
            .catch((err) => {
              console.error('Audio play error:', err);
              cleanup();
            });

          if (model._wavFileHandler) {
            if (!model._wavFileHandler._initialized) {
              console.log('Applying enhanced lip sync');
              model._wavFileHandler._initialized = true;

              const originalUpdate = model._wavFileHandler.update.bind(model._wavFileHandler);
              model._wavFileHandler.update = function (deltaTimeSeconds: number) {
                const result = originalUpdate(deltaTimeSeconds);
                // @ts-ignore
                this._lastRms = Math.min(2.0, this._lastRms * lipSyncScale);
                return result;
              };
            }

            if (audioManager.hasCurrentAudio()) {
              model._wavFileHandler.start(audioDataUrl);
            } else {
              console.warn('WavFileHandler start skipped - audio was stopped');
            }
          }
        });

        audio.addEventListener('ended', () => {
          console.log(`[PLAYBACK] audio element completed: ${displayText?.text ?? ''}`);
          cleanup();
        });

        audio.addEventListener('error', (error) => {
          console.error('Audio playback error:', error);
          cleanup();
        });

        audio.load();
      } else {
        resolve();
      }
    } catch (error) {
      console.error('Audio playback setup error:', error);
      toaster.create({
        title: `${t('error.audioPlayback')}: ${error}`,
        type: 'error',
        duration: 2000,
      });
      resolve();
    }
  });

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  useEffect(() => {
    if (!managePlaybackCompletion) {
      return;
    }
    if (!backendSynthComplete || playbackCompleteAckInFlightRef.current) {
      return;
    }

    playbackCompleteAckInFlightRef.current = true;

    void (async () => {
      try {
        await audioTaskQueue.waitForCompletion();
        if (!isMountedRef.current || !backendSynthCompleteRef.current) {
          return;
        }
        stopCurrentAudioAndLipSync();
        console.log('[PLAYBACK] frontend completed all queued audio for current turn');
        sendMessage({ type: 'frontend-playback-complete', turn_id: currentTurnIdRef.current || undefined });
        backendSynthCompleteRef.current = false;
        setBackendSynthComplete(false);
      } finally {
        playbackCompleteAckInFlightRef.current = false;
      }
    })();
  }, [
    backendSynthComplete,
    managePlaybackCompletion,
    sendMessage,
    setBackendSynthComplete,
    stopCurrentAudioAndLipSync,
  ]);

  /**
   * Add a new audio task to the queue
   */
  const addAudioTask = async (options: AudioTaskOptions) => {
    const { aiState: currentState } = stateRef.current;

    if (currentState === 'interrupted') {
      console.log('Skipping audio task due to interrupted state');
      return;
    }

    // Tool status should show up immediately, but it should not block or impersonate audio playback.
    if (isDisplayOnlyToolStatus(options)) {
      console.log(`[PLAYBACK] showing tool status immediately: ${options.displayText?.text}`);
      await handleAudioPlayback(options);
      return;
    }

    console.log(`[PLAYBACK] queueing audio task: ${options.displayText?.text}`);
    audioTaskQueue.addTask(() => handleAudioPlayback(options));
  };

  return {
    addAudioTask,
    appendResponse,
    stopCurrentAudioAndLipSync,
  };
};
