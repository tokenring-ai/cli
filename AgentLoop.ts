import Agent from "@tokenring-ai/agent/Agent";
import {
  AgentEventEnvelope,
  InputHandledSchema,
  type ParsedAgentExecutionState,
  type ParsedQuestionRequest,
  QuestionResponseSchema,
} from "@tokenring-ai/agent/AgentEvents";
import {AgentEventCursor, AgentEventState,} from "@tokenring-ai/agent/state/agentEventState";
import {CommandHistoryState} from "@tokenring-ai/agent/state/commandHistoryState";
import {createAsciiTable} from "@tokenring-ai/utility/string/asciiTable";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import chalk from "chalk";
import process from "node:process";
import readline from "node:readline";
import {z} from "zod";
import {commandPrompt, PartialInputError} from "./commandPrompt.ts";
import {renderScreen as renderScreenInk} from "./ink/renderScreen.tsx";
import InkQuestionInputScreen from "./ink/screens/QuestionInputScreen.tsx";
import {renderScreen as renderScreenOpenTUI} from "./opentui/renderScreen.tsx";
import OpenTUIQuestionInputScreen from "./opentui/screens/QuestionInputScreen.tsx";
import type {CLIConfigSchema} from "./schema.ts";
import {SimpleSpinner} from "./SimpleSpinner.ts";
import {theme} from "./theme.ts";
import applyMarkdownStyles from "./utility/applyMarkdownStyles.ts";
import { setTimeout } from "node:timers/promises";

// ── Theme-derived colours ──────────────────────────────────────────────

const OUTPUT_COLORS = {
  "output.chat": chalk.hex(theme.chatOutputText),
  "output.reasoning": chalk.hex(theme.chatReasoningText),
  "output.info": chalk.hex(theme.chatSystemInfoMessage),
  "output.warning": chalk.hex(theme.chatSystemWarningMessage),
  "output.error": chalk.hex(theme.chatSystemErrorMessage),
  "input.received": chalk.hex(theme.chatInputReceived),
  "input.handled": chalk.hex(theme.chatInputHandledSuccess),
  "question.request": chalk.hex(theme.chatQuestionRequest),
  "question.response": chalk.hex(theme.chatQuestionResponse),
  "reset": chalk.hex(theme.chatReset),
  "abort": chalk.hex(theme.chatAbort),
} as const;

const PREVIOUS_INPUT_COLOR = chalk.hex(theme.chatPreviousInput);
const DIVIDER_COLOR = chalk.hex(theme.chatDivider);
const BANNER_COLOR = chalk.hex(theme.agentSelectionBanner);

type OutputColorKey = keyof typeof OUTPUT_COLORS;

// ── Helpers ────────────────────────────────────────────────────────────

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (val) => { signal.removeEventListener("abort", onAbort); resolve(val); },
      (err) => { signal.removeEventListener("abort", onAbort); reject(err); },
    );
  });
}

// ── Public contract ────────────────────────────────────────────────────

export interface AgentLoopOptions {
  availableCommands: string[];
  rl: readline.Interface;
  config: z.infer<typeof CLIConfigSchema>;
}

// ── Prompt mode ────────────────────────────────────────────────────────

type PromptMode = null
  | { kind: "input"; abort: AbortController; promise: Promise<void> }
  | { kind: "human"; abort: AbortController; promise: Promise<void>; requestId: string };

// ── Implementation ─────────────────────────────────────────────────────

export default class AgentLoop {
  private abort: AbortController | null = null;

  private eventCursor: AgentEventCursor = { position: 0 };

  private spinner: SimpleSpinner | null = null;
  private spinnerRunning = false;
  private lastWriteHadNewline = true;
  private currentOutputType = "chat";
  private currentLine = "";

  private prompt: PromptMode = null;

  constructor(
    readonly agent: Agent,
    readonly options: AgentLoopOptions,
  ) {}

  // ── Entry point ────────────────────────────────────────────────────

