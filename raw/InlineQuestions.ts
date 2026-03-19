import type {ParsedFileSelectQuestion, ParsedFormQuestion, ParsedTextQuestion, ParsedTreeSelectQuestion, TreeLeaf,} from "@tokenring-ai/agent/question";
import {clamp} from "@tokenring-ai/utility/number/clamp";
import {flattenWrappedLines} from "@tokenring-ai/utility/string/flattenWrappedLines";
import {truncateVisible} from "@tokenring-ai/utility/string/truncateVisible";
import {visibleLength} from "@tokenring-ai/utility/string/visibleLength";
import chalk from "chalk";
import {theme} from "../theme.ts";
import InputEditor from "./InputEditor.ts";

export type Keypress = {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence?: string;
};

export type RenderLayout = {
  columns: number;
  rows: number;
};

export type RenderBlock = {
  lines: string[];
  cursorRow?: number;
  cursorColumn?: number;
  showCursor?: boolean;
};

export type InlineQuestionCallbacks = {
  onSubmit: (result: unknown) => void;
  onCancel: () => void;
  onRender: () => void;
  listFileSelectEntries: (path: string) => Promise<string[]>;
};

export interface InlineQuestionSession {
  render(layout: RenderLayout): RenderBlock;
  handleKeypress(input: string, key: Keypress): boolean | Promise<boolean>;
}

type PrimitiveQuestion =
  | ParsedTextQuestion
  | ParsedTreeSelectQuestion
  | ParsedFileSelectQuestion;

type ParsedQuestion =
  | ParsedTextQuestion
  | ParsedTreeSelectQuestion
  | ParsedFileSelectQuestion
  | ParsedFormQuestion;

interface AsyncFileNode {
  name: string;
  value: string;
  isDirectory: boolean;
  children?: AsyncFileNode[];
}

interface FlatFileItem {
  node: AsyncFileNode;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
}

const QUESTION_COLOR = chalk.hex(theme.chatQuestionRequest);
const MUTED_COLOR = chalk.hex(theme.chatDivider);
const ERROR_COLOR = chalk.hex(theme.chatSystemErrorMessage);
const TREE_COLOR = chalk.hex(theme.treeMessage);
const TREE_HIGHLIGHT = chalk.hex(theme.treeHighlightedItem);
const TREE_SELECTED = chalk.hex(theme.treeFullySelectedItem);
const TREE_PARTIAL = chalk.hex(theme.treePartiallySelectedItem);
const TREE_IDLE = chalk.hex(theme.treeNotSelectedItem);
const FILE_BROWSER_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
const PROMPT_COLOR = chalk.hex(theme.askMessage).bold;
const TEXT_INDENT = "  ";
const RAW_PROMPT_PREFIX = " → ";
const RAW_CONTINUATION_PREFIX = "   ";
const PROMPT_PREFIX = ` ${PROMPT_COLOR("→")} `;
const CONTINUATION_PREFIX = RAW_CONTINUATION_PREFIX;

function compareFileNodesForBrowsing(left: AsyncFileNode, right: AsyncFileNode): number {
  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  const nameDifference = FILE_BROWSER_COLLATOR.compare(left.name, right.name);
  if (nameDifference !== 0) {
    return nameDifference;
  }

  return FILE_BROWSER_COLLATOR.compare(left.value, right.value);
}

