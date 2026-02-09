import {Box, Text, useInput} from 'ink';
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(defaultValue));
  const [checked, setChecked] = useState<Set<string>>(new Set(defaultValue ?? []));
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const multiple = maximumSelections !== 1;
  const maxVisibleItems = 20;

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
        const remainingAfterDeselect = prev.size - descendantValues.filter(v => prev.has(v)).length;
        if (minimumSelections !== undefined && remainingAfterDeselect < minimumSelections) {
          setFlashMessage(`Cannot deselect: minimum ${minimumSelections} required`);
          return prev;
        }
        descendantValues.forEach(v => next.delete(v));
      } else {
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

  useInput((input, key) => {
    if (key.escape || input === 'q') { onResponse(null); return; }

    if (key.upArrow) setSelectedIndex(prev => Math.max(0, prev - 1));
    else if (key.downArrow) setSelectedIndex(prev => Math.min(flatTree.length - 1, prev + 1));
    else if (key.pageUp) setSelectedIndex(prev => Math.max(0, prev - Math.floor(maxVisibleItems / 2)));
    else if (key.pageDown) setSelectedIndex(prev => Math.min(flatTree.length - 1, prev + Math.floor(maxVisibleItems / 2)));
    else if (key.rightArrow) {
      const current = flatTree[selectedIndex];
      if (current?.isParent && !current.isExpanded) toggleExpand(current.node.value ?? current.node.name);
    } else if (key.leftArrow) {
      const current = flatTree[selectedIndex];
      if (current?.isExpanded) toggleExpand(current.node.value ?? current.node.name);
    } else if (input === ' ') {
      const current = flatTree[selectedIndex];
      if (!current) return;

      if (multiple) {
        const currentNodeValue = current.node.value ?? current.node.name;
        const rootNode = tree.find(root => (root.value ?? root.name) === currentNodeValue);
        handleToggleSelection(rootNode ?? current.node);
      } else if (current.isParent) {
        toggleExpand(current.node.value ?? current.node.name);
      }
    } else if (key.return) {
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

  const visibleTree = flatTree.slice(scrollOffset, scrollOffset + maxVisibleItems);

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" paddingLeft={1} paddingRight={1}>
      <Text color={theme.treeMessage}>{label}</Text>
      {multiple && (
        <Text color={theme.treeMessage}>
          Selected: {checked.size}
          {minimumSelections && ` (min: ${minimumSelections})`}
          {maximumSelections && ` (max: ${maximumSelections})`}
        </Text>
      )}

      {visibleTree.map((item) => {
        const itemNodeValue = item.node.value ?? item.node.name;
        const isSelected = flatTree.indexOf(item) === selectedIndex;
        const isChecked = checked.has(itemNodeValue);

        let color: string = theme.treeNotSelectedItem;
        if (isSelected) color = theme.treeHighlightedItem;
        else if (isChecked) color = theme.treeFullySelectedItem;

        return (
          <Box key={itemNodeValue}>
            <Text color={color}>
              {'  '.repeat(item.depth)}{isSelected ? '❯ ' : '  '}
              {item.isParent ? (item.isExpanded ? '▼ ' : '▶ ') : '  '}
              {multiple && (isChecked ? '◉ ' : '◯ ')}{item.node.name}
            </Text>
          </Box>
        );
      })}

      {flashMessage && <Text color={theme.confirmNo}>{flashMessage}</Text>}

      <Box flexGrow={1} flexDirection="row">
        <Text>
          ({multiple ? 'Space to toggle branch, Enter to submit' : 'Space/→ to expand, ← to collapse, Enter to select'}), q to exit
        </Text>
      </Box>
    </Box>
  );
}
