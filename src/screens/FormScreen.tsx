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

// Type guards for different field types
const isTextField = (field: FormField): field is Extract<FormField, { type: 'text' }> => 
  'type' in field && field.type === 'text';

const isSelectOneField = (field: FormField): field is Extract<FormField, { type: 'selectOne' }> => 
  'type' in field && field.type === 'selectOne';

const isSelectManyField = (field: FormField): field is Extract<FormField, { type: 'selectMany' }> => 
  'type' in field && field.type === 'selectMany';

const isFileField = (field: FormField): field is Extract<FormField, { type: 'file' }> => 
  'type' in field && field.type === 'file';

const isMultipleFileField = (field: FormField): field is Extract<FormField, { type: 'multipleFile' }> => 
  'type' in field && field.type === 'multipleFile';

const isDirectoryField = (field: FormField): field is Extract<FormField, { type: 'directory' }> => 
  'type' in field && field.type === 'directory';

const isTreeField = (field: FormField): field is Extract<FormField, { tree: unknown }> => 
  'tree' in field && !('type' in field);

const getFieldKey = (field: FormField): string => {
  if ('key' in field) {
    return field.key;
  }
  // For tree fields, use title as the key
  if ('title' in field) {
    return `tree_${field.title.replace(/\s+/g, '_').toLowerCase()}`;
  }
  throw new Error('Field has no key or title');
};

const getFieldLabel = (field: FormField): string => {
  if ('label' in field) {
    return field.label;
  }
  if ('title' in field) {
    return field.title;
  }
  return 'Unknown Field';
};

