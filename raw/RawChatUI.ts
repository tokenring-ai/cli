import process from "node:process";
import readline from "node:readline";
import type Agent from "@tokenring-ai/agent/Agent";
import type { AgentEventEnvelope, ParsedInteractionRequest } from "@tokenring-ai/agent/AgentEvents";
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";
import { CommandHistoryState } from "@tokenring-ai/agent/state/commandHistoryState";
import { FileSystemService } from "@tokenring-ai/filesystem";
import { FileSystemState } from "@tokenring-ai/filesystem/state/fileSystemState";
import { clamp } from "@tokenring-ai/utility/number/clamp";
import { brailleSpinner } from "@tokenring-ai/utility/string/brailleSpinner";
import { truncateVisible } from "@tokenring-ai/utility/string/truncateVisible";
import { visibleLength } from "@tokenring-ai/utility/string/visibleLength";
import type { MaybePromise } from "bun";
import chalk from "chalk";
import type { z } from "zod";
import type { CLIConfigSchema } from "../schema.ts";
import { theme } from "../theme.ts";
import {
  combineBlocks,
  formatArtifactBody,
  formatToolCallBody,
  getCommandCompletionSignature,
  getFileSearchTokenSignature,
  getFooterCursorSequence,
  getQuestionLabel,
  getQuestionTitle,
  getRawStreamText,
  HEADER_PREFIX,
  moveToFooterTop,
  type QuestionInteraction,
  renderBufferedStream,
  renderEntryText,
  TEXT_INDENT,
  TITLE_COLOR,
  TONE_COLORS,
  type TranscriptEntry,
  type TranscriptEntryKind,
  type TranscriptTone,
} from "./ChatRenderUtils.ts";
import { type CommandDefinition, getCommandCompletionContext } from "./CommandCompletions.ts";
import { compareFilePathsForBrowsing, type FileSearchToken, findActiveFileSearchToken, getFileSearchMatches, replaceFileSearchToken } from "./FileSearch.ts";
import { createInlineQuestionSession, type Keypress as InlineKeypress, type InlineQuestionSession, type RenderBlock } from "./InlineQuestions.ts";
import InputEditor from "./InputEditor.ts";
import {
  countScreenRows,
  findFirstDifferentLineIndex,
  flattenWrappedLines,
  formatCompactNumber,
  formatCurrency,
  formatPercentLeft,
  formatTimer,
  getActiveToolCount,
  getChatCost,
  getCurrentModelLabel,
  getRemainingContextPercent,
  getTerminalSize,
  getTokenUsage,
  shortenPath,
  splitLines,
} from "./utility.ts";

type CompletionState = {
  replacementStart: number;
  replacementEnd: number;
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
  lines: string[];
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
      kind: "rewriteStreamTail";
      footerNeedsLeadingNewline: boolean;
      blockTopOffsetFromFooterTop: number;
      previousLines: string[];
    };

type TranscriptEventAction =
  | { action: "clearOnly" }
  | { action: "addEntry"; kind: TranscriptEntryKind; title: string; body: string; tone: TranscriptTone; markdown: boolean }
  | { action: "stream"; type: "output.chat" | "output.reasoning"; title: string; message: string; tone: TranscriptTone };

type ActiveVisibleStream = {
  type: "output.chat" | "output.reasoning";
  tone: TranscriptTone;
  rawBuffer: string;
  displayedBuffer: string;
  screenLineCount: number;
};

type FollowupInteraction = Extract<ParsedInteractionRequest, { type: "followup" }>;

