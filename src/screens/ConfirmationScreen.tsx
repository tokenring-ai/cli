/** @jsxImportSource @opentui/react */

import {useKeyboard} from '@opentui/react';
import React, {useState} from 'react';
import {theme} from '../theme.ts';

export interface ConfirmInputProps {
  message: string;
  defaultValue?: boolean;
  timeout?: number;
  onResponse: (value: boolean) => void;
}

export default function ConfirmationScreen({ message, defaultValue = false, timeout, onResponse }: ConfirmInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [remaining, setRemaining] = useState(timeout);

  React.useEffect(() => {
    if (timeout && timeout > 0) {
      const timer = setTimeout(() => onResponse(defaultValue), timeout * 1000);
      const interval = setInterval(() => setRemaining(prev => Math.max(0, (prev ?? timeout) - 1)), 1000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [timeout, defaultValue, onResponse]);

  useKeyboard((keyEvent) => {
    if (keyEvent.name?.toLowerCase() === 'y') {
      onResponse(true);
    } else if (keyEvent.name?.toLowerCase() === 'n') {
      onResponse(false);
    } else if (keyEvent.name === 'return') {
      onResponse(value);
    } else if (keyEvent.name === 'left' || keyEvent.name === 'right') {
      setValue(prev => !prev);
    }
  });

  return (
    <box flexDirection="column">
      <box flexDirection="row">
        <text fg={value ? theme.confirmYes : theme.confirmInactive}>[Yes]</text>
        <text> / </text>
        <text fg={!value ? theme.confirmNo : theme.confirmInactive}>[No]</text>
        {timeout && timeout > 0 && <text fg={theme.confirmTimeout}> ({remaining}s)</text>}
      </box>
      <text>{message} </text>
    </box>
  );
};
