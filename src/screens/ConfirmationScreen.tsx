import {useKeyboard} from '@opentui/react';
import React, {useState} from 'react';
import {theme} from '../theme.ts';

export interface ConfirmInputProps {
  message: string;
  defaultValue?: boolean;
  timeout?: number;
  onConfirm: (value: boolean) => void;
}

export default function ConfirmationScreen({ message, defaultValue = false, timeout, onConfirm }: ConfirmInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [remaining, setRemaining] = useState(timeout);

  React.useEffect(() => {
    if (timeout && timeout > 0) {
      const timer = setTimeout(() => onConfirm(defaultValue), timeout * 1000);
      const interval = setInterval(() => setRemaining(prev => Math.max(0, (prev ?? timeout) - 1)), 1000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [timeout, defaultValue, onConfirm]);

  useKeyboard((keyEvent) => {
    if (keyEvent.name?.toLowerCase() === 'y') {
      onConfirm(true);
    } else if (keyEvent.name?.toLowerCase() === 'n') {
      onConfirm(false);
    } else if (keyEvent.name === 'return') {
      onConfirm(value);
    } else if (keyEvent.name === 'left' || keyEvent.name === 'right') {
      setValue(prev => !prev);
    }
  });

  return (
    <box flexDirection="column">
      <text>{message} </text>
      <box flexDirection="row">
        <text fg={value ? theme.confirmYes : theme.selectionInactive}>[Yes]</text>
        <text> / </text>
        <text fg={!value ? theme.confirmNo : theme.selectionInactive}>[No]</text>
        {timeout && timeout > 0 && <text fg={theme.timeout}> ({remaining}s)</text>}
      </box>
    </box>
  );
};