function renderEditor(
  editor: InputEditor,
  options: {
    width: number;
    maxContentLines: number;
    placeholder: string;
    masked?: boolean;
  },
): {
  lines: string[];
  cursorRow: number;
  cursorColumn: number;
  isEmpty: boolean;
} {
  const width = Math.max(4, options.width);
  const text = editor.getText();
  const cursor = editor.getCursor();
  const source = options.masked ? "*".repeat(text.length) : text;

  const lines = [""];
  let row = 0;
  let cursorRow = 0;
  let cursorColumn = 0;

  for (let index = 0; index < source.length; index += 1) {
    if (index === cursor) {
      cursorRow = row;
      cursorColumn = visibleLength(lines[row]);
    }

    const char = source[index];
    if (char === "\n") {
      row += 1;
      lines.push("");
      continue;
    }

    lines[row] += char;
    if (visibleLength(lines[row]) >= width) {
      row += 1;
      lines.push("");
    }
  }

  if (cursor === source.length) {
    cursorRow = row;
    cursorColumn = visibleLength(lines[row]);
  }

  const visibleCount = clamp(lines.length, 1, Math.max(1, options.maxContentLines));
  const windowStart = clamp(cursorRow - visibleCount + 1, 0, Math.max(0, lines.length - visibleCount));
  const visibleLines = lines.slice(windowStart, windowStart + visibleCount);

  return {
    lines: visibleLines,
    cursorRow: cursorRow - windowStart,
    cursorColumn,
    isEmpty: text.length === 0,
  };
}

function applyEditorKeypress(editor: InputEditor, input: string, key: Keypress): boolean {
  if (key.ctrl && key.name === "a") {
    editor.moveHome();
    return true;
  }
  if (key.ctrl && key.name === "e") {
    editor.moveEnd();
    return true;
  }
  if (key.ctrl && key.name === "u") {
    editor.deleteToStartOfLine();
    return true;
  }
  if (key.ctrl && key.name === "k") {
    editor.deleteToEndOfLine();
    return true;
  }
  if (key.ctrl && key.name === "w") {
    editor.deleteWordBackward();
    return true;
  }
  if (key.ctrl && key.name === "d") {
    editor.deleteForward();
    return true;
  }
  if (key.meta && key.name === "b") {
    editor.moveWordLeft();
    return true;
  }
  if (key.meta && key.name === "f") {
    editor.moveWordRight();
    return true;
  }
  if (key.name === "left") {
    editor.moveLeft();
    return true;
  }
  if (key.name === "right") {
    editor.moveRight();
    return true;
  }
  if (key.name === "up") {
    const {lineIndex} = editor.getCursorLocation();
    if (lineIndex > 0) {
      editor.moveUp();
      return true;
    }
    return false;
  }
  if (key.name === "down") {
    const {lineIndex} = editor.getCursorLocation();
    if (lineIndex < editor.getLineCount() - 1) {
      editor.moveDown();
      return true;
    }
    return false;
  }
  if (key.name === "home") {
    editor.moveHome();
    return true;
  }
  if (key.name === "end") {
    editor.moveEnd();
    return true;
  }
  if (key.name === "backspace") {
    editor.backspace();
    return true;
  }
  if (key.name === "delete") {
    editor.deleteForward();
    return true;
  }

  if (input && !key.ctrl && !key.meta) {
    editor.insert(input.replace(/\r\n?/g, "\n"));
    return true;
  }

  return false;
}

class TextQuestionSession implements InlineQuestionSession {
  private readonly editor: InputEditor;
  private flashMessage: string | null = null;

  constructor(
    private readonly question: ParsedTextQuestion,
    private readonly callbacks: InlineQuestionCallbacks,
  ) {
    this.editor = new InputEditor(question.defaultValue);
  }

