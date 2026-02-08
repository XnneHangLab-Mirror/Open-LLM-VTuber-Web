import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocket } from '@/context/websocket-context';
import { useAiState } from '@/context/ai-state-context';
import { useInterrupt } from '@/components/canvas/live2d';
import { useChatHistory } from '@/context/chat-history-context';
import { useVAD } from '@/context/vad-context';
import { toaster } from '@/components/ui/toaster';
import { useMediaCapture } from '@/hooks/utils/use-media-capture';
import { ImagePayload } from '@/types/media';

const MAX_ATTACHMENTS = 20;

export function useTextInput() {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [attachedImages, setAttachedImages] = useState<ImagePayload[]>([]);
  const wsContext = useWebSocket();
  const { aiState } = useAiState();
  const { interrupt } = useInterrupt();
  const { appendHumanMessage } = useChatHistory();
  const { stopMic, autoStopMic } = useVAD();
  const { captureAllMedia } = useMediaCapture();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  };

  const readFileAsDataUrl = useCallback((file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  }), []);

  const handleAttachFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_ATTACHMENTS - attachedImages.length;
    if (remainingSlots <= 0) {
      toaster.create({
        title: t('error.maxAttachmentsExceeded', { max: MAX_ATTACHMENTS }),
        type: 'warning',
        duration: 2500,
      });
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toaster.create({
        title: t('error.maxAttachmentsExceeded', { max: MAX_ATTACHMENTS }),
        type: 'warning',
        duration: 2500,
      });
    }

    const newImages: ImagePayload[] = [];
    for (const file of filesToProcess) {
      if (!file.type.startsWith('image/')) {
        toaster.create({
          title: t('error.unsupportedFileType'),
          type: 'error',
          duration: 2000,
        });
        continue;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        newImages.push({
          source: 'upload',
          data: dataUrl,
          mime_type: file.type || 'image/*',
        });
      } catch (error) {
        console.error('Failed to read attachment:', error);
        toaster.create({
          title: t('error.failedReadFile', { filename: file.name }),
          type: 'error',
          duration: 2000,
        });
      }
    }

    if (newImages.length > 0) {
      setAttachedImages((prev) => [...prev, ...newImages]);
    }
  }, [attachedImages.length, readFileAsDataUrl, t]);

  const handleSend = async () => {
    if (!wsContext) return;
    if (!inputText.trim() && attachedImages.length === 0) return;
    if (aiState === 'thinking-speaking') {
      interrupt();
    }

    const images = [...(await captureAllMedia()), ...attachedImages];
    const trimmedText = inputText.trim();
    const messageText = trimmedText || (images.length > 0 ? t('sidebar.imageMessage') : '');

    if (messageText) {
      appendHumanMessage(messageText, images);
    }
    wsContext.sendMessage({
      type: 'text-input',
      text: trimmedText,
      images,
    });

    if (autoStopMic) stopMic();
    setInputText('');
    setAttachedImages([]);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposing) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);

  const handleRemoveAttachment = useCallback((indexToRemove: number) => {
    setAttachedImages((prev) => prev.filter((_, index) => index !== indexToRemove));
  }, []);

  return {
    inputText,
    setInputText: handleInputChange,
    handleSend,
    handleAttachFiles,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    attachedImages,
    handleRemoveAttachment,
  };
}
