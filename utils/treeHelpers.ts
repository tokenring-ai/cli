import type {AsyncTreeLeaf, FlatNode, TreeNode} from "../types";

export function convertLeafToNode(
  leaf: AsyncTreeLeaf,
  resolvedMap: Map<string, AsyncTreeLeaf[]>
): TreeNode {
  const value = leaf.value || leaf.name;
  const resolved = resolvedMap.get(value);

  let children: TreeNode[] | undefined;
  let childrenLoader: ((signal?: AbortSignal) => Promise<AsyncTreeLeaf[]> | AsyncTreeLeaf[]) | undefined;

  if (resolved) {
    children = resolved.map(child => convertLeafToNode(child, resolvedMap));
  } else if (Array.isArray(leaf.children)) {
    children = leaf.children.map(child => convertLeafToNode(child, resolvedMap));
  } else if (typeof leaf.children === 'function') {
    childrenLoader = leaf.children as ((signal?: AbortSignal) => Promise<AsyncTreeLeaf[]> | AsyncTreeLeaf[]);
  }

  return {
    label: leaf.name,
    value,
    children,
    childrenLoader
  };
}

export function isVirtualParent(node: TreeNode): boolean {
  return (node.children || node.childrenLoader) !== undefined &&
         (!node.value || node.value.includes('*'));
}

export function getChildValues(node: TreeNode): string[] {
  const values: string[] = [];
  const traverse = (n: TreeNode) => {
    if (!isVirtualParent(n)) {
      values.push(n.value);
    }
    n.children?.forEach(traverse);
  };
  node.children?.forEach(traverse);
  return values;
}

export function flattenTree(
  tree: AsyncTreeLeaf,
  expanded: Set<string>,
  resolvedChildren: Map<string, AsyncTreeLeaf[]>,
  loading: Set<string>
): FlatNode[] {
  const result: FlatNode[] = [];

  const traverse = (leaves: AsyncTreeLeaf[], depth: number) => {
    for (const leaf of leaves) {
      const convertedNode = convertLeafToNode(leaf, resolvedChildren);
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

  let rootChildren: AsyncTreeLeaf[];
  if (rootResolved) {
    rootChildren = rootResolved;
  } else if (Array.isArray(tree.children)) {
    rootChildren = tree.children;
  } else {
    rootChildren = [];
  }

  traverse(rootChildren, 0);
  return result;
}