  render(layout: RenderLayout): RenderBlock {
    const lines: string[] = [];
    const innerWidth = Math.max(10, layout.columns - visibleLength(RAW_PROMPT_PREFIX));
    const maxContentLines = clamp(
      this.question.expectedLines > 1 ? this.question.expectedLines : 1,
      1,
      Math.max(3, Math.min(10, Math.floor(layout.rows * 0.35))),
    );

    lines.push(QUESTION_COLOR(this.question.label));
    if (this.question.description) {
      lines.push(...flattenWrappedLines([this.question.description], layout.columns, TEXT_INDENT).map((line) => MUTED_COLOR(line)));
    }

    const editorView = renderEditor(this.editor, {
      width: innerWidth,
      maxContentLines,
      placeholder: this.question.required ? "Type a response" : "Type a response or leave blank",
      masked: this.question.masked,
    });

    editorView.lines.forEach((line, index) => {
      const prefix = index === 0 ? PROMPT_PREFIX : CONTINUATION_PREFIX;
      const body = editorView.isEmpty && index === 0
        ? MUTED_COLOR(editorView.lines[index])
        : line;
      lines.push(`${prefix}${body || (editorView.isEmpty && index === 0 ? MUTED_COLOR(editorView.isEmpty ? this.question.required ? "Required response" : "Optional response" : "") : "")}`);
    });

    if (editorView.isEmpty) {
      const placeholder = this.question.required ? "Required response" : "Optional response";
      lines[lines.length - editorView.lines.length] = `${PROMPT_PREFIX}${MUTED_COLOR(placeholder)}`;
    }

    if (this.flashMessage) {
      lines.push(ERROR_COLOR(this.flashMessage));
    }

    lines.push(MUTED_COLOR(this.question.expectedLines > 1
      ? "Enter submit  Alt+Enter newline  Esc cancel"
      : "Enter submit  Esc cancel"));

    const promptStart = lines.length - editorView.lines.length - (this.flashMessage ? 2 : 1);
    return {
      lines,
      cursorRow: promptStart + editorView.cursorRow,
      cursorColumn: (editorView.cursorRow === 0 ? visibleLength(RAW_PROMPT_PREFIX) : visibleLength(RAW_CONTINUATION_PREFIX)) + editorView.cursorColumn,
      showCursor: true,
    };
  }

  handleKeypress(input: string, key: Keypress): boolean {
    if (key.name === "escape") {
      this.callbacks.onCancel();
      return true;
    }

    if (key.meta && key.name === "return") {
      this.editor.insertNewline();
      this.flashMessage = null;
      return true;
    }

    if (key.ctrl && key.name === "o") {
      this.editor.insertNewline();
      this.flashMessage = null;
      return true;
    }

    if (key.name === "return") {
      const value = this.editor.getText().trimEnd();
      if (this.question.required && value.trim().length === 0) {
        this.flashMessage = "A response is required.";
        return true;
      }

      this.callbacks.onSubmit(value.trim().length === 0 ? null : value);
      return true;
    }

    const handled = applyEditorKeypress(this.editor, input, key);
    if (handled) {
      this.flashMessage = null;
    }
    return handled;
  }
}

type FlatTreeItem = {
  key: string;
  depth: number;
  node: TreeLeaf & { children: any };
  isExpanded: boolean;
  isParent: true;
  descendantLeafCount: number;
  selectedLeafCount: number;
} | {
  key: string;
  depth: number;
  node: TreeLeaf & { value: string };
  isParent: false;
  isExpanded?: never;
  descendantLeafCount?: never;
  selectedLeafCount?: never;
};

function getNodeKey(node: TreeLeaf, ancestry: string[]): string {
  if ("value" in node) return node.value;
  return [...ancestry, node.name].join("/");
}

function countLeafNodes(node: TreeLeaf): number {
  if ("children" in node) {
    return node.children.reduce((total, child) => total + countLeafNodes(child), 0);
  }
  return 1;
}

function countSelectedLeafNodes(node: TreeLeaf, checked: Set<string>): number {
  if ("children" in node) {
    return node.children.reduce((total, child) => total + countSelectedLeafNodes(child, checked), 0);
  }
  return checked.has(node.value) ? 1 : 0;
}

class TreeQuestionSession implements InlineQuestionSession {
  private selectedIndex = 0;
  private scrollOffset = 0;
  private readonly expanded: Set<string>;
  private readonly checked: Set<string>;
  private flashMessage: string | null = null;

  constructor(
    private readonly question: ParsedTreeSelectQuestion,
    private readonly callbacks: InlineQuestionCallbacks,
  ) {
    this.checked = new Set(question.defaultValue);
    this.expanded = new Set();
  }

  render(layout: RenderLayout): RenderBlock {
    const flatTree = this.getFlatTree();
    const maxVisibleItems = Math.max(4, Math.min(flatTree.length, layout.rows - 10));

    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + maxVisibleItems) {
      this.scrollOffset = this.selectedIndex - maxVisibleItems + 1;
    }

