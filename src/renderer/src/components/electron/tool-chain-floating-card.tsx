import React, { useState, useEffect, useRef } from 'react';
import { Box, Flex, Text, Spinner } from '@chakra-ui/react';
import type { Message } from '@/services/websocket-service';

interface ToolChainFloatingCardProps {
  tools: Message[];
}

export default function ToolChainFloatingCard({ tools }: ToolChainFloatingCardProps): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasRunning = tools.some((t) => t.status === 'running');

  useEffect(() => {
    if (tools.length === 0) return;

    setVisible(true);
    setFading(false);

    if (fadeTimer.current) clearTimeout(fadeTimer.current);

    if (!hasRunning) {
      fadeTimer.current = setTimeout(() => {
        setFading(true);
        setTimeout(() => setVisible(false), 600);
      }, 2500);
    }

    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [tools.length, hasRunning]);

  if (!visible || tools.length === 0) return null;

  const uniqueNames = [...new Set(tools.map((t) => t.tool_name).filter(Boolean))];

  return (
    <Box
      position="relative"
      mb="2"
      display="flex"
      justifyContent="center"
      opacity={fading ? 0 : 1}
      transition="opacity 0.6s ease-out"
    >
      <Flex
        align="center"
        gap={2}
        px="3"
        py="1.5"
        bg="blackAlpha.600"
        backdropFilter="blur(6px)"
        borderRadius="lg"
        boxShadow="sm"
      >
        {hasRunning ? (
          <Spinner size="xs" color="blue.300" />
        ) : (
          <Text fontSize="xs" color="green.300">&#x2713;</Text>
        )}
        <Text fontSize="xs" color="whiteAlpha.800">
          {uniqueNames.length === 1
            ? uniqueNames[0]
            : `${uniqueNames.length} tools`}
        </Text>
      </Flex>
    </Box>
  );
}
