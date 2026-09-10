import { useCallback } from 'react';
import { useWebSocket } from '@/context/websocket-context';
import { useMediaCapture } from './use-media-capture';

export function useTriggerSpeak() {
  const { sendMessage } = useWebSocket();
  const { captureAllMedia } = useMediaCapture();

  const sendTriggerSignal = useCallback(
    async () => {
      const images = await captureAllMedia();
      sendMessage({
        type: "ai-speak-signal",
        images,
      });
    },
    [sendMessage, captureAllMedia],
  );

  return {
    sendTriggerSignal,
  };
}