    const visibleTree = flatTree.slice(this.scrollOffset, this.scrollOffset + maxVisibleItems);
    const multiple = this.question.maximumSelections !== 1;
    const lines: string[] = [];

    for (let index = 0; index < visibleTree.length; index += 1) {
      const item = visibleTree[index];
      const actualIndex = this.scrollOffset + index;
      const isSelected = actualIndex === this.selectedIndex;
      const isChecked = "value" in item.node && this.checked.has(item.node.value);

      const treeGlyph = item.isParent
        ? multiple
          ? item.selectedLeafCount > 0
            ? "◐"
            : "○"
          : (item.isExpanded ? "▾" : "▸")
        : isChecked
            ? "●"
            : "-";



      const pointer = isSelected ? "›" : " ";
      const indent = "  ".repeat(item.depth);
      const countSuffix = multiple && item.isParent && item.descendantLeafCount > 0 ? ` (${item.selectedLeafCount}/${item.descendantLeafCount})` : "";
      const availableWidth = Math.max(10, layout.columns - visibleLength(indent) - 8);
      const label = truncateVisible(`${item.node.name}${countSuffix}`, availableWidth);

      let color = TREE_IDLE;
      if (isSelected) {
        color = TREE_HIGHLIGHT;
      } else if (isChecked) {
        color = TREE_SELECTED;
      } else if (item.isParent && item.selectedLeafCount > 0) {
        color = TREE_PARTIAL;
      }

      lines.push(color(` ${pointer} ${indent}${treeGlyph} ${label}`));
    }

    if (multiple) {
      const min = this.question.minimumSelections ? `  min ${this.question.minimumSelections}` : "";
      const max = this.question.maximumSelections ? `  max ${this.question.maximumSelections}` : "";
      lines.push(TREE_COLOR(`Selected ${this.checked.size}${min}${max}`));
    }

    if (this.flashMessage) {
      lines.push(ERROR_COLOR(this.flashMessage));
    }

