/** @jsxImportSource @opentui/react */

import {
  type questionResponseTypes, type TreeLeaf,
  TreeSelectQuestionSchema
} from "@tokenring-ai/agent/HumanInterfaceRequest";
import {useKeyboard, useTerminalDimensions} from '@opentui/react';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {z} from "zod";
import {theme} from '../theme.ts';

interface TreeNode {
  label: string;
  value: string;
  children?: TreeNode[];
  childrenLoader?: () => Promise<TreeLeaf[]> | TreeLeaf[];
}

interface FlatNode {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  loading: boolean;
}

export default function TreeSelectionScreen({
                                                                     question,
                                                                     onResponse,
                                                                     signal
                                                                   }: {
  question: z.output<typeof TreeSelectQuestionSchema>,
  onResponse: (response: string[] | null) => void,
  signal?: AbortSignal
}) {
  const { tree, defaultValue, minimumSelections, maximumSelections } = question;

  const { height } = useTerminalDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set(defaultValue ?? []));
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [resolvedChildren, setResolvedChildren] = useState<Map<string, TreeLeaf[]>>(new Map());

  React.useEffect(() => {
    if (signal) {
      const handler = () => onResponse(null);
      signal.addEventListener('abort', handler);
      return () => signal.removeEventListener('abort', handler);
    }
  }, [signal, onResponse]);


  const multiple = maximumSelections !== 1;

  const canSelect = (value: string): boolean => {
    const isCurrentlySelected = checked.has(value);

    if (isCurrentlySelected) {
      if (minimumSelections !== undefined && checked.size <= minimumSelections) {
        return false;
      }
      return true;
    } else {
      if (maximumSelections !== undefined && checked.size >= maximumSelections) {
        return false;
      }
      return true;
    }
  };

  const isSelectionValid = (): boolean => {
    const count = checked.size;
    if (minimumSelections !== undefined && count < minimumSelections) {
      return false;
    }
    if (maximumSelections !== undefined && count > maximumSelections) {
      return false;
    }
    return true;
  };

  const isVirtualParent = (node: TreeNode) => {
    return (node.children || node.childrenLoader) &&
           (!node.value || node.value.includes('*'));
  };

  const getChildValues = (node: TreeNode): string[] => {
    const values: string[] = [];
    const traverse = (n: TreeNode) => {
      if (!isVirtualParent(n)) {
        values.push(n.value);
      }
      n.children?.forEach(traverse);
    };
    node.children?.forEach(traverse);
    return values;
  };

  const maxVisibleItems = Math.max(1, height - 6);

  useEffect(() => {
    const rootValue = tree.value || tree.name;

    if (typeof tree.children === 'function' && !resolvedChildren.has(rootValue) && !loading.has(rootValue)) {
      const loadRootChildren = async () => {
        setLoading(prev => new Set(prev).add(rootValue));

        try {
          const loader = tree.children as () => Promise<TreeLeaf[]> | TreeLeaf[];
          const result = loader();
          const children = result instanceof Promise ? await result : result;

          setResolvedChildren(prev => new Map(prev).set(rootValue, children));
        } finally {
          setLoading(prev => {
            const next = new Set(prev);
            next.delete(rootValue);
            return next;
          });
        }
      };

      loadRootChildren();
    }
  }, [tree, resolvedChildren, loading]);

  const flatTree = useMemo(() => {
    const result: FlatNode[] = [];

    const convertLeaf = (leaf: TreeLeaf, resolvedMap: Map<string, TreeLeaf[]>): TreeNode => {
      const value = leaf.value || leaf.name;
      const resolved = resolvedMap.get(value);

      let children: TreeNode[] | undefined;
      let childrenLoader: (() => Promise<TreeLeaf[]> | TreeLeaf[]) | undefined;

      if (resolved) {
        children = resolved.map(child => convertLeaf(child, resolvedMap));
      } else if (Array.isArray(leaf.children)) {
        children = leaf.children.map(child => convertLeaf(child, resolvedMap));
      } else if (typeof leaf.children === 'function') {
        childrenLoader = leaf.children;
      }

      return {
        label: leaf.name,
        value,
        children,
        childrenLoader
      };
    };

    const traverse = (leaves: TreeLeaf[], depth: number) => {
      for (const leaf of leaves) {
        const convertedNode = convertLeaf(leaf, resolvedChildren);
        const isExpanded = expanded.has(convertedNode.value);
        const isLoading = loading.has(convertedNode.value);

        result.push({
          node: convertedNode,
          depth,
          expanded: isExpanded,
          loading: isLoading
        });

        if (isExpanded) {
          const resolved = resolvedChildren.get(convertedNode.value);
          if (resolved) {
            traverse(resolved, depth + 1);
          } else if (Array.isArray(leaf.children)) {
            traverse(leaf.children, depth + 1);
          }
        }
      }
    };

    const rootValue = tree.value || tree.name;
    const rootResolved = resolvedChildren.get(rootValue);

    let rootChildren: TreeLeaf[];
    if (rootResolved) {
      rootChildren = rootResolved;
    } else if (Array.isArray(tree.children)) {
      rootChildren = tree.children;
    } else {
      rootChildren = [];
    }

    traverse(rootChildren, 0);
    return result;
  }, [tree, expanded, resolvedChildren, loading]);

  const expandNode = useCallback(async (current: FlatNode) => {
    const nodeValue = current.node.value;

    if (current.node.childrenLoader && !resolvedChildren.has(nodeValue)) {
      setLoading(prev => new Set(prev).add(nodeValue));

      try {
        const result = current.node.childrenLoader();
        const children = result instanceof Promise ? await result : result;

        setResolvedChildren(prev => new Map(prev).set(nodeValue, children));
        setExpanded(prev => new Set(prev).add(nodeValue));
      } finally {
        setLoading(prev => {
          const next = new Set(prev);
          next.delete(nodeValue);
          return next;
        });
      }
    } else if (current.node.children || resolvedChildren.has(nodeValue)) {
      setExpanded(prev => new Set(prev).add(nodeValue));
    }
  }, [resolvedChildren]);

  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + maxVisibleItems) {
      setScrollOffset(selectedIndex - maxVisibleItems + 1);
    }
  }, [selectedIndex, maxVisibleItems, scrollOffset]);

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
      if (current && !current.loading) {
        expandNode(current);
      }
    } else if (keyEvent.name === 'left') {
      const current = flatTree[selectedIndex];
      if (current) {
        setExpanded(prev => {
          const next = new Set(prev);
          next.delete(current.node.value);
          return next;
        });
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
                  return prev;
                }
                children.forEach(val => next.delete(val));
              } else {
                if (maximumSelections !== undefined && next.size >= maximumSelections) {
                  return prev;
                }
                children.forEach(val => next.add(val));
              }
            } else {
              if (next.has(current.node.value)) {
                if (minimumSelections !== undefined && next.size <= minimumSelections) {
                  return prev;
                }
                next.delete(current.node.value);
              } else {
                if (maximumSelections !== undefined && next.size >= maximumSelections) {
                  return prev;
                }
                next.add(current.node.value);
              }
            }
            return next;
          });
        } else {
          if (!current.loading) {
            expandNode(current);
          }
        }
      }
    } else if (keyEvent.name === 'return') {
      if (multiple) {
        if (isSelectionValid()) {
          onResponse(Array.from(checked));
        }
      } else {
        const current = flatTree[selectedIndex];
        if (current) {
          onResponse([current.node.value]);
        }
      }
    }
  });

  const visibleTree = useMemo(() => {
    return flatTree.slice(scrollOffset, scrollOffset + maxVisibleItems);
  }, [flatTree, scrollOffset, maxVisibleItems]);

  return (
    <box flexDirection="column" borderStyle="single" paddingLeft={1} paddingRight={1} title={question.label} >
      {visibleTree.map((item, visibleIndex) => {
        const actualIndex = scrollOffset + visibleIndex;
        const virtual = isVirtualParent(item.node);
        const childValues = virtual ? getChildValues(item.node) : [];
        const selectedCount = childValues.filter(v => checked.has(v)).length;

        let fg : string = theme.treeNotSelectedItem;
        if (actualIndex === selectedIndex) fg = theme.treeHighlightedItem;
        else if (checked.has(item.node.value)) fg = theme.treeFullySelectedItem;
        else if (multiple && virtual) {
          if (selectedCount == childValues.length) fg = theme.treeFullySelectedItem;
          else if (selectedCount > 0) fg = theme.treePartiallySelectedItem;
        }

        return (
          <box key={actualIndex}>
            <text fg={fg}>
              {'  '.repeat(item.depth)}
              {actualIndex === selectedIndex ? '❯ ' : '  '}
              {item.loading
                ? '⏳ '
                : (item.node.children || item.node.childrenLoader)
                  ? (item.expanded ? '▼ ' : '▶ ')
                  : '  '}
              {multiple && !virtual && (checked.has(item.node.value) ? '◉ ' : '◯ ')}
              {item.node.label}
              {multiple && virtual && ` (${selectedCount}/${childValues.length} selected)`}
            </text>
          </box>
        );
      })}
      <text>
        ({multiple ? 'Space to toggle, Enter to submit' : 'Enter to select'}), q to exit
      </text>
    </box>
  );
}
