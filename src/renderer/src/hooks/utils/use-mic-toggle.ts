import { useVAD } from '@/context/vad-context';
import { useAiState } from '@/context/ai-state-context';
import { useConfig } from '@/context/character-config-context';
import { toaster } from '@/components/ui/toaster';

export function useMicToggle() {
  const { startMic, stopMic, micOn } = useVAD();
  const { aiState, setAiState } = useAiState();
  const { asrEnabled } = useConfig();

  const handleMicToggle = async (): Promise<void> => {
    if (micOn) {
      stopMic();
      if (aiState === 'listening') {
        setAiState('idle');
      }
    } else {
      if (!asrEnabled) {
        toaster.create({
          title: 'ASR 未启用，无法使用语音输入',
          type: 'warning',
          duration: 3000,
        });
        return;
      }
      await startMic();
    }
  };

  return {
    handleMicToggle,
    micOn,
  };
}
