import { Box, Text } from '@chakra-ui/react';
import { memo, useEffect, useRef, useState } from 'react';
import { petBubbleStyles } from './electron-style';

const fontFace = new FontFace('Zihun Buding', 'url(/fonts/ZihunBuding.ttf)');
fontFace.load().then((loaded) => {
  document.fonts.add(loaded);
}).catch((err) => {
  console.warn('Failed to load Zihun Buding font:', err);
});

interface PetBubbleProps {
  text?: string;
}

export const PetBubble = memo(({ text }: PetBubbleProps) => {
  const [sentences, setSentences] = useState<string[]>([]);
  const [animKey, setAnimKey] = useState(0);
  const prevTextRef = useRef('');

  useEffect(() => {
    if (!text) {
      setSentences([]);
      prevTextRef.current = '';
      return;
    }

    const prev = prevTextRef.current;
    if (text.startsWith(prev) && text.length > prev.length) {
      const newPart = text.slice(prev.length);
      setSentences((s) => [...s, newPart]);
    } else if (text !== prev) {
      setSentences([text]);
    }
    prevTextRef.current = text;
    setAnimKey((k) => k + 1);
  }, [text]);

  const current = sentences[sentences.length - 1];
  const collapsed = sentences.length > 1 ? sentences[sentences.length - 2] : null;

  if (!current) return null;

  return (
    <Box {...petBubbleStyles.container}>
      {collapsed && (
        <Text {...petBubbleStyles.collapsedText} truncate>
          {collapsed}
        </Text>
      )}
      <Text key={animKey} {...petBubbleStyles.text}>
        {current}
      </Text>
    </Box>
  );
});

PetBubble.displayName = 'PetBubble';
