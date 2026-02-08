/* eslint-disable react/require-default-props */
import {
  Box,
  Textarea,
  IconButton,
  HStack,
  Image,
} from '@chakra-ui/react';
import { BsMicFill, BsMicMuteFill, BsPaperclip, BsX } from 'react-icons/bs';
import { IoHandRightSharp } from 'react-icons/io5';
import { FiChevronDown } from 'react-icons/fi';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InputGroup } from '@/components/ui/input-group';
import {
  DialogRoot,
  DialogContent,
  DialogCloseTrigger,
  DialogBody,
} from '@/components/ui/dialog';
import { footerStyles } from './footer-styles';
import AIStateIndicator from './ai-state-indicator';
import { useFooter } from '@/hooks/footer/use-footer';

const MIN_THUMBNAIL_SIZE = 32;
const MAX_THUMBNAIL_SIZE = 72;
const THUMBNAIL_GAP = 8;
const REMOVE_BUTTON_RATIO = 0.34;
const MAX_ATTACHMENTS = 20;

interface FooterProps {
  isCollapsed?: boolean
  onToggle?: () => void
}

interface ToggleButtonProps {
  isCollapsed: boolean
  onToggle?: () => void
}

interface ActionButtonsProps {
  micOn: boolean
  onMicToggle: () => void
  onInterrupt: () => void
}

interface MessageInputProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
  onAttachFiles: (files: FileList | null) => void
  attachedCount: number
}

const ToggleButton = memo(({ isCollapsed, onToggle }: ToggleButtonProps) => (
  <Box
    {...footerStyles.footer.toggleButton}
    onClick={onToggle}
    color="whiteAlpha.500"
    style={{
      transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
    }}
  >
    <FiChevronDown />
  </Box>
));

ToggleButton.displayName = 'ToggleButton';

const ActionButtons = memo(({ micOn, onMicToggle, onInterrupt }: ActionButtonsProps) => (
  <HStack gap={2}>
    <IconButton
      bg={micOn ? 'green.500' : 'red.500'}
      {...footerStyles.footer.actionButton}
      onClick={onMicToggle}
    >
      {micOn ? <BsMicFill /> : <BsMicMuteFill />}
    </IconButton>
    <IconButton
      aria-label="Raise hand"
      bg="yellow.500"
      {...footerStyles.footer.actionButton}
      onClick={onInterrupt}
    >
      <IoHandRightSharp size="24" />
    </IconButton>
  </HStack>
));

ActionButtons.displayName = 'ActionButtons';

const MessageInput = memo(({
  value,
  onChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onAttachFiles,
  attachedCount,
}: MessageInputProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Box flex={1} minW="clamp(280px, 42vw, 760px)" display="flex" flexDirection="column" gap="2">
      <InputGroup>
        <Box position="relative" width="100%">
          <IconButton
            aria-label="Attach file"
            variant="ghost"
            {...footerStyles.footer.attachButton}
            onClick={() => fileInputRef.current?.click()}
          >
            <BsPaperclip size="24" />
          </IconButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(event) => {
              onAttachFiles(event.target.files);
              event.target.value = '';
            }}
            aria-label={t('footer.attachFile')}
          />
          <Textarea
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            placeholder={t('footer.typeYourMessage')}
            {...footerStyles.footer.input}
          />
          {attachedCount > 0 && (
            <Box
              position="absolute"
              top="2"
              right="2"
              fontSize="xs"
              color="whiteAlpha.700"
            >
              {t('footer.attachmentsCount', { count: attachedCount, max: MAX_ATTACHMENTS })}
            </Box>
          )}
        </Box>
      </InputGroup>
    </Box>
  );
});

MessageInput.displayName = 'MessageInput';

function Footer({ isCollapsed = false, onToggle }: FooterProps): JSX.Element {
  const { t } = useTranslation();
  const {
    inputValue,
    handleInputChange,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    handleAttachFiles,
    attachedImages,
    handleRemoveAttachment,
    handleInterrupt,
    handleMicToggle,
    micOn,
  } = useFooter();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const thumbnailSize = useMemo(() => {
    const count = Math.max(attachedImages.length, 1);
    const minimumInputWidth = Math.max(320, Math.floor(viewportWidth * 0.28));
    const estimatedRailWidth = Math.max(240, viewportWidth - minimumInputWidth - 300);
    const availableWidth = Math.max(estimatedRailWidth, 180);
    const totalGapWidth = THUMBNAIL_GAP * (count - 1);
    const size = Math.floor((availableWidth - totalGapWidth) / count);
    return Math.min(MAX_THUMBNAIL_SIZE, Math.max(MIN_THUMBNAIL_SIZE, size));
  }, [attachedImages.length, viewportWidth]);

  const removeButtonSize = Math.max(14, Math.floor(thumbnailSize * REMOVE_BUTTON_RATIO));

  return (
    <Box {...footerStyles.footer.container(isCollapsed, attachedImages.length > 0)}>
      <ToggleButton isCollapsed={isCollapsed} onToggle={onToggle} />

      <Box pt="0" px="4">
        {attachedImages.length > 0 && (
          <Box
            width="100%"
            minW="0"
            bg="gray.700"
            borderRadius="12px"
            px="3"
            py="2"
            mb="3"
            overflowX="hidden"
          >
            <HStack gap={`${THUMBNAIL_GAP}px`} flexWrap="nowrap" align="center">
              {attachedImages.map((image, index) => (
                <Box
                  key={`${image.data}-${index}`}
                  position="relative"
                  borderRadius="md"
                  overflow="hidden"
                  border="1px solid"
                  borderColor="whiteAlpha.300"
                  cursor="zoom-in"
                  role="button"
                  tabIndex={0}
                  flex={`0 0 ${thumbnailSize}px`}
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
                    alt={t('footer.attachFile')}
                    boxSize={`${thumbnailSize}px`}
                    objectFit="cover"
                  />
                  <IconButton
                    aria-label={t('footer.removeAttachment')}
                    w={`${removeButtonSize}px`}
                    h={`${removeButtonSize}px`}
                    minW={`${removeButtonSize}px`}
                    p="0"
                    fontSize={`${Math.max(10, Math.floor(removeButtonSize * 0.66))}px`}
                    position="absolute"
                    top="1"
                    right="1"
                    borderRadius="full"
                    bg="blackAlpha.700"
                    color="whiteAlpha.900"
                    _hover={{ bg: 'blackAlpha.800' }}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemoveAttachment(index);
                    }}
                  >
                    <BsX />
                  </IconButton>
                </Box>
              ))}
            </HStack>
          </Box>
        )}
        <HStack width="100%" gap={4} align="flex-start">
          <Box flexShrink={0}>
            <Box mb="1.5">
              <AIStateIndicator />
            </Box>
            <ActionButtons
              micOn={micOn}
              onMicToggle={handleMicToggle}
              onInterrupt={handleInterrupt}
            />
          </Box>

          <MessageInput
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onAttachFiles={handleAttachFiles}
            attachedCount={attachedImages.length}
          />
        </HStack>
      </Box>
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
                alt={t('footer.previewAttachment')}
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

export default Footer;
