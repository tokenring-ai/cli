import {Box, Text, useInput} from 'ink';
import React, {useEffect, useState} from 'react';
import {useAbortSignal} from "../../../hooks/useAbortSignal.ts";
import {useResponsiveLayout} from "../../hooks/useResponsiveLayout.ts";
import {theme} from '../../../theme.ts';
import type {TextInputProps} from "./types.ts";

export default function TextInput({ question, onResponse, signal }: TextInputProps) {
  const layout = useResponsiveLayout();
  const [lines, setLines] = useState<string[]>(['']);
  const [currentLine, setCurrentLine] = useState(0);

  useAbortSignal(signal, () => onResponse(null));

  useInput((input, key) => {
    if (key.escape) {
      onResponse(null);
      return;
    }

    if (key.ctrl && input === 'd') {
      onResponse(lines.join('\n'));
      return;
    }

    if (key.return) {
      setLines([...lines, '']);
      setCurrentLine(currentLine + 1);
      return;
    }

    if (key.backspace || key.delete) {
      const newLines = [...lines];
      if (newLines[currentLine].length > 0) {
        newLines[currentLine] = newLines[currentLine].slice(0, -1);
      } else if (currentLine > 0) {
        newLines.splice(currentLine, 1);
        setCurrentLine(currentLine - 1);
      }
      setLines(newLines);
      return;
    }

    if (input) {
      const newLines = [...lines];
      newLines[currentLine] = (newLines[currentLine] || '') + input;
      setLines(newLines);
    }
  });

  if (layout.minimalMode) {
    return (
      <Box>
        <Text color={theme.chatSystemWarningMessage}>
          Terminal too small. Minimum: 40x10
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.askMessage}>{question.label}</Text>
      <Text>(Press Ctrl+D to submit, Esc to cancel)</Text>
      {lines.map((line, idx) => (
        <Text key={idx}>{line}{idx === currentLine ? '█' : ''}</Text>
      ))}
    </Box>
  );
}
