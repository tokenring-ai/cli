import Agent from "@tokenring-ai/agent/Agent";
import {type AgentEventEnvelope} from "@tokenring-ai/agent/AgentEvents";
import {AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import {CommandHistoryState} from "@tokenring-ai/agent/state/commandHistoryState";
import {ChatModelRegistry} from "@tokenring-ai/ai-client/ModelRegistry";
import {parseModelAndSettings} from "@tokenring-ai/ai-client/util/modelSettings";
import {ChatService} from "@tokenring-ai/chat";
import chalk from "chalk";
import process from "node:process";
import readline from "node:readline";
import type {z} from "zod";
import {CLIConfigSchema} from "../schema.ts";
import {theme} from "../theme.ts";
import applyMarkdownStyles from "../utility/applyMarkdownStyles.ts";
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
  cache?: {
    width: number;
    verbose: boolean;
    rendered: string[];
  };
};

type TranscriptEntryKind =
  | "banner"
  | "help"
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

type FlashMessage = {
  text: string;
  tone: Exclude<TranscriptTone, "chat" | "reasoning" | "input" | "success" | "muted"> | "success";
  expiresAt: number;
};

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
const BORDER_COLOR = chalk.hex(theme.chatDivider);
const TITLE_COLOR = chalk.hex(theme.boxTitle).bold;
const PLACEHOLDER_COLOR = chalk.hex(theme.chatDivider);
const PROMPT_ARROW_COLOR = chalk.hex(theme.askMessage).bold;
const TEXT_INDENT = "   ";
const HEADER_PREFIX = " · ";
const PROMPT_PREFIX = ` ${PROMPT_ARROW_COLOR("→")} `;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function trimBoundaryNewlines(text: string): string {
  return text.replace(/^\n+|\n+$/g, "");
}

function repeat(char: string, count: number): string {
  return count > 0 ? char.repeat(count) : "";
}

function visibleLength(text: string): number {
  return Array.from(text).length;
}

function sliceVisible(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join("");
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

    if (current.length > 0 || line.length === 0) {
      wrapped.push(current);
    }
  }

  return wrapped.length > 0 ? wrapped : [""];
}

