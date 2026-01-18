/** @jsxImportSource @opentui/react */
import {useKeyboard} from '@opentui/react';
import React, {useState} from 'react';
import {useAbortSignal} from "../../hooks/useAbortSignal.ts";
import {useResponsiveLayout} from "../../hooks/useResponsiveLayout.ts";
import {theme} from '../../theme';
import FileSelect from './FileSelect';
import TextInput from './TextInput';
import TreeSelect from './TreeSelect';
import type {FormInputProps} from "./types.ts";

export default function FormInput({ question, agent, onResponse, signal }: FormInputProps) {
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

  const progressText = `${currentSection.name} (Section ${currentSectionIndex + 1}/${sections.length}, Field ${currentFieldIndex + 1}/${fieldKeys.length})`;

  return (
    <box flexDirection="column">
      <text fg={theme.treeMessage}>{progressText}</text>
      <box flexDirection="column" flexGrow={1}>
        {currentField.type === 'text' && (
          <TextInput
            question={currentField}
            onResponse={handleFieldResponse}
            signal={signal}
          />
        )}
        {currentField.type === 'treeSelect' && (
          <TreeSelect
            question={currentField}
            onResponse={handleFieldResponse}
            signal={signal}
          />
        )}
        {currentField.type === 'fileSelect' && (
          <FileSelect
            agent={agent}
            question={currentField}
            onResponse={handleFieldResponse}
            signal={signal}
          />
        )}
      </box>
      <text>(Use Esc to cancel, form will auto-advance)</text>
    </box>
  );
}
