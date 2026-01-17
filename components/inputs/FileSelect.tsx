/** @jsxImportSource @opentui/react */
import { useKeyboard } from '@opentui/react';
import React, { useState } from 'react';
import { theme } from '../../theme';
import type { FileSelectProps } from '../../types';
import { useAbortSignal } from '../../hooks';

export default function FileSelect({ question, message, onResponse, signal }: FileSelectProps) {
  const [paths, setPaths] = useState<string[]>(question.defaultValue || []);

  useAbortSignal(signal, () => onResponse(null));

  useKeyboard((keyEvent) => {
    if (keyEvent.name === 'escape') {
      onResponse(null);
      return;
    }
    if (keyEvent.name === 'return') {
      onResponse(paths);
      return;
    }
  });

  return (
    <box flexDirection="column">
      {message && <text fg={theme.askMessage}>{message}</text>}
      <text>(File selection not yet implemented)</text>
    </box>
  );
}
