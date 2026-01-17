/** @jsxImportSource @opentui/react */
import {FileSystemService} from "@tokenring-ai/filesystem";
import {useKeyboard, useTerminalDimensions} from '@opentui/react';
import React, { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type {AsyncTreeLeaf, FileSelectProps} from '../../types';
import {theme} from '../../theme';
import {useAbortSignal, useResponsiveLayout, useTreeNavigation} from '../../hooks';
import {canSelect, flattenTree, getChildValues, isSelectionValid, isVirtualParent} from '../../utils';

export default function FileSelect({ agent, question: { allowFiles, allowDirectories, defaultValue, minimumSelections, maximumSelections, label}, onResponse, signal }: FileSelectProps) {
  const fileSystemService = agent.requireServiceByType(FileSystemService);
  const { height, width } = useTerminalDimensions();
  const layout = useResponsiveLayout();
  const [previewElement, setPreviewElement] = useState<ReactNode | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const prevHeightRef = useRef(height);

  const multiple = maximumSelections !== 1;
  const maxVisibleItems = layout.maxVisibleItems;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleHighlight = useCallback(async (filePath: string) => {
    try {
      const stat = await fileSystemService.stat(filePath, agent);
      const fileType = stat.isDirectory ? 'Directory' : stat.isFile ? 'File' : 'Unknown';

      setPreviewElement(
        <box flexDirection="column" flexGrow={1} borderStyle="single" paddingLeft={1} paddingRight={1} title="File Info">
          <text fg={theme.boxTitle}>{filePath}<br /></text>
          <box><text fg={theme.treeNotSelectedItem}>Type: </text><text fg={theme.chatOutputText}>{fileType}</text></box>
          {stat.size !== undefined && (
            <box><text fg={theme.treeNotSelectedItem}>Size: </text><text fg={theme.chatOutputText}>{formatBytes(stat.size)}</text></box>
          )}
          {stat.modified && (
            <box><text fg={theme.treeNotSelectedItem}>Modified: </text><text fg={theme.chatOutputText}>{new Date(stat.modified).toLocaleString()}</text></box>
          )}
        </box>
      );
    } catch (e) {
      setPreviewElement(
        <box flexDirection="column" flexGrow={1} borderStyle="single" paddingLeft={1} paddingRight={1} title="File Info">
          <text fg={theme.boxTitle}>{filePath}<br /></text>
          <text fg={theme.chatSystemErrorMessage}>Error: {e instanceof Error ? e.message : 'Failed to stat file'}</text>
        </box>
      );
    }
  }, [fileSystemService, agent]);

  const buildTree = async (path = ""): Promise<Array<AsyncTreeLeaf>> => {
    const children: Array<AsyncTreeLeaf> = [];

    for await (const itemPath of fileSystemService.getDirectoryTree(path, {
      ignoreFilter: (itemPath) => false,
      recursive: false,
    }, agent)) {
      if (itemPath.endsWith("/")) {
        const dirName = itemPath
          .substring(0, itemPath.length - 1)
          .split("/")
          .pop()!;
        children.push({
          name: dirName,
          ...(allowDirectories && {value: itemPath}),
          children: () => buildTree(itemPath),
        });
      } else if (allowFiles) {
        const fileName = itemPath.split("/").pop()!;
        children.push({
          name: fileName,
          value: itemPath,
        });
      }
    }

    return children;
  };

  const tree = {
    name: "File Selection",
    label: label || "File Selection",
    children: buildTree,
  };

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

  const flatTree = useMemo(() => {
    return flattenTree(tree, expanded, resolvedChildren, loading);
  }, [tree, expanded, resolvedChildren, loading]);

  useEffect(() => {
    const current = flatTree[selectedIndex];
    if (current) {
      handleHighlight(current.node.value);
    }
  }, [selectedIndex, flatTree, handleHighlight]);

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

  const countSelectedInPath = (dirPath: string): number => {
    let count = 0;
    for (const selectedPath of checked) {
      if (selectedPath.startsWith(dirPath)) {
        count++;
      }
    }
    return count;
  };

  return (
    <box flexDirection={layout.isNarrow ? "column" : "row"} flexGrow={1}>
      <box flexDirection="column" flexGrow={layout.isNarrow ? 0 : 1}>
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
            const isDirectory = item.node.children || item.node.childrenLoader;
            const itemCanSelect = !virtual && canSelect(item.node.value, checked, minimumSelections, maximumSelections);

            let fg: string = theme.treeNotSelectedItem;
            if (actualIndex === selectedIndex) fg = theme.treeHighlightedItem;
            else if (checked.has(item.node.value)) fg = theme.treeFullySelectedItem;
            else if (multiple) {
              if (virtual) {
                if (selectedCount === childValues.length && childValues.length > 0) fg = theme.treeFullySelectedItem;
                else if (selectedCount > 0) fg = theme.treePartiallySelectedItem;
              } else if (isDirectory) {
                const selectedInDir = countSelectedInPath(item.node.value);
                if (selectedInDir > 0) fg = theme.treePartiallySelectedItem;
              }
            }

            const itemFg = multiple && !virtual && !isDirectory && !itemCanSelect ? theme.treeNotSelectedItem : fg;

            const availableWidth = width - (item.depth * 2) - 10;
            const truncatedLabel = truncateLabel(item.node.label, availableWidth);

            return (
              <box key={actualIndex}>
                <text fg={itemFg}>
                  {'  '.repeat(item.depth)}
                  {actualIndex === selectedIndex ? '❯ ' : '  '}
                  {item.loading
                    ? '⏳ '
                    : isDirectory
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
      </box>
      {previewElement && (
        layout.isNarrow ? (
          <box width="100%" marginTop={1}>{previewElement}</box>
        ) : layout.isShort ? null : (
          <box flexGrow={1} width="50%" maxWidth={75} marginLeft={1}>{previewElement}</box>
        )
      )}
    </box>
  );
}