    return {
      lines,
      showCursor: false,
    };
  }

  handleKeypress(_input: string, key: Keypress): boolean {
    const flatTree = this.getFlatTree();
    const current = flatTree[this.selectedIndex];
    const multiple = this.question.maximumSelections !== 1;

    if (key.name === "escape" || key.name === "q") {
      this.callbacks.onCancel();
      return true;
    }

    if (key.name === "up") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.flashMessage = null;
      return true;
    }
    if (key.name === "down") {
      this.selectedIndex = Math.min(flatTree.length - 1, this.selectedIndex + 1);
      this.flashMessage = null;
      return true;
    }
    if (key.name === "pageup") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 8);
      this.flashMessage = null;
      return true;
    }
    if (key.name === "pagedown") {
      this.selectedIndex = Math.min(flatTree.length - 1, this.selectedIndex + 8);
      this.flashMessage = null;
      return true;
    }
    if (key.name === "right") {
      if (current?.isParent && !current.isExpanded) {
        this.expanded.add(current.key);
        this.flashMessage = null;
        return true;
      }
      return false;
    }
    if (key.name === "left") {
      if (current?.isParent && current.isExpanded) {
        this.expanded.delete(current.key);
        this.flashMessage = null;
        return true;
      }
      return false;
    }
    if (key.name === "space") {
      if (!current) return false;

      if (multiple) {
        this.toggleSelection(current.node);
        return true;
      }

      if (current.isParent) {
        if (current.isExpanded) {
          this.expanded.delete(current.key);
        } else {
          this.expanded.add(current.key);
        }
        return true;
      }

      this.callbacks.onSubmit([current.node.value]);
      return true;
    }
    if (key.name === "return") {
      if (!current) return false;

      if (multiple) {
        if (this.question.minimumSelections && this.checked.size < this.question.minimumSelections) {
          this.flashMessage = `Select at least ${this.question.minimumSelections} item${this.question.minimumSelections === 1 ? "" : "s"}.`;
          return true;
        }

        this.callbacks.onSubmit(Array.from(this.checked));
        return true;
      }

      if (current.isParent) {
        if (current.isExpanded) {
          this.expanded.delete(current.key);
        } else {
          this.expanded.add(current.key);
        }
        return true;
      }

      this.callbacks.onSubmit([current.node.value ?? current.node.name]);
      return true;
    }

    return false;
  }

  private getFlatTree(): FlatTreeItem[] {
    const result: FlatTreeItem[] = [];
    const walk = (node: TreeLeaf, depth: number, ancestry: string[]) => {
      const key = getNodeKey(node, ancestry);

      let resultItem: FlatTreeItem;
      if ("children" in node) {
        resultItem ={
          key,
          node,
          depth,
          isExpanded: this.expanded.has(key),
          isParent: true,
          descendantLeafCount: countLeafNodes(node),
          selectedLeafCount: countSelectedLeafNodes(node, this.checked),
        };
      } else {
        resultItem = {
          key,
          node,
          depth,
          isParent: false,
        };
      }
      result.push(resultItem);

      if (resultItem.isParent && resultItem.isExpanded) {
        for (const child of resultItem.node.children ?? []) {
          walk(child, depth + 1, [...ancestry, node.name]);
        }
      }
    };

    for (const node of this.question.tree) {
      walk(node, 0, []);
    }

    return result;
  }

  private getDescendantValues(node: TreeLeaf): string[] {
    if ("children" in node) {
      return node.children.flatMap((child) => this.getDescendantValues(child));
    }
    return [node.value];
  }

  private toggleSelection(node: TreeLeaf): void {
    const values = this.getDescendantValues(node);
    const currentlyChecked = values.every((value) => this.checked.has(value));

    if (currentlyChecked) {
      const nextSize = this.checked.size - values.filter((value) => this.checked.has(value)).length;
      if (this.question.minimumSelections && nextSize < this.question.minimumSelections) {
        this.flashMessage = `At least ${this.question.minimumSelections} item${this.question.minimumSelections === 1 ? "" : "s"} must remain selected.`;
        return;
      }

      values.forEach((value) => this.checked.delete(value));
      this.flashMessage = null;
      return;
    }

    const nextSize = this.checked.size + values.filter((value) => !this.checked.has(value)).length;
    if (this.question.maximumSelections && nextSize > this.question.maximumSelections) {
      this.flashMessage = `Select at most ${this.question.maximumSelections} item${this.question.maximumSelections === 1 ? "" : "s"}.`;
      return;
    }

    values.forEach((value) => this.checked.add(value));
    this.flashMessage = null;
  }
}

class FileQuestionSession implements InlineQuestionSession {
  private nodes: AsyncFileNode[] = [];
  private selectedIndex = 0;
  private scrollOffset = 0;
  private readonly expanded = new Set<string>();
  private readonly loadingPaths = new Set<string>();
  private readonly checked: Set<string>;
  private flashMessage: string | null = null;
  private initialLoading = true;

  constructor(
    private readonly question: ParsedFileSelectQuestion,
    private readonly callbacks: InlineQuestionCallbacks,
  ) {
    this.checked = new Set(question.defaultValue);
    queueMicrotask(() => {
      void this.initialize();
    });
  }

  render(layout: RenderLayout): RenderBlock {
    const lines: string[] = [];
    const multiple = this.question.maximumSelections !== 1;

    lines.push(QUESTION_COLOR(this.question.label));
    if (this.question.description) {
      lines.push(...flattenWrappedLines([this.question.description], layout.columns, TEXT_INDENT).map((line) => MUTED_COLOR(line)));
    }

    if (this.initialLoading) {
      lines.push(TREE_COLOR("Loading directory..."));
      if (this.flashMessage) {
        lines.push(ERROR_COLOR(this.flashMessage));
      }
      return {
        lines,
        showCursor: false,
      };
    }

    const flatTree = this.getFlatTree();
    const maxVisibleItems = Math.max(4, Math.min(Math.max(1, flatTree.length), layout.rows - 12));

    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + maxVisibleItems) {
      this.scrollOffset = this.selectedIndex - maxVisibleItems + 1;
    }

