/** @jsxImportSource @opentui/react */
import { useKeyboard } from '@opentui/react';
import React, { useState } from 'react';
import { theme } from '../../theme';
import type { FormInputProps } from '../../types';
import { useAbortSignal, useResponsiveLayout } from '../../hooks';
import TextInput from './TextInput';
import SelectInput from './SelectInput';
import TreeSelect from './TreeSelect';
import FileSelect from './FileSelect';

export default function FormInput({ question, message, agent, onResponse, signal }: FormInputProps) {
  const layout = useResponsiveLayout();
  const [responses, setResponses] = useState<Record<string, Record<string, any>>>({});
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);

  useAbortSignal(signal, () => onResponse(null));

  const sections = question.sections;
  const currentSection = sections[currentSectionIndex];
  const fieldKeys = Object.keys(currentSection.fields);
  const currentFieldKey = fieldKeys[currentFieldIndex];
  const currentField = currentSection.fields[currentFieldKey];

  const handleFieldResponse = (response: any) => {
    const newResponses = { ...responses };
    if (!newResponses[currentSection.name]) {
      newResponses[currentSection.name] = {};
    }
    newResponses[currentSection.name][currentFieldKey] = response;
    setResponses(newResponses);

    if (currentFieldIndex < fieldKeys.length - 1) {
      setCurrentFieldIndex(currentFieldIndex + 1);
    } else if (currentSectionIndex < sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1);
      setCurrentFieldIndex(0);
    } else {
      onResponse(newResponses);
    }
  };

  const handleBack = () => {
    if (currentFieldIndex > 0) {
      setCurrentFieldIndex(currentFieldIndex - 1);
    } else if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1);
      const prevSection = sections[currentSectionIndex - 1];
      setCurrentFieldIndex(Object.keys(prevSection.fields).length - 1);
    }
  };

  useKeyboard((keyEvent) => {
    if (keyEvent.name === 'escape') {
      onResponse(null);
      return;
    }
  });

  if (layout.minimalMode) {
    return (
      <box>
        <text fg={theme.chatSystemWarningMessage}>
          Terminal too small. Minimum: 40x10
        </text>
      </box>
    );
  }

  const fieldLabel = `${currentSection.name} - ${currentFieldKey}`;
  const progressText = `Section ${currentSectionIndex + 1}/${sections.length}, Field ${currentFieldIndex + 1}/${fieldKeys.length}`;

  return (
    <box flexDirection="column">
      {message && <text fg={theme.askMessage}>{message}</text>}
      <text fg={theme.treeMessage}>{progressText}</text>
      {currentSection.description && <text>{currentSection.description}</text>}
      <box flexDirection="column" flexGrow={1}>
        {currentField.type === 'text' && (
          <TextInput
            question={{ ...currentField, label: currentFieldKey }}
            message={currentFieldKey}
            onResponse={handleFieldResponse}
            signal={signal}
          />
        )}
        {currentField.type === 'select' && (
          <SelectInput
            question={{ ...currentField, label: currentFieldKey }}
            message={currentFieldKey}
            onResponse={handleFieldResponse}
            signal={signal}
          />
        )}
        {currentField.type === 'treeSelect' && (
          <TreeSelect
            question={{ ...currentField, label: currentFieldKey }}
            onResponse={handleFieldResponse}
            signal={signal}
          />
        )}
        {currentField.type === 'fileSelect' && (
          <FileSelect
            agent={agent}
            question={{ ...currentField, label: currentFieldKey }}
            message={currentFieldKey}
            onResponse={handleFieldResponse}
            signal={signal}
          />
        )}
      </box>
      <text>(Use Esc to cancel, form will auto-advance)</text>
    </box>
  );
}
