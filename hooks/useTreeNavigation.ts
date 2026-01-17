import { useState, useCallback, useEffect } from 'react';
import type { TreeLeaf } from "@tokenring-ai/agent/HumanInterfaceRequest";

export function useTreeNavigation(tree: TreeLeaf, defaultValue?: string[]) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set(defaultValue ?? []));
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [resolvedChildren, setResolvedChildren] = useState<Map<string, TreeLeaf[]>>(new Map());

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

  const expandNode = useCallback(async (nodeValue: string, childrenLoader?: () => Promise<TreeLeaf[]> | TreeLeaf[]) => {
    if (childrenLoader && !resolvedChildren.has(nodeValue)) {
      setLoading(prev => new Set(prev).add(nodeValue));

      try {
        const result = childrenLoader();
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
    } else {
      // Node has static children or already resolved, just expand it
      setExpanded(prev => new Set(prev).add(nodeValue));
    }
  }, [resolvedChildren]);

  const collapseNode = useCallback((nodeValue: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.delete(nodeValue);
      return next;
    });
  }, []);

  return {
    expanded,
    checked,
    loading,
    resolvedChildren,
    setChecked,
    expandNode,
    collapseNode
  };
}
