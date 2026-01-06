/** @jsxImportSource @opentui/react */

import {HumanInterfaceRequestFor, HumanInterfaceResponseFor} from "@tokenring-ai/agent/HumanInterfaceRequest";
import {useKeyboard} from '@opentui/react';
import React, {useState} from 'react';

export interface PasswordInputProps {
  request: HumanInterfaceRequestFor<"askForPassword">;
  onResponse: (response: HumanInterfaceResponseFor<"askForPassword">) => void;
  signal?: AbortSignal;
}

export default function PasswordScreen({ request, onResponse, signal } : PasswordInputProps) {
  const [value, setValue] = useState('');

  React.useEffect(() => {
    if (signal) {
      const handler = () => onResponse('');
      signal.addEventListener('abort', handler);
      return () => signal.removeEventListener('abort', handler);
    }
  }, [signal, onResponse]);

  useKeyboard((keyEvent) => {
    if (keyEvent.name === 'return') {
      onResponse(value);
    } else if (keyEvent.name === 'backspace') {
      setValue(prev => prev.slice(0, -1));
    } else if (!keyEvent.ctrl && !keyEvent.meta && keyEvent.raw) {
      setValue(prev => prev + keyEvent.raw);
    }
  });

  return (
    <box>
      <text>{request.message} </text>
      <text>{'*'.repeat(value.length)}</text>
    </box>
  );
}