    if (multiple) {
      const min = this.question.minimumSelections ? `  min ${this.question.minimumSelections}` : "";
      const max = this.question.maximumSelections ? `  max ${this.question.maximumSelections}` : "";
      lines.push(TREE_COLOR(`Selected ${this.checked.size}${min}${max}`));
    }

    if (flatTree.length === 0) {
      lines.push(MUTED_COLOR("Current directory is empty."));
    } else {
      const visibleTree = flatTree.slice(this.scrollOffset, this.scrollOffset + maxVisibleItems);

      for (let index = 0; index < visibleTree.length; index += 1) {
        const item = visibleTree[index];
        const actualIndex = this.scrollOffset + index;
        const isSelected = actualIndex === this.selectedIndex;
        const isChecked = this.checked.has(item.node.value);
        const isSelectable = this.isSelectable(item.node);
        const isPartial = item.node.isDirectory && this.hasCheckedDescendant(item.node.value);
        const pointer = isSelected ? "›" : " ";
        const indent = "  ".repeat(item.depth);
        const branchGlyph = item.isLoading ? "…" : item.node.isDirectory ? (item.isExpanded ? "▾" : "▸") : " ";
        const toggleGlyph = multiple ? `${isSelectable ? (isChecked ? "◉" : "◯") : " "} ` : "";
        const label = truncateVisible(
          item.node.name,
          Math.max(10, layout.columns - visibleLength(indent) - visibleLength(toggleGlyph) - 8),
        );

        let color = TREE_IDLE;
        if (isSelected) {
          color = TREE_HIGHLIGHT;
        } else if (isChecked) {
          color = TREE_SELECTED;
        } else if (isPartial) {
          color = TREE_PARTIAL;
        }

        lines.push(color(` ${pointer} ${indent}${branchGlyph} ${toggleGlyph}${label}`));
      }
    }

    if (this.flashMessage) {
      lines.push(ERROR_COLOR(this.flashMessage));
    }

    lines.push(MUTED_COLOR(
      multiple
        ? "Arrows move  Right/Left expand  Space select or open dirs  Enter submit  Esc or q cancel"
        : "Arrows move  Right/Left or Space expand  Enter submit  Esc or q cancel",
    ));

