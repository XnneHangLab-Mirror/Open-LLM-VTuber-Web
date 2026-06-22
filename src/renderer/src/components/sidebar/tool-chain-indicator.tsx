import React, { useState } from 'react';
import { Box, Flex, Text, Icon, Spinner } from '@chakra-ui/react';
import { FaTools, FaCheck, FaTimes, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import type { Message } from '@/services/websocket-service';

interface ToolChainIndicatorProps {
  tools: Message[];
}

function formatArgs(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return Object.entries(parsed)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
  } catch {
    return content.length > 60 ? content.slice(0, 60) + '...' : content;
  }
}

function StatusIcon({ status }: { status: string | undefined }) {
  if (status === 'running') return <Spinner size="xs" color="blue.300" />;
  if (status === 'completed') return <Icon as={FaCheck} color="green.300" boxSize="12px" />;
  if (status === 'error') return <Icon as={FaTimes} color="red.300" boxSize="12px" />;
  return null;
}

export default function ToolChainIndicator({ tools }: ToolChainIndicatorProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const allCompleted = tools.every((t) => t.status === 'completed');
  const hasError = tools.some((t) => t.status === 'error');
  const uniqueTools = [...new Set(tools.map((t) => t.tool_name).filter(Boolean))];

  const summaryColor = hasError ? 'red.300' : allCompleted ? 'whiteAlpha.600' : 'blue.300';

  return (
    <Box
      pl="44px"
      my="1"
      width="100%"
      borderRadius="md"
    >
      <Flex
        align="center"
        gap={2}
        cursor="pointer"
        onClick={() => setExpanded(!expanded)}
        _hover={{ bg: 'whiteAlpha.100' }}
        borderRadius="md"
        px="2"
        py="1"
      >
        <Icon
          as={expanded ? FaChevronDown : FaChevronRight}
          boxSize="10px"
          color="whiteAlpha.500"
        />
        <Icon as={FaTools} boxSize="13px" color={summaryColor} />
        <Text fontSize="xs" color={summaryColor} fontStyle="italic">
          {uniqueTools.length === 1
            ? uniqueTools[0]
            : `Used ${uniqueTools.length} tools`}
        </Text>
        {!allCompleted && <Spinner size="xs" color="blue.300" />}
      </Flex>

      {expanded && (
        <Box
          ml="6"
          mt="1"
          pl="3"
          borderLeftWidth="2px"
          borderLeftColor="whiteAlpha.200"
        >
          {tools.map((tool) => (
            <Flex key={tool.id} align="center" gap={2} py="0.5">
              <StatusIcon status={tool.status} />
              <Text fontSize="xs" color="whiteAlpha.800" fontWeight="medium">
                {tool.tool_name}
              </Text>
              {tool.content && (
                <Text fontSize="xs" color="whiteAlpha.500" truncate maxW="280px">
                  {formatArgs(tool.content)}
                </Text>
              )}
            </Flex>
          ))}
        </Box>
      )}
    </Box>
  );
}
