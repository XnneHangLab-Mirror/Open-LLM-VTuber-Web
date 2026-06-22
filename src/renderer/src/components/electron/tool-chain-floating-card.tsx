import { useState, useEffect, useRef } from 'react';
import { Box, Flex, Text, Spinner } from '@chakra-ui/react';
import type { Message } from '@/services/websocket-service';

interface ToolChainFloatingCardProps {
  tools: Message[];
}

export default function ToolChainFloatingCard({ tools }: ToolChainFloatingCardProps): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cachedTools = useRef<Message[]>([]);

  const hasRunning = tools.some((t) => t.status === 'running');

  useEffect(() => {
    if (tools.length > 0) {
      cachedTools.current = tools;
      setVisible(true);
      setFading(false);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);

      if (!hasRunning) {
        fadeTimer.current = setTimeout(() => {
          setFading(true);
          setTimeout(() => {
            setVisible(false);
            cachedTools.current = [];
          }, 600);
        }, 2500);
      }
    } else if (cachedTools.current.length > 0 && !fadeTimer.current) {
      fadeTimer.current = setTimeout(() => {
        setFading(true);
        setTimeout(() => {
          setVisible(false);
          cachedTools.current = [];
        }, 600);
      }, 2500);
    }

    return () => {
      if (fadeTimer.current) {
        clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }
    };
  }, [tools.length, hasRunning]);

  const displayTools = tools.length > 0 ? tools : cachedTools.current;
  if (!visible || displayTools.length === 0) return null;

  const latestByTool = new Map<string, Message>();
  for (const t of displayTools) {
    if (t.tool_name) latestByTool.set(t.tool_name, t);
  }
  const entries = [...latestByTool.values()];

  return (
    <Box
      mb="2"
      display="flex"
      justifyContent="center"
      opacity={fading ? 0 : 1}
      transition="opacity 0.6s ease-out"
    >
      <Flex
        direction="column"
        gap={1}
        px="3"
        py="1.5"
        bg="blackAlpha.600"
        backdropFilter="blur(6px)"
        borderRadius="xl"
        boxShadow="md"
      >
        {entries.map((t) => (
          <Flex key={t.tool_name} align="center" gap={2}>
            {t.status === 'running' ? (
              <Spinner size="xs" color="blue.300" />
            ) : (
              <Text fontSize="xs" color="green.300">&#x2713;</Text>
            )}
            <Text fontSize="xs" color="whiteAlpha.800">
              {t.tool_name}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}