const STATUS_BAR = chalk.hex(theme.chatDivider);
const PROMPT_ARROW_COLOR = chalk.hex(theme.askMessage).bold;
const PLACEHOLDER_COLOR = chalk.hex(theme.chatDivider);
const FILE_SEARCH_SELECTED = chalk.hex(theme.treeHighlightedItem).bold;
const FILE_SEARCH_IDLE = chalk.hex(theme.chatSystemInfoMessage);
const RAW_PROMPT_PREFIX = " → ";
const RAW_CONTINUATION_PREFIX = "   ";
const PROMPT_PREFIX = ` ${PROMPT_ARROW_COLOR("→")} `;
const CONTINUATION_PREFIX = RAW_CONTINUATION_PREFIX;
const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

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
  private activeTranscriptStream: {
    type: "output.chat" | "output.reasoning";
    entry: TranscriptEntry;
  } | null = null;
  private activeVisibleStream: ActiveVisibleStream | null = null;
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
  private stdinWasPaused = true;
  private footerSnapshot: FooterSnapshot = {
    lineCount: 0,
    lines: [],
    cursorRow: 0,
    cursorColumn: 0,
    showCursor: true,
  };
  private fullReplayRequested = true;
  private lastFullReplayAt = 0;
  private fullReplayThrottleTimer: NodeJS.Timeout | null = null;
  private latestState: AgentEventState | null = null;
  private optionalPickerOpen = false;
  private optionalQuestionIndex = 0;
  private activeOptionalQuestionId: string | null = null;
  private bracketedPasteBuffer = "";
  private inBracketedPaste = false;
  private pasteSuppressionExpiresAt = 0;
  private workspaceFiles: string[] | null = null;
  private workspaceFilesLoadError: string | null = null;
  private workspaceFilesPromise: Promise<void> | null = null;
  private dismissedCompletionSignature: string | null = null;
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
      this.spinnerIndex = (this.spinnerIndex + 1) % brailleSpinner.length;
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
    if (this.fullReplayThrottleTimer) {
      clearTimeout(this.fullReplayThrottleTimer);
      this.fullReplayThrottleTimer = null;
    }

    this.clearFooter();
    this.detachTerminal();
  }

  renderEvent(event: AgentEventEnvelope): void {
    try {
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
    } catch (error: unknown) {
      this.reportInternalError("Failed to process event", error);
    }
  }

  syncState(state: AgentEventState): void {
    try {
      this.latestState = state;
      this.cleanupInteractionState();
      this.render();
    } catch (error: unknown) {
      this.latestState = null;
      this.reportInternalError("Failed to sync state", error);
    }
  }

  flash(text: string, tone: FlashMessage["tone"] = "info", durationMs = 2400): void {
    this.setFlashMessage(text, tone, durationMs);
    this.render();
  }

  private setFlashMessage(text: string, tone: FlashMessage["tone"], durationMs = 2400): void {
    this.flashMessage = {
      text,
      tone,
      expiresAt: Date.now() + durationMs,
    };
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private reportInternalError(prefix: string, error: unknown): void {
    this.setFlashMessage(`${prefix}: ${this.describeError(error)}`, "error");
  }

  private attachTerminal(): void {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return;

    this.rawModeBeforeStart = process.stdin.isRaw;
    this.stdinWasPaused = process.stdin.isPaused();
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
      if (this.stdinWasPaused) {
        process.stdin.pause();
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
        void handled.then(didHandle => {
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

    if (this.completionState) {
      if (key.name === "escape") {
        this.dismissCommandCompletion();
        return true;
      }

      if (key.name === "up" || (key.ctrl && key.name === "p")) {
        return this.moveCommandCompletionSelection(-1);
      }

      if (key.name === "down" || (key.ctrl && key.name === "n")) {
        return this.moveCommandCompletionSelection(1);
      }

      if (key.name === "pageup") {
        return this.moveCommandCompletionSelection(-5);
      }

      if (key.name === "pagedown") {
        return this.moveCommandCompletionSelection(5);
      }
    }

    if (key.name === "escape") {
      if (this.options.onAbortCurrentActivity()) {
        this.flash("Cancelled the current activity.", "warning");
      } else {
        this.flash("No active work to cancel.", "muted");
      }
      return true;
    }

    if (key.name === "tab") {
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
      const { lineIndex } = this.chatEditor.getCursorLocation();
      if (lineIndex > 0) {
        this.chatEditor.moveUp();
        this.afterChatEdit();
      } else {
        this.browseHistory(-1);
      }
      return true;
    }

    if (key.name === "down") {
      const { lineIndex } = this.chatEditor.getCursorLocation();
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
      if (this.completionState) {
        return this.insertSelectedCommandCompletion();
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

  private handleFollowupKeypress(followup: FollowupInteraction, input: string, key: InlineKeypress): boolean {
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

  private insertSelectedCommandCompletion(): boolean {
    if (!this.completionState) return false;

    const selectedCommand = this.completionState.matches[this.completionState.selectedIndex];
    if (!selectedCommand) {
      this.flash("No matching command.", "warning");
      return true;
    }

    this.applyCompletion(this.completionState.replacementStart, this.completionState.replacementEnd, `${selectedCommand.name} `);
    return true;
  }

  private moveCommandCompletionSelection(offset: number): boolean {
    if (!this.completionState || this.completionState.matches.length === 0) {
      return true;
    }

    this.completionState = {
      ...this.completionState,
      selectedIndex: clamp(this.completionState.selectedIndex + offset, 0, this.completionState.matches.length - 1),
    };
    return true;
  }

  private applyCompletion(start: number, end: number, replacement: string): void {
    const text = this.chatEditor.getText();
    const prefix = text.slice(0, start);
    const suffix = text.slice(end);

    this.chatEditor.setText(`${prefix}/${replacement}${suffix}`, prefix.length + replacement.length + 1);
    this.historyIndex = null;
    this.historyDraft = "";
    this.dismissedCompletionSignature = null;
    this.afterChatEdit();
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
      this.afterChatEdit();
      return;
    } else {
      this.historyIndex += 1;
    }

    this.chatEditor.setText(history[this.historyIndex]);
    this.afterChatEdit();
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
    this.afterChatEdit();
  }

  private triggerShortcutCommand(commandName: string, flashMessage: string): void {
    if (!this.hasCommand(commandName)) {
      this.flash(`/${commandName} is not available.`, "warning");
      return;
    }

    this.dismissedCompletionSignature = null;
    this.completionState = null;
    this.options.onSubmit(`/${commandName}`);
    this.flash(flashMessage, "info");
  }

  private hasCommand(commandName: string): boolean {
    return this.options.commands.some(command => command.name === commandName);
  }

  private afterChatEdit(): void {
    this.historyIndex = null;
    this.historyDraft = "";
    this.syncChatCommandCompletionState();
    this.syncChatFileSearchState();
  }

  private syncChatCommandCompletionState(): void {
    const context = getCommandCompletionContext(this.chatEditor.getText(), this.chatEditor.getCursor(), this.options.commands);

    if (!context) {
      this.completionState = null;
      this.dismissedCompletionSignature = null;
      return;
    }

    const signature = getCommandCompletionSignature(context);
    if (this.dismissedCompletionSignature && this.dismissedCompletionSignature !== signature) {
      this.dismissedCompletionSignature = null;
    }

    if (this.dismissedCompletionSignature === signature) {
      this.completionState = null;
      return;
    }

    const previousSelection = this.completionState?.matches[this.completionState.selectedIndex]?.name ?? null;
    let selectedIndex = 0;

    if (context.matches.length > 0) {
      if (previousSelection) {
        const nextIndex = context.matches.findIndex(command => command.name === previousSelection);
        if (nextIndex !== -1) {
          selectedIndex = nextIndex;
        } else if (this.completionState?.sourceQuery === context.query) {
          selectedIndex = clamp(this.completionState.selectedIndex, 0, context.matches.length - 1);
        }
      } else if (this.completionState?.sourceQuery === context.query) {
        selectedIndex = clamp(this.completionState.selectedIndex, 0, context.matches.length - 1);
      }
    }

    this.completionState = {
      replacementStart: context.replacementStart,
      replacementEnd: context.replacementEnd,
      sourceQuery: context.query,
      matches: context.matches,
      selectedIndex,
    };
  }

  private dismissCommandCompletion(): void {
    if (!this.completionState) return;

    this.dismissedCompletionSignature = getCommandCompletionSignature(this.completionState);
    this.completionState = null;
  }

  private syncChatFileSearchState(): void {
    const token = findActiveFileSearchToken(this.chatEditor.getText(), this.chatEditor.getCursor());

    if (!token) {
      this.fileSearchState = null;
      this.dismissedFileSearchSignature = null;
      return;
    }

    const tokenSignature = getFileSearchTokenSignature(token);
    if (this.dismissedFileSearchSignature && this.dismissedFileSearchSignature !== tokenSignature) {
      this.dismissedFileSearchSignature = null;
    }

    if (this.dismissedFileSearchSignature === tokenSignature) {
      this.fileSearchState = null;
      return;
    }

    const previousSelection = this.fileSearchState?.matches[this.fileSearchState.selectedIndex] ?? null;
    const matches = this.workspaceFiles ? getFileSearchMatches(this.workspaceFiles, token.query, 48) : [];

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

  private dismissFileSearch(): void {
    if (!this.fileSearchState) return;

    this.dismissedFileSearchSignature = getFileSearchTokenSignature(this.fileSearchState.token);
    this.fileSearchState = null;
  }

  private moveFileSearchSelection(offset: number): boolean {
    if (!this.fileSearchState || this.fileSearchState.matches.length === 0) {
      return true;
    }

    this.fileSearchState = {
      ...this.fileSearchState,
      selectedIndex: clamp(this.fileSearchState.selectedIndex + offset, 0, this.fileSearchState.matches.length - 1),
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

    const nextValue = replaceFileSearchToken(this.chatEditor.getText(), this.fileSearchState.token, selectedPath);

    this.chatEditor.setText(nextValue.text, nextValue.cursor);
    this.dismissedFileSearchSignature = null;
    this.afterChatEdit();
    return true;
  }

  private loadWorkspaceFiles(): MaybePromise<void> {
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
        const files = await fileSystem.glob("**/*", { includeDirectories: false }, this.options.agent);
        this.workspaceFiles = Array.from(new Set(files)).sort(compareFilePathsForBrowsing);
      } catch (error: unknown) {
        this.workspaceFiles = null;
        this.workspaceFilesLoadError = error instanceof Error ? `Workspace file search failed: ${error.message}` : "Workspace file search failed.";
      } finally {
        this.workspaceFilesPromise = null;
        this.syncChatFileSearchState();
        this.render();
      }
    })();

    return this.workspaceFilesPromise;
  }

  private classifyTranscriptEvent(event: AgentEventEnvelope): TranscriptEventAction {
    switch (event.type) {
      case "agent.created":
        return {
          action: "addEntry",
          kind: "system",
          title: "System",
          body: this.verbose ? event.message : (event.message.split("\n")[0] ?? ""),
          tone: "info",
          markdown: false,
        };
      case "output.chat":
        return { action: "stream", type: "output.chat", title: "Assistant", message: event.message, tone: "chat" };
      case "output.reasoning":
        return { action: "stream", type: "output.reasoning", title: "Reasoning", message: event.message, tone: "reasoning" };
      case "output.info":
        return { action: "addEntry", kind: "info", title: "Info", body: event.message, tone: "info", markdown: false };
      case "output.warning":
        return { action: "addEntry", kind: "warning", title: "Warning", body: event.message, tone: "warning", markdown: false };
      case "output.error":
        return { action: "addEntry", kind: "error", title: "Error", body: event.message, tone: "error", markdown: false };
      case "output.artifact":
        return {
          action: "addEntry",
          kind: "artifact",
          title: `Artifact: ${event.name}`,
          tone: "info",
          ...formatArtifactBody(event, this.verbose),
        };
      case "toolCall":
        return {
          action: "addEntry",
          kind: "toolCall",
          title: event.summary,
          body: formatToolCallBody(event, this.verbose),
          tone: "info",
          markdown: true,
        };
      case "agent.response":
        return {
          action: "addEntry",
          kind: "response",
          title: event.status === "success" ? "Response" : "Error",
          body: event.message,
          tone: event.status === "success" ? "success" : "error",
          markdown: event.status === "success",
        };
      case "input.received":
        return { action: "addEntry", kind: "input", title: "You", body: event.input.message, tone: "input", markdown: false };
      case "agent.stopped":
      case "agent.status":
      case "input.execution":
      case "cancel":
      case "input.interaction":
        return { action: "clearOnly" };
      default: {
        // noinspection UnnecessaryLocalVariableJS
        const unknownEventType: never = event;
        throw new Error(`Unhandled event type: ${unknownEventType as string}`);
      }
    }
  }

  private applyTranscriptEvent(event: AgentEventEnvelope): void {
    const classified = this.classifyTranscriptEvent(event);
    switch (classified.action) {
      case "clearOnly":
        this.clearActiveTranscriptStream();
        break;
      case "addEntry":
        this.clearActiveTranscriptStream();
        this.addEntry({
          kind: classified.kind,
          title: classified.title,
          body: classified.body,
          tone: classified.tone,
          markdown: classified.markdown,
        });
        break;
      case "stream":
        this.appendTranscriptStream(classified.type, classified.title, classified.message, classified.tone);
        break;
    }
  }

  private buildTranscriptDelta(event: AgentEventEnvelope): TranscriptDelta {
    const { columns, rows } = getTerminalSize();
    const classified = this.classifyTranscriptEvent(event);

    switch (classified.action) {
      case "clearOnly":
        this.closeVisibleStream();
        return { kind: "none" };
      case "addEntry": {
        // Verbose-gated entries that are hidden in quiet mode
        if (!this.verbose && (classified.kind === "reasoning" || classified.kind === "artifact")) {
          this.closeVisibleStream();
          return { kind: "none" };
        }
        return this.buildCompleteEntryDelta(classified.title, classified.body, classified.tone, classified.markdown, columns, classified.kind);
      }
      case "stream": {
        if (!this.verbose && classified.type === "output.reasoning") {
          this.closeVisibleStream();
          return { kind: "none" };
        }
        return this.buildStreamDelta(classified.type, classified.title, classified.message, classified.tone, columns, rows);
      }
    }
  }

  private buildCompleteEntryDelta(
    title: string,
    body: string,
    tone: TranscriptTone,
    markdown: boolean,
    columns: number,
    kind: TranscriptEntryKind = "info",
  ): TranscriptDelta {
    this.closeVisibleStream();
    const prefix = this.pendingSeparatorBeforeNextVisibleEntry ? "\n" : "";
    this.pendingSeparatorBeforeNextVisibleEntry = false;
    return {
      kind: "append",
      text: `${prefix}${renderEntryText(
        {
          id: 0,
          kind,
          title,
          body,
          tone,
          markdown,
        },
        columns,
      )}`,
      footerNeedsLeadingNewline: false,
    };
  }

  private buildStreamDelta(
    type: "output.chat" | "output.reasoning",
    title: string,
    message: string,
    tone: TranscriptTone,
    columns: number,
    rows: number,
  ): TranscriptDelta {
    const rawChunk = getRawStreamText(message);

    if (!this.activeVisibleStream || this.activeVisibleStream.type !== type) {
      const prefix = this.pendingSeparatorBeforeNextVisibleEntry ? "\n" : "";
      this.pendingSeparatorBeforeNextVisibleEntry = false;
      const rawBuffer = `${TEXT_INDENT}${rawChunk}`;
      const displayedBuffer = renderBufferedStream(rawBuffer, tone, columns);
      const screenLineCount = countScreenRows(splitLines(displayedBuffer), columns);

      if (screenLineCount > rows) {
        this.scheduleFullReplay();
        return { kind: "none" };
      }

      this.activeVisibleStream = {
        type,
        tone,
        rawBuffer,
        displayedBuffer,
        screenLineCount,
      };
      return {
        kind: "append",
        text: `${prefix}${TITLE_COLOR(`${HEADER_PREFIX}${title}`)}\n${displayedBuffer}`,
        footerNeedsLeadingNewline: true,
      };
    }

    const previousDisplayedBuffer = this.activeVisibleStream.displayedBuffer;
    const previousLines = splitLines(previousDisplayedBuffer);
    const previousScreenLineCount = this.activeVisibleStream.screenLineCount;
    this.activeVisibleStream.rawBuffer += rawChunk;
    const displayedBuffer = renderBufferedStream(this.activeVisibleStream.rawBuffer, tone, columns);
    const nextLines = splitLines(displayedBuffer);
    const screenLineCount = countScreenRows(nextLines, columns);

    if (screenLineCount > rows) {
      this.scheduleFullReplay();
      return { kind: "none" };
    }

    this.activeVisibleStream.tone = tone;
    this.activeVisibleStream.displayedBuffer = displayedBuffer;
    this.activeVisibleStream.screenLineCount = screenLineCount;

    return {
      kind: "rewriteStreamTail",
      footerNeedsLeadingNewline: true,
      blockTopOffsetFromFooterTop: previousScreenLineCount,
      previousLines,
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

  private appendTranscriptStream(type: "output.chat" | "output.reasoning", title: string, message: string, tone: TranscriptTone): void {
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
    this.activeTranscriptStream = { type, entry };
  }

  private requestFullReplay(): void {
    this.fullReplayRequested = true;
    this.render();
  }

  private scheduleFullReplay(): void {
    const now = Date.now();
    const remainingMs = Math.max(0, 1000 - (now - this.lastFullReplayAt));
    if (remainingMs === 0) {
      this.requestFullReplay();
      return;
    }

    if (this.fullReplayThrottleTimer) {
      return;
    }

    this.fullReplayThrottleTimer = globalThis.setTimeout(() => {
      this.fullReplayThrottleTimer = null;
      this.requestFullReplay();
    }, remainingMs);
    this.fullReplayThrottleTimer.unref();
  }

  private render(): void {
    if (!this.started || this.suspended || !process.stdout.isTTY) return;

    try {
      if (this.fullReplayRequested) {
        this.renderFullReplay();
        return;
      }
      this.renderFooterOnly();
    } catch (error: unknown) {
      this.latestState = null;
      this.reportInternalError("Render failed", error);
      try {
        this.fullReplayRequested = true;
        this.renderFullReplay();
      } catch {
        // Swallow the recovery failure; the UI is already degraded.
      }
    }
  }

  private renderFullReplay(): void {
    if (!process.stdout.isTTY) return;

    if (this.latestState) {
      this.rebuildTranscriptFromEvents(this.latestState.events);
    }

    const { columns, rows } = getTerminalSize();
    const footer = this.renderFooter(columns, rows);

    if (columns < 40 || rows < 10) {
      const output = `\x1b[?25l\x1b[3J\x1b[2J\x1b[H${TONE_COLORS.warning("Terminal too small. Resize to at least 40x10.")}\x1b[?25h`;
      process.stdout.write(output);
      this.footerSnapshot = {
        lineCount: 1,
        lines: [TONE_COLORS.warning("Terminal too small. Resize to at least 40x10.")],
        cursorRow: 0,
        cursorColumn: 0,
        showCursor: false,
      };
      this.fullReplayRequested = false;
      return;
    }

    const { text, activeStream } = this.renderTranscriptReplay(columns);
    let output = "\x1b[?25l\x1b[3J\x1b[2J\x1b[H";
    output += text;

    if (footer.lines.length > 0) {
      if (text.length > 0 && activeStream) {
        output += "\n";
      }
      output += footer.lines.join("\n");
      output += getFooterCursorSequence(footer);
    } else {
      output += "\x1b[?25h";
    }

    process.stdout.write(output);
    this.footerSnapshot = {
      lineCount: footer.lines.length,
      lines: [...footer.lines],
      cursorRow: footer.cursorRow ?? Math.max(0, footer.lines.length - 1),
      cursorColumn: footer.cursorColumn ?? 0,
      showCursor: footer.showCursor !== false,
    };
    this.activeVisibleStream = activeStream;
    this.pendingSeparatorBeforeNextVisibleEntry = false;
    this.fullReplayRequested = false;
    this.lastFullReplayAt = Date.now();
  }

  private renderFooterOnly(): void {
    this.renderIncremental({ kind: "none" });
  }

  private renderIncremental(delta: TranscriptDelta): void {
    if (!process.stdout.isTTY) return;

    const { columns, rows } = getTerminalSize();
    const footer = this.renderFooter(columns, rows);

    if (columns < 40 || rows < 10) {
      this.requestFullReplay();
      return;
    }

    if (delta.kind === "none" && footer.lines.length !== this.footerSnapshot.lineCount) {
      this.renderFullReplay();
      return;
    }

    if (delta.kind === "append") {
      let output = "\x1b[?25l";
      output += moveToFooterTop(this.footerSnapshot);
      output += "\x1b[J";
      output += delta.text;
      if (footer.lines.length > 0 && delta.footerNeedsLeadingNewline) {
        output += "\n";
      }
      if (footer.lines.length > 0) {
        output += footer.lines.join("\n");
        output += getFooterCursorSequence(footer);
      } else {
        output += "\x1b[?25h";
      }
      process.stdout.write(output);
    } else if (delta.kind === "rewriteStreamTail" && this.activeVisibleStream) {
      const nextTail = [...splitLines(this.activeVisibleStream.displayedBuffer), ...footer.lines];
      const previousDisplay = [...delta.previousLines, ...this.footerSnapshot.lines];
      if (!this.rewriteTailBlock(previousDisplay, nextTail, footer, delta.blockTopOffsetFromFooterTop, columns, rows)) {
        return;
      }
    } else {
      if (!this.rewriteTailBlock(this.footerSnapshot.lines, footer.lines, footer, 0, columns, rows)) {
        return;
      }
    }

    this.footerSnapshot = {
      lineCount: footer.lines.length,
      lines: [...footer.lines],
      cursorRow: footer.cursorRow ?? Math.max(0, footer.lines.length - 1),
      cursorColumn: footer.cursorColumn ?? 0,
      showCursor: footer.showCursor !== false,
    };
  }

  private clearFooter(): void {
    if (!process.stdout.isTTY || this.footerSnapshot.lineCount === 0) return;
    const output = `${moveToFooterTop(this.footerSnapshot)}\x1b[J\r\n`;
    process.stdout.write(output);
    this.footerSnapshot = {
      lineCount: 0,
      lines: [],
      cursorRow: 0,
      cursorColumn: 0,
      showCursor: true,
    };
  }

  private rewriteTailBlock(
    previousLines: string[],
    nextLines: string[],
    footer: RenderBlock,
    blockTopOffsetFromFooterTop: number,
    columns: number,
    rows: number,
  ): boolean {
    const previousRowCount = countScreenRows(previousLines, columns);
    const nextRowCount = countScreenRows(nextLines, columns);
    if (Math.max(previousRowCount, nextRowCount) > rows) {
      this.scheduleFullReplay();
      return false;
    }

    let firstDifferentLine = findFirstDifferentLineIndex(previousLines, nextLines);
    if (firstDifferentLine === previousLines.length && firstDifferentLine === nextLines.length) {
      firstDifferentLine = 0;
    }

    const prefixRowCount = countScreenRows(previousLines.slice(0, firstDifferentLine), columns);
    let output = "\x1b[?25l";
    output += moveToFooterTop(this.footerSnapshot);
    if (blockTopOffsetFromFooterTop > 0) {
      output += `\x1b[${blockTopOffsetFromFooterTop}F`;
    }
    if (prefixRowCount > 0) {
      output += `\x1b[${prefixRowCount}E`;
    }
    output += "\x1b[J";

    const tailText = nextLines.slice(firstDifferentLine).join("\n");
    if (tailText.length > 0) {
      output += tailText;
    }
    output += footer.lines.length > 0 ? getFooterCursorSequence(footer) : "\x1b[?25h";

    process.stdout.write(output);
    return true;
  }

  private renderFooter(columns: number, rows: number): RenderBlock {
    let workingDirectory = process.cwd();
    try {
      workingDirectory = this.options.agent.getState(FileSystemState).workingDirectory;
    } catch (error: unknown) {
      this.reportInternalError("File system state unavailable", error);
    }

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
      if (!followup && this.completionState) {
        sections.push(this.renderCommandCompletionPicker(columns, rows));
      }
      if (!followup && this.fileSearchState) {
        sections.push(this.renderFileSearchPicker(columns, rows, workingDirectory));
      }
      sections.push(followup ? this.renderFollowupComposer(followup, columns, rows) : this.renderChatComposer(columns, rows));
    }

    sections.push({
      lines: [this.getStatusLine(columns, workingDirectory)],
      showCursor: false,
    });

    const footerContent = combineBlocks(sections);
    const transcriptVisibleRows = this.getVisibleTranscriptViewportLineCount(Math.max(0, rows - footerContent.lines.length), columns);
    const spacerCount = Math.max(0, rows - footerContent.lines.length - transcriptVisibleRows);

    if (spacerCount === 0) {
      return footerContent;
    }

    return {
      lines: [...Array.from({ length: spacerCount }, () => ""), ...footerContent.lines],
      cursorRow: footerContent.cursorRow === undefined ? undefined : footerContent.cursorRow + spacerCount,
      cursorColumn: footerContent.cursorColumn,
      showCursor: footerContent.showCursor,
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
      const body = renderedInput.isEmpty && index === 0 ? PLACEHOLDER_COLOR("Write a message or /command") : line;
      lines.push(`${prefix}${body}`);
    });

    return {
      lines,
      cursorRow: renderedInput.cursorRow,
      cursorColumn: (renderedInput.cursorRow === 0 ? promptPrefixWidth : continuationPrefixWidth) + renderedInput.cursorColumn,
      showCursor: true,
    };
  }

  private renderCommandCompletionPicker(columns: number, rows: number): RenderBlock {
    const state = this.completionState;
    if (!state) {
      return { lines: [], showCursor: false };
    }

    const lines = [TITLE_COLOR(`${HEADER_PREFIX}Commands`)];

    if (state.matches.length === 0) {
      lines.push(TONE_COLORS.muted(`${TEXT_INDENT}No matches for /${state.sourceQuery}`));
      return { lines, showCursor: false };
    }

    lines.push(TONE_COLORS.muted(`${TEXT_INDENT}${state.matches.length} matches`));

    const maxVisibleItems = clamp(rows - 16, 3, 6);
    const windowStart = clamp(state.selectedIndex - maxVisibleItems + 1, 0, Math.max(0, state.matches.length - maxVisibleItems));
    const visibleMatches = state.matches.slice(windowStart, windowStart + maxVisibleItems);

    visibleMatches.forEach((match, index) => {
      const actualIndex = windowStart + index;
      const prefix = actualIndex === state.selectedIndex ? "›" : " ";
      const label = truncateVisible(`/${match.name}  ${match.description}`, Math.max(10, columns - 4));
      lines.push(actualIndex === state.selectedIndex ? FILE_SEARCH_SELECTED(`${prefix} ${label}`) : FILE_SEARCH_IDLE(`${prefix} ${label}`));
    });

    return {
      lines,
      showCursor: false,
    };
  }

  private renderFileSearchPicker(columns: number, rows: number, workingDirectory: string): RenderBlock {
    const state = this.fileSearchState;
    if (!state) {
      return { lines: [], showCursor: false };
    }

    const indexedCount = this.workspaceFiles?.length ?? 0;
    const lines = [TITLE_COLOR(`${HEADER_PREFIX}Workspace Files`), TONE_COLORS.muted(`${TEXT_INDENT}${shortenPath(workingDirectory)}`)];

    if (state.loading) {
      lines.push(TONE_COLORS.info(`${TEXT_INDENT}Indexing workspace files...`));
      return { lines, showCursor: false };
    }

    if (state.error) {
      lines.push(TONE_COLORS.warning(`${TEXT_INDENT}${state.error}`));
      return { lines, showCursor: false };
    }

    if (state.matches.length === 0) {
      lines.push(TONE_COLORS.muted(`${TEXT_INDENT}No matches for @${state.token.query}`));
      return { lines, showCursor: false };
    }

    lines.push(TONE_COLORS.muted(`${TEXT_INDENT}${state.matches.length} matches · ${indexedCount} indexed`));

    const maxVisibleItems = clamp(rows - 16, 3, 6);
    const windowStart = clamp(state.selectedIndex - maxVisibleItems + 1, 0, Math.max(0, state.matches.length - maxVisibleItems));
    const visibleMatches = state.matches.slice(windowStart, windowStart + maxVisibleItems);

    visibleMatches.forEach((match, index) => {
      const actualIndex = windowStart + index;
      const prefix = actualIndex === state.selectedIndex ? "›" : " ";
      const label = truncateVisible(match, Math.max(10, columns - 4));
      lines.push(actualIndex === state.selectedIndex ? FILE_SEARCH_SELECTED(`${prefix} ${label}`) : FILE_SEARCH_IDLE(`${prefix} ${label}`));
    });

    return {
      lines,
      showCursor: false,
    };
  }

  private renderFollowupComposer(followup: FollowupInteraction, columns: number, rows: number): RenderBlock {
    const editor = this.getFollowupEditor(followup.interactionId);
    const promptPrefixWidth = visibleLength(RAW_PROMPT_PREFIX);
    const continuationPrefixWidth = visibleLength(RAW_CONTINUATION_PREFIX);
    const innerWidth = Math.max(10, columns - promptPrefixWidth);
    const maxContentLines = clamp(Math.floor(rows * 0.25), 1, 8);
    const renderedInput = renderEditor(editor, innerWidth, maxContentLines);
    const lines = [
      TITLE_COLOR(`${HEADER_PREFIX}Follow-up`),
      ...flattenWrappedLines([followup.message], columns, TEXT_INDENT).map(line => TONE_COLORS.info(line)),
    ];

    renderedInput.visibleLines.forEach((line, index) => {
      const prefix = index === 0 ? PROMPT_PREFIX : CONTINUATION_PREFIX;
      const body = renderedInput.isEmpty && index === 0 ? PLACEHOLDER_COLOR("Reply to continue the current run") : line;
      lines.push(`${prefix}${body}`);
    });

    return {
      lines,
      cursorRow: lines.length - renderedInput.visibleLines.length + renderedInput.cursorRow,
      cursorColumn: (renderedInput.cursorRow === 0 ? promptPrefixWidth : continuationPrefixWidth) + renderedInput.cursorColumn,
      showCursor: true,
    };
  }

  private renderQuestionSection(question: QuestionInteraction, columns: number, rows: number): RenderBlock {
    const session = this.getQuestionSession(question);
    const child = session.render({ columns, rows });
    const childIndent = question.question.type === "treeSelect" || question.question.type === "fileSelect" ? "" : TEXT_INDENT;
    const indentedChildLines = child.lines.map(line => `${childIndent}${line}`);
    const title = getQuestionTitle(question);
    const lines = [
      TITLE_COLOR(`${HEADER_PREFIX}${title}`),
      "",
      ...flattenWrappedLines([question.message], columns, TEXT_INDENT).map(line => TONE_COLORS.info(line)),
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

    const lines = [TITLE_COLOR(`${HEADER_PREFIX}Optional Questions`), TONE_COLORS.info(`${TEXT_INDENT}${optionalQuestions.length} available`)];

    visibleQuestions.forEach((question, index) => {
      const actualIndex = start + index;
      const prefix = actualIndex === this.optionalQuestionIndex ? "›" : " ";
      const timer = question.autoSubmitAt ? ` · ${formatTimer(question.autoSubmitAt)}` : "";
      const label = truncateVisible(`${getQuestionLabel(question)}${timer}`, Math.max(10, columns - 6));
      lines.push(`${prefix} ${label}`);
      lines.push(...flattenWrappedLines([question.message], Math.max(20, columns - 4), "  ").map(line => TONE_COLORS.muted(line)));
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
    let tone: TranscriptTone;

    const optionalCount = this.getOptionalQuestions().length;
    const optionalHint = optionalCount > 0 ? `  Alt+Q optional ${optionalCount}` : "";
    const activeQuestion = this.getFocusedQuestion();
    const followup = this.getPrimaryFollowup();

    if (this.flashMessage) {
      text = this.flashMessage.text;
      tone = this.flashMessage.tone;
    } else if (this.fileSearchState) {
      if (this.fileSearchState.loading) {
        text = `@ file search · Indexing workspace files...  Esc close`;
        tone = "info";
      } else if (this.fileSearchState.error) {
        text = `@ file search · ${this.fileSearchState.error}  Esc close`;
        tone = "warning";
      } else {
        text = `@ file search · Up/Down move  Enter insert  Esc close`;
        tone = "info";
      }
    } else if (this.completionState && this.completionState.matches.length > 0) {
      const selected = this.completionState.matches[this.completionState.selectedIndex];
      text = `/ commands · Up/Down move  Enter insert  Esc close · ${selected.description}`;
      tone = "info";
    } else if (activeQuestion) {
      text = `Waiting for input${optionalHint}`;
      tone = "muted";
    } else if (this.optionalPickerOpen) {
      text = `Optional question picker · Enter open  Esc close`;
      tone = "info";
    } else if (followup) {
      text = `Follow-up ready · Enter send  Alt+Enter newline${optionalHint}`;
      tone = "info";
    } else if (this.isAgentExecuting()) {
      const activity = this.getActivityLabel();
      text = `${activity} · Alt+A Agent Selection  Ctrl+C Cancel${optionalHint}`;
      tone = "muted";
    } else {
      const activity = this.getActivityLabel();
      text = `${activity} · Alt+M model  Alt+T tools  Alt+V ${this.verbose ? "verbose" : "quiet"}  Alt+A Agent Selection · Enter send${optionalHint}`;
      tone = "muted";
    }

    return TONE_COLORS[tone](truncateVisible(text, columns));
  }

  private getActivityLabel(): string {
    const state = this.latestState ?? this.options.agent.getState(AgentEventState);
    if (state.currentlyExecutingInputItem?.executionState.currentActivity) {
      return `${brailleSpinner[this.spinnerIndex]} ${state.currentlyExecutingInputItem.executionState.currentActivity}`;
    }
    return "Ready";
  }

  private isAgentExecuting(): boolean {
    const state = this.latestState ?? this.options.agent.getState(AgentEventState);
    return state.currentlyExecutingInputItem !== null;
  }

  private getStatusLine(columns: number, workingDirectory: string): string {
    const activeQuestion = this.getFocusedQuestion();
    if (activeQuestion) {
      const cancelHint =
        activeQuestion.question.type === "treeSelect" || activeQuestion.question.type === "fileSelect"
          ? "Waiting for input · Esc or q to cancel"
          : "Waiting for input · Esc to cancel";
      return STATUS_BAR(truncateVisible(cancelHint, columns));
    }

    const segments = [
      getCurrentModelLabel(this.options.agent),
      formatPercentLeft(getRemainingContextPercent(this.options.agent)),
      `${formatCompactNumber(getActiveToolCount(this.options.agent))} tools`,
      `${formatCompactNumber(getTokenUsage(this.options.agent), " tk")}`,
      formatCurrency(getChatCost(this.options.agent)),
      shortenPath(workingDirectory),
    ];

    return STATUS_BAR(truncateVisible(segments.join(" · "), columns));
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
    activeStream: ActiveVisibleStream | null;
  } {
    const visibleEntries = this.getVisibleTranscript();
    const activeEntry = this.activeTranscriptStream ? this.activeTranscriptStream.entry : null;

    let text = "";
    for (const entry of visibleEntries) {
      text += renderEntryText(entry, columns, activeEntry?.id === entry.id);
    }

    const activeStream =
      activeEntry && this.activeTranscriptStream
        ? this.createActiveVisibleStream(this.activeTranscriptStream.type, `${TEXT_INDENT}${getRawStreamText(activeEntry.body)}`, activeEntry.tone, columns)
        : null;

    return { text, activeStream };
  }

  private getVisibleTranscript(): TranscriptEntry[] {
    return this.transcript;
    /*if (this.verbose) return this.transcript;
    return this.transcript.filter(
      (entry) => entry.kind !== "reasoning" && entry.kind !== "artifact",
    );*/
  }

  private getVisibleTranscriptViewportLineCount(maxRows: number, columns: number): number {
    if (maxRows <= 0) return 0;

    const visibleEntries = this.getVisibleTranscript();
    const activeEntryId = this.activeTranscriptStream ? this.activeTranscriptStream.entry.id : null;

    let totalLines = 0;
    for (const entry of visibleEntries) {
      const isActive = activeEntryId === entry.id;
      const rendered = renderEntryText(entry, columns, isActive);
      totalLines += splitLines(rendered).length;
      // Complete entries end with \n\n; the trailing "" from splitLines is the
      // cursor position after writing (not a visible row), so subtract it.
      if (!isActive) totalLines -= 1;
    }

    return Math.min(maxRows, totalLines);
  }

  private createActiveVisibleStream(type: "output.chat" | "output.reasoning", rawBuffer: string, tone: TranscriptTone, columns: number): ActiveVisibleStream {
    const displayedBuffer = renderBufferedStream(rawBuffer, tone, columns);
    return {
      type,
      tone,
      rawBuffer,
      displayedBuffer,
      screenLineCount: countScreenRows(splitLines(displayedBuffer), columns),
    };
  }

  private getAvailableInteractions(): ParsedInteractionRequest[] {
    return this.latestState?.currentlyExecutingInputItem?.executionState.availableInteractions ?? [];
  }

  private getPrimaryFollowup(): FollowupInteraction | null {
    return this.getAvailableInteractions().find((interaction): interaction is FollowupInteraction => interaction.type === "followup") ?? null;
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
      return this.getOptionalQuestions().find(question => question.interactionId === this.activeOptionalQuestionId) ?? null;
    }

    return null;
  }

  private cleanupInteractionState(): void {
    const interactions = this.getAvailableInteractions();
    const interactionIds = new Set(interactions.map(interaction => interaction.interactionId));

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

    session = createInlineQuestionSession(
      question.question,
      {
        onSubmit: result => this.sendInteractionResponse(question.interactionId, result),
        onCancel: () => this.sendInteractionResponse(question.interactionId, null),
        onRender: () => this.render(),
        listFileSelectEntries: path => this.listQuestionDirectoryEntries(path),
      },
      question.message,
    );

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

  private listQuestionDirectoryEntries(path: string): Promise<string[]> {
    const fileSystem = this.options.agent.requireServiceByType(FileSystemService);
    return Array.fromAsync(fileSystem.getDirectoryTree(path, { recursive: false, ignoreFilter: () => false }, this.options.agent));
  }
}
