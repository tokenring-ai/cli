import Agent from "@tokenring-ai/agent/Agent";
import {
  type AgentEventEnvelope,
  type ParsedInteractionRequest,
} from "@tokenring-ai/agent/AgentEvents";
import type {ParsedFileSelectQuestion} from "@tokenring-ai/agent/question";
import {AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import {CommandHistoryState} from "@tokenring-ai/agent/state/commandHistoryState";
import {ChatModelRegistry} from "@tokenring-ai/ai-client/ModelRegistry";
import {parseModelAndSettings} from "@tokenring-ai/ai-client/util/modelSettings";
import {ChatService} from "@tokenring-ai/chat";
import {FileSystemService} from "@tokenring-ai/filesystem";
import chalk from "chalk";
import process from "node:process";
import readline from "node:readline";
import {setTimeout as sleep} from "node:timers/promises";
import type {z} from "zod";
import {renderScreen as renderScreenInk} from "../ink/renderScreen.tsx";
import InkQuestionInputScreen from "../ink/screens/QuestionInputScreen.tsx";
import {renderScreen as renderScreenOpenTUI} from "../opentui/renderScreen.tsx";
import OpenTUIQuestionInputScreen from "../opentui/screens/QuestionInputScreen.tsx";
import {CLIConfigSchema} from "../schema.ts";
import {theme} from "../theme.ts";
import applyMarkdownStyles from "../utility/applyMarkdownStyles.ts";
import {
  createInlineQuestionSession,
  type InlineQuestionSession,
  type Keypress as InlineKeypress,
  type RenderBlock,
} from "./InlineQuestions.ts";
import {
  compareFilePathsForBrowsing,
  findActiveFileSearchToken,
  getFileSearchMatches,
  replaceFileSearchToken,
  type FileSearchToken,
} from "./FileSearch.ts";
import {
  type CommandDefinition,
  getCommandCompletionContext,
  getLongestCommonPrefix,
} from "./CommandCompletions.ts";
import InputEditor from "./InputEditor.ts";

type TranscriptTone =
  | "chat"
  | "reasoning"
  | "info"
  | "warning"
  | "error"
  | "input"
  | "success"
  | "muted";

type TranscriptEntry = {
  id: number;
  kind: TranscriptEntryKind;
  title: string | null;
  body: string;
  tone: TranscriptTone;
  markdown: boolean;
};

type TranscriptEntryKind =
  | "system"
  | "input"
  | "chat"
  | "reasoning"
  | "info"
  | "warning"
  | "error"
  | "artifact"
  | "response";

type CompletionState = {
  sourceQuery: string;
  matches: CommandDefinition[];
  selectedIndex: number;
};

type FileSearchState = {
  token: FileSearchToken;
  matches: string[];
  selectedIndex: number;
  loading: boolean;
  error: string | null;
};

type FlashMessage = {
  text: string;
  tone: Exclude<TranscriptTone, "chat" | "reasoning" | "input" | "muted"> | "muted";
  expiresAt: number;
};

type FooterSnapshot = {
  lineCount: number;
  cursorRow: number;
  cursorColumn: number;
  showCursor: boolean;
};

type TranscriptDelta =
  | {
    kind: "none";
  }
  | {
    kind: "append";
    text: string;
    footerNeedsLeadingNewline: boolean;
  }
  | {
    kind: "continueStream";
    text: string;
    footerNeedsLeadingNewline: boolean;
    fromColumn: number;
  };

type FollowupInteraction = Extract<ParsedInteractionRequest, {type: "followup"}>;
type QuestionInteraction = Extract<ParsedInteractionRequest, {type: "question"}>;

const TONE_COLORS: Record<TranscriptTone, (text: string) => string> = {
  chat: chalk.hex(theme.chatOutputText),
  reasoning: chalk.hex(theme.chatReasoningText),
  info: chalk.hex(theme.chatSystemInfoMessage),
  warning: chalk.hex(theme.chatSystemWarningMessage),
  error: chalk.hex(theme.chatSystemErrorMessage),
  input: chalk.hex(theme.chatPreviousInput),
  success: chalk.hex(theme.chatInputHandledSuccess),
  muted: chalk.hex(theme.chatDivider),
};

const STATUS_BAR = chalk.hex(theme.chatDivider);
const TITLE_COLOR = chalk.hex(theme.boxTitle).bold;
const PROMPT_ARROW_COLOR = chalk.hex(theme.askMessage).bold;
const PLACEHOLDER_COLOR = chalk.hex(theme.chatDivider);
const FILE_SEARCH_SELECTED = chalk.hex(theme.treeHighlightedItem).bold;
const FILE_SEARCH_IDLE = chalk.hex(theme.chatSystemInfoMessage);
const RAW_PROMPT_PREFIX = " → ";
const RAW_CONTINUATION_PREFIX = "   ";
const PROMPT_PREFIX = ` ${PROMPT_ARROW_COLOR("→")} `;
const CONTINUATION_PREFIX = RAW_CONTINUATION_PREFIX;
const HEADER_PREFIX = " · ";
const TEXT_INDENT = "   ";
const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function trimBoundaryNewlines(text: string): string {
  return text.replace(/^\n+|\n+$/g, "");
}

function visibleLength(text: string): number {
  return Array.from(text).length;
}

function truncateVisible(text: string, width: number): string {
  if (width <= 0) return "";
  const chars = Array.from(text);
  if (chars.length <= width) return text;
  if (width <= 1) return chars.slice(0, width).join("");
  return `${chars.slice(0, width - 1).join("")}…`;
}

function wrapPlainText(text: string, width: number): string[] {
  if (width <= 0) return [""];

  const normalizedLines = text.replace(/\t/g, "  ").split("\n");
  const wrapped: string[] = [];

  for (const line of normalizedLines) {
    if (line.length === 0) {
      wrapped.push("");
      continue;
    }

    let current = "";
    for (const char of Array.from(line)) {
      current += char;
      if (visibleLength(current) >= width) {
        wrapped.push(current);
        current = "";
      }
    }

    if (current.length > 0) {
      wrapped.push(current);
    }
  }

  return wrapped.length > 0 ? wrapped : [""];
}

function shortenPath(path: string): string {
  const home = process.env.HOME;
  if (home && path.startsWith(home)) {
    return `~${path.slice(home.length) || "/"}`;
  }
  return path;
}

function formatPercentLeft(value: number | null): string {
  if (value === null) return "-- left";
  return `${value}% left`;
}

function formatCompactNumber(value: number | null, suffix = ""): string {
  if (value === null) return `--${suffix}`;
  if (value < 1000) return `${value}${suffix}`;
  if (value < 1_000_000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k${suffix}`;
  return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}m${suffix}`;
}

function formatCurrency(value: number | null): string {
  if (value === null) return "$--";
  if (value >= 100) return `$${value.toFixed(0)}`;
  if (value >= 10) return `$${value.toFixed(1)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

function formatTimer(timestamp: number): string {
  const remainingMs = Math.max(0, timestamp - Date.now());
  const seconds = Math.ceil(remainingMs / 1000);
  return `auto ${seconds}s`;
}

function flattenWrappedLines(lines: string[], width: number, prefix = ""): string[] {
  const result: string[] = [];
  const innerWidth = Math.max(1, width - visibleLength(prefix));

  for (const line of lines) {
    for (const wrapped of wrapPlainText(line, innerWidth)) {
      result.push(`${prefix}${wrapped}`);
    }
  }

  return result.length > 0 ? result : [prefix];
}

function renderEditor(
  editor: InputEditor,
  width: number,
  maxContentLines: number,
): {
  visibleLines: string[];
  cursorRow: number;
  cursorColumn: number;
  isEmpty: boolean;
} {
  const text = editor.getText();
  const cursor = editor.getCursor();
  const lines = [""];
  let row = 0;
  let cursorRow = 0;
  let cursorColumn = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (index === cursor) {
      cursorRow = row;
      cursorColumn = visibleLength(lines[row]);
    }

    const char = text[index];
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

  if (cursor === text.length) {
    cursorRow = row;
    cursorColumn = visibleLength(lines[row]);
  }

  const visibleCount = clamp(lines.length, 1, Math.max(1, maxContentLines));
  const windowStart = clamp(cursorRow - visibleCount + 1, 0, Math.max(0, lines.length - visibleCount));
  const visibleLines = lines.slice(windowStart, windowStart + visibleCount);

  return {
    visibleLines,
    cursorRow: cursorRow - windowStart,
    cursorColumn,
    isEmpty: text.length === 0,
  };
}

function advanceColumn(currentColumn: number, text: string, columns: number): number {
  const width = Math.max(1, columns);
  let column = currentColumn;

  for (const char of Array.from(text)) {
    if (char === "\n") {
      column = 0;
      continue;
    }

    column += 1;
    if (column >= width) {
      column = 0;
    }
  }

  return column;
}

export interface RawChatUIOptions {
  agent: Agent;
  config: z.output<typeof CLIConfigSchema>;
  commands: CommandDefinition[];
  onSubmit: (message: string) => void;
  onOpenAgentSelection: () => void;
  onDeleteIdleAgent: () => void;
  onAbortCurrentActivity: () => boolean;
}

export default class RawChatUI {
  private readonly chatEditor = new InputEditor();
  private readonly transcript: TranscriptEntry[] = [];
  private readonly followupEditors = new Map<string, InputEditor>();
  private readonly questionSessions = new Map<string, InlineQuestionSession>();
  private readonly options: RawChatUIOptions;

  private entryId = 0;
  private activeTranscriptStream: {type: "output.chat" | "output.reasoning"; entry: TranscriptEntry} | null = null;
  private activeVisibleStream: {type: "output.chat" | "output.reasoning"; column: number} | null = null;
  private pendingSeparatorBeforeNextVisibleEntry = false;
  private completionState: CompletionState | null = null;
  private fileSearchState: FileSearchState | null = null;
  private flashMessage: FlashMessage | null = null;
  private historyIndex: number | null = null;
  private historyDraft = "";
  private verbose = false;
  private spinnerIndex = 0;
  private spinnerTimer: NodeJS.Timeout | null = null;
  private resizeTimer: NodeJS.Timeout | null = null;
  private started = false;
  private suspended = false;
  private rawModeBeforeStart = false;
  private footerSnapshot: FooterSnapshot = {
    lineCount: 0,
    cursorRow: 0,
    cursorColumn: 0,
    showCursor: true,
  };
  private renderedFooterSignature = "";
  private fullReplayRequested = true;
  private latestState: AgentEventState | null = null;
  private optionalPickerOpen = false;
  private optionalQuestionIndex = 0;
  private activeOptionalQuestionId: string | null = null;
  private inlineScreenAbort: AbortController | null = null;
  private bracketedPasteBuffer = "";
  private inBracketedPaste = false;
  private pasteSuppressionExpiresAt = 0;
  private workspaceFiles: string[] | null = null;
  private workspaceFilesLoadError: string | null = null;
  private workspaceFilesPromise: Promise<void> | null = null;
  private dismissedFileSearchSignature: string | null = null;

  private readonly dataHandler = (data: Buffer | string) => {
    if (this.suspended) return;
    this.handleTerminalData(data);
  };

  private readonly keypressHandler = (input: string, key: readline.Key) => {
    if (this.suspended) return;
    this.handleKeypress(input, key);
  };

  private readonly resizeHandler = () => {
    this.handleResize();
  };

  constructor(options: RawChatUIOptions) {
    this.options = options;
    this.verbose = options.config.verbose;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.attachTerminal();
    this.spinnerTimer = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % 4;
      this.render();
    }, 120);
    this.spinnerTimer.unref();
    this.requestFullReplay();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }

    if (this.inlineScreenAbort) {
      this.inlineScreenAbort.abort();
      this.inlineScreenAbort = null;
    }

    this.clearFooter();
    this.detachTerminal();
  }

  suspend(): void {
    if (!this.started || this.suspended) return;
    this.suspended = true;
    this.detachTerminal();
  }

  resume(): void {
    if (!this.started || !this.suspended) return;
    this.suspended = false;
    this.attachTerminal();
    this.requestFullReplay();
  }

  renderEvent(event: AgentEventEnvelope): void {
    this.applyTranscriptEvent(event);

    if (!this.started || this.suspended || !process.stdout.isTTY) {
      return;
    }

    if (this.fullReplayRequested) {
      return;
    }

    const delta = this.buildTranscriptDelta(event);
    if (delta.kind !== "none") {
      this.renderIncremental(delta);
    }
  }

  syncState(state: AgentEventState): void {
    this.latestState = state;
    this.cleanupInteractionState();
    this.render();
  }

  flash(text: string, tone: FlashMessage["tone"] = "info", durationMs = 2400): void {
    this.flashMessage = {
      text,
      tone,
      expiresAt: Date.now() + durationMs,
    };
    this.render();
  }

  private attachTerminal(): void {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return;

    this.rawModeBeforeStart = !!process.stdin.isRaw;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.prependListener("data", this.dataHandler);
    process.stdin.on("keypress", this.keypressHandler);
    process.stdout.on("resize", this.resizeHandler);
    process.on("SIGWINCH", this.resizeHandler);
    process.stdout.write("\x1b[?2004h\x1b[?25l");
  }

  private detachTerminal(): void {
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    if (process.stdin.isTTY) {
      process.stdin.off("data", this.dataHandler);
      process.stdin.off("keypress", this.keypressHandler);
      if (!this.rawModeBeforeStart) {
        process.stdin.setRawMode(false);
      }
    }
    if (process.stdout.isTTY) {
      process.stdout.off("resize", this.resizeHandler);
      process.off("SIGWINCH", this.resizeHandler);
      process.stdout.write("\x1b[?2004l\x1b[?25h");
    }
  }

  private handleTerminalData(data: Buffer | string): void {
    const text = typeof data === "string" ? data : data.toString("utf8");

    if (!this.inBracketedPaste && !text.includes(BRACKETED_PASTE_START)) {
      return;
    }

    let remainder = text;

    while (remainder.length > 0) {
      if (!this.inBracketedPaste) {
        const startIndex = remainder.indexOf(BRACKETED_PASTE_START);
        if (startIndex === -1) {
          return;
        }

        this.inBracketedPaste = true;
        this.bracketedPasteBuffer = "";
        remainder = remainder.slice(startIndex + BRACKETED_PASTE_START.length);
      }

      const endIndex = remainder.indexOf(BRACKETED_PASTE_END);
      if (endIndex === -1) {
        this.bracketedPasteBuffer += remainder;
        return;
      }

      this.bracketedPasteBuffer += remainder.slice(0, endIndex);
      this.insertBracketedPaste(this.bracketedPasteBuffer);
      this.bracketedPasteBuffer = "";
      this.inBracketedPaste = false;
      this.pasteSuppressionExpiresAt = Date.now() + 50;
      remainder = remainder.slice(endIndex + BRACKETED_PASTE_END.length);
    }
  }

  private insertBracketedPaste(text: string): void {
    const normalized = text.replace(/\r\n?/g, "\n");
    const activeQuestion = this.getFocusedQuestion();
    if (activeQuestion) {
      return;
    }

    const followup = this.getPrimaryFollowup();
    if (followup) {
      this.getFollowupEditor(followup.interactionId).insert(normalized);
      this.render();
      return;
    }

    this.chatEditor.insert(normalized);
    this.afterChatEdit();
    this.render();
  }

  private handleResize(): void {
    this.requestFullReplay();

    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = globalThis.setTimeout(() => {
      this.requestFullReplay();
    }, 16);
    this.resizeTimer?.unref();
  }

  private handleKeypress(input: string, key: readline.Key): void {
    if (this.inBracketedPaste || Date.now() < this.pasteSuppressionExpiresAt) {
      return;
    }

    if (key.ctrl && key.name === "c") {
      if (this.options.onAbortCurrentActivity()) {
        this.flash("Cancelled the current activity.", "warning");
      } else {
        this.options.onDeleteIdleAgent();
      }
      return;
    }

    if (key.ctrl && key.name === "l") {
      this.requestFullReplay();
      return;
    }

    if ((key.meta && key.name === "a") || key.name === "f1") {
      this.options.onOpenAgentSelection();
      return;
    }

    if ((key.meta && key.name === "m") || key.name === "f3") {
      this.triggerShortcutCommand("model select", "Opening model selector...");
      return;
    }

    if ((key.meta && key.name === "t") || key.name === "f2") {
      this.triggerShortcutCommand("tools select", "Opening tools selector...");
      return;
    }

    if ((key.meta && key.name === "v") || key.name === "f4") {
      this.toggleVerboseMode();
      return;
    }

    if ((key.meta && key.name === "q") || key.name === "f6") {
      this.toggleOptionalQuestions();
      return;
    }

    const activeQuestion = this.getFocusedQuestion();
    if (!activeQuestion && this.optionalPickerOpen) {
      if (this.handleOptionalQuestionPicker(key)) {
        this.render();
        return;
      }
    }

    if (activeQuestion) {
      const session = this.getQuestionSession(activeQuestion);
      const handled = session.handleKeypress(input, key as InlineKeypress);
      if (handled instanceof Promise) {
        void handled.then((didHandle) => {
          if (didHandle) {
            this.render();
          }
        });
      } else if (handled) {
        this.render();
      }
      return;
    }

    const followup = this.getPrimaryFollowup();
    if (followup) {
      if (this.handleFollowupKeypress(followup, input, key as InlineKeypress)) {
        this.render();
      }
      return;
    }

    if (this.handleChatComposerKeypress(input, key)) {
      this.render();
    }
  }

  private handleChatComposerKeypress(input: string, key: readline.Key): boolean {
    if (this.fileSearchState) {
      if (key.name === "escape") {
        this.dismissFileSearch();
        return true;
      }

      if (key.name === "tab") {
        return this.insertSelectedFileSearchMatch();
      }

      if (key.name === "up" || (key.ctrl && key.name === "p")) {
        return this.moveFileSearchSelection(-1);
      }

      if (key.name === "down" || (key.ctrl && key.name === "n")) {
        return this.moveFileSearchSelection(1);
      }

      if (key.name === "pageup") {
        return this.moveFileSearchSelection(-5);
      }

      if (key.name === "pagedown") {
        return this.moveFileSearchSelection(5);
      }
    }

    if (key.name === "escape") {
      if (this.completionState) {
        this.completionState = null;
        return true;
      }

      if (this.options.onAbortCurrentActivity()) {
        this.flash("Cancelled the current activity.", "warning");
      } else {
        this.flash("No active work to cancel.", "muted");
      }
      return true;
    }

    if (key.name === "tab") {
      if (this.handleTabCompletion()) {
        return true;
      }

      if (!this.isCommandInput()) {
        this.chatEditor.insert("  ");
        this.afterChatEdit();
      }
      return true;
    }

    if ((key.meta && key.name === "return") || (key.shift && key.name === "return")) {
      this.chatEditor.insertNewline();
      this.afterChatEdit();
      return true;
    }

    if (key.ctrl && key.name === "o") {
      this.chatEditor.insertNewline();
      this.afterChatEdit();
      return true;
    }

    if (key.ctrl && key.name === "p") {
      this.browseHistory(-1);
      return true;
    }

    if (key.ctrl && key.name === "n") {
      this.browseHistory(1);
      return true;
    }

    if (key.name === "up") {
      const {lineIndex} = this.chatEditor.getCursorLocation();
      if (lineIndex > 0) {
        this.chatEditor.moveUp();
        this.afterChatEdit();
      } else {
        this.browseHistory(-1);
      }
      return true;
    }

    if (key.name === "down") {
      const {lineIndex} = this.chatEditor.getCursorLocation();
      if (lineIndex < this.chatEditor.getLineCount() - 1) {
        this.chatEditor.moveDown();
        this.afterChatEdit();
      } else {
        this.browseHistory(1);
      }
      return true;
    }

    if (key.name === "return") {
      if (this.fileSearchState) {
        return this.insertSelectedFileSearchMatch();
      }
      this.submitCurrentInput();
      return true;
    }

    if (this.applyEditorKeypress(this.chatEditor, input, key)) {
      this.afterChatEdit();
      return true;
    }

    return false;
  }

  private handleFollowupKeypress(
    followup: FollowupInteraction,
    input: string,
    key: InlineKeypress,
  ): boolean {
    const editor = this.getFollowupEditor(followup.interactionId);

    if (key.name === "escape") {
      if (this.options.onAbortCurrentActivity()) {
        this.flash("Cancelled the current activity.", "warning");
      } else {
        this.flash("No active work to cancel.", "muted");
      }
      return true;
    }

    if ((key.meta && key.name === "return") || (key.shift && key.name === "return")) {
      editor.insertNewline();
      return true;
    }

    if (key.ctrl && key.name === "o") {
      editor.insertNewline();
      return true;
    }

    if (key.name === "return") {
      const value = editor.getText().trimEnd();
      if (value.trim().length === 0) {
        this.flash("Type a follow-up first.", "muted");
        return true;
      }

      this.sendInteractionResponse(followup.interactionId, value);
      editor.clear();
      return true;
    }

    return this.applyEditorKeypress(editor, input, key);
  }

  private handleOptionalQuestionPicker(key: InlineKeypress): boolean {
    const optionalQuestions = this.getOptionalQuestions();
    if (optionalQuestions.length === 0) {
      this.optionalPickerOpen = false;
      return false;
    }

    if (key.name === "escape") {
      this.optionalPickerOpen = false;
      return true;
    }
    if (key.name === "up") {
      this.optionalQuestionIndex = clamp(this.optionalQuestionIndex - 1, 0, optionalQuestions.length - 1);
      return true;
    }
    if (key.name === "down") {
      this.optionalQuestionIndex = clamp(this.optionalQuestionIndex + 1, 0, optionalQuestions.length - 1);
      return true;
    }
    if (key.name === "pageup") {
      this.optionalQuestionIndex = clamp(this.optionalQuestionIndex - 8, 0, optionalQuestions.length - 1);
      return true;
    }
    if (key.name === "pagedown") {
      this.optionalQuestionIndex = clamp(this.optionalQuestionIndex + 8, 0, optionalQuestions.length - 1);
      return true;
    }
    if (key.name === "return") {
      const question = optionalQuestions[this.optionalQuestionIndex];
      if (question) {
        this.activeOptionalQuestionId = question.interactionId;
        this.optionalPickerOpen = false;
      }
      return true;
    }

    return false;
  }

  private applyEditorKeypress(editor: InputEditor, input: string, key: InlineKeypress): boolean {
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

  private toggleVerboseMode(): void {
    this.verbose = !this.verbose;
    this.flash(`Verbose mode ${this.verbose ? "on" : "off"}.`, "info");
    this.requestFullReplay();
  }

  private toggleOptionalQuestions(): void {
    const optionalQuestions = this.getOptionalQuestions();
    if (optionalQuestions.length === 0) {
      this.flash("No optional questions are available.", "muted");
      return;
    }

    if (this.activeOptionalQuestionId) {
      this.activeOptionalQuestionId = null;
      this.optionalPickerOpen = true;
    } else {
      this.optionalPickerOpen = !this.optionalPickerOpen;
    }

    this.optionalQuestionIndex = clamp(this.optionalQuestionIndex, 0, optionalQuestions.length - 1);
    this.render();
  }

  private handleTabCompletion(): boolean {
    const context = getCommandCompletionContext(
      this.chatEditor.getText(),
      this.chatEditor.getCursor(),
      this.options.commands,
    );

    if (!context) {
      if (this.isCommandInput()) {
        this.flash("No matching command.", "warning");
        return true;
      }
      return false;
    }

    if (context.matches.length === 1) {
      this.applyCompletion(context.replacementStart, context.replacementEnd, `${context.matches[0].name} `);
      this.completionState = null;
      return true;
    }

    if (
      this.completionState
      && context.query.startsWith(this.completionState.sourceQuery)
      && this.sameCompletionMatches(this.completionState.matches, context.matches)
    ) {
      const nextIndex = (this.completionState.selectedIndex + 1) % context.matches.length;
      this.completionState = {
        ...this.completionState,
        selectedIndex: nextIndex,
      };
      this.applyCompletion(context.replacementStart, context.replacementEnd, context.matches[nextIndex].name);
      return true;
    }

    const commonPrefix = getLongestCommonPrefix(context.matches.map((command) => command.name));
    if (commonPrefix.length > context.query.length) {
      this.applyCompletion(context.replacementStart, context.replacementEnd, commonPrefix);
    }

    this.completionState = {
      sourceQuery: context.query,
      matches: context.matches,
      selectedIndex: 0,
    };
    return true;
  }

  private sameCompletionMatches(a: CommandDefinition[], b: CommandDefinition[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((command, index) => command.name === b[index]?.name);
  }

  private applyCompletion(start: number, end: number, replacement: string): void {
    const text = this.chatEditor.getText();
    const prefix = text.slice(0, start);
    const suffix = text.slice(end);

    this.chatEditor.setText(`${prefix}/${replacement}${suffix}`, prefix.length + replacement.length + 1);
    this.historyIndex = null;
    this.historyDraft = "";
    this.syncChatFileSearchState();
  }

  private browseHistory(direction: -1 | 1): void {
    const history = this.options.agent.getState(CommandHistoryState).commands;
    if (history.length === 0) {
      this.flash("History is empty.", "muted");
      return;
    }

    if (direction < 0) {
      if (this.historyIndex === null) {
        this.historyDraft = this.chatEditor.getText();
        this.historyIndex = history.length - 1;
      } else {
        this.historyIndex = clamp(this.historyIndex - 1, 0, history.length - 1);
      }
    } else if (this.historyIndex === null) {
      return;
    } else if (this.historyIndex >= history.length - 1) {
      this.historyIndex = null;
      this.chatEditor.setText(this.historyDraft);
      this.completionState = null;
      this.syncChatFileSearchState();
      return;
    } else {
      this.historyIndex += 1;
    }

    this.chatEditor.setText(history[this.historyIndex]);
    this.completionState = null;
    this.syncChatFileSearchState();
  }

  private submitCurrentInput(): void {
    const message = this.chatEditor.getText().trimEnd();
    if (message.trim().length === 0) {
      this.flash("Type a message or command first.", "muted");
      return;
    }

    this.options.onSubmit(message);
    this.chatEditor.clear();
    this.historyIndex = null;
    this.historyDraft = "";
    this.completionState = null;
    this.syncChatFileSearchState();
  }

  private triggerShortcutCommand(commandName: string, flashMessage: string): void {
    if (!this.hasCommand(commandName)) {
      this.flash(`/${commandName} is not available.`, "warning");
      return;
    }

    this.completionState = null;
    this.options.onSubmit(`/${commandName}`);
    this.flash(flashMessage, "info");
  }

  private hasCommand(commandName: string): boolean {
    return this.options.commands.some((command) => command.name === commandName);
  }

  private afterChatEdit(): void {
    this.historyIndex = null;
    this.historyDraft = "";
    this.completionState = null;
    this.syncChatFileSearchState();
  }

  private syncChatFileSearchState(): void {
    const token = findActiveFileSearchToken(this.chatEditor.getText(), this.chatEditor.getCursor());

    if (!token) {
      this.fileSearchState = null;
      this.dismissedFileSearchSignature = null;
      return;
    }

    const tokenSignature = this.getFileSearchTokenSignature(token);
    if (this.dismissedFileSearchSignature && this.dismissedFileSearchSignature !== tokenSignature) {
      this.dismissedFileSearchSignature = null;
    }

    if (this.dismissedFileSearchSignature === tokenSignature) {
      this.fileSearchState = null;
      return;
    }

    const previousSelection = this.fileSearchState?.matches[this.fileSearchState.selectedIndex] ?? null;
    const matches = this.workspaceFiles
      ? getFileSearchMatches(this.workspaceFiles, token.query, 48)
      : [];

    let selectedIndex = 0;
    if (matches.length > 0) {
      if (previousSelection) {
        const nextIndex = matches.indexOf(previousSelection);
        if (nextIndex !== -1) {
          selectedIndex = nextIndex;
        } else if (this.fileSearchState?.token.query === token.query) {
          selectedIndex = clamp(this.fileSearchState.selectedIndex, 0, matches.length - 1);
        }
      } else if (this.fileSearchState?.token.query === token.query) {
        selectedIndex = clamp(this.fileSearchState.selectedIndex, 0, matches.length - 1);
      }
    }

    this.fileSearchState = {
      token,
      matches,
      selectedIndex,
      loading: !this.workspaceFiles && !this.workspaceFilesLoadError,
      error: this.workspaceFilesLoadError,
    };

    if (!this.workspaceFiles && !this.workspaceFilesPromise) {
      void this.loadWorkspaceFiles();
    }
  }

  private getFileSearchTokenSignature(token: FileSearchToken): string {
    return `${token.start}:${token.end}:${token.query}`;
  }

  private dismissFileSearch(): void {
    if (!this.fileSearchState) return;

    this.dismissedFileSearchSignature = this.getFileSearchTokenSignature(this.fileSearchState.token);
    this.fileSearchState = null;
  }

  private moveFileSearchSelection(offset: number): boolean {
    if (!this.fileSearchState || this.fileSearchState.matches.length === 0) {
      return true;
    }

    this.fileSearchState = {
      ...this.fileSearchState,
      selectedIndex: clamp(
        this.fileSearchState.selectedIndex + offset,
        0,
        this.fileSearchState.matches.length - 1,
      ),
    };
    return true;
  }

  private insertSelectedFileSearchMatch(): boolean {
    if (!this.fileSearchState) return false;

    if (this.fileSearchState.loading) {
      this.flash("Indexing workspace files...", "muted");
      return true;
    }

    if (this.fileSearchState.error) {
      this.flash(this.fileSearchState.error, "warning");
      return true;
    }

    const selectedPath = this.fileSearchState.matches[this.fileSearchState.selectedIndex];
    if (!selectedPath) {
      this.flash("No matching files.", "muted");
      return true;
    }

    const nextValue = replaceFileSearchToken(
      this.chatEditor.getText(),
      this.fileSearchState.token,
      selectedPath,
    );

    this.chatEditor.setText(nextValue.text, nextValue.cursor);
    this.dismissedFileSearchSignature = null;
    this.afterChatEdit();
    return true;
  }

  private async loadWorkspaceFiles(): Promise<void> {
    if (this.workspaceFilesPromise) {
      return this.workspaceFilesPromise;
    }

    const fileSystem = this.options.agent.getServiceByType(FileSystemService);
    if (!fileSystem) {
      this.workspaceFilesLoadError = "Workspace file search is unavailable.";
      this.syncChatFileSearchState();
      this.render();
      return;
    }

    this.workspaceFilesLoadError = null;
    this.workspaceFilesPromise = (async () => {
      try {
        const files = await fileSystem.glob("**/*", {includeDirectories: false}, this.options.agent);
        this.workspaceFiles = Array.from(new Set(files)).sort(compareFilePathsForBrowsing);
      } catch (error) {
        this.workspaceFiles = null;
        this.workspaceFilesLoadError = error instanceof Error
          ? `Workspace file search failed: ${error.message}`
          : "Workspace file search failed.";
      } finally {
        this.workspaceFilesPromise = null;
        this.syncChatFileSearchState();
        this.render();
      }
    })();

    return this.workspaceFilesPromise;
  }

  private isCommandInput(): boolean {
    return this.chatEditor.getText().startsWith("/");
  }

  private applyTranscriptEvent(event: AgentEventEnvelope): void {
    switch (event.type) {
      case "agent.created":
        this.clearActiveTranscriptStream();
        this.addEntry({
          kind: "system",
          title: "System",
          body: event.message,
          tone: "info",
          markdown: false,
        });
        break;

      case "agent.stopped":
      case "agent.status":
      case "input.execution":
      case "cancel":
        this.clearActiveTranscriptStream();
        break;

      case "output.chat":
        this.appendTranscriptStream("output.chat", "Assistant", event.message, "chat");
        break;

      case "output.reasoning":
        this.appendTranscriptStream("output.reasoning", "Reasoning", event.message, "reasoning");
        break;

      case "output.info":
        this.clearActiveTranscriptStream();
        this.addEntry({
          kind: "info",
          title: "Info",
          body: event.message,
          tone: "info",
          markdown: false,
        });
        break;

      case "output.warning":
        this.clearActiveTranscriptStream();
        this.addEntry({
          kind: "warning",
          title: "Warning",
          body: event.message,
          tone: "warning",
          markdown: false,
        });
        break;

      case "output.error":
        this.clearActiveTranscriptStream();
        this.addEntry({
          kind: "error",
          title: "Error",
          body: event.message,
          tone: "error",
          markdown: false,
        });
        break;

      case "output.artifact":
        this.clearActiveTranscriptStream();
        this.addEntry({
          kind: "artifact",
          title: `Artifact: ${event.name}`,
          body: event.encoding === "text" ? event.body : `Generated ${event.mimeType} artifact`,
          tone: "info",
          markdown: event.encoding === "text",
        });
        break;

      case "agent.response":
        this.clearActiveTranscriptStream();
        this.addEntry({
          kind: "response",
          title: event.status === "success" ? "Response" : "Error",
          body: event.message,
          tone: event.status === "success" ? "success" : "error",
          markdown: event.status === "success",
        });
        break;

      case "input.received":
        this.clearActiveTranscriptStream();
        this.addEntry({
          kind: "input",
          title: "You",
          body: event.input.message,
          tone: "input",
          markdown: false,
        });
        break;

      case "input.interaction":
        this.clearActiveTranscriptStream();
        break;
    }
  }

  private buildTranscriptDelta(event: AgentEventEnvelope): TranscriptDelta {
    const columns = this.getTerminalSize().columns;

    switch (event.type) {
      case "agent.created":
        return this.buildCompleteEntryDelta("System", event.message, "info", false);
      case "output.chat":
        return this.buildStreamDelta("output.chat", "Assistant", event.message, "chat", columns);
      case "output.reasoning":
        if (!this.verbose) {
          this.closeVisibleStream();
          return {kind: "none"};
        }
        return this.buildStreamDelta("output.reasoning", "Reasoning", event.message, "reasoning", columns);
      case "output.info":
        return this.buildCompleteEntryDelta("Info", event.message, "info", false);
      case "output.warning":
        return this.buildCompleteEntryDelta("Warning", event.message, "warning", false);
      case "output.error":
        return this.buildCompleteEntryDelta("Error", event.message, "error", false);
      case "output.artifact":
        if (!this.verbose) {
          this.closeVisibleStream();
          return {kind: "none"};
        }
        return this.buildCompleteEntryDelta(
          `Artifact: ${event.name}`,
          event.encoding === "text" ? event.body : `Generated ${event.mimeType} artifact`,
          "info",
          event.encoding === "text",
        );
      case "agent.response":
        return this.buildCompleteEntryDelta(
          event.status === "success" ? "Response" : "Error",
          event.message,
          event.status === "success" ? "success" : "error",
          event.status === "success",
        );
      case "input.received":
        return this.buildCompleteEntryDelta("You", event.input.message, "input", false);
      case "agent.stopped":
      case "agent.status":
      case "input.execution":
      case "cancel":
      case "input.interaction":
        this.closeVisibleStream();
        return {kind: "none"};
    }
  }

  private buildCompleteEntryDelta(
    title: string,
    body: string,
    tone: TranscriptTone,
    markdown: boolean,
  ): TranscriptDelta {
    this.closeVisibleStream();
    const prefix = this.pendingSeparatorBeforeNextVisibleEntry ? "\n" : "";
    this.pendingSeparatorBeforeNextVisibleEntry = false;
    return {
      kind: "append",
      text: `${prefix}${this.renderEntryText({
        id: 0,
        kind: "info",
        title,
        body,
        tone,
        markdown,
      })}`,
      footerNeedsLeadingNewline: false,
    };
  }

  private buildStreamDelta(
    type: "output.chat" | "output.reasoning",
    title: string,
    message: string,
    tone: TranscriptTone,
    columns: number,
  ): TranscriptDelta {
    const {styled, raw} = this.renderStreamChunk(message, tone);

    if (!this.activeVisibleStream || this.activeVisibleStream.type !== type) {
      const prefix = this.pendingSeparatorBeforeNextVisibleEntry ? "\n" : "";
      this.pendingSeparatorBeforeNextVisibleEntry = false;
      const rawBody = `${TEXT_INDENT}${raw}`;
      this.activeVisibleStream = {
        type,
        column: advanceColumn(0, rawBody, columns),
      };
      return {
        kind: "append",
        text: `${prefix}${TITLE_COLOR(`${HEADER_PREFIX}${title}`)}\n${TONE_COLORS[tone](rawBody)}`,
        footerNeedsLeadingNewline: true,
      };
    }

    const fromColumn = this.activeVisibleStream.column;
    this.activeVisibleStream.column = advanceColumn(fromColumn, raw, columns);
    return {
      kind: "continueStream",
      text: styled,
      footerNeedsLeadingNewline: true,
      fromColumn,
    };
  }

  private closeVisibleStream(): void {
    if (this.activeVisibleStream) {
      this.activeVisibleStream = null;
      this.pendingSeparatorBeforeNextVisibleEntry = true;
    }
  }

  private addEntry(entry: Omit<TranscriptEntry, "id">): TranscriptEntry {
    const fullEntry: TranscriptEntry = {
      ...entry,
      id: ++this.entryId,
    };
    this.transcript.push(fullEntry);
    return fullEntry;
  }

  private clearActiveTranscriptStream(): void {
    this.activeTranscriptStream = null;
  }

  private appendTranscriptStream(
    type: "output.chat" | "output.reasoning",
    title: string,
    message: string,
    tone: TranscriptTone,
  ): void {
    if (this.activeTranscriptStream?.type === type) {
      this.activeTranscriptStream.entry.body += message;
      return;
    }

    const entry = this.addEntry({
      kind: type === "output.reasoning" ? "reasoning" : "chat",
      title,
      body: message,
      tone,
      markdown: true,
    });
    this.activeTranscriptStream = {type, entry};
  }

  private requestFullReplay(): void {
    this.fullReplayRequested = true;
    this.render();
  }

  private render(): void {
    if (!this.started || this.suspended || !process.stdout.isTTY) return;
    const footerSignature = this.getFooterSignature();
    if (!this.fullReplayRequested && this.renderedFooterSignature !== footerSignature) {
      this.fullReplayRequested = true;
    }
    if (this.fullReplayRequested) {
      this.renderFullReplay();
      return;
    }
    this.renderFooterOnly();
  }

  private renderFullReplay(): void {
    if (!process.stdout.isTTY) return;

    if (this.latestState) {
      this.rebuildTranscriptFromEvents(this.latestState.events);
    }

    const {columns, rows} = this.getTerminalSize();
    const footerSignature = this.getFooterSignature();
    const footer = this.renderFooter(columns, rows);

    if (columns < 40 || rows < 10) {
      const output = `\x1b[?25l\x1b[3J\x1b[2J\x1b[H${TONE_COLORS.warning("Terminal too small. Resize to at least 40x10.")}\x1b[?25h`;
      process.stdout.write(output);
      this.footerSnapshot = {
        lineCount: 1,
        cursorRow: 0,
        cursorColumn: 0,
        showCursor: false,
      };
      this.fullReplayRequested = false;
      return;
    }

    const {text, activeStream} = this.renderTranscriptReplay(columns);
    let output = "\x1b[?25l\x1b[3J\x1b[2J\x1b[H";
    output += text;

    if (footer.lines.length > 0) {
      if (text.length > 0 && activeStream) {
        output += "\n";
      }
      output += footer.lines.join("\n");
      output += this.getFooterCursorSequence(footer);
    } else {
      output += "\x1b[?25h";
    }

    process.stdout.write(output);
    this.footerSnapshot = {
      lineCount: footer.lines.length,
      cursorRow: footer.cursorRow ?? Math.max(0, footer.lines.length - 1),
      cursorColumn: footer.cursorColumn ?? 0,
      showCursor: footer.showCursor !== false,
    };
    this.renderedFooterSignature = footerSignature;
    this.activeVisibleStream = activeStream;
    this.pendingSeparatorBeforeNextVisibleEntry = false;
    this.fullReplayRequested = false;
  }

  private renderFooterOnly(): void {
    this.renderIncremental({kind: "none"});
  }

  private renderIncremental(delta: TranscriptDelta): void {
    if (!process.stdout.isTTY) return;

    const {columns, rows} = this.getTerminalSize();
    const footer = this.renderFooter(columns, rows);

    if (columns < 40 || rows < 10) {
      this.requestFullReplay();
      return;
    }

    let output = "\x1b[?25l";
    output += this.moveToFooterTop();
    output += "\x1b[J";

    if (delta.kind === "continueStream") {
      output += `\x1b[1F\x1b[${delta.fromColumn + 1}G`;
      output += delta.text;
      if (footer.lines.length > 0 && delta.footerNeedsLeadingNewline) {
        output += "\n";
      }
    } else if (delta.kind === "append") {
      output += delta.text;
      if (footer.lines.length > 0 && delta.footerNeedsLeadingNewline) {
        output += "\n";
      }
    }

    if (footer.lines.length > 0) {
      output += footer.lines.join("\n");
      output += this.getFooterCursorSequence(footer);
    } else {
      output += "\x1b[?25h";
    }

    process.stdout.write(output);
    this.footerSnapshot = {
      lineCount: footer.lines.length,
      cursorRow: footer.cursorRow ?? Math.max(0, footer.lines.length - 1),
      cursorColumn: footer.cursorColumn ?? 0,
      showCursor: footer.showCursor !== false,
    };
    this.renderedFooterSignature = this.getFooterSignature();
  }

  private clearFooter(): void {
    if (!process.stdout.isTTY || this.footerSnapshot.lineCount === 0) return;
    const output = `${this.moveToFooterTop()}\x1b[J\r\n`;
    process.stdout.write(output);
    this.footerSnapshot = {
      lineCount: 0,
      cursorRow: 0,
      cursorColumn: 0,
      showCursor: true,
    };
    this.renderedFooterSignature = "";
  }

  private moveToFooterTop(): string {
    if (this.footerSnapshot.lineCount === 0) {
      return "";
    }

    let output = "\r";
    if (this.footerSnapshot.cursorRow > 0) {
      output += `\x1b[${this.footerSnapshot.cursorRow}F`;
    }
    return output;
  }

  private getFooterCursorSequence(block: RenderBlock): string {
    const lineCount = block.lines.length;
    if (lineCount === 0) {
      return block.showCursor === false ? "\x1b[?25l" : "\x1b[?25h";
    }

    const cursorRow = block.cursorRow ?? Math.max(0, lineCount - 1);
    const cursorColumn = block.cursorColumn ?? 0;
    const moveUp = Math.max(0, lineCount - 1 - cursorRow);

    let output = "\r";
    if (moveUp > 0) {
      output += `\x1b[${moveUp}F`;
    }
    output += `\x1b[${cursorColumn + 1}G`;
    output += block.showCursor === false ? "\x1b[?25l" : "\x1b[?25h";
    return output;
  }

  private renderFooter(columns: number, rows: number): RenderBlock {
    if (columns < 40 || rows < 10) {
      return {
        lines: [TONE_COLORS.warning("Terminal too small. Resize to at least 40x10.")],
        showCursor: false,
      };
    }

    const sections: RenderBlock[] = [];
    const question = this.getFocusedQuestion();

    if (question) {
      sections.push(this.renderQuestionSection(question, columns, rows));
    } else if (this.optionalPickerOpen) {
      sections.push({
        lines: [this.getHintLine(columns)],
        showCursor: false,
      });
      sections.push(this.renderOptionalQuestionPicker(columns, rows));
    } else {
      const followup = this.getPrimaryFollowup();
      sections.push({
        lines: [this.getHintLine(columns)],
        showCursor: false,
      });
      if (!followup && this.fileSearchState) {
        sections.push(this.renderFileSearchPicker(columns, rows));
      }
      sections.push(followup
        ? this.renderFollowupComposer(followup, columns, rows)
        : this.renderChatComposer(columns, rows));
    }

    sections.push({
      lines: [this.getStatusLine(columns)],
      showCursor: false,
    });

    const footerContent = this.combineBlocks(sections);
    const transcriptVisibleRows = this.getVisibleTranscriptViewportLineCount(
      Math.max(0, rows - footerContent.lines.length),
    );
    const spacerCount = Math.max(0, rows - footerContent.lines.length - transcriptVisibleRows);

    if (spacerCount === 0) {
      return footerContent;
    }

    return {
      lines: [
        ...Array.from({length: spacerCount}, () => ""),
        ...footerContent.lines,
      ],
      cursorRow: footerContent.cursorRow === undefined ? undefined : footerContent.cursorRow + spacerCount,
      cursorColumn: footerContent.cursorColumn,
      showCursor: footerContent.showCursor,
    };
  }

  private combineBlocks(blocks: RenderBlock[]): RenderBlock {
    const lines: string[] = [];
    let cursorRow: number | undefined;
    let cursorColumn: number | undefined;
    let showCursor = false;

    for (const block of blocks) {
      if (block.lines.length === 0) continue;
      if (lines.length > 0) {
        lines.push("");
      }

      const offset = lines.length;
      lines.push(...block.lines);

      if (block.cursorRow !== undefined) {
        cursorRow = offset + block.cursorRow;
        cursorColumn = block.cursorColumn ?? 0;
        showCursor = block.showCursor !== false;
      }
    }

    return {
      lines,
      cursorRow,
      cursorColumn,
      showCursor,
    };
  }

  private renderChatComposer(columns: number, rows: number): RenderBlock {
    const promptPrefixWidth = visibleLength(RAW_PROMPT_PREFIX);
    const continuationPrefixWidth = visibleLength(RAW_CONTINUATION_PREFIX);
    const innerWidth = Math.max(10, columns - promptPrefixWidth);
    const maxContentLines = clamp(Math.floor(rows * 0.25), 1, 8);
    const renderedInput = renderEditor(this.chatEditor, innerWidth, maxContentLines);
    const lines: string[] = [];

    renderedInput.visibleLines.forEach((line, index) => {
      const prefix = index === 0 ? PROMPT_PREFIX : CONTINUATION_PREFIX;
      const body = renderedInput.isEmpty && index === 0
        ? PLACEHOLDER_COLOR("Write a message or /command")
        : line;
      lines.push(`${prefix}${body}`);
    });

    return {
      lines,
      cursorRow: renderedInput.cursorRow,
      cursorColumn: (renderedInput.cursorRow === 0 ? promptPrefixWidth : continuationPrefixWidth) + renderedInput.cursorColumn,
      showCursor: true,
    };
  }

  private renderFileSearchPicker(columns: number, rows: number): RenderBlock {
    const state = this.fileSearchState;
    if (!state) {
      return {lines: [], showCursor: false};
    }

    const indexedCount = this.workspaceFiles?.length ?? 0;
    const lines = [
      TITLE_COLOR(`${HEADER_PREFIX}Workspace Files`),
      TONE_COLORS.muted(`${TEXT_INDENT}${shortenPath(this.options.agent.app.config.app.workingDirectory)}`),
    ];

    if (state.loading) {
      lines.push(TONE_COLORS.info(`${TEXT_INDENT}Indexing workspace files...`));
      return {lines, showCursor: false};
    }

    if (state.error) {
      lines.push(TONE_COLORS.warning(`${TEXT_INDENT}${state.error}`));
      return {lines, showCursor: false};
    }

    if (state.matches.length === 0) {
      lines.push(TONE_COLORS.muted(`${TEXT_INDENT}No matches for @${state.token.query}`));
      return {lines, showCursor: false};
    }

    lines.push(TONE_COLORS.muted(`${TEXT_INDENT}${state.matches.length} matches · ${indexedCount} indexed`));

    const maxVisibleItems = clamp(rows - 16, 3, 6);
    const windowStart = clamp(
      state.selectedIndex - maxVisibleItems + 1,
      0,
      Math.max(0, state.matches.length - maxVisibleItems),
    );
    const visibleMatches = state.matches.slice(windowStart, windowStart + maxVisibleItems);

    visibleMatches.forEach((match, index) => {
      const actualIndex = windowStart + index;
      const prefix = actualIndex === state.selectedIndex ? "›" : " ";
      const label = truncateVisible(match, Math.max(10, columns - 4));
      lines.push(
        actualIndex === state.selectedIndex
          ? FILE_SEARCH_SELECTED(`${prefix} ${label}`)
          : FILE_SEARCH_IDLE(`${prefix} ${label}`),
      );
    });

    return {
      lines,
      showCursor: false,
    };
  }

  private renderFollowupComposer(
    followup: FollowupInteraction,
    columns: number,
    rows: number,
  ): RenderBlock {
    const editor = this.getFollowupEditor(followup.interactionId);
    const promptPrefixWidth = visibleLength(RAW_PROMPT_PREFIX);
    const continuationPrefixWidth = visibleLength(RAW_CONTINUATION_PREFIX);
    const innerWidth = Math.max(10, columns - promptPrefixWidth);
    const maxContentLines = clamp(Math.floor(rows * 0.25), 1, 8);
    const renderedInput = renderEditor(editor, innerWidth, maxContentLines);
    const lines = [
      TITLE_COLOR(`${HEADER_PREFIX}Follow-up`),
      ...flattenWrappedLines([followup.message], columns, TEXT_INDENT).map((line) => TONE_COLORS.info(line)),
    ];

    renderedInput.visibleLines.forEach((line, index) => {
      const prefix = index === 0 ? PROMPT_PREFIX : CONTINUATION_PREFIX;
      const body = renderedInput.isEmpty && index === 0
        ? PLACEHOLDER_COLOR("Reply to continue the current run")
        : line;
      lines.push(`${prefix}${body}`);
    });

    return {
      lines,
      cursorRow: lines.length - renderedInput.visibleLines.length + renderedInput.cursorRow,
      cursorColumn: (renderedInput.cursorRow === 0 ? promptPrefixWidth : continuationPrefixWidth) + renderedInput.cursorColumn,
      showCursor: true,
    };
  }

  private renderQuestionSection(
    question: QuestionInteraction,
    columns: number,
    rows: number,
  ): RenderBlock {
    const session = this.getQuestionSession(question);
    const child = session.render({columns, rows});
    const childIndent = question.question.type === "treeSelect" ? "" : TEXT_INDENT;
    const indentedChildLines = child.lines.map((line) => `${childIndent}${line}`);
    const title = this.getQuestionTitle(question);
    const lines = [
      TITLE_COLOR(`${HEADER_PREFIX}${title}`),
      "",
      ...flattenWrappedLines([question.message], columns, TEXT_INDENT).map((line) => TONE_COLORS.info(line)),
      "",
    ];

    if (question.autoSubmitAt) {
      lines.push(TONE_COLORS.warning(`${TEXT_INDENT}${formatTimer(question.autoSubmitAt)}`));
      lines.push("");
    }

    const offset = lines.length;
    lines.push(...indentedChildLines);

    return {
      lines,
      cursorRow: child.cursorRow === undefined ? undefined : child.cursorRow + offset,
      cursorColumn: child.cursorColumn === undefined ? undefined : child.cursorColumn + visibleLength(childIndent),
      showCursor: child.showCursor,
    };
  }

  private renderOptionalQuestionPicker(columns: number, rows: number): RenderBlock {
    const optionalQuestions = this.getOptionalQuestions();
    const maxVisibleItems = Math.max(4, rows - 10);
    const visibleQuestions = optionalQuestions.slice(
      clamp(this.optionalQuestionIndex - maxVisibleItems + 1, 0, Math.max(0, optionalQuestions.length - maxVisibleItems)),
      clamp(this.optionalQuestionIndex - maxVisibleItems + 1, 0, Math.max(0, optionalQuestions.length - maxVisibleItems)) + maxVisibleItems,
    );
    const start = clamp(this.optionalQuestionIndex - maxVisibleItems + 1, 0, Math.max(0, optionalQuestions.length - maxVisibleItems));

    const lines = [
      TITLE_COLOR(`${HEADER_PREFIX}Optional Questions`),
      TONE_COLORS.info(`${TEXT_INDENT}${optionalQuestions.length} available`),
    ];

    visibleQuestions.forEach((question, index) => {
      const actualIndex = start + index;
      const prefix = actualIndex === this.optionalQuestionIndex ? "›" : " ";
      const timer = question.autoSubmitAt ? ` · ${formatTimer(question.autoSubmitAt)}` : "";
      const label = truncateVisible(`${this.getQuestionLabel(question)}${timer}`, Math.max(10, columns - 6));
      lines.push(`${prefix} ${label}`);
      lines.push(...flattenWrappedLines([question.message], Math.max(20, columns - 4), "  ").map((line) => TONE_COLORS.muted(line)));
    });

    lines.push(TONE_COLORS.muted("Enter open · Esc close"));

    return {
      lines,
      showCursor: false,
    };
  }

  private getHintLine(columns: number): string {
    if (this.flashMessage && this.flashMessage.expiresAt <= Date.now()) {
      this.flashMessage = null;
    }

    let text: string;
    let tone: TranscriptTone = "muted";

    const optionalCount = this.getOptionalQuestions().length;
    const optionalHint = optionalCount > 0 ? `  Alt+Q optional ${optionalCount}` : "";
    const activeQuestion = this.getFocusedQuestion();
    const followup = this.getPrimaryFollowup();

    if (this.flashMessage) {
      text = this.flashMessage.text;
      tone = this.flashMessage.tone;
    } else if (this.fileSearchState) {
      if (this.fileSearchState.loading) {
        text = `@ file search  ·  Indexing workspace files...  Esc close`;
        tone = "info";
      } else if (this.fileSearchState.error) {
        text = `@ file search  ·  ${this.fileSearchState.error}  Esc close`;
        tone = "warning";
      } else {
        text = `@ file search  ·  Up/Down move  Tab or Enter insert  Esc close`;
        tone = "info";
      }
    } else if (this.completionState && this.completionState.matches.length > 0) {
      const selected = this.completionState.matches[this.completionState.selectedIndex];
      const suggestions = this.completionState.matches
        .slice(0, 4)
        .map((command, index) => (index === this.completionState?.selectedIndex ? `[/${command.name}]` : `/${command.name}`))
        .join("  ");
      text = `${suggestions}  ·  ${selected.description}`;
      tone = "info";
    } else if (activeQuestion) {
      text = `Waiting for input${optionalHint}`;
      tone = "muted";
    } else if (this.optionalPickerOpen) {
      text = `Optional question picker  ·  Enter open  Esc close`;
      tone = "info";
    } else if (followup) {
      text = `Follow-up ready  ·  Enter send  Alt+Enter newline${optionalHint}`;
      tone = "info";
    } else if (this.isAgentExecuting()) {
      const activity = this.getActivityLabel();
      text = `${activity}  ·  Alt+A Agent Selection  Ctrl+C Cancel${optionalHint}`;
      tone = "muted";
    } else {
      const activity = this.getActivityLabel();
      text = `${activity}  ·  Alt+M model  Alt+T tools  Alt+V ${this.verbose ? "verbose on" : "verbose off"}  ·  Tab complete  Enter send${optionalHint}`;
      tone = "muted";
    }

    return TONE_COLORS[tone](truncateVisible(text, columns));
  }

  private getActivityLabel(): string {
    const state = this.latestState ?? this.options.agent.getState(AgentEventState);
    if (state.currentlyExecutingInputItem?.executionState.currentActivity) {
      const frames = ["-", "\\", "|", "/"];
      return `${frames[this.spinnerIndex]} ${state.currentlyExecutingInputItem.executionState.currentActivity}`;
    }
    return "Ready";
  }

  private isAgentExecuting(): boolean {
    const state = this.latestState ?? this.options.agent.getState(AgentEventState);
    return state.currentlyExecutingInputItem !== null;
  }

  private getStatusLine(columns: number): string {
    const activeQuestion = this.getFocusedQuestion();
    if (activeQuestion) {
      const cancelHint = activeQuestion.question.type === "treeSelect"
        ? "Waiting for input  ·  Esc or q to cancel"
        : "Waiting for input  ·  Esc to cancel";
      return STATUS_BAR(truncateVisible(cancelHint, columns));
    }

    const segments = [
      this.getCurrentModelLabel(),
      formatPercentLeft(this.getRemainingContextPercent()),
      `${formatCompactNumber(this.getActiveToolCount())} tools`,
      `${formatCompactNumber(this.getTokenUsage(), " tk")}`,
      formatCurrency(this.getChatCost()),
      shortenPath(this.options.agent.app.config.app.workingDirectory),
    ];

    return STATUS_BAR(truncateVisible(segments.join(" · "), columns));
  }

  private getFooterSignature(): string {
    const activeQuestion = this.getFocusedQuestion();
    if (activeQuestion) {
      return `question:${activeQuestion.interactionId}:${activeQuestion.question.type}`;
    }

    if (this.optionalPickerOpen) {
      return `optional-picker:${this.getOptionalQuestions().map((question) => question.interactionId).join(",")}`;
    }

    const followup = this.getPrimaryFollowup();
    if (followup) {
      return `followup:${followup.interactionId}`;
    }

    if (this.fileSearchState) {
      return `file-search:${this.fileSearchState.token.start}:${this.fileSearchState.token.end}:${this.fileSearchState.token.query}:${this.fileSearchState.selectedIndex}:${this.fileSearchState.loading}:${this.fileSearchState.error ?? ""}:${this.fileSearchState.matches.length}:${this.fileSearchState.matches.slice(0, 8).join(",")}`;
    }

    return "chat";
  }

  private getQuestionTitle(question: QuestionInteraction): string {
    const inner = question.question;
    if ("label" in inner && typeof inner.label === "string" && inner.label.trim().length > 0) {
      return inner.label.trim();
    }
    return question.optional ? "Optional Question" : "Question";
  }

  private getCurrentModelLabel(): string {
    const chatService = this.options.agent.getServiceByType(ChatService);
    return chatService?.getModel(this.options.agent) ?? "(no model)";
  }

  private getRemainingContextPercent(): number | null {
    const chatService = this.options.agent.getServiceByType(ChatService);
    const modelRegistry = this.options.agent.getServiceByType(ChatModelRegistry);
    if (!chatService || !modelRegistry) return null;

    const message = chatService.getLastMessage(this.options.agent);
    if (!message) return 100;

    const model = chatService.getModel(this.options.agent);
    if (!model) return null;

    const {base} = parseModelAndSettings(model.toLowerCase());
    const spec = modelRegistry.modelSpecs.getItemByName(base);
    if (!spec?.maxContextLength) return null;

    const usage = message.response.lastStepUsage;
    const usedTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
    const remaining = 1 - usedTokens / spec.maxContextLength;
    return clamp(Math.round(remaining * 100), 0, 100);
  }

  private getActiveToolCount(): number | null {
    const chatService = this.options.agent.getServiceByType(ChatService);
    if (!chatService) return null;
    return chatService.getEnabledTools(this.options.agent).length;
  }

  private getTokenUsage(): number | null {
    const chatService = this.options.agent.getServiceByType(ChatService);
    if (!chatService) return null;

    const messages = chatService.getChatMessages(this.options.agent);
    if (messages.length === 0) return 0;

    return messages.reduce((total, message) => {
      const usage = message.response.totalUsage;
      return total
        + (usage.inputTokens ?? 0)
        + (usage.outputTokens ?? 0)
        + (usage.cachedInputTokens ?? 0)
        + (usage.reasoningTokens ?? 0);
    }, 0);
  }

  private getChatCost(): number | null {
    const chatService = this.options.agent.getServiceByType(ChatService);
    if (!chatService) return null;

    const messages = chatService.getChatMessages(this.options.agent);
    if (messages.length === 0) return 0;

    return messages.reduce((total, message) => total + (message.response.cost.total ?? 0), 0);
  }

  private getTerminalSize(): {columns: number; rows: number} {
    return {
      columns: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
    };
  }

  private rebuildTranscriptFromEvents(events: AgentEventEnvelope[]): void {
    this.transcript.length = 0;
    this.entryId = 0;
    this.activeTranscriptStream = null;

    for (const event of events) {
      this.applyTranscriptEvent(event);
    }
  }

  private renderTranscriptReplay(columns: number): {
    text: string;
    activeStream: {type: "output.chat" | "output.reasoning"; column: number} | null;
  } {
    const visibleEntries = this.getVisibleTranscript();
    const activeEntry = this.activeTranscriptStream && this.isEntryVisible(this.activeTranscriptStream.entry)
      ? this.activeTranscriptStream.entry
      : null;

    let text = "";
    for (const entry of visibleEntries) {
      text += this.renderEntryText(entry, activeEntry?.id === entry.id);
    }

    const activeStream = activeEntry && this.activeTranscriptStream
      ? {
        type: this.activeTranscriptStream.type,
        column: advanceColumn(0, `${TEXT_INDENT}${this.getRawStreamText(activeEntry.body)}`, columns),
      }
      : null;

    return {text, activeStream};
  }

  private getVisibleTranscript(): TranscriptEntry[] {
    if (this.verbose) return this.transcript;
    return this.transcript.filter((entry) => entry.kind !== "reasoning" && entry.kind !== "artifact");
  }

  private getVisibleTranscriptViewportLineCount(maxRows: number): number {
    if (maxRows <= 0) return 0;

    const visibleEntries = this.getVisibleTranscript();
    const activeEntryId = this.activeTranscriptStream && this.isEntryVisible(this.activeTranscriptStream.entry)
      ? this.activeTranscriptStream.entry.id
      : null;

    let totalLines = 0;
    for (const entry of visibleEntries) {
      totalLines += this.getRenderedEntryLineCount(entry, activeEntryId === entry.id);
    }

    return Math.min(maxRows, totalLines);
  }

  private isEntryVisible(entry: TranscriptEntry): boolean {
    return this.verbose || (entry.kind !== "reasoning" && entry.kind !== "artifact");
  }

  private getRenderedEntryLineCount(entry: TranscriptEntry, keepOpen = false): number {
    let count = 0;

    if (entry.title) {
      count += 1;
    }

    const body = trimBoundaryNewlines(entry.body);
    if (body.length > 0) {
      count += body.split("\n").length;
    }

    if (!keepOpen) {
      count += 1;
    }

    return count;
  }

  private renderEntryText(entry: TranscriptEntry, keepOpen = false): string {
    const lines: string[] = [];

    if (entry.title) {
      lines.push(TITLE_COLOR(`${HEADER_PREFIX}${entry.title}`));
    }

    const body = trimBoundaryNewlines(entry.body);
    if (body.length > 0) {
      for (const sourceLine of body.split("\n")) {
        const styled = entry.markdown
          ? TONE_COLORS[entry.tone](applyMarkdownStyles(sourceLine))
          : TONE_COLORS[entry.tone](sourceLine);
        lines.push(`${TEXT_INDENT}${styled}`);
      }
    }

    if (keepOpen) {
      return lines.join("\n");
    }

    return `${lines.join("\n")}\n\n`;
  }

  private renderStreamChunk(message: string, tone: TranscriptTone): {styled: string; raw: string} {
    const raw = this.getRawStreamText(message);
    return {
      styled: TONE_COLORS[tone](raw),
      raw,
    };
  }

  private getRawStreamText(message: string): string {
    return message.replace(/\n/g, `\n${TEXT_INDENT}`);
  }

  private getAvailableInteractions(): ParsedInteractionRequest[] {
    return this.latestState?.currentlyExecutingInputItem?.executionState.availableInteractions ?? [];
  }

  private getPrimaryFollowup(): FollowupInteraction | null {
    return this.getAvailableInteractions().find(
      (interaction): interaction is FollowupInteraction => interaction.type === "followup",
    ) ?? null;
  }

  private getRequiredQuestions(): QuestionInteraction[] {
    return this.getAvailableInteractions()
      .filter((interaction): interaction is QuestionInteraction => interaction.type === "question" && !interaction.optional)
      .sort((left, right) => left.timestamp - right.timestamp);
  }

  private getOptionalQuestions(): QuestionInteraction[] {
    return this.getAvailableInteractions()
      .filter((interaction): interaction is QuestionInteraction => interaction.type === "question" && interaction.optional)
      .sort((left, right) => left.timestamp - right.timestamp);
  }

  private getFocusedQuestion(): QuestionInteraction | null {
    const required = this.getRequiredQuestions();
    if (required.length > 0) {
      this.activeOptionalQuestionId = null;
      this.optionalPickerOpen = false;
      return required[0];
    }

    if (this.activeOptionalQuestionId) {
      return this.getOptionalQuestions().find((question) => question.interactionId === this.activeOptionalQuestionId) ?? null;
    }

    return null;
  }

  private getQuestionLabel(question: QuestionInteraction): string {
    switch (question.question.type) {
      case "text":
      case "treeSelect":
      case "fileSelect":
        return question.question.label;
      case "form":
        return "Form";
    }
  }

  private cleanupInteractionState(): void {
    const interactions = this.getAvailableInteractions();
    const interactionIds = new Set(interactions.map((interaction) => interaction.interactionId));

    for (const interactionId of this.followupEditors.keys()) {
      if (!interactionIds.has(interactionId)) {
        this.followupEditors.delete(interactionId);
      }
    }

    for (const interactionId of this.questionSessions.keys()) {
      if (!interactionIds.has(interactionId)) {
        this.questionSessions.delete(interactionId);
      }
    }

    if (this.activeOptionalQuestionId && !interactionIds.has(this.activeOptionalQuestionId)) {
      this.activeOptionalQuestionId = null;
    }

    const optionalQuestions = this.getOptionalQuestions();
    if (optionalQuestions.length === 0) {
      this.optionalPickerOpen = false;
      this.optionalQuestionIndex = 0;
    } else {
      this.optionalQuestionIndex = clamp(this.optionalQuestionIndex, 0, optionalQuestions.length - 1);
    }
  }

  private getFollowupEditor(interactionId: string): InputEditor {
    let editor = this.followupEditors.get(interactionId);
    if (!editor) {
      editor = new InputEditor();
      this.followupEditors.set(interactionId, editor);
    }
    return editor;
  }

  private getQuestionSession(question: QuestionInteraction): InlineQuestionSession {
    let session = this.questionSessions.get(question.interactionId);
    if (session) return session;

    session = createInlineQuestionSession(question.question, {
      onSubmit: (result) => this.sendInteractionResponse(question.interactionId, result),
      onCancel: () => this.sendInteractionResponse(question.interactionId, null),
      onRender: () => this.render(),
      openFileSelect: (fileQuestion, message) => this.openInlineFileSelector(fileQuestion, question, message),
    }, question.message);

    this.questionSessions.set(question.interactionId, session);
    return session;
  }

  private sendInteractionResponse(interactionId: string, result: unknown): void {
    const requestId = this.latestState?.currentlyExecutingInputItem?.request.requestId;
    if (!requestId) {
      this.flash("No active interaction is waiting for a response.", "warning");
      return;
    }

    if (interactionId === this.activeOptionalQuestionId) {
      this.activeOptionalQuestionId = null;
    }

    this.optionalPickerOpen = false;
    this.options.agent.sendInteractionResponse({
      requestId,
      interactionId,
      result,
    });
  }

  private async openInlineFileSelector(
    question: ParsedFileSelectQuestion,
    parentQuestion: QuestionInteraction,
    message: string,
  ): Promise<string[] | null> {
    const renderScreen =
      this.options.config.uiFramework === "ink" ? renderScreenInk : renderScreenOpenTUI;
    const Screen =
      this.options.config.uiFramework === "ink"
        ? InkQuestionInputScreen
        : OpenTUIQuestionInputScreen;

    const abort = new AbortController();
    this.inlineScreenAbort = abort;
    this.suspend();

    try {
      await sleep(60);
      return await renderScreen(
        Screen as any,
        {
          request: {
            type: "question",
            interactionId: parentQuestion.interactionId,
            timestamp: Date.now(),
            message,
            optional: parentQuestion.optional,
            autoSubmitAt: parentQuestion.autoSubmitAt,
            question,
          },
          agent: this.options.agent,
          config: this.options.config,
        } as any,
        abort.signal,
      );
    } catch {
      return null;
    } finally {
      if (this.inlineScreenAbort === abort) {
        this.inlineScreenAbort = null;
      }
      this.resume();
    }
  }
}
