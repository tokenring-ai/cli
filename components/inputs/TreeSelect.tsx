/** @jsxImportSource @opentui/react */
import {useKeyboard, useTerminalDimensions} from '@opentui/react';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useAbortSignal, useResponsiveLayout, useTreeNavigation} from '../../hooks';
import {theme} from '../../theme';
import type {TreeSelectProps} from '../../types';
import {canSelect, flattenTree, getChildValues, isSelectionValid, isVirtualParent} from '../../utils';

export default function TreeSelect({ question: {tree, defaultValue, minimumSelections, maximumSelections, label}, onResponse, signal, onHighlight }: TreeSelectProps) {
  const { height, width } = useTerminalDimensions();
  const layout = useResponsiveLayout();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const prevHeightRef = useRef(height);

  const {
    expanded,
    checked,
    loading,
    resolvedChildren,
    setChecked,
    expandNode,
    collapseNode
  } = useTreeNavigation(tree, defaultValue);

  useAbortSignal(signal, () => onResponse(null));

  useEffect(() => {
    if (flashMessage) {
      const timer = setTimeout(() => setFlashMessage(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [flashMessage]);

  const multiple = maximumSelections !== 1;
  const maxVisibleItems = layout.maxVisibleItems;

  const flatTree = useMemo(() => {
    return flattenTree(tree, expanded, resolvedChildren, loading);
  }, [tree, expanded, resolvedChildren, loading]);

  useEffect(() => {
    const current = flatTree[selectedIndex];
    if (current && onHighlight) {
      onHighlight(current.node.value);
    }
  }, [selectedIndex, flatTree, onHighlight]);

  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + maxVisibleItems) {
      setScrollOffset(selectedIndex - maxVisibleItems + 1);
    }
  }, [selectedIndex, maxVisibleItems, scrollOffset]);

  useEffect(() => {
    if (prevHeightRef.current !== height) {
      if (selectedIndex < scrollOffset) {
        setScrollOffset(selectedIndex);
      } else if (selectedIndex >= scrollOffset + maxVisibleItems) {
        setScrollOffset(Math.max(0, selectedIndex - maxVisibleItems + 1));
      }
      prevHeightRef.current = height;
    }
  }, [height, selectedIndex, scrollOffset, maxVisibleItems]);

  useKeyboard((keyEvent) => {
    if ((keyEvent.name === 'escape' || keyEvent.name === 'q')) {
      onResponse(null);
      return;
    }

    if (keyEvent.name === 'up') {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (keyEvent.name === 'down') {
      setSelectedIndex(prev => Math.min(flatTree.length - 1, prev + 1));
    } else if (keyEvent.name === 'pageup') {
      const halfScreen = Math.floor(maxVisibleItems / 2);
      setSelectedIndex(prev => Math.max(0, prev - halfScreen));
    } else if (keyEvent.name === 'pagedown') {
      const halfScreen = Math.floor(maxVisibleItems / 2);
      setSelectedIndex(prev => Math.min(flatTree.length - 1, prev + halfScreen));
    } else if (keyEvent.name === 'right') {
      const current = flatTree[selectedIndex];
      if (current && (current.node.children || current.node.childrenLoader)) {
        if (current.expanded) {
          // Already expanded, do nothing or could move to first child
        } else if (!current.loading) {
          expandNode(current.node.value, current.node.childrenLoader);
        }
      }
    } else if (keyEvent.name === 'left') {
      const current = flatTree[selectedIndex];
      if (current) {
        collapseNode(current.node.value);
      }
    } else if (keyEvent.name === 'space') {
      const current = flatTree[selectedIndex];
      if (current) {
        if (multiple) {
          setChecked(prev => {
            const next = new Set(prev);
            if (isVirtualParent(current.node)) {
              const children = getChildValues(current.node);
              const allSelected = children.every(val => next.has(val));

              if (allSelected) {
                if (minimumSelections !== undefined && next.size <= minimumSelections) {
                  setFlashMessage(`Cannot deselect: minimum ${minimumSelections} required`);
                  return prev;
                }
                children.forEach(val => next.delete(val));
              } else {
                if (maximumSelections !== undefined && next.size >= maximumSelections) {
                  setFlashMessage(`Cannot select: maximum ${maximumSelections} allowed`);
                  return prev;
                }
                children.forEach(val => next.add(val));
              }
            } else {
              if (next.has(current.node.value)) {
                if (minimumSelections !== undefined && next.size <= minimumSelections) {
                  setFlashMessage(`Cannot deselect: minimum ${minimumSelections} required`);
                  return prev;
                }
                next.delete(current.node.value);
              } else {
                if (maximumSelections !== undefined && next.size >= maximumSelections) {
                  setFlashMessage(`Cannot select: maximum ${maximumSelections} allowed`);
                  return prev;
                }
                next.add(current.node.value);
              }
            }
            return next;
          });
        } else {
          // Single selection mode: space toggles expansion
          if (current.node.children || current.node.childrenLoader) {
            if (current.expanded) {
              collapseNode(current.node.value);
            } else if (!current.loading) {
              expandNode(current.node.value, current.node.childrenLoader);
            }
          }
        }
      }
    } else if (keyEvent.name === 'return') {
      if (multiple) {
        if (!isSelectionValid(checked, minimumSelections, maximumSelections)) {
          if (checked.size < (minimumSelections || 0)) {
            setFlashMessage(`Select at least ${minimumSelections} items`);
          } else {
            setFlashMessage(`Select at most ${maximumSelections} items`);
          }
          return;
        }
        onResponse(Array.from(checked));
      } else {
        const current = flatTree[selectedIndex];
        if (current) {
          onResponse([current.node.value]);
        }
      }
    }
  });

  const truncateLabel = (label: string, maxWidth: number): string => {
    if (label.length <= maxWidth) return label;
    return label.substring(0, maxWidth - 3) + '...';
  };

  if (layout.minimalMode) {
    return (
      <box>
        <text fg={theme.chatSystemWarningMessage}>
          Terminal too small. Minimum: 40x10
        </text>
      </box>
    );
  }

  const visibleTree = useMemo(() => {
    return flatTree.slice(scrollOffset, scrollOffset + maxVisibleItems);
  }, [flatTree, scrollOffset, maxVisibleItems]);

  return (
    <box flexDirection="column" borderStyle="rounded"  paddingLeft={1} paddingRight={1} title={label} backgroundColor={theme.panelBackground}>
      {multiple && (
        <text fg={theme.treeMessage}>
          Selected: {checked.size}
          {minimumSelections && ` (min: ${minimumSelections})`}
          {maximumSelections && ` (max: ${maximumSelections})`}
        </text>
      )}
      {visibleTree.map((item, visibleIndex) => {
        const actualIndex = scrollOffset + visibleIndex;
        const virtual = isVirtualParent(item.node);
        const childValues = virtual ? getChildValues(item.node) : [];
        const selectedCount = childValues.filter(v => checked.has(v)).length;
        const itemCanSelect = !virtual && canSelect(item.node.value, checked, minimumSelections, maximumSelections);

        let fg: string = theme.treeNotSelectedItem;
        if (actualIndex === selectedIndex) fg = theme.treeHighlightedItem;
        else if (checked.has(item.node.value)) fg = theme.treeFullySelectedItem;
        else if (multiple && virtual) {
          if (selectedCount === childValues.length) fg = theme.treeFullySelectedItem;
          else if (selectedCount > 0) fg = theme.treePartiallySelectedItem;
        }

        const itemFg = multiple && !virtual && !itemCanSelect ? theme.treeNotSelectedItem : fg;

        const availableWidth = width - (item.depth * 2) - 10;
        const truncatedLabel = truncateLabel(item.node.label, availableWidth);

        return (
          <box key={actualIndex}>
            <text fg={itemFg}>
              {'  '.repeat(item.depth)}
              {actualIndex === selectedIndex ? '❯ ' : '  '}
              {item.loading
                ? '⏳ '
                : (item.node.children || item.node.childrenLoader)
                  ? (item.expanded ? '▼ ' : '▶ ')
                  : '  '}
              {multiple && !virtual && (checked.has(item.node.value) ? '◉ ' : '◯ ')}
              {truncatedLabel}
              {multiple && virtual && ` (${selectedCount}/${childValues.length} selected)`}
            </text>
          </box>
        );
      })}
      {flashMessage && <text fg={theme.confirmNo}>{flashMessage}</text>}
      <text>
        ({multiple ? 'Space to toggle, Enter to submit' : 'Space/→ to expand, ← to collapse, Enter to select'}), q to exit
      </text>
    </box>
  );
}
