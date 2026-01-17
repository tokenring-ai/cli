/** @jsxImportSource @opentui/react */
import { useKeyboard } from '@opentui/react';
import React, { useState } from 'react';
import { theme } from '../../theme';
import type { TextInputProps } from '../../types';
import { useAbortSignal } from '../../hooks';

export default function TextInput({ question, message, onResponse, signal }: TextInputProps) {
  const [lines, setLines] = useState<string[]>(['']);
  const [currentLine, setCurrentLine] = useState(0);

  useAbortSignal(signal, () => onResponse(null));

  useKeyboard((keyEvent) => {
    if ((keyEvent.name === 'escape' || keyEvent.name === 'q')) {
      onResponse(null);
      return;
    }

    if (keyEvent.ctrl && keyEvent.name === 'd') {
      onResponse(lines.join('\n'));
      return;
    }

    if (keyEvent.name === 'return') {
      setLines([...lines, '']);
      setCurrentLine(currentLine + 1);
      return;
    }

    if (keyEvent.name === 'backspace') {
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

    if (keyEvent.raw) {
      const newLines = [...lines];
      newLines[currentLine] = (newLines[currentLine] || '') + keyEvent.raw;
      setLines(newLines);
    }
  });

  return (
    <box flexDirection="column">
      {message && <text fg={theme.askMessage}>{message}</text>}
      <text>(Press Ctrl+D to submit, Esc to cancel)</text>
      {lines.map((line, idx) => (
        <text key={idx}>{line}{idx === currentLine ? '█' : ''}</text>
      ))}
    </box>
  );
}
