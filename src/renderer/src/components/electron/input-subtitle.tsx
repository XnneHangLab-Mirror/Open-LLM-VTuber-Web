import {
  LuBell, LuSend, LuMic, LuMicOff, LuHand, LuX, LuMonitor,
} from 'react-icons/lu';
import {
  Box,
  Button,
  Flex,
  Input,
  Stack,
  Text,
  IconButton,
} from '@chakra-ui/react';
import { useState, useEffect, useCallback } from 'react';
import { useInputSubtitle } from '@/hooks/electron/use-input-subtitle';
import { useDraggable } from '@/hooks/electron/use-draggable';
import { inputSubtitleStyles } from './electron-style';
import { useMode } from '@/context/mode-context';
import { useMood } from '@/context/mood-context';
import { PetBubble } from './pet-bubble';
import { ScreenRecordControls } from '@/components/sidebar/screen-record-controls';
import { useScreenRecording } from '@/context/screen-record-context';
import ToolChainFloatingCard from './tool-chain-floating-card';

function getMoodPresentation(score: number) {
  if (score >= 90) {
    return { emoji: '😊', label: 'excited' };
  }
  if (score >= 80) {
    return { emoji: '🙂', label: 'normal' };
  }
  if (score >= 60) {
    return { emoji: '😔', label: 'low' };
  }
  return { emoji: '😶', label: 'silent' };
}

export function InputSubtitle() {
  const {
    inputValue,
    handleInputChange,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    handleInterrupt,
    handleMicToggle,
    handleSend,
    lastAIMessage,
    hasAIMessages,
    toolCallMessages,
    aiState,
    micOn,
  } = useInputSubtitle();

  const { mode } = useMode();
  const { moodScore } = useMood();
  const isPet = mode === 'pet';
  const mood = getMoodPresentation(moodScore);
  const moodDescription = `Mood: ${mood.label} (${moodScore})`;

  const {
    elementRef,
    isDragging,
    handleMouseDown,
    handleMouseEnter,
    handleMouseLeave,
  } = useDraggable({
    componentId: 'input-subtitle',
  });

  const [isVisible, setIsVisible] = useState(true);
  const [showRecording, setShowRecording] = useState(false);
  const { state: recordingState } = useScreenRecording();

  const handleClose = useCallback(() => {
    if (isPet) {
      (window.api as any)?.updateComponentHover('input-subtitle', false);
    }
    setIsVisible(false);
  }, [isPet]);

  const handleOpen = () => {
    setIsVisible(true);
  };

  useEffect(() => {
    if (isPet) {
      const cleanup = (window.api as any)?.onToggleInputSubtitle(() => {
        if (isVisible) {
          handleClose();
        } else {
          handleOpen();
        }
      });
      return () => cleanup?.();
    }
    return () => {};
  }, [handleClose, isPet, isVisible]);

  useEffect(() => {
    (window as any).inputSubtitle = {
      open: handleOpen,
      close: handleClose,
    };

    return () => {
      delete (window as any).inputSubtitle;
    };
  }, [isPet, handleClose]);

  if (!isVisible) return null;

  return (
    <Box
      ref={elementRef}
      {...inputSubtitleStyles.container}
      {...inputSubtitleStyles.draggableContainer(isDragging)}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {toolCallMessages.length > 0 && (
        <ToolChainFloatingCard tools={toolCallMessages} />
      )}

      <Box {...inputSubtitleStyles.box}>
        <IconButton
          aria-label="Close subtitle"
          onClick={handleClose}
          {...inputSubtitleStyles.closeButton}
        >
          <LuX size={12} />
        </IconButton>

        {hasAIMessages && (
          <PetBubble text={lastAIMessage} />
        )}

        <Box {...inputSubtitleStyles.statusBox}>
          <Flex align="center" justify="space-between" color="whiteAlpha.700">
            <Flex align="center" gap="2">
              <LuBell size={16} />
              <Text {...inputSubtitleStyles.statusText}>
                {aiState}
              </Text>
              <Text
                {...inputSubtitleStyles.statusText}
                lineHeight="1"
                title={moodDescription}
                aria-label={moodDescription}
              >
                {mood.emoji}
              </Text>
              <Text
                {...inputSubtitleStyles.statusText}
                lineHeight="1"
                aria-hidden="true"
              >
                {moodScore}
              </Text>
            </Flex>

            <Flex gap="2">
              <Button
                aria-label="屏幕记录控制"
                title={recordingState?.recording ? `屏幕记录中，剩余 ${recordingState.remaining_seconds ?? 0} 秒` : '屏幕记录控制'}
                aria-expanded={showRecording}
                onClick={() => setShowRecording((shown) => !shown)}
                {...inputSubtitleStyles.iconButton}
                fontFamily="inherit"
                fontSize="sm"
                fontWeight="normal"
                color={recordingState?.recording ? 'red.300' : 'whiteAlpha.900'}
                bg={recordingState?.recording ? 'red.950' : 'whiteAlpha.100'}
                px="2"
                gap="1"
              >
                <LuMonitor size={16} />
                {recordingState?.recording ? '记录中' : '记录'}
              </Button>
              <IconButton
                aria-label="Toggle microphone"
                onClick={handleMicToggle}
                {...inputSubtitleStyles.iconButton}
              >
                {micOn ? <LuMic size={16} /> : <LuMicOff size={16} />}
              </IconButton>
              <IconButton
                aria-label="Interrupt"
                onClick={handleInterrupt}
                {...inputSubtitleStyles.iconButton}
              >
                <LuHand size={16} />
              </IconButton>
            </Flex>
          </Flex>
        </Box>

        {showRecording && <ScreenRecordControls />}

        <Box {...inputSubtitleStyles.inputBox}>
          <Stack direction="row" gap="2" p="2">
            <Input
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              placeholder="Type your message..."
              {...inputSubtitleStyles.input}
            />
            <Button
              onClick={handleSend}
              {...inputSubtitleStyles.sendButton}
            >
              <LuSend size={16} />
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
