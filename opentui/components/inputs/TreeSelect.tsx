/** @jsxImportSource @opentui/react */
import {useKeyboard, useTerminalDimensions} from '@opentui/react';
import type {TreeLeaf, TreeSelectQuestionSchema} from "@tokenring-ai/agent/question";
import React, {useEffect, useMemo, useState} from 'react';
import {z} from "zod";
import {theme} from '../../../theme.ts';

export interface TreeSelectProps {
  question: Omit<z.output<typeof TreeSelectQuestionSchema>, "type">;
  onResponse: (response: string[] | null) => void;
  onHighlight?: (value: string) => void;
  signal?: AbortSignal;
}

interface FlatItem {
  node: TreeLeaf;
  depth: number;
  isExpanded: boolean;
  isParent: boolean;
}

export default function TreeSelect({
                                     question: { tree, defaultValue, minimumSelections, maximumSelections, label },
                                     onResponse,
                                     signal,
                                     onHighlight
                                   }: TreeSelectProps) {
  const { height, width } = useTerminalDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(defaultValue)); // Root expanded by default
  const [checked, setChecked] = useState<Set<string>>(new Set(defaultValue ?? []));
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const multiple = maximumSelections !== 1;
  const maxVisibleItems = Math.max(5, height - 8);
  const minimalMode = height < 10 || width < 40;

  useEffect(() => {
    if (!signal) return;
    const handler = () => onResponse(null);
    signal.addEventListener('abort', handler);
    return () => signal.removeEventListener('abort', handler);
  }, [signal, onResponse]);

  useEffect(() => {
    if (flashMessage) {
      const timer = setTimeout(() => setFlashMessage(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [flashMessage]);

  const flatTree = useMemo<FlatItem[]>(() => {
    const result: FlatItem[] = [];
    const traverse = (node: TreeLeaf, depth: number) => {
      const hasChildren = !!(node.children && node.children.length > 0);
      const nodeValue = node.value ?? node.name;
      const isOpen = expanded.has(nodeValue);
      result.push({ node, depth, isExpanded: isOpen, isParent: hasChildren });

      if (hasChildren && isOpen) {
        node.children!.forEach(child => traverse(child, depth + 1));
      }
    };
    tree.forEach(root => traverse(root, 0));
    return result;
  }, [tree, expanded]);

  useEffect(() => {
    const current = flatTree[selectedIndex];
    if (current && onHighlight) onHighlight(current.node.value ?? current.node.name);
  }, [selectedIndex, flatTree, onHighlight]);

  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + maxVisibleItems) {
      setScrollOffset(selectedIndex - maxVisibleItems + 1);
    }
  }, [selectedIndex, maxVisibleItems, scrollOffset]);

  const toggleExpand = (value: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const getDescendantValues = (node: TreeLeaf): string[] => {
    const values: string[] = [node.value ?? node.name];
    if (node.children) {
      node.children.forEach(child => values.push(...getDescendantValues(child)));
    }
    return values;
  };

  const handleToggleSelection = (node: TreeLeaf) => {
    const descendantValues = getDescendantValues(node);
    const nodeValue = node.value ?? node.name;
    const isCurrentlyChecked = checked.has(nodeValue);

    setChecked(prev => {
      const next = new Set(prev);
      if (isCurrentlyChecked) {
        // Deselecting node and all children
        const remainingAfterDeselect = prev.size - descendantValues.filter(v => prev.has(v)).length;
        if (minimumSelections !== undefined && remainingAfterDeselect < minimumSelections) {
          setFlashMessage(`Cannot deselect: minimum ${minimumSelections} required`);
          return prev;
        }
        descendantValues.forEach(v => next.delete(v));
      } else {
        // Selecting node and all children
        const newTotal = prev.size + descendantValues.filter(v => !prev.has(v)).length;
        if (maximumSelections !== undefined && newTotal > maximumSelections) {
          setFlashMessage(`Cannot select: maximum ${maximumSelections} allowed`);
          return prev;
        }
        descendantValues.forEach(v => next.add(v));
      }
      return next;
    });
  };

  useKeyboard((keyEvent) => {
    if (keyEvent.name === 'escape' || keyEvent.name === 'q') { onResponse(null); return; }

    if (keyEvent.name === 'up') setSelectedIndex(prev => Math.max(0, prev - 1));
    else if (keyEvent.name === 'down') setSelectedIndex(prev => Math.min(flatTree.length - 1, prev + 1));
    else if (keyEvent.name === 'pageup') setSelectedIndex(prev => Math.max(0, prev - Math.floor(maxVisibleItems / 2)));
    else if (keyEvent.name === 'pagedown') setSelectedIndex(prev => Math.min(flatTree.length - 1, prev + Math.floor(maxVisibleItems / 2)));
    else if (keyEvent.name === 'right') {
      const current = flatTree[selectedIndex];
      if (current?.isParent && !current.isExpanded) toggleExpand(current.node.value ?? current.node.name);
    } else if (keyEvent.name === 'left') {
      const current = flatTree[selectedIndex];
      if (current?.isExpanded) toggleExpand(current.node.value ?? current.node.name);
    } else if (keyEvent.name === 'space') {
      const current = flatTree[selectedIndex];
      if (!current) return;

      if (multiple) {
        const currentNodeValue = current.node.value ?? current.node.name;
        const rootNode = tree.find(root => (root.value ?? root.name) === currentNodeValue);
        handleToggleSelection(rootNode ?? current.node);
      } else if (current.isParent) {
        toggleExpand(current.node.value ?? current.node.name);
      }
    } else if (keyEvent.name === 'return') {
      if (multiple) {
        if (minimumSelections && checked.size < minimumSelections) {
          setFlashMessage(`Select at least ${minimumSelections} items`);
          return;
        }
        onResponse(Array.from(checked));
      } else {
        const current = flatTree[selectedIndex];
        if (current) onResponse([current.node.value ?? current.node.name]);
      }
    }
  });

  if (minimalMode) return <box><text fg={theme.chatSystemWarningMessage}>Terminal too small. Minimum: 40x10</text></box>;

  const visibleTree = flatTree.slice(scrollOffset, scrollOffset + maxVisibleItems);

  return (
    <box flexDirection="column" flexGrow={1} borderStyle="rounded" paddingLeft={1} paddingRight={1} title={label} backgroundColor={theme.panelBackground}>
      {multiple && (
        <text fg={theme.treeMessage}>
          Selected: {checked.size}
          {minimumSelections && ` (min: ${minimumSelections})`}
          {maximumSelections && ` (max: ${maximumSelections})`}
        </text>
      )}

      {visibleTree.map((item, visibleIndex) => {
        const actualIndex = scrollOffset + visibleIndex;
        const isSelected = actualIndex === selectedIndex;
        const itemNodeValue = item.node.value ?? item.node.name;
        const isChecked = checked.has(itemNodeValue);

        let fg: string = theme.treeNotSelectedItem;
        if (isSelected) fg = theme.treeHighlightedItem;
        else if (isChecked) fg = theme.treeFullySelectedItem;

        const availableWidth = width - (item.depth * 2) - 10;
        const truncatedLabel = item.node.name.length <= availableWidth
          ? item.node.name
          : item.node.name.substring(0, Math.max(0, availableWidth - 3)) + '...';

        return (
          <box key={itemNodeValue}>
            <text fg={fg}>
              {'  '.repeat(item.depth)}{isSelected ? '❯ ' : '  '}
              {item.isParent ? (item.isExpanded ? '▼ ' : '▶ ') : '  '}
              {multiple && (isChecked ? '◉ ' : '◯ ')}{truncatedLabel}
            </text>
          </box>
        );
      })}

      {flashMessage && <text fg={theme.confirmNo}>{flashMessage}</text>}

      <box flexGrow={1} flexDirection="row" alignItems="flex-end">
        <text>
          ({multiple ? 'Space to toggle branch, Enter to submit' : 'Space/→ to expand, ← to collapse, Enter to select'}), q to exit
        </text>
      </box>
    </box>
  );
}