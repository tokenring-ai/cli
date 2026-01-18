/** @jsxImportSource @opentui/react */
import {useKeyboard, useTerminalDimensions} from '@opentui/react';
import {FileSystemService} from "@tokenring-ai/filesystem";
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {theme} from '../../theme';
import type {FileSelectProps} from "./types.ts";

export interface AsyncFileNode {
  name: string;
  value: string;
  isDirectory: boolean;
  children?: AsyncFileNode[];
}

interface FlatItem {
  node: AsyncFileNode;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
}

export default function FileSelect({
                                     question: {
                                       label = 'Select Files',
                                       allowFiles = true,
                                       allowDirectories = true,
                                       defaultValue = [],
                                       minimumSelections,
                                       maximumSelections
                                     },
                                     agent,
                                     onResponse,
                                     signal
                                   }: FileSelectProps) {
  const fileSystemService = agent.requireServiceByType(FileSystemService);
  const { height, width } = useTerminalDimensions();

  const [nodes, setNodes] = useState<AsyncFileNode[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set(defaultValue));
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const multiple = maximumSelections !== 1;
  const maxVisibleItems = Math.max(5, height - 8);

  const loadPath = useCallback(async (path: string): Promise<AsyncFileNode[]> => {
    const entries = await Array.fromAsync(fileSystemService.getDirectoryTree(path, { recursive: false, ignoreFilter: () => false }, agent));
    return entries.map(name => {
      const isDirectory = name.endsWith('/');
      const fullPath = isDirectory ? name.slice(0, -1) : name;

      let cleanName = (isDirectory ? name.substring(0, name.length - 1) : name);
      cleanName = cleanName.substring(cleanName.lastIndexOf('/') + 1);


      return {
        name: cleanName,
        value: fullPath,
        isDirectory,
        children: undefined
      };
    });
  }, [fileSystemService]);

  // Initial load of current directory
  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      try {
        const rootEntries = await loadPath('.');
        setNodes(rootEntries);
      } catch (e) {
        setFlashMessage("Failed to load root directory");
      } finally {
        setInitialLoading(false);
      }
    };
    init();
  }, [loadPath]);

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

  const updateTreeNodes = (tree: AsyncFileNode[], path: string, children: AsyncFileNode[]): AsyncFileNode[] => {
    return tree.map(node => {
      if (node.value === path) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: updateTreeNodes(node.children, path, children) };
      }
      return node;
    });
  };

  const toggleExpand = useCallback(async (node: AsyncFileNode) => {
    if (!node.isDirectory) return;

    const isOpening = !expanded.has(node.value);

    if (isOpening) {
      setExpanded(prev => new Set(prev).add(node.value));

      if (node.children === undefined) {
        setLoadingPaths(prev => new Set(prev).add(node.value));
        try {
          const children = await loadPath(node.value);
          setNodes(currentNodes => updateTreeNodes(currentNodes, node.value, children));
        } catch (e) {
          setFlashMessage("Failed to load directory");
          setExpanded(prev => {
            const next = new Set(prev);
            next.delete(node.value);
            return next;
          });
        } finally {
          setLoadingPaths(prev => {
            const next = new Set(prev);
            next.delete(node.value);
            return next;
          });
        }
      }
    } else {
      setExpanded(prev => {
        const next = new Set(prev);
        next.delete(node.value);
        return next;
      });
    }
  }, [expanded, loadPath]);

  const flatTree = useMemo(() => {
    const result: FlatItem[] = [];
    const traverse = (nodeList: AsyncFileNode[], depth: number) => {
      for (const node of nodeList) {
        const isVisible = (node.isDirectory && allowDirectories) || (!node.isDirectory && allowFiles);
        // We still traverse directories even if not "selectable" to allow navigation
        const showThisNode = isVisible || node.isDirectory;

        if (showThisNode) {
          const isOpen = expanded.has(node.value);
          const isLoading = loadingPaths.has(node.value);
          result.push({ node, depth, isExpanded: isOpen, isLoading });

          if (isOpen && node.children) {
            traverse(node.children, depth + 1);
          }
        }
      }
    };
    traverse(nodes, 0);
    return result;
  }, [nodes, expanded, loadingPaths, allowFiles, allowDirectories]);

  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + maxVisibleItems) {
      setScrollOffset(selectedIndex - maxVisibleItems + 1);
    }
  }, [selectedIndex, maxVisibleItems, scrollOffset]);

  useKeyboard((keyEvent) => {
    if (keyEvent.name === 'escape' || keyEvent.name === 'q') {
      onResponse(null);
      return;
    }

    if (keyEvent.name === 'up') setSelectedIndex(prev => Math.max(0, prev - 1));
    else if (keyEvent.name === 'down') setSelectedIndex(prev => Math.min(flatTree.length - 1, prev + 1));
    else if (keyEvent.name === 'right') {
      const current = flatTree[selectedIndex];
      if (current?.node.isDirectory && !current.isExpanded) toggleExpand(current.node);
    } else if (keyEvent.name === 'left') {
      const current = flatTree[selectedIndex];
      if (current?.isExpanded) toggleExpand(current.node);
    } else if (keyEvent.name === 'space') {
      const current = flatTree[selectedIndex];
      if (!current) return;

      const isSelectable = (current.node.isDirectory && allowDirectories) || (!current.node.isDirectory && allowFiles);

      if (multiple && isSelectable) {
        setChecked(prev => {
          const next = new Set(prev);
          if (next.has(current.node.value)) {
            if (minimumSelections && next.size <= minimumSelections) {
              setFlashMessage(`Min ${minimumSelections} required`);
              return prev;
            }
            next.delete(current.node.value);
          } else {
            if (maximumSelections && next.size >= maximumSelections) {
              setFlashMessage(`Max ${maximumSelections} allowed`);
              return prev;
            }
            next.add(current.node.value);
          }
          return next;
        });
      } else if (current.node.isDirectory) {
        toggleExpand(current.node);
      }
    } else if (keyEvent.name === 'return') {
      if (multiple) {
        if (minimumSelections && checked.size < minimumSelections) {
          setFlashMessage(`Select at least ${minimumSelections}`);
          return;
        }
        onResponse(Array.from(checked));
      } else {
        const current = flatTree[selectedIndex];
        const isSelectable = current && ((current.node.isDirectory && allowDirectories) || (!current.node.isDirectory && allowFiles));
        if (isSelectable) onResponse([current.node.value]);
      }
    }
  });

  if (height < 10 || width < 40) return <box><text fg={theme.chatSystemWarningMessage}>Terminal too small.</text></box>;

  if (initialLoading) {
    return (
      <box flexDirection="column" borderStyle="rounded" paddingLeft={1} paddingRight={1} title={label} backgroundColor={theme.panelBackground}>
        <text fg={theme.treeMessage}>⏳ Loading directory...</text>
      </box>
    );
  }

  const visibleTree = flatTree.slice(scrollOffset, scrollOffset + maxVisibleItems);

  return (
    <box flexDirection="column" borderStyle="rounded" paddingLeft={1} paddingRight={1} title={label} backgroundColor={theme.panelBackground}>
      {multiple && (
        <text fg={theme.treeMessage}>
          Selected: {checked.size} {maximumSelections ? `/ ${maximumSelections}` : ''}
        </text>
      )}

      {visibleTree.map((item, visibleIndex) => {
        const actualIndex = scrollOffset + visibleIndex;
        const isSelected = actualIndex === selectedIndex;
        const isChecked = checked.has(item.node.value);
        const isSelectable = (item.node.isDirectory && allowDirectories) || (!item.node.isDirectory && allowFiles);

        let fg: string = isSelected ? theme.treeHighlightedItem : (isChecked ? theme.treeFullySelectedItem : theme.treeNotSelectedItem);
        if (item.node.isDirectory) {
          for (const checkedItem of checked) {
            if (checkedItem.startsWith(item.node.value)) {
              fg = theme.treePartiallySelectedItem;
              break;
            }
          }
        }

        if (!isSelectable && !isSelected) fg = theme.treeNotSelectedItem; // Dim non-selectable items

        const availableWidth = width - (item.depth * 2) - 10;
        const truncatedName = item.node.name.length <= availableWidth
          ? item.node.name
          : item.node.name.substring(0, Math.max(0, availableWidth - 3)) + '...';

        return (
          <box key={item.node.value}>
            <text fg={fg}>
              {'  '.repeat(item.depth)}{isSelected ? '❯ ' : '  '}
              {item.isLoading ? '⏳ ' : item.node.isDirectory ? (item.isExpanded ? '▼ ' : '▶ ') : '  '}
              {multiple && isSelectable && (isChecked ? '◉ ' : '◯ ')}
              {truncatedName}
            </text>
          </box>
        );
      })}

      {flashMessage && <text fg={theme.confirmNo}>{flashMessage}</text>}

      <text fg={theme.treeMessage} marginTop={1}>
        Arrows to navigate, Space to {multiple ? 'select/expand' : 'expand'}, Enter to submit
      </text>
    </box>
  );
}