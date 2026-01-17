import type {AsyncTreeLeaf} from "./inputs.ts";

export interface TreeNode {
  label: string;
  value: string;
  icon?: string;
  children?: TreeNode[];
  childrenLoader?: (signal?: AbortSignal) => Promise<AsyncTreeLeaf[]> | AsyncTreeLeaf[];
}

export interface FlatNode {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  loading: boolean;
}
