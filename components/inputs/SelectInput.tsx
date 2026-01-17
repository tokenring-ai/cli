/** @jsxImportSource @opentui/react */
import { useKeyboard } from '@opentui/react';
import React, { useState, useEffect } from 'react';
import { theme } from '../../theme';
import type { SelectInputProps } from '../../types';
import { useAbortSignal } from '../../hooks';
import { isSelectionValid, canSelect } from '../../utils/selectionValidation';

export default function SelectInput({ question, message, onResponse, signal }: SelectInputProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set(
    question.defaultValue?.map(v => question.options.findIndex(o => o.value === v)).filter(i => i >= 0) || []
  ));
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  useAbortSignal(signal, () => onResponse(null));

  useEffect(() => {
    if (flashMessage) {
      const timer = setTimeout(() => setFlashMessage(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [flashMessage]);

  const singleSelect = question.maximumSelections === 1;

  useKeyboard((keyEvent) => {
    if (keyEvent.name === 'escape') {
      onResponse(null);
      return;
    }

    if (keyEvent.name === 'return') {
      if (singleSelect) {
        const selected = [question.options[focusedIndex].value];
        onResponse(selected);
      } else {
        const selectedValues = Array.from(selectedIndices).sort().map(idx => question.options[idx].value);
        const selectedSet = new Set(selectedValues);
        if (!isSelectionValid(selectedSet, question.minimumSelections, question.maximumSelections)) {
          if (selectedIndices.size < (question.minimumSelections || 0)) {
            setFlashMessage(`Select at least ${question.minimumSelections} items`);
          } else {
            setFlashMessage(`Select at most ${question.maximumSelections} items`);
          }
          return;
        }
        onResponse(selectedValues);
      }
      return;
    }

    if (keyEvent.name === 'up') {
      setFocusedIndex(Math.max(0, focusedIndex - 1));
    } else if (keyEvent.name === 'down') {
      setFocusedIndex(Math.min(question.options.length - 1, focusedIndex + 1));
    } else if (keyEvent.name === 'space' && !singleSelect) {
      const newSelected = new Set(selectedIndices);
      const optionValue = question.options[focusedIndex].value;
      if (newSelected.has(focusedIndex)) {
        if (question.minimumSelections !== undefined && newSelected.size <= question.minimumSelections) {
          setFlashMessage(`Cannot deselect: minimum ${question.minimumSelections} required`);
          return;
        }
        newSelected.delete(focusedIndex);
      } else {
        if (question.maximumSelections !== undefined && newSelected.size >= question.maximumSelections) {
          setFlashMessage(`Cannot select: maximum ${question.maximumSelections} allowed`);
          return;
        }
        newSelected.add(focusedIndex);
      }
      setSelectedIndices(newSelected);
    }
  });

  const canSubmit = singleSelect || isSelectionValid(new Set(Array.from(selectedIndices).map(idx => question.options[idx].value)), question.minimumSelections, question.maximumSelections);
  const itemCanSelect = (idx: number) => {
    return canSelect(
      question.options[idx].value,
      new Set(Array.from(selectedIndices).map(i => question.options[i].value)),
      question.minimumSelections,
      question.maximumSelections
    );
  };

  return (
    <box flexDirection="column">
      {message && <text fg={theme.askMessage}>{message}</text>}
      {!singleSelect && (
        <text fg={theme.treeMessage}>
          Selected: {selectedIndices.size}
          {question.minimumSelections && ` (min: ${question.minimumSelections})`}
          {question.maximumSelections && ` (max: ${question.maximumSelections})`}
        </text>
      )}
      <text>(↑/↓ navigate, {singleSelect ? 'Enter to select' : 'Space to toggle, Enter to submit'}, Esc to cancel)</text>
      {question.options.map((option, idx) => {
        const canSelect_ = itemCanSelect(idx);
        const optionFg = !singleSelect && !canSelect_ ? theme.treeNotSelectedItem : (focusedIndex === idx ? theme.treeHighlightedItem : theme.treeNotSelectedItem);
        return (
          <text key={idx} fg={optionFg}>
            {focusedIndex === idx ? '❯ ' : '  '}
            {singleSelect ? '' : (selectedIndices.has(idx) ? '☑ ' : '☐ ')}
            {option.label}
          </text>
        );
      })}
      {flashMessage && <text fg={theme.confirmNo}>{flashMessage}</text>}
      {!singleSelect && (
        <text fg={canSubmit ? theme.confirmYes : theme.confirmNo}>
          {canSubmit ? '✓ Press Enter to submit' : '✗ Selection invalid'}
        </text>
      )}
    </box>
  );
}
