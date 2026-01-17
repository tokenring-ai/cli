import { useState, useCallback, useEffect } from 'react';
import type {AsyncTreeLeaf} from "../types";

export function useTreeNavigation(tree: AsyncTreeLeaf, defaultValue?: string[]) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set(defaultValue ?? []));
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [resolvedChildren, setResolvedChildren] = useState<Map<string, AsyncTreeLeaf[]>>(new Map());

  useEffect(() => {
    const rootValue = tree.value || tree.name;

    if (typeof tree.children === 'function' && !resolvedChildren.has(rootValue) && !loading.has(rootValue)) {
      const loadRootChildren = async () => {
        setLoading(prev => new Set(prev).add(rootValue));

        try {
          const loader = tree.children as () => Promise<AsyncTreeLeaf[]> | AsyncTreeLeaf[];
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

  const expandNode = useCallback(async (nodeValue: string, childrenLoader?: () => Promise<AsyncTreeLeaf[]> | AsyncTreeLeaf[]) => {
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
