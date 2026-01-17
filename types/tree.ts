import type { TreeLeaf } from "@tokenring-ai/agent/HumanInterfaceRequest";

export interface TreeNode {
  label: string;
  value: string;
  children?: TreeNode[];
  childrenLoader?: () => Promise<TreeLeaf[]> | TreeLeaf[];
}

export interface FlatNode {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  loading: boolean;
}
