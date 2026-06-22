/* eslint-disable function-paren-newline */
/* eslint-disable react/jsx-one-expression-per-line */
/* eslint-disable no-trailing-spaces */
/* eslint-disable no-nested-ternary */
/* eslint-disable import/order */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable react/require-default-props */
import React, { useEffect, useState, useMemo } from 'react';
import { Box, Spinner, Flex, Text, Icon, Image } from '@chakra-ui/react';
import { sidebarStyles, chatPanelStyles } from './sidebar-styles';
import { MainContainer, ChatContainer, MessageList as ChatMessageList, Message as ChatMessage, Avatar as ChatAvatar } from '@chatscope/chat-ui-kit-react';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import { useChatHistory } from '@/context/chat-history-context';
import { Global } from '@emotion/react';
import { useConfig } from '@/context/character-config-context';
import { useWebSocket } from '@/context/websocket-context';
import { FaTools, FaCheck, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import {
  DialogRoot,
  DialogContent,
  DialogCloseTrigger,
  DialogBody,
} from '@/components/ui/dialog';
import ToolChainIndicator from './tool-chain-indicator';
import type { Message } from '@/services/websocket-service';

type GroupedItem =
  | { kind: 'message'; msg: Message }
  | { kind: 'tool_group'; tools: Message[] };

function groupMessages(msgs: Message[]): GroupedItem[] {
  const result: GroupedItem[] = [];
  let toolBuf: Message[] = [];

  for (const msg of msgs) {
    if (msg.type === 'tool_call_status') {
      toolBuf.push(msg);
    } else {
      if (toolBuf.length > 0) {
        result.push({ kind: 'tool_group', tools: toolBuf });
        toolBuf = [];
      }
      result.push({ kind: 'message', msg });
    }
  }
  if (toolBuf.length > 0) {
    result.push({ kind: 'tool_group', tools: toolBuf });
  }
  return result;
}

// Main component
function ChatHistoryPanel(): JSX.Element {
  const { t } = useTranslation();
  const { messages } = useChatHistory(); // Get messages directly from context
  const { confName } = useConfig();
  const { baseUrl } = useWebSocket();
  const userName = "Me";
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const validMessages = messages.filter((msg) => msg.content || // Keep messages with content
     (msg.images && msg.images.length > 0) || // Keep messages with images
     (msg.type === 'tool_call_status' && msg.status === 'running') || // Keep running tools
     (msg.type === 'tool_call_status' && msg.status === 'completed') || // Keep completed tools
     (msg.type === 'tool_call_status' && msg.status === 'error'), // Keep error tools
  );

  const grouped = useMemo(() => groupMessages(validMessages), [validMessages]);

  return (
    <Box
      h="full"
      overflow="hidden"
      bg="gray.900"
    >
      <Global styles={chatPanelStyles} />
      <MainContainer>
        <ChatContainer>
          <ChatMessageList>
            {validMessages.length === 0 ? (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                height="100%"
                color="whiteAlpha.500"
                fontSize="sm"
              >
                {t('sidebar.noMessages')}
              </Box>
            ) : (
              grouped.map((item) => {
                if (item.kind === 'tool_group') {
                  const groupKey = item.tools.map((t) => t.id).join('-');
                  return <ToolChainIndicator key={groupKey} tools={item.tools} />;
                }
                const msg = item.msg;
                // Render Standard Chat Message (human or ai text)
                const hasImages = msg.images && msg.images.length > 0;
                const messageText = msg.content || (hasImages ? t('sidebar.imageMessage') : '');
                return (
                  <ChatMessage
                    key={msg.id}
                    model={{
                      message: hasImages ? '' : messageText,
                      sentTime: msg.timestamp,
                      sender: msg.role === 'ai'
                        ? (msg.name || confName || 'AI')
                        : userName,
                      direction: msg.role === 'ai' ? 'incoming' : 'outgoing',
                      position: 'single',
                    }}
                    avatarPosition={msg.role === 'ai' ? 'tl' : 'tr'}
                    avatarSpacer={false}
                  >
                    <ChatAvatar>
                      {msg.role === 'ai' ? (
                        msg.avatar ? (
                          <img
                            src={`${baseUrl}/avatars/${msg.avatar}`}
                            alt="avatar"
                            style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              const fallbackName = msg.name || confName || 'A';
                              target.outerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border-radius: 50%; background-color: var(--chakra-colors-blue-500); color: white; font-size: 14px;">${fallbackName[0].toUpperCase()}</div>`;
                            }}
                          />
                        ) : (
                          (msg.name && msg.name[0].toUpperCase()) ||
                            (confName && confName[0].toUpperCase()) ||
                            'A'
                        )
                      ) : (
                        userName[0].toUpperCase()
                      )}
                    </ChatAvatar>
                    {hasImages && (
                      <ChatMessage.CustomContent>
                        <Box mt="2" display="flex" flexDirection="column" gap="2">
                          <Box display="flex" flexWrap="wrap" gap="2">
                            {msg.images?.map((image, index) => (
                              <Box
                                key={`${msg.id}-image-${index}`}
                                borderRadius="md"
                                overflow="hidden"
                                border="1px solid"
                                borderColor="whiteAlpha.300"
                                cursor="zoom-in"
                                role="button"
                                tabIndex={0}
                                onClick={() => setPreviewImage(image.data)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setPreviewImage(image.data);
                                  }
                                }}
                              >
                                <Image
                                  src={image.data}
                                  alt={t('sidebar.imageMessage')}
                                  boxSize="128px"
                                  objectFit="cover"
                              />
                            </Box>
                          ))}
                          </Box>
                          {msg.content && (
                            <Text fontSize="sm" color="whiteAlpha.900" whiteSpace="pre-wrap">
                              {msg.content}
                            </Text>
                          )}
                        </Box>
                      </ChatMessage.CustomContent>
                    )}
                  </ChatMessage>
                );
              })
            )}
          </ChatMessageList>
        </ChatContainer>
      </MainContainer>
      <DialogRoot
        open={Boolean(previewImage)}
        onOpenChange={(details) => {
          if (!details.open) {
            setPreviewImage(null);
          }
        }}
      >
        <DialogContent bg="gray.900" maxW="80vw" w="fit-content">
          <DialogCloseTrigger />
          <DialogBody p="4">
            {previewImage && (
              <Image
                src={previewImage}
                alt={t('sidebar.previewImage')}
                maxH="80vh"
                maxW="80vw"
                objectFit="contain"
              />
            )}
          </DialogBody>
        </DialogContent>
      </DialogRoot>
    </Box>
  );
}

export default ChatHistoryPanel;