  async run(externalSignal: AbortSignal): Promise<void> {
    this.abort = new AbortController();
    const signal = this.abort.signal;

    const onExternalAbort = () => this.abort?.abort();
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });

    this.redraw(this.agent.getState(AgentEventState));

    const onResize = () => this.redraw(this.agent.getState(AgentEventState));
    process.stdout.on("resize", onResize);

    try {
      const events$ = this.agent.subscribeStateAsync(AgentEventState, signal);
      await raceAbort(this.consumeEvents(events$, signal), signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // Normal shutdown
      } else if (e instanceof Error && e.name === "AbortError") {
        // Same, different runtime
      } else {
        process.stderr.write(formatLogMessages(["Error while running agent loop", e as Error]));
      }
    } finally {
      this.cancelPrompt();
      this.stopSpinner();
      this.abort.abort();
      this.abort = null;
      externalSignal.removeEventListener("abort", onExternalAbort);
      process.stdout.removeListener("resize", onResize);
    }

    this.ensureNewline();
  }

  private shutdown(): void {
    this.abort?.abort();
  }

  // ── Single event loop ──────────────────────────────────────────────

  private async consumeEvents(
    subscription: AsyncIterable<AgentEventState>,
    signal: AbortSignal,
  ): Promise<void> {
    let lastExecutionState: ParsedAgentExecutionState | null = null;
    for await (const state of subscription) {
      if (signal.aborted) return;

      for (const event of state.yieldEventsByCursor(this.eventCursor)) {
        //this.clearPromptLine();
        this.renderEvent(event);
      }

      if (state.latestExecutionState !== lastExecutionState) {
        this.handleExecutionState(state.latestExecutionState);
        lastExecutionState = state.latestExecutionState;
      }
    }
  }

  // ── Rendering: full redraw ─────────────────────────────────────────

  private redraw(state: AgentEventState): void {
    this.write("\x1b[2J\x1b[0f\x1b[3J");
    this.write(BANNER_COLOR(this.options.config.chatBanner) + "\n");
    this.write(
      OUTPUT_COLORS["output.chat"](
        "Type your questions and hit Enter. Commands start with /\n" +
        "Use ↑/↓ for command history, Esc to cancel your current activity\n" +
        "Ctrl-C to return to the agent selection screen\n\n",
      ),
    );

    this.lastWriteHadNewline = true;
    this.currentOutputType = "chat";
    this.currentLine = "";

    this.eventCursor = state.getEventCursorFromCurrentPosition();

    for (const event of state.events) {
      this.renderEvent(event);
    }


    this.handleExecutionState(state.latestExecutionState);
  }

  // ── Rendering: single event ────────────────────────────────────────

  private renderEvent(event: AgentEventEnvelope): void {
    switch (event.type) {
      case "agent.created":
        this.renderSystemLine(event.message);
        break;

      case "agent.stopped":
        this.shutdown();
        break;

      case "agent.execution":
        // Do nothing, handled elsewhere
        break;

      case "reset":
        this.renderSystemLine(`Agent reset: ${event.what.join(", ")}`);
        break;

      case "abort":
        this.renderSystemLine(event.message);
        break;

      case "output.artifact":
        this.renderArtifact(event);
        break;

      case "output.warning":
      case "output.error":
      case "output.info":
        this.renderStreamOutput({
          ...event,
          message: event.message.endsWith("\n") ? event.message : event.message + "\n",
        });
        break;

      case "output.chat":
      case "output.reasoning":
        this.renderStreamOutput(event);
        break;

      case "input.handled":
        this.renderInputHandled(event);
        break;

      case "input.received":
        this.renderInputReceived(event);
        break;

      case "question.request":
        this.renderQuestionRequest(event);
        break;

      case "question.response":
        this.renderQuestionResponse(event);
        break;

      default: {
        // noinspection UnnecessaryLocalVariableJS
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  }

  // ── Execution state handling (replaces consumeExecution) ───────────

  private handleExecutionState(
    event: ParsedAgentExecutionState,
  ): void {
    // Spinner
    this.syncSpinner(event);

    this.synchronizePrompt(event);
  }

  // ── Spinner management ─────────────────────────────────────────────

  private syncSpinner(
    exec: ParsedAgentExecutionState,
  ): void {
    if (!exec.busyWith && this.spinner) {
      this.stopSpinner();
      this.spinner = null;
      return;
    }

    if (exec.busyWith && !this.spinner) {
      this.spinner = new SimpleSpinner(exec.busyWith, theme.chatSpinner);
      this.spinnerRunning = true;
      this.spinner.start();
    }
  }

  private stopSpinner(): void {
    if (this.spinnerRunning) {
      this.spinner?.stop();
      this.spinnerRunning = false;
    }
  }

  // ── Prompt lifecycle (unified) ─────────────────────────────────────

  private cancelPrompt(): void {
    this.prompt?.abort.abort();
    this.prompt = null;
  }

  private synchronizePrompt(
    exec: ParsedAgentExecutionState,
  ): void {
    const idle = exec.running && exec.inputQueue.length === 0;

    if (this.prompt) {
      if (this.prompt.kind === "human") {
        // Cancel human prompt if the question it was answering is no longer pending
        if (exec.waitingOn.length === 0 || exec.waitingOn[0].requestId !== this.prompt.requestId) {
          this.cancelPrompt()
        }
      } else if (this.prompt.kind === "input" && !idle) {
        // Cancel input prompt if the agent is no longer idle (another user sent input)
        this.cancelPrompt()
      }
    }

    if (this.prompt) return;

    if (exec.waitingOn.length > 0) {
      const request = exec.waitingOn[0];
      const ac = new AbortController();

      const promise = this.handleHumanRequest(request, ac.signal)
        .catch((err) => {
          this.agent.errorMessage("Error while handling human request in CLI: ", err.message);
          return null;
        })
        .then((response) => {
          this.agent.sendQuestionResponse(request.requestId, {result: response});
          //this.prompt = null;
          this.redraw(this.agent.getState(AgentEventState));
          this.resetSigintHandlers();
        })

      this.prompt = {kind: "human", abort: ac, promise, requestId: request.requestId};
    } else if (idle) {
      this.ensureNewline();

      const ac = new AbortController();
      const promise = this.inputLoop(ac.signal);
      this.prompt = {kind: "input", abort: ac, promise};
    }
  }

  private async inputLoop(signal: AbortSignal): Promise<void> {
    try {
      const message = await this.gatherInput(signal);
      this.prompt = null;
      this.resetSigintHandlers();
      this.agent.handleInput({ message });
    } catch (err) {
      if (err instanceof PartialInputError && err.buffer.trim() !== "") {
        // Retry with a fresh signal if buffer is non-empty
        const ac = new AbortController();
        const promise = this.inputLoop(ac.signal);
        this.prompt = { kind: "input", abort: ac, promise };
        return;
      }
      this.prompt = null;
    }
  }

  // ── Rendering helpers ──────────────────────────────────────────────

  private renderSystemLine(message: string): void {
    this.stopSpinner();
    this.ensureNewline();
    this.write(OUTPUT_COLORS["output.info"](`${message}\n`));
    this.currentLine = "";
  }

  private renderArtifact(event: AgentEventEnvelope & { type: "output.artifact" }): void {
    this.stopSpinner();
    this.ensureNewline();
    this.write(OUTPUT_COLORS["output.info"](`Agent generated artifact: ${event.name}\n`));
    if (event.encoding === "text") {
      this.write(event.body.trim() + "\n");
    }
    this.currentLine = "";
  }

  private renderStreamOutput(event: AgentEventEnvelope & { message: string }): void {
    this.stopSpinner();

    let message = event.message;

    if (event.type !== this.currentOutputType) {
      this.ensureNewline();
      if (event.type === "output.chat") this.printDivider("Chat");
      else if (event.type === "output.reasoning") this.printDivider("Reasoning");
      this.currentOutputType = event.type;

      message = message.trimStart();
    }

    const color = OUTPUT_COLORS[event.type as OutputColorKey];

    for (const char of message) {
      if (char === "\n") {
        this.write(color(applyMarkdownStyles(this.currentLine) + "\n"));
        this.currentLine = "";
      } else {
        this.currentLine += char;
      }
    }

    this.lastWriteHadNewline = message.endsWith("\n");
  }

  private renderInputHandled(event: z.output<typeof InputHandledSchema>): void {
    this.stopSpinner();
    this.ensureNewline();
    if (event.status === "cancelled" || event.status === "error") {
      this.write(OUTPUT_COLORS["output.error"](event.message.trimEnd() + "\n"));
    } else if (event.status === "success") {
      this.write(OUTPUT_COLORS["input.handled"](event.message.trimEnd() + "\n"));
    }
    this.lastWriteHadNewline = true;
    this.currentLine = "";
  }

  private renderInputReceived(event: AgentEventEnvelope & { type: "input.received" }): void {
    this.ensureNewline();
    this.write(
      PREVIOUS_INPUT_COLOR(
        createAsciiTable([[`user >`, event.message.trimEnd() + "\n"]], {
          columnWidths: [7, process.stdout.columns ? process.stdout.columns - 7 : 65],
          padding: 0,
          grid: false,
        }),
      ),
    );
    this.lastWriteHadNewline = true;
    this.currentLine = "";
  }

  private renderQuestionRequest(event: AgentEventEnvelope & { type: "question.request" }): void {
    this.stopSpinner();
    this.ensureNewline();
    this.write(OUTPUT_COLORS["question.request"](`\n${event.message}\n\n`));
    this.currentLine = "";
  }

  private renderQuestionResponse(event: AgentEventEnvelope & { type: "question.response" }): void {
    this.stopSpinner();
    this.ensureNewline();
    const responseStr = JSON.stringify(event.result, null, 2);
    this.write(OUTPUT_COLORS["question.response"](`Response: ${responseStr}\n`));
    this.lastWriteHadNewline = true;
    this.currentLine = "";
  }

  // ── Terminal I/O primitives ────────────────────────────────────────

  private write(data: string): void {
    process.stdout.write(data);
  }

  private clearPromptLine(): void {
    if (this.prompt && process.stdout.isTTY) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
    }
  }

  private ensureNewline(): void {
    if (!this.lastWriteHadNewline) {
      this.write("\n");
      this.lastWriteHadNewline = true;
    }
  }

  private printDivider(label: string): void {
    const lineChar = "─";
    const width = process.stdout.columns ? Math.floor(process.stdout.columns * 0.8) : 60;
    const tail = Math.max(0, width - 6 - label.length);
    this.write(
      DIVIDER_COLOR(lineChar.repeat(4) + " " + label + " " + lineChar.repeat(tail)) + "\n",
    );
    this.lastWriteHadNewline = true;
  }

  // ── Input collection ───────────────────────────────────────────────

  private async gatherInput(signal: AbortSignal): Promise<string> {
    const history = this.agent.getState(CommandHistoryState).commands;
    this.resetSigintHandlers();

    return commandPrompt({
      rl: this.options.rl!,
      prefix: chalk.yellowBright("user"),
      message: chalk.yellowBright(">"),
      autoCompletion: this.options.availableCommands,
      history,
      signal,
    });
  }

  private async handleHumanRequest(
    request: ParsedQuestionRequest,
    signal: AbortSignal,
  ): Promise<z.output<typeof QuestionResponseSchema>> {
    const renderScreen =
      this.options.config.uiFramework === "ink" ? renderScreenInk : renderScreenOpenTUI;
    const Screen =
      this.options.config.uiFramework === "ink"
        ? InkQuestionInputScreen
        : OpenTUIQuestionInputScreen;

    await setTimeout(1000);

    return await renderScreen(
      Screen,
      {request, agent: this.agent, config: this.options.config},
      signal,
    );
  }

  // ── Signal / readline helpers ──────────────────────────────────────

  private resetSigintHandlers(): void {
    this.options.rl?.close();
    process.removeAllListeners("SIGINT");
    process.stdin.removeAllListeners("keypress");
    process.stdin.setRawMode(true);

    this.options.rl = readline.createInterface(process.stdin, process.stdout);

    this.options.rl.on("SIGINT", () => {
      if (this.prompt?.kind === "human") {
        this.prompt.abort.abort();
      } else {
        this.shutdown();
      }
    });
  }
}