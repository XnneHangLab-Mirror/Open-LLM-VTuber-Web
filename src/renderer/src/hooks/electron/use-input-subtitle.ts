import { ChangeEvent, KeyboardEvent, useMemo } from 'react';
import { useChatHistory } from '@/context/chat-history-context';
import { useVAD } from '@/context/vad-context';
import { useMicToggle } from '@/hooks/utils/use-mic-toggle';
import { useTextInput } from '@/hooks/footer/use-text-input';
import { useAiState, AiStateEnum } from '@/context/ai-state-context';
import { useInterrupt } from '@/hooks/utils/use-interrupt';

export function useInputSubtitle() {
  const {
    inputText: inputValue,
    setInputText: handleChange,
    handleKeyPress: handleKey,
    handleCompositionStart,
    handleCompositionEnd,
    handleSend,

  } = useTextInput();

  const { messages } = useChatHistory();
  const { startMic, autoStartMicOn } = useVAD();
  const { handleMicToggle, micOn } = useMicToggle();
  const { aiState, setAiState } = useAiState();
  const { interrupt } = useInterrupt();

  const lastAIMessage = messages
    .filter((msg) => msg.role === 'ai' && msg.type !== 'tool_call_status')
    .slice(-1)
    .map((msg) => msg.content)[0];

  const hasAIMessages = messages.some((msg) => msg.role === 'ai' && msg.type !== 'tool_call_status');

  const toolCallMessages = useMemo(() => {
    const toolMsgs = messages.filter((msg) => msg.type === 'tool_call_status');
    if (toolMsgs.length === 0) return [];
    const lastTextIdx = messages.reduce(
      (acc, msg, i) => (msg.role === 'ai' && msg.type !== 'tool_call_status' ? i : acc), -1
    );
    return toolMsgs.filter((_, i) => {
      const realIdx = messages.indexOf(toolMsgs[i]);
      return realIdx > lastTextIdx;
    });
  }, [messages]);

  const handleInterrupt = () => {
    interrupt();
    if (autoStartMicOn) {
      startMic();
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleChange({ target: { value: e.target.value } } as ChangeEvent<HTMLInputElement>);
    setAiState(AiStateEnum.WAITING);
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    handleKey(e as any);
  };

  return {
    inputValue,
    handleInputChange,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    handleInterrupt,
    handleMicToggle,
    lastAIMessage,
    hasAIMessages,
    toolCallMessages,
    aiState,
    micOn,
    handleSend,
  };
}