function padOrTrim(text: string, width: number): string {
  const len = visibleLength(text);
  if (len === width) return text;
  if (len > width) return sliceVisible(text, 0, width);
  return text + repeat(" ", width - len);
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

function getMouseSequencePayloads(text: string): string[] {
  return Array.from(text.matchAll(/\x1b\[<(\d+;\d+;\d+[mM])/g), (match) => match[1]);
}

export interface RawChatUIOptions {
  agent: Agent;
  config: z.output<typeof CLIConfigSchema>;
  commands: CommandDefinition[];
  onSubmit: (message: string) => void;
  onExit: () => void;
  onAbortCurrentActivity: () => boolean;
}

export default class RawChatUI {
  private readonly editor = new InputEditor();
  private readonly transcript: TranscriptEntry[] = [];
  private readonly options: RawChatUIOptions;

  private entryId = 0;
  private activeStream: {type: "output.chat" | "output.reasoning"; entry: TranscriptEntry} | null = null;
  private transcriptScrollOffset = 0;
  private completionState: CompletionState | null = null;
  private flashMessage: FlashMessage | null = null;
  private historyIndex: number | null = null;
  private historyDraft = "";
  private verbose = false;
  private spinnerIndex = 0;
  private spinnerTimer: NodeJS.Timeout | null = null;
  private resizeTimer: NodeJS.Timeout | null = null;
  private pendingMousePayloads: string[] = [];
  private mouseSuppressionExpiresAt = 0;
  private started = false;
  private suspended = false;
  private rawModeBeforeStart = false;
  private forceFullRefresh = true;

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

    this.addEntry({
      kind: "banner",
      title: null,
      body: options.config.chatBanner,
      tone: "info",
      markdown: false,
    });
    this.addEntry({
      kind: "help",
      title: "Keys",
      body:
        "Enter sends, Alt+Enter adds a newline, Tab completes commands.\n" +
        "Alt+M opens model select, Alt+T opens tools select, Alt+V toggles verbose mode.\n" +
        "Up/Down edits or browses history, PgUp/PgDn scrolls chat, Esc cancels the current run.",
      tone: "muted",
      markdown: false,
    });
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

    this.render();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }

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
    this.forceFullRefresh = true;
    this.attachTerminal();
    this.render();
  }

  renderEvent(event: AgentEventEnvelope): void {
    this.mutateTranscript(() => {
      switch (event.type) {
        case "agent.created":
          this.clearActiveStream();
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
          this.clearActiveStream();
          break;

        case "output.chat":
          this.appendStream("output.chat", "Assistant", event.message, "chat");
          break;

        case "output.reasoning":
          this.appendStream("output.reasoning", "Reasoning", event.message, "reasoning");
          break;

        case "output.info":
          this.clearActiveStream();
          this.addEntry({
            kind: "info",
            title: "Info",
            body: event.message,
            tone: "info",
            markdown: false,
          });
          break;

        case "output.warning":
          this.clearActiveStream();
          this.addEntry({
            kind: "warning",
            title: "Warning",
            body: event.message,
            tone: "warning",
            markdown: false,
          });
          break;

        case "output.error":
          this.clearActiveStream();
          this.addEntry({
            kind: "error",
            title: "Error",
            body: event.message,
            tone: "error",
            markdown: false,
          });
          break;

        case "output.artifact":
          this.clearActiveStream();
          this.addEntry({
            kind: "artifact",
            title: `Artifact: ${event.name}`,
            body:
              event.encoding === "text"
                ? event.body
                : `Generated ${event.mimeType} artifact`,
            tone: "info",
            markdown: event.encoding === "text",
          });
          break;

        case "agent.response":
          this.clearActiveStream();
          this.addEntry({
            kind: "response",
            title: event.status === "success" ? "Response" : "Error",
            body: event.message,
            tone: event.status === "success" ? "success" : "error",
            markdown: event.status === "success",
          });
          break;

        case "input.received":
          this.clearActiveStream();
          this.addEntry({
            kind: "input",
            title: "You",
            body: event.input.message,
            tone: "input",
            markdown: false,
          });
          break;

        case "input.interaction":
          this.clearActiveStream();
          break;

        default: {
          const exhaustive: never = event;
          void exhaustive;
        }
      }
    });
  }

  syncState(_state: AgentEventState): void {
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
    this.forceFullRefresh = true;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.prependListener("data", this.dataHandler);
    process.stdin.on("keypress", this.keypressHandler);
    process.stdout.on("resize", this.resizeHandler);
    process.on("SIGWINCH", this.resizeHandler);

    process.stdout.write("\x1b[?1049h\x1b[?1000h\x1b[?1006h\x1b[?25l\x1b[2J\x1b[H");
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
      process.stdout.write("\x1b[?1006l\x1b[?1000l\x1b[?25h\x1b[?1049l");
    }
  }

  private handleResize(): void {
    this.forceFullRefresh = true;
    this.render();

    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = setTimeout(() => {
      this.forceFullRefresh = true;
      this.render();
    }, 16);
    this.resizeTimer.unref();
  }

  private handleTerminalData(data: Buffer | string): void {
    const text = typeof data === "string" ? data : data.toString("utf8");
    const mousePayloads = getMouseSequencePayloads(text);

    let handledMouseScroll = false;
    for (const payload of mousePayloads) {
      this.pendingMousePayloads.push(payload);
      this.mouseSuppressionExpiresAt = Date.now() + 80;

      const code = Number(payload.split(";", 1)[0]);
      if (code === 64) {
        this.scrollTranscript(3);
        handledMouseScroll = true;
      } else if (code === 65) {
        this.scrollTranscript(-3);
        handledMouseScroll = true;
      }
    }

    if (handledMouseScroll) {
      this.completionState = null;
    }
  }

  private handleKeypress(input: string, key: readline.Key): void {
    if (this.shouldSuppressMouseKeypress(input, key)) {
      return;
    }

    if (key.sequence?.startsWith("\x1b[<")) {
      return;
    }

    if (key.ctrl && key.name === "c") {
      this.options.onExit();
      return;
    }

    if (key.name === "escape") {
      if (this.completionState) {
        this.completionState = null;
        this.render();
        return;
      }

      if (this.options.onAbortCurrentActivity()) {
        this.flash("Cancelled the current activity.", "warning");
      } else {
        this.flash("No active work to cancel.", "info");
      }
      return;
    }

    if (key.name === "pageup") {
      this.scrollTranscript(this.getPageScrollDelta());
      return;
    }
    if (key.name === "pagedown") {
      this.scrollTranscript(-this.getPageScrollDelta());
      return;
    }
    if (key.name === "home" && key.ctrl) {
      this.scrollToTop();
      return;
    }
    if (key.name === "end" && key.ctrl) {
      this.scrollToBottom();
      return;
    }

    if (key.ctrl && key.name === "l") {
      this.render();
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

    if (key.name === "tab") {
      if (this.handleTabCompletion()) {
        return;
      }

      if (!this.isCommandInput()) {
        this.editor.insert("  ");
        this.afterEdit();
      }
      return;
    }

    if (key.meta && key.name === "return") {
      this.editor.insertNewline();
      this.afterEdit();
      return;
    }

    if (key.ctrl && key.name === "o") {
      this.editor.insertNewline();
      this.afterEdit();
      return;
    }

    if (key.ctrl && key.name === "a") {
      this.editor.moveHome();
      this.afterCursorMove();
      return;
    }
    if (key.ctrl && key.name === "e") {
      this.editor.moveEnd();
      this.afterCursorMove();
      return;
    }
    if (key.ctrl && key.name === "u") {
      this.editor.deleteToStartOfLine();
      this.afterEdit();
      return;
    }
    if (key.ctrl && key.name === "k") {
      this.editor.deleteToEndOfLine();
      this.afterEdit();
      return;
    }
    if (key.ctrl && key.name === "w") {
      this.editor.deleteWordBackward();
      this.afterEdit();
      return;
    }
    if (key.ctrl && key.name === "d") {
      this.editor.deleteForward();
      this.afterEdit();
      return;
    }
    if (key.ctrl && key.name === "p") {
      this.browseHistory(-1);
      return;
    }
    if (key.ctrl && key.name === "n") {
      this.browseHistory(1);
      return;
    }

    if (key.meta && key.name === "b") {
      this.editor.moveWordLeft();
      this.afterCursorMove();
      return;
    }
    if (key.meta && key.name === "f") {
      this.editor.moveWordRight();
      this.afterCursorMove();
      return;
    }

    if (key.name === "left") {
      this.editor.moveLeft();
      this.afterCursorMove();
      return;
    }
    if (key.name === "right") {
      this.editor.moveRight();
      this.afterCursorMove();
      return;
    }
    if (key.name === "up") {
      const {lineIndex} = this.editor.getCursorLocation();
      if (lineIndex > 0) {
        this.editor.moveUp();
        this.afterCursorMove();
      } else {
        this.browseHistory(-1);
      }
      return;
    }
    if (key.name === "down") {
      const {lineIndex} = this.editor.getCursorLocation();
      if (lineIndex < this.editor.getLineCount() - 1) {
        this.editor.moveDown();
        this.afterCursorMove();
      } else {
        this.browseHistory(1);
      }
      return;
    }
    if (key.name === "home") {
      this.editor.moveHome();
      this.afterCursorMove();
      return;
    }
    if (key.name === "end") {
      this.editor.moveEnd();
      this.afterCursorMove();
      return;
    }

    if (key.name === "backspace") {
      this.editor.backspace();
      this.afterEdit();
      return;
    }
    if (key.name === "delete") {
      this.editor.deleteForward();
      this.afterEdit();
      return;
    }

    if (key.name === "return") {
      this.submitCurrentInput();
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      this.editor.insert(input.replace(/\r\n?/g, "\n"));
      this.afterEdit();
    }
  }

  private shouldSuppressMouseKeypress(input: string, key: readline.Key): boolean {
    if (Date.now() > this.mouseSuppressionExpiresAt) {
      this.pendingMousePayloads = [];
    }

    const sequence = key.sequence ?? "";
    if (sequence.startsWith("\x1b[<")) {
      return true;
    }

    const payload = this.pendingMousePayloads[0];
    if (!payload) return false;

    const candidate = input || sequence;
    if (!candidate) return false;

    if (candidate === "[" || candidate === "<" || key.name === "escape") {
      return true;
    }

    if (payload.startsWith(candidate)) {
      const remainder = payload.slice(candidate.length);
      if (remainder.length === 0) {
        this.pendingMousePayloads.shift();
      } else {
        this.pendingMousePayloads[0] = remainder;
      }
      return true;
    }

    if (/^[0-9;Mm]+$/.test(candidate)) {
      return true;
    }

    this.pendingMousePayloads = [];
    return false;
  }

  private handleTabCompletion(): boolean {
    const context = getCommandCompletionContext(
      this.editor.getText(),
      this.editor.getCursor(),
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
      this.applyCompletion(
        context.replacementStart,
        context.replacementEnd,
        context.matches[nextIndex].name,
      );
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
    this.render();
    return true;
  }

  private sameCompletionMatches(a: CommandDefinition[], b: CommandDefinition[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((command, index) => command.name === b[index]?.name);
  }

  private applyCompletion(start: number, end: number, replacement: string): void {
    const text = this.editor.getText();
    const prefix = text.slice(0, start);
    const suffix = text.slice(end);

    this.editor.setText(`${prefix}/${replacement}${suffix}`, prefix.length + replacement.length + 1);
    this.historyIndex = null;
    this.historyDraft = "";
    this.render();
  }

  private browseHistory(direction: -1 | 1): void {
    const history = this.options.agent.getState(CommandHistoryState).commands;
    if (history.length === 0) {
      this.flash("History is empty.", "info");
      return;
    }

    if (direction < 0) {
      if (this.historyIndex === null) {
        this.historyDraft = this.editor.getText();
        this.historyIndex = history.length - 1;
      } else {
        this.historyIndex = clamp(this.historyIndex - 1, 0, history.length - 1);
      }
    } else if (this.historyIndex === null) {
      return;
    } else if (this.historyIndex >= history.length - 1) {
      this.historyIndex = null;
      this.editor.setText(this.historyDraft);
      this.completionState = null;
      this.render();
      return;
    } else {
      this.historyIndex += 1;
    }

    this.editor.setText(history[this.historyIndex]);
    this.completionState = null;
    this.render();
  }

  private submitCurrentInput(): void {
    const message = this.editor.getText().trimEnd();
    if (message.trim().length === 0) {
      this.flash("Type a message or command first.", "info");
      return;
    }

    this.options.onSubmit(message);
    this.editor.clear();
    this.historyIndex = null;
    this.historyDraft = "";
    this.completionState = null;
    this.transcriptScrollOffset = 0;
    this.render();
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

  private afterEdit(): void {
    this.historyIndex = null;
    this.historyDraft = "";
    this.completionState = null;
    this.render();
  }

  private afterCursorMove(): void {
    this.render();
  }

  private scrollTranscript(delta: number): void {
    const {columns, rows} = this.getTerminalSize();
    const inputPanel = this.renderInputPanel(columns, rows);
    const transcriptHeight = Math.max(1, rows - inputPanel.rows.length - 4);
    const maxOffset = Math.max(0, this.getTotalTranscriptLineCount(columns) - transcriptHeight);

    this.transcriptScrollOffset = clamp(this.transcriptScrollOffset + delta, 0, maxOffset);
    this.render();
  }

  private getPageScrollDelta(): number {
    const {columns, rows} = this.getTerminalSize();
    const inputPanel = this.renderInputPanel(columns, rows);
    const transcriptHeight = Math.max(1, rows - inputPanel.rows.length - 4);
    return Math.max(1, transcriptHeight - 2);
  }

  private scrollToTop(): void {
    const {columns, rows} = this.getTerminalSize();
    const inputPanel = this.renderInputPanel(columns, rows);
    const transcriptHeight = Math.max(1, rows - inputPanel.rows.length - 4);
    this.transcriptScrollOffset = Math.max(0, this.getTotalTranscriptLineCount(columns) - transcriptHeight);
    this.render();
  }

  private scrollToBottom(): void {
    this.transcriptScrollOffset = 0;
    this.render();
  }

  private isCommandInput(): boolean {
    return this.editor.getText().startsWith("/");
  }

  private mutateTranscript(mutator: () => void): void {
    const width = this.getTerminalSize().columns;
    const before = this.transcriptScrollOffset > 0 ? this.getTotalTranscriptLineCount(width) : 0;
    mutator();
    const after = this.transcriptScrollOffset > 0 ? this.getTotalTranscriptLineCount(width) : 0;
    if (this.transcriptScrollOffset > 0 && after > before) {
      this.transcriptScrollOffset += after - before;
    }
    this.render();
  }

  private addEntry(entry: Omit<TranscriptEntry, "id">): TranscriptEntry {
    const fullEntry: TranscriptEntry = {
      ...entry,
      id: ++this.entryId,
    };
    this.transcript.push(fullEntry);
    return fullEntry;
  }

  private clearActiveStream(): void {
    this.activeStream = null;
  }

  private appendStream(
    type: "output.chat" | "output.reasoning",
    title: string,
    message: string,
    tone: TranscriptTone,
  ): void {
    if (this.activeStream?.type === type) {
      this.activeStream.entry.body += message;
      this.activeStream.entry.cache = undefined;
      return;
    }

    const entry = this.addEntry({
      kind: type === "output.reasoning" ? "reasoning" : "chat",
      title,
      body: message,
      tone,
      markdown: true,
    });
    this.activeStream = {type, entry};
  }

  private toggleVerboseMode(): void {
    const width = this.getTerminalSize().columns;
    const before = this.transcriptScrollOffset > 0 ? this.getTotalTranscriptLineCount(width) : 0;

    this.verbose = !this.verbose;
    this.invalidateTranscriptCache();

    const after = this.transcriptScrollOffset > 0 ? this.getTotalTranscriptLineCount(width) : 0;
    if (this.transcriptScrollOffset > 0 && after > before) {
      this.transcriptScrollOffset += after - before;
    }

    this.flash(`Verbose mode ${this.verbose ? "on" : "off"}.`, "info");
  }

  private invalidateTranscriptCache(): void {
    for (const entry of this.transcript) {
      entry.cache = undefined;
    }
  }

  private getVisibleTranscript(): TranscriptEntry[] {
    if (this.verbose) return this.transcript;
    return this.transcript.filter((entry) => entry.kind !== "reasoning");
  }

  private getDisplayBody(entry: TranscriptEntry): string | null {
    if (! this.verbose && entry.kind === "artifact") return null;
    return trimBoundaryNewlines(entry.body);
  }

  private getRenderedEntry(entry: TranscriptEntry, width: number): string[] {
    if (entry.cache?.width === width && entry.cache.verbose === this.verbose) {
      return entry.cache.rendered;
    }

    const lines: string[] = [];
    if (entry.title) {
      lines.push(TITLE_COLOR(`${HEADER_PREFIX}${entry.title}`));
    }

    const contentWidth = Math.max(1, width - visibleLength(TEXT_INDENT));
    const rawBody = this.getDisplayBody(entry);
    if (rawBody) {
      const sourceLines = (rawBody.length > 0 ? rawBody : "").split("\n");
      for (const sourceLine of sourceLines) {
        const wrappedBody = wrapPlainText(sourceLine, contentWidth);
        for (const line of wrappedBody) {
          const bodyText = line;
          const styledBody = entry.markdown
            ? TONE_COLORS[entry.tone](applyMarkdownStyles(bodyText))
            : TONE_COLORS[entry.tone](bodyText);
          lines.push(`${TEXT_INDENT}${styledBody}`);
        }
      }
    }

    lines.push(TEXT_INDENT);
    entry.cache = {width, verbose: this.verbose, rendered: lines};
    return lines;
  }

  private getTotalTranscriptLineCount(width: number): number {
    return this.getVisibleTranscript().reduce((total, entry) => total + this.getRenderedEntry(entry, width).length, 0);
  }

  private getViewportTranscript(width: number, height: number): string[] {
    const lines: string[] = [];
    let remainingOffset = this.transcriptScrollOffset;
    const visibleTranscript = this.getVisibleTranscript();

    for (let entryIndex = visibleTranscript.length - 1; entryIndex >= 0 && lines.length < height; entryIndex -= 1) {
      const entryLines = this.getRenderedEntry(visibleTranscript[entryIndex], width);
      for (let lineIndex = entryLines.length - 1; lineIndex >= 0 && lines.length < height; lineIndex -= 1) {
        if (remainingOffset > 0) {
          remainingOffset -= 1;
          continue;
        }
        lines.push(entryLines[lineIndex]);
      }
    }

    return lines.reverse();
  }

  private getHintLine(width: number): string {
    if (this.flashMessage && this.flashMessage.expiresAt <= Date.now()) {
      this.flashMessage = null;
    }

    let text: string;
    let tone: TranscriptTone = "muted";

    if (this.flashMessage) {
      text = this.flashMessage.text;
      tone = this.flashMessage.tone;
    } else if (this.completionState && this.completionState.matches.length > 0) {
      const completionState = this.completionState;
      const selected = completionState.matches[completionState.selectedIndex];
      const suggestions = completionState.matches
        .slice(0, 4)
        .map((command, index) => (index === completionState.selectedIndex ? `[/${command.name}]` : `/${command.name}`))
        .join("  ");
      text = `${suggestions}  ·  ${selected.description}`;
      tone = "info";
    } else if (this.transcriptScrollOffset > 0) {
      text = `Viewing earlier output · PgDn follows latest · Ctrl+End jumps to the bottom`;
      tone = "warning";
    } else {
      const activity = this.getActivityLabel();
      text = `${activity} · Alt+M model · Alt+T tools · Alt+V ${this.verbose ? "verbose on" : "verbose off"} · Enter send · Alt+Enter newline · Tab complete · PgUp/PgDn scroll · Esc cancel`;
      tone = "muted";
    }

    return TONE_COLORS[tone](padOrTrim(`${TEXT_INDENT}${text}`, width));
  }

  private getActivityLabel(): string {
    const state = this.options.agent.getState(AgentEventState);
    if (state.currentlyExecutingInputItem?.executionState.currentActivity) {
      const frames = ["-", "\\", "|", "/"];
      return `${frames[this.spinnerIndex]} ${state.currentlyExecutingInputItem.executionState.currentActivity}`;
    }
    return "Ready";
  }

  private getStatusLine(width: number): string {
    const segments = [
      this.getCurrentModelLabel(),
      formatPercentLeft(this.getRemainingContextPercent()),
      `${formatCompactNumber(this.getActiveToolCount())} tools`,
      `${formatCompactNumber(this.getTokenUsage(), " tk")}`,
      formatCurrency(this.getChatCost()),
      shortenPath(this.options.agent.app.config.app.workingDirectory),
    ];

    return STATUS_BAR(padOrTrim(`${TEXT_INDENT}${segments.join(" · ")}`, width));
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

  private renderInputPanel(columns: number, rows: number): {
    rows: string[];
    cursorRow: number;
    cursorColumn: number;
  } {
    const promptPrefixWidth = visibleLength(" → ");
    const continuationPrefixWidth = visibleLength(TEXT_INDENT);
    const innerWidth = Math.max(10, columns - promptPrefixWidth);
    const maxContentLines = clamp(Math.floor(rows * 0.25), 1, 8);

    const renderedInput = this.renderEditor(innerWidth, maxContentLines);
    const contentRows = renderedInput.visibleLines.map((line, index) => {
      const prefix = index === 0 ? PROMPT_PREFIX : TEXT_INDENT;
      const body = renderedInput.isEmpty && index === 0
        ? PLACEHOLDER_COLOR(padOrTrim("Write a message or /command", innerWidth))
        : padOrTrim(line, innerWidth);
      return `${prefix}${body}`;
    });

    return {
      rows: contentRows,
      cursorRow: renderedInput.cursorRow,
      cursorColumn: (renderedInput.cursorRow === 0 ? promptPrefixWidth : continuationPrefixWidth) + renderedInput.cursorColumn,
    };
  }

  private renderEditor(innerWidth: number, maxContentLines: number): {
    visibleLines: string[];
    cursorRow: number;
    cursorColumn: number;
    isEmpty: boolean;
  } {
    const text = this.editor.getText();
    const cursor = this.editor.getCursor();

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
      if (visibleLength(lines[row]) >= innerWidth) {
        row += 1;
        lines.push("");
      }
    }

    if (cursor === text.length) {
      cursorRow = row;
      cursorColumn = visibleLength(lines[row]);
    }

    const visibleCount = clamp(lines.length, 1, maxContentLines);
    const windowStart = clamp(cursorRow - visibleCount + 1, 0, Math.max(0, lines.length - visibleCount));
    const visibleLines = lines.slice(windowStart, windowStart + visibleCount);

    return {
      visibleLines,
      cursorRow: cursorRow - windowStart,
      cursorColumn,
      isEmpty: text.length === 0,
    };
  }

  private getTerminalSize(): {columns: number; rows: number} {
    return {
      columns: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
    };
  }

  render(): void {
    if (!this.started || this.suspended || !process.stdout.isTTY) return;

    const {columns, rows} = this.getTerminalSize();
    if (columns < 40 || rows < 10) {
      const message = padOrTrim("Terminal too small. Resize to at least 40x10.", columns);
      process.stdout.write(`\x1b[?25l\x1b[H${TONE_COLORS.warning(message)}\x1b[K\x1b[?25h`);
      return;
    }

    const inputPanel = this.renderInputPanel(columns, rows);
    const transcriptHeight = Math.max(1, rows - inputPanel.rows.length - 4);
    const totalTranscriptLines = this.getTotalTranscriptLineCount(columns);
    const maxOffset = Math.max(0, totalTranscriptLines - transcriptHeight);
    this.transcriptScrollOffset = clamp(this.transcriptScrollOffset, 0, maxOffset);
    const transcriptLines = this.getViewportTranscript(columns, transcriptHeight);
    const paddedTranscript = [...transcriptLines];
    while (paddedTranscript.length < transcriptHeight) {
      paddedTranscript.push("");
    }

    const frameRows = [
      ...paddedTranscript,
      this.getHintLine(columns),
      "",
      ...inputPanel.rows,
      "",
      this.getStatusLine(columns),
    ];

    let output = `\x1b[?25l${this.forceFullRefresh ? "\x1b[2J" : ""}\x1b[H`;
    frameRows.forEach((line, index) => {
      output += line + "\x1b[K";
      if (index < frameRows.length - 1) {
        output += "\n";
      }
    });

    const cursorRow = transcriptHeight + 2 + inputPanel.cursorRow;
    const cursorColumn = clamp(inputPanel.cursorColumn, 0, Math.max(0, columns - 1));
    output += `\x1b[${cursorRow + 1};${cursorColumn + 1}H\x1b[?25h`;

    this.forceFullRefresh = false;
    process.stdout.write(output);
  }
}
