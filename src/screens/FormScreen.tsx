/** @jsxImportSource @opentui/react */

import {HumanInterfaceRequestFor, HumanInterfaceResponseFor} from "@tokenring-ai/agent/HumanInterfaceRequest";
import {useKeyboard} from '@opentui/react';
import React, {useState, useMemo} from 'react';
import {theme} from '../theme.ts';
import TreeSelectionScreen from './TreeSelectionScreen.tsx';

type FormField = HumanInterfaceRequestFor<"askForForm">["sections"][number]["fields"][number];
type FormValues = Record<string, string | string[] | null>;

interface FormScreenProps {
  request: HumanInterfaceRequestFor<"askForForm">;
  onResponse: (response: HumanInterfaceResponseFor<"askForForm">) => void;
}

export default function FormScreen({ request, onResponse }: FormScreenProps) {
  const allFields = useMemo(() => 
    request.sections.flatMap(s => s.fields.map(f => ({ ...f, section: s.name }))),
    [request.sections]
  );

  const [values, setValues] = useState<FormValues>(() => {
    const initial: FormValues = {};
    for (const field of allFields) {
      if (field.type === 'text') initial[field.key] = field.defaultValue || '';
      else if (field.type === 'selectOne') initial[field.key] = field.defaultValue || '';
      else if (field.type === 'selectMany') initial[field.key] = field.defaultValue || [];
      else if (field.type === 'file') initial[field.key] = field.defaultValue || '';
      else if (field.type === 'multipleFile') initial[field.key] = field.defaultValue || [];
    }
    return initial;
  });

  const [focusedIndex, setFocusedIndex] = useState(0);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [textBuffer, setTextBuffer] = useState('');
  const [treeMode, setTreeMode] = useState<{ field: FormField; multiple: boolean } | null>(null);

  const focusedField = allFields[focusedIndex];

  useKeyboard((keyEvent) => {
    if (treeMode) return;

    if (keyEvent.name === 'escape') {
      if (editingField) {
        setEditingField(null);
        setTextBuffer('');
      } else {
        onResponse({ type: 'askForForm', values: {} });
      }
      return;
    }

    if (editingField) {
      if (keyEvent.name === 'return') {
        setValues(prev => ({ ...prev, [editingField]: textBuffer }));
        setEditingField(null);
        setTextBuffer('');
      } else if (keyEvent.name === 'backspace') {
        setTextBuffer(prev => prev.slice(0, -1));
      } else if (keyEvent.raw) {
        setTextBuffer(prev => prev + keyEvent.raw);
      }
      return;
    }

    if (keyEvent.name === 'up') {
      setFocusedIndex(prev => Math.max(0, prev - 1));
    } else if (keyEvent.name === 'down') {
      setFocusedIndex(prev => Math.min(allFields.length - 1, prev + 1));
    } else if (keyEvent.name === 'return') {
      if (focusedField.type === 'text') {
        setEditingField(focusedField.key);
        setTextBuffer((values[focusedField.key] as string) || '');
      } else if (focusedField.type === 'selectOne') {
        const opts = focusedField.options;
        const current = values[focusedField.key] as string;
        const idx = opts.findIndex(o => o.value === current);
        const next = opts[(idx + 1) % opts.length];
        setValues(prev => ({ ...prev, [focusedField.key]: next.value }));
      } else if (focusedField.type === 'file' || focusedField.type === 'multipleFile') {
        setEditingField(focusedField.key);
        setTextBuffer(Array.isArray(values[focusedField.key]) 
          ? (values[focusedField.key] as string[]).join(',') 
          : (values[focusedField.key] as string) || '');
      }
    } else if (keyEvent.name === 'space') {
      if (focusedField.type === 'selectMany') {
        const opts = focusedField.options;
        const current = (values[focusedField.key] as string[]) || [];
        const idx = opts.findIndex(o => !current.includes(o.value));
        if (idx >= 0) {
          const toggled = current.includes(opts[idx].value)
            ? current.filter(v => v !== opts[idx].value)
            : [...current, opts[idx].value];
          setValues(prev => ({ ...prev, [focusedField.key]: toggled }));
        }
      } else if ('tree' in focusedField) {
        setTreeMode({ 
          field: focusedField, 
          multiple: 'initialSelection' in focusedField && Array.isArray(focusedField.initialSelection)
        });
      }
    } else if (keyEvent.ctrl && keyEvent.name === 's') {
      onResponse({ type: 'askForForm', values });
    }
  });

  if (treeMode) {
    const treeRequest = treeMode.multiple
      ? { type: 'askForMultipleTreeSelection' as const, ...treeMode.field }
      : { type: 'askForSingleTreeSelection' as const, ...treeMode.field };

    return (
      <TreeSelectionScreen
        request={treeRequest}
        onResponse={(result) => {
          if (result !== null) {
            setValues(prev => ({ ...prev, [treeMode.field.key]: result }));
          }
          setTreeMode(null);
        }}
      />
    );
  }

  return (
    <box flexDirection="column" borderStyle="single" paddingLeft={1} paddingRight={1} title={request.name}>
      <text fg={theme.askMessage}>{request.description}</text>
      <text> </text>
      {request.sections.map(section => (
        <box key={section.name} flexDirection="column">
          <text bold>{section.name}</text>
          {section.description && <text fg={theme.treeMessage}>{section.description}</text>}
          {section.fields.map((field, idx) => {
            const globalIdx = allFields.findIndex(f => f.key === field.key);
            const focused = globalIdx === focusedIndex;
            const editing = editingField === field.key;
            const value = values[field.key];

            let display = '';
            if (field.type === 'text') {
              display = editing ? textBuffer + '█' : (value as string) || '(empty)';
            } else if (field.type === 'selectOne') {
              const opt = field.options.find(o => o.value === value);
              display = opt?.label || '(none)';
            } else if (field.type === 'selectMany') {
              const selected = (value as string[]) || [];
              display = selected.length > 0 
                ? field.options.filter(o => selected.includes(o.value)).map(o => o.label).join(', ')
                : '(none)';
            } else if (field.type === 'file') {
              display = editing ? textBuffer + '█' : (value as string) || '(none)';
            } else if (field.type === 'multipleFile') {
              display = editing ? textBuffer + '█' : ((value as string[])?.join(', ') || '(none)');
            } else if ('tree' in field) {
              display = Array.isArray(value) ? value.join(', ') : (value as string) || '(none)';
            }

            return (
              <box key={field.key}>
                <text fg={focused ? theme.treeHighlightedItem : theme.treeNotSelectedItem}>
                  {focused ? '❯ ' : '  '}
                  {field.label}: {display}
                </text>
              </box>
            );
          })}
          <text> </text>
        </box>
      ))}
      <text>(↑/↓ navigate, Enter/Space to edit, Ctrl+S to submit, Esc to cancel)</text>
    </box>
  );
}