    return {
      lines,
      showCursor: false,
    };
  }

  async handleKeypress(_input: string, key: Keypress): Promise<boolean> {
    if (key.name === "escape" || key.name === "q") {
      this.callbacks.onCancel();
      return true;
    }

    if (this.initialLoading) {
      return true;
    }

    const flatTree = this.getFlatTree();
    const current = flatTree[this.selectedIndex];
    const multiple = this.question.maximumSelections !== 1;

    if (key.name === "up") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.flashMessage = null;
      return true;
    }

    if (key.name === "down") {
      this.selectedIndex = Math.min(Math.max(0, flatTree.length - 1), this.selectedIndex + 1);
      this.flashMessage = null;
      return true;
    }

    if (key.name === "pageup") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 8);
      this.flashMessage = null;
      return true;
    }

    if (key.name === "pagedown") {
      this.selectedIndex = Math.min(Math.max(0, flatTree.length - 1), this.selectedIndex + 8);
      this.flashMessage = null;
      return true;
    }

    if (key.name === "right") {
      if (current?.node.isDirectory && !current.isExpanded) {
        await this.toggleExpand(current.node);
        this.flashMessage = null;
        return true;
      }
      return false;
    }

    if (key.name === "left") {
      if (current?.isExpanded) {
        await this.toggleExpand(current.node);
        this.flashMessage = null;
        return true;
      }
      return false;
    }

    if (key.name === "space") {
      if (!current) {
        return false;
      }

      if (multiple && this.isSelectable(current.node)) {
        this.toggleSelection(current.node.value);
        return true;
      }

      if (current.node.isDirectory) {
        await this.toggleExpand(current.node);
        return true;
      }

      return false;
    }

    if (key.name === "return") {
      if (multiple) {
        if (this.question.minimumSelections && this.checked.size < this.question.minimumSelections) {
          this.flashMessage = `Select at least ${this.question.minimumSelections} item${this.question.minimumSelections === 1 ? "" : "s"}.`;
          return true;
        }

        this.callbacks.onSubmit(Array.from(this.checked));
        return true;
      }

      if (!current) {
        return false;
      }

      if (this.isSelectable(current.node)) {
        this.callbacks.onSubmit([current.node.value]);
        return true;
      }
    }

    return false;
  }

  private async initialize(): Promise<void> {
    this.initialLoading = true;
    this.callbacks.onRender();

    try {
      this.nodes = await this.loadPath(".");
      this.selectedIndex = 0;
      this.scrollOffset = 0;
      this.flashMessage = null;
    } catch {
      this.flashMessage = "Failed to load root directory.";
    } finally {
      this.initialLoading = false;
      this.callbacks.onRender();
    }
  }

  private async loadPath(path: string): Promise<AsyncFileNode[]> {
    const entries = await this.callbacks.listFileSelectEntries(path);
    return entries.map((entry) => {
      const isDirectory = entry.endsWith("/");
      const value = isDirectory ? entry.slice(0, -1) : entry;
      const name = value.slice(value.lastIndexOf("/") + 1);

      return {
        name,
        value,
        isDirectory,
      };
    }).sort(compareFileNodesForBrowsing);
  }

  private getFlatTree(): FlatFileItem[] {
    const result: FlatFileItem[] = [];

    const traverse = (nodeList: AsyncFileNode[], depth: number) => {
      for (const node of nodeList) {
        const isVisible = this.isSelectable(node);
        const showNode = isVisible || node.isDirectory;

        if (!showNode) {
          continue;
        }

        const isExpanded = this.expanded.has(node.value);
        const isLoading = this.loadingPaths.has(node.value);
        result.push({node, depth, isExpanded, isLoading});

        if (isExpanded && node.children) {
          traverse(node.children, depth + 1);
        }
      }
    };

    traverse(this.nodes, 0);
    return result;
  }

  private isSelectable(node: AsyncFileNode): boolean {
    return (node.isDirectory && this.question.allowDirectories) || (!node.isDirectory && this.question.allowFiles);
  }

  private hasCheckedDescendant(path: string): boolean {
    const prefix = `${path}/`;
    for (const checkedPath of this.checked) {
      if (checkedPath === path || checkedPath.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  private async toggleExpand(node: AsyncFileNode): Promise<void> {
    if (!node.isDirectory) {
      return;
    }

    const isOpening = !this.expanded.has(node.value);
    if (!isOpening) {
      this.expanded.delete(node.value);
      this.callbacks.onRender();
      return;
    }

    this.expanded.add(node.value);
    this.callbacks.onRender();

    if (node.children !== undefined) {
      return;
    }

    this.loadingPaths.add(node.value);
    this.callbacks.onRender();

    try {
      const children = await this.loadPath(node.value);
      this.nodes = this.updateTreeNodes(this.nodes, node.value, children);
      this.flashMessage = null;
    } catch {
      this.flashMessage = "Failed to load directory.";
      this.expanded.delete(node.value);
    } finally {
      this.loadingPaths.delete(node.value);
      this.callbacks.onRender();
    }
  }

  private updateTreeNodes(tree: AsyncFileNode[], path: string, children: AsyncFileNode[]): AsyncFileNode[] {
    return tree.map((node) => {
      if (node.value === path) {
        return {...node, children};
      }
      if (node.children) {
        return {...node, children: this.updateTreeNodes(node.children, path, children)};
      }
      return node;
    });
  }

  private toggleSelection(path: string): void {
    if (this.checked.has(path)) {
      if (this.question.minimumSelections && this.checked.size <= this.question.minimumSelections) {
        this.flashMessage = `Select at least ${this.question.minimumSelections} item${this.question.minimumSelections === 1 ? "" : "s"}.`;
        return;
      }

      this.checked.delete(path);
      this.flashMessage = null;
      return;
    }

    if (this.question.maximumSelections && this.checked.size >= this.question.maximumSelections) {
      this.flashMessage = `Select at most ${this.question.maximumSelections} item${this.question.maximumSelections === 1 ? "" : "s"}.`;
      return;
    }

    this.checked.add(path);
    this.flashMessage = null;
  }
}

class FormQuestionSession implements InlineQuestionSession {
  private currentSectionIndex = 0;
  private currentFieldIndex = 0;
  private readonly responses: Record<string, Record<string, unknown>> = {};
  private currentSession: InlineQuestionSession;

  constructor(
    private readonly question: ParsedFormQuestion,
    private readonly callbacks: InlineQuestionCallbacks,
  ) {
    this.currentSession = this.createCurrentSession();
  }

  render(layout: RenderLayout): RenderBlock {
    const currentSection = this.question.sections[this.currentSectionIndex];
    const fieldKeys = Object.keys(currentSection.fields);
    const currentFieldKey = fieldKeys[this.currentFieldIndex];
    const child = this.currentSession.render(layout);

    const lines = [
      QUESTION_COLOR(`${currentSection.name}  ${this.currentSectionIndex + 1}/${this.question.sections.length}`),
      MUTED_COLOR(`Field ${this.currentFieldIndex + 1}/${fieldKeys.length}  ${currentFieldKey}`),
    ];

    if (currentSection.description) {
      lines.push(...flattenWrappedLines([currentSection.description], layout.columns, TEXT_INDENT).map((line) => MUTED_COLOR(line)));
    }

    const offset = lines.length;
    lines.push(...child.lines);

    return {
      lines,
      cursorRow: child.cursorRow === undefined ? undefined : child.cursorRow + offset,
      cursorColumn: child.cursorColumn,
      showCursor: child.showCursor,
    };
  }

  handleKeypress(input: string, key: Keypress): boolean | Promise<boolean> {
    if (key.name === "escape") {
      this.callbacks.onCancel();
      return true;
    }

    return this.currentSession.handleKeypress(input, key);
  }

  private createCurrentSession(): InlineQuestionSession {
    const currentSection = this.question.sections[this.currentSectionIndex];
    const fieldKeys = Object.keys(currentSection.fields);
    const fieldKey = fieldKeys[this.currentFieldIndex];
    const field = currentSection.fields[fieldKey];

    return createPrimitiveSession(field, {
      onCancel: () => this.callbacks.onCancel(),
      onRender: this.callbacks.onRender,
      listFileSelectEntries: this.callbacks.listFileSelectEntries,
      onSubmit: (result) => {
        const sectionName = currentSection.name;
        this.responses[sectionName] ??= {};
        this.responses[sectionName][fieldKey] = result;
        this.advance();
      },
    }, field.label);
  }

  private advance(): void {
    const currentSection = this.question.sections[this.currentSectionIndex];
    const fieldKeys = Object.keys(currentSection.fields);

    if (this.currentFieldIndex < fieldKeys.length - 1) {
      this.currentFieldIndex += 1;
      this.currentSession = this.createCurrentSession();
      this.callbacks.onRender();
      return;
    }

    if (this.currentSectionIndex < this.question.sections.length - 1) {
      this.currentSectionIndex += 1;
      this.currentFieldIndex = 0;
      this.currentSession = this.createCurrentSession();
      this.callbacks.onRender();
      return;
    }

    this.callbacks.onSubmit(this.responses);
  }
}

function createPrimitiveSession(
  question: PrimitiveQuestion,
  callbacks: InlineQuestionCallbacks,
  message: string,
): InlineQuestionSession {
  switch (question.type) {
    case "text":
      return new TextQuestionSession(question, callbacks);
    case "treeSelect":
      return new TreeQuestionSession(question, callbacks);
    case "fileSelect":
      return new FileQuestionSession(question, callbacks);
  }
}

export function createInlineQuestionSession(
  question: ParsedQuestion,
  callbacks: InlineQuestionCallbacks,
  message: string,
): InlineQuestionSession {
  if (question.type === "form") {
    return new FormQuestionSession(question, callbacks);
  }

  return createPrimitiveSession(question, callbacks, message);
}
