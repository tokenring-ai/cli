/** @jsxImportSource @opentui/react */

import {QuestionRequestSchema} from "@tokenring-ai/agent/HumanInterfaceRequest";
import {useKeyboard} from '@opentui/react';
import React, {useState} from 'react';
import {theme} from '../theme.ts';
import z from 'zod';
import TreeSelectionScreen from "./TreeSelectionScreen.tsx";

type QuestionInputScreenProps = {
  request: z.output<typeof QuestionRequestSchema>;
  onResponse: (response: any) => void;
  signal?: AbortSignal;
};

export default function QuestionInputScreen({ request, onResponse, signal }: QuestionInputScreenProps) {
  const { question, message } = request;
  if (question.type === 'treeSelect') {
    return <TreeSelectionScreen question={question} onResponse={onResponse} signal={signal} />;
  }

  if (question.type === 'text') {
    return <TextInputComponent question={question} message={message} onResponse={onResponse} signal={signal} />;
  } else if (question.type === 'select') {
    return <SelectInputComponent question={question} message={message} onResponse={onResponse} signal={signal} />;
  } else if (question.type === 'fileSelect') {
    return <FileSelectInputComponent question={question} message={message} onResponse={onResponse} signal={signal} />;
  }

  return <box><text>Unknown question type</text></box>;
}

interface TextInputComponentProps {
  question: z.output<typeof QuestionRequestSchema>['question'] & { type: 'text' };
  message: string;
  onResponse: (response: string | null) => void;
  signal?: AbortSignal;
}

function TextInputComponent({ question, message, onResponse, signal }: TextInputComponentProps) {
  const [lines, setLines] = useState<string[]>(['']);
  const [currentLine, setCurrentLine] = useState(0);

  React.useEffect(() => {
    if (signal) {
      const handler = () => onResponse(null);
      signal.addEventListener('abort', handler);
      return () => signal.removeEventListener('abort', handler);
    }
  }, [signal, onResponse]);

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

interface SelectInputComponentProps {
  question: z.output<typeof QuestionRequestSchema>['question'] & { type: 'select' };
  message: string;
  onResponse: (response: string[] | null) => void;
  signal?: AbortSignal;
}

function SelectInputComponent({ question, message, onResponse, signal }: SelectInputComponentProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set(
    question.defaultValue?.map(v => question.options.findIndex(o => o.value === v)).filter(i => i >= 0) || []
  ));
  const [focusedIndex, setFocusedIndex] = useState(0);

  React.useEffect(() => {
    if (signal) {
      const handler = () => onResponse(null);
      signal.addEventListener('abort', handler);
      return () => signal.removeEventListener('abort', handler);
    }
  }, [signal, onResponse]);

  const singleSelect = question.maximumSelections === 1;

  useKeyboard((keyEvent) => {
    if (keyEvent.name === 'escape') {
      onResponse(null);
      return;
    }

    if (keyEvent.name === 'return') {
      const selected = singleSelect
        ? [question.options[focusedIndex].value]
        : Array.from(selectedIndices).sort().map(idx => question.options[idx].value);
      onResponse(selected);
      return;
    }

    if (keyEvent.name === 'up') {
      setFocusedIndex(Math.max(0, focusedIndex - 1));
    } else if (keyEvent.name === 'down') {
      setFocusedIndex(Math.min(question.options.length - 1, focusedIndex + 1));
    } else if (keyEvent.name === 'space' && !singleSelect) {
      const newSelected = new Set(selectedIndices);
      if (newSelected.has(focusedIndex)) {
        newSelected.delete(focusedIndex);
      } else {
        newSelected.add(focusedIndex);
      }
      setSelectedIndices(newSelected);
    }
  });

  return (
    <box flexDirection="column">
      {message && <text fg={theme.askMessage}>{message}</text>}
      <text>(↑/↓ navigate, {singleSelect ? 'Enter to select' : 'Space to toggle, Enter to submit'}, Esc to cancel)</text>
      {question.options.map((option, idx) => (
        <text key={idx} fg={focusedIndex === idx ? theme.treeHighlightedItem : theme.treeNotSelectedItem}>
          {focusedIndex === idx ? '❯ ' : '  '}
          {singleSelect ? '' : (selectedIndices.has(idx) ? '☑ ' : '☐ ')}
          {option.label}
        </text>
      ))}
    </box>
  );
}

interface TreeSelectInputComponentProps {
  question: z.output<typeof QuestionRequestSchema>['question'] & { type: 'treeSelect' };
  message: string;
  onResponse: (response: string | string[] | null) => void;
  signal?: AbortSignal;
}

function TreeSelectInputComponent({ question, message, onResponse, signal }: TreeSelectInputComponentProps) {
  // Placeholder - would need more complex tree navigation logic
  const [value, setValue] = useState('');

  React.useEffect(() => {
    if (signal) {
      const handler = () => onResponse(null);
      signal.addEventListener('abort', handler);
      return () => signal.removeEventListener('abort', handler);
    }
  }, [signal, onResponse]);

  useKeyboard((keyEvent) => {
    if (keyEvent.name === 'escape') {
      onResponse(null);
      return;
    }
    if (keyEvent.name === 'return') {
      onResponse(value);
      return;
    }
  });

  return (
    <box flexDirection="column">
      {message && <text fg={theme.askMessage}>{message}</text>}
      <text>(Tree selection not fully implemented yet)</text>
    </box>
  );
}

interface FileSelectInputComponentProps {
  question: z.output<typeof QuestionRequestSchema>['question'] & { type: 'fileSelect' };
  message: string;
  onResponse: (response: string[] | null) => void;
  signal?: AbortSignal;
}

function FileSelectInputComponent({ question, message, onResponse, signal }: FileSelectInputComponentProps) {
  const [paths, setPaths] = useState<string[]>(question.defaultValue || []);

  React.useEffect(() => {
    if (signal) {
      const handler = () => onResponse(null);
      signal.addEventListener('abort', handler);
      return () => signal.removeEventListener('abort', handler);
    }
  }, [signal, onResponse]);

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