export default function FormScreen({ request, onResponse }: FormScreenProps) {
  const allFields = useMemo(() => 
    request.sections.flatMap(s => s.fields.map(f => ({ ...f, section: s.name }))),
    [request.sections]
  );

  const [values, setValues] = useState<FormValues>(() => {
    const initial: FormValues = {};
    for (const field of allFields) {
      const key = getFieldKey(field);
      if (isTextField(field)) {
        initial[key] = field.defaultValue || '';
      } else if (isSelectOneField(field)) {
        initial[key] = field.defaultValue || '';
      } else if (isSelectManyField(field)) {
        initial[key] = field.defaultValue || [];
      } else if (isFileField(field)) {
        initial[key] = field.defaultValue || '';
      } else if (isMultipleFileField(field)) {
        initial[key] = field.defaultValue || [];
      } else if (isDirectoryField(field)) {
        initial[key] = field.defaultValue || '';
      } else if (isTreeField(field)) {
        initial[key] = null;
      }
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
      const focusedKey = getFieldKey(focusedField);
      if (isTextField(focusedField)) {
        setEditingField(focusedKey);
        setTextBuffer((values[focusedKey] as string) || '');
      } else if (isSelectOneField(focusedField)) {
        const opts = focusedField.options;
        const current = values[focusedKey] as string;
        const idx = opts.findIndex(o => o.value === current);
        const next = opts[(idx + 1) % opts.length];
        setValues(prev => ({ ...prev, [focusedKey]: next.value }));
      } else if (isFileField(focusedField) || isMultipleFileField(focusedField) || isDirectoryField(focusedField)) {
        setEditingField(focusedKey);
        setTextBuffer(Array.isArray(values[focusedKey]) 
          ? (values[focusedKey] as string[]).join(',') 
          : (values[focusedKey] as string) || '');
      }
    } else if (keyEvent.name === 'space') {
      const focusedKey = getFieldKey(focusedField);
      if (isSelectManyField(focusedField)) {
        const opts = focusedField.options;
        const current = (values[focusedKey] as string[]) || [];
        const idx = opts.findIndex(o => !current.includes(o.value));
        if (idx >= 0) {
          const toggled = current.includes(opts[idx].value)
            ? current.filter(v => v !== opts[idx].value)
            : [...current, opts[idx].value];
          setValues(prev => ({ ...prev, [focusedKey]: toggled }));
        }
      } else if (isTreeField(focusedField)) {
        const multiple = 'initialSelection' in focusedField && Array.isArray(focusedField.initialSelection);
        setTreeMode({ 
          field: focusedField, 
          multiple
        });
      }
    } else if (keyEvent.ctrl && keyEvent.name === 's') {
      onResponse({ type: 'askForForm', values });
    }
  });

  if (treeMode) {
    // Create proper tree request from the tree field
    const treeField = treeMode.field;
    
    // Type guard to ensure we have the right tree field type
    if ('title' in treeField && 'tree' in treeField) {
      // Create the tree request with proper typing
      const baseRequest = {
        title: treeField.title,
        tree: treeField.tree,
        ...('message' in treeField ? { message: treeField.message } : {}),
        ...('timeout' in treeField ? { timeout: treeField.timeout } : {}),
        ...('loop' in treeField ? { loop: treeField.loop } : {})
      };

      if (treeMode.multiple) {
        // For multiple selection, ensure initialSelection and default are string[]
        const initialSelection = 'initialSelection' in treeField 
          ? (Array.isArray(treeField.initialSelection) ? treeField.initialSelection : 
             treeField.initialSelection ? [treeField.initialSelection] : undefined)
          : undefined;
        
        const defaultValue = 'default' in treeField 
          ? (Array.isArray(treeField.default) ? treeField.default : 
             treeField.default ? [treeField.default] : undefined)
          : undefined;
        
        const treeRequest = {
          type: 'askForMultipleTreeSelection' as const,
          ...baseRequest,
          ...(initialSelection ? { initialSelection } : {}),
          ...(defaultValue ? { default: defaultValue } : {})
        };

        return (
          <TreeSelectionScreen
            request={treeRequest}
            onResponse={(result) => {
              if (result !== null) {
                const fieldKey = getFieldKey(treeMode.field);
                setValues(prev => ({ ...prev, [fieldKey]: result }));
              }
              setTreeMode(null);
            }}
          />
        );
      } else {
        // For single selection, ensure initialSelection and default are string
        const initialSelection = 'initialSelection' in treeField 
          ? (typeof treeField.initialSelection === 'string' ? treeField.initialSelection : undefined)
          : undefined;
        
        const defaultValue = 'default' in treeField 
          ? (typeof treeField.default === 'string' ? treeField.default : undefined)
          : undefined;
        
        const treeRequest = {
          type: 'askForSingleTreeSelection' as const,
          ...baseRequest,
          ...(initialSelection ? { initialSelection } : {}),
          ...(defaultValue ? { default: defaultValue } : {})
        };

        return (
          <TreeSelectionScreen
            request={treeRequest}
            onResponse={(result) => {
              if (result !== null) {
                const fieldKey = getFieldKey(treeMode.field);
                setValues(prev => ({ ...prev, [fieldKey]: result }));
              }
              setTreeMode(null);
            }}
          />
        );
      }
    }
  }

  return (
    <box flexDirection="column" borderStyle="single" paddingLeft={1} paddingRight={1} title={request.name}>
      <text fg={theme.askMessage}>{request.description}</text>
      <text> </text>
      {request.sections.map(section => (
        <box key={section.name} flexDirection="column">
          <text>{section.name}</text>
          {section.description && <text fg={theme.treeMessage}>{section.description}</text>}
          {section.fields.map((field, idx) => {
            const globalIdx = allFields.findIndex(f => getFieldKey(f) === getFieldKey(field));
            const focused = globalIdx === focusedIndex;
            const editing = editingField === getFieldKey(field);
            const fieldKey = getFieldKey(field);
            const value = values[fieldKey];

            let display = '';
            if (isTextField(field)) {
              display = editing ? textBuffer + '█' : (value as string) || '(empty)';
            } else if (isSelectOneField(field)) {
              const opt = field.options.find(o => o.value === value);
              display = opt?.label || '(none)';
            } else if (isSelectManyField(field)) {
              const selected = (value as string[]) || [];
              display = selected.length > 0 
                ? field.options.filter(o => selected.includes(o.value)).map(o => o.label).join(', ')
                : '(none)';
            } else if (isFileField(field) || isDirectoryField(field)) {
              display = editing ? textBuffer + '█' : (value as string) || '(none)';
            } else if (isMultipleFileField(field)) {
              display = editing ? textBuffer + '█' : ((value as string[])?.join(', ') || '(none)');
            } else if (isTreeField(field)) {
              display = Array.isArray(value) ? value.join(', ') : (value as string) || '(none)';
            }

            return (
              <box key={fieldKey}>
                <text fg={focused ? theme.treeHighlightedItem : theme.treeNotSelectedItem}>
                  {focused ? '❯ ' : '  '}
                  {getFieldLabel(field)}: {display}
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