import Agent from "@tokenring-ai/agent/Agent";
import {
  AgentEventEnvelope,
  type ParsedQuestionRequest,
  QuestionResponseSchema,
} from "@tokenring-ai/agent/AgentEvents";
import {
  AgentEventCursor,
  AgentEventState,
} from "@tokenring-ai/agent/state/agentEventState";
import { AgentExecutionState } from "@tokenring-ai/agent/state/agentExecutionState";
import { CommandHistoryState } from "@tokenring-ai/agent/state/commandHistoryState";
import { createAsciiTable } from "@tokenring-ai/utility/string/asciiTable";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import chalk from "chalk";
import process from "node:process";
import readline from "node:readline";
import { z } from "zod";
import { commandPrompt, PartialInputError } from "./commandPrompt.ts";
import { renderScreen as renderScreenInk } from "./ink/renderScreen.tsx";
import InkQuestionInputScreen from "./ink/screens/QuestionInputScreen.tsx";
import { renderScreen as renderScreenOpenTUI } from "./opentui/renderScreen.tsx";
import OpenTUIQuestionInputScreen from "./opentui/screens/QuestionInputScreen.tsx";
import type { CLIConfigSchema } from "./schema.ts";
import { SimpleSpinner } from "./SimpleSpinner.ts";
import { theme } from "./theme.ts";
import applyMarkdownStyles from "./utility/applyMarkdownStyles.ts";

// ── Theme-derived colours ──────────────────────────────────────────────

const OUTPUT_COLORS = {
  "output.chat": chalk.hex(theme.chatOutputText),
  "output.reasoning": chalk.hex(theme.chatReasoningText),
  "output.info": chalk.hex(theme.chatSystemInfoMessage),
  "output.warning": chalk.hex(theme.chatSystemWarningMessage),
  "output.error": chalk.hex(theme.chatSystemErrorMessage),
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

// ── Implementation ─────────────────────────────────────────────────────

export default class AgentLoop {
  private abort: AbortController | null = null;
  private inputAbort: AbortController | null = null;
  private humanAbort: AbortController | null = null;

  private readonly eventCursor: AgentEventCursor = { position: 0 };

  private spinner: SimpleSpinner | null = null;
  private spinnerRunning = false;
  private lastWriteHadNewline = true;
  private currentOutputType = "chat";
  private currentLine = "";

  private inputPromise: Promise<void> | null = null;
  private humanPromise: Promise<void> | null = null;

  constructor(
    readonly agent: Agent,
    readonly options: AgentLoopOptions,
  ) {}

  // ── Entry point ────────────────────────────────────────────────────

  async run(externalSignal: AbortSignal): Promise<void> {
    this.abort = new AbortController();
    const signal = this.abort.signal;

    // Forward external cancellation.
    const onExternalAbort = () => this.abort?.abort();
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });

    this.redraw(this.agent.getState(AgentEventState));

    const onResize = () => this.redraw(this.agent.getState(AgentEventState));
    process.stdout.on("resize", onResize);

    try {
      const events$ = this.agent.subscribeStateAsync(AgentEventState, signal);
      const exec$ = this.agent.subscribeStateAsync(AgentExecutionState, signal);

      await raceAbort(
        Promise.all([
          this.consumeEvents(events$, signal),
          this.consumeExecution(exec$, signal),
        ]),
        signal,
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // Normal shutdown — Ctrl-C, agent.stopped, or external signal.
      } else if (e instanceof Error && e.name === "AbortError") {
        // Same, different runtime.
      } else {
        process.stderr.write(formatLogMessages(["Error while running agent loop", e as Error]));
      }
    } finally {
      this.cancelInput();
      this.cancelHuman();
      this.stopSpinner();
      this.abort.abort();
      this.abort = null;
      externalSignal.removeEventListener("abort", onExternalAbort);
      process.stdout.removeListener("resize", onResize);
    }

    this.ensureNewline();
  }

  /** Shuts down the loop cleanly. Safe to call multiple times. */
  private shutdown(): void {
    this.abort?.abort();
  }

  // ── Event stream ───────────────────────────────────────────────────

  private async consumeEvents(
    subscription: AsyncIterable<AgentEventState>,
    signal: AbortSignal,
  ): Promise<void> {
    for await (const state of subscription) {
      if (signal.aborted) return;

      if (this.inputPromise) await this.inputPromise;
      if (this.humanPromise) await this.humanPromise;

      for (const event of state.yieldEventsByCursor(this.eventCursor)) {
        this.renderEvent(event);
      }
    }
  }

  // ── Execution-state stream ─────────────────────────────────────────

  private async consumeExecution(
    subscription: AsyncIterable<AgentExecutionState>,
    signal: AbortSignal,
  ): Promise<void> {
    for await (const exec of subscription) {
      if (signal.aborted) return;

      this.syncSpinner(exec);
      this.cancelStalePromises(exec);
      this.maybeStartInput(exec);
      this.maybeStartHumanInput(exec);
    }
  }

  // ── Spinner management ─────────────────────────────────────────────

  private syncSpinner(exec: AgentExecutionState): void {
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

  // ── Scoped cancellation ────────────────────────────────────────────

  private cancelInput(): void {
    this.inputAbort?.abort();
    this.inputAbort = null;
    this.inputPromise = null;
  }

  private cancelHuman(): void {
    this.humanAbort?.abort();
    this.humanAbort = null;
    this.humanPromise = null;
  }

  private cancelStalePromises(exec: AgentExecutionState): void {
    if (!exec.idle && this.inputPromise) {
      this.cancelInput();
    }
    if (exec.waitingOn.length === 0 && this.humanPromise) {
      this.cancelHuman();
    }
  }

  // ── Input lifecycle ────────────────────────────────────────────────

  private maybeStartInput(exec: AgentExecutionState): void {
    if (!exec.idle || this.inputPromise) return;
    this.ensureNewline();
    this.inputPromise = this.inputLoop();
  }

  private inputLoop(): Promise<void> {
    this.inputAbort?.abort();
    this.inputAbort = new AbortController();
    const signal = this.inputAbort.signal;

    return this.gatherInput(signal)
      .then((message) => {
        this.inputAbort = null;
        this.inputPromise = null;
        this.resetSigintHandlers();
        this.agent.handleInput({ message });
      })
      .catch((err) => {
        this.inputAbort = null;
        this.inputPromise = null;
        if (err instanceof PartialInputError) {
          if (err.buffer.trim() !== "") {
            this.inputPromise = this.inputLoop();
            return;
          }
        }
        // Swallow AbortError and empty partial — nothing to do.
      });
  }

  private maybeStartHumanInput(exec: AgentExecutionState): void {
    if (exec.waitingOn.length === 0 || this.humanPromise) return;

    this.humanAbort?.abort();
    this.humanAbort = new AbortController();
    const signal = this.humanAbort.signal;
    const request = exec.waitingOn[0];

    this.humanPromise = this.handleHumanRequest(request, signal)
      .then(([req, response]) => {
        this.humanAbort = null;
        this.humanPromise = null;
        this.redraw(this.agent.getState(AgentEventState));
        this.resetSigintHandlers();
        this.agent.sendQuestionResponse(req.requestId, { result: response });
      })
      .catch(() => {
        this.humanAbort = null;
        this.humanPromise = null;
      });
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

    for (const event of state.yieldEventsByCursor({ position: 0 })) {
      this.renderEvent(event);
    }

    this.eventCursor.position = state.events.length;
    this.write("\n");
  }

  // ── Rendering: single event ────────────────────────────────────────

  private renderEvent(event: AgentEventEnvelope): void {
    switch (event.type) {
      case "agent.created":
        this.renderSystemLine(`${this.agent.config.name} created`);
        break;

      case "agent.stopped":
        this.shutdown();
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
      case "question.response":
        break;

      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
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

    if (event.type !== this.currentOutputType) {
      this.ensureNewline();
      if (event.type === "output.chat") this.printDivider("Chat");
      else if (event.type === "output.reasoning") this.printDivider("Reasoning");
      this.currentOutputType = event.type;
    }

    const color = OUTPUT_COLORS[event.type as OutputColorKey];

    for (const char of event.message) {
      if (char === "\n") {
        this.write(color(applyMarkdownStyles(this.currentLine) + "\n"));
        this.currentLine = "";
      } else {
        this.currentLine += char;
      }
    }

    this.lastWriteHadNewline = event.message.endsWith("\n");
  }

  private renderInputHandled(event: AgentEventEnvelope & { type: "input.handled" }): void {
    this.stopSpinner();
    this.ensureNewline();
    if (event.status === "cancelled" || event.status === "error") {
      this.write(OUTPUT_COLORS["output.error"](event.message));
      this.lastWriteHadNewline = true;
    }
    this.currentLine = "";
  }

  private renderInputReceived(event: AgentEventEnvelope & { type: "input.received" }): void {
    this.ensureNewline();
    this.write(
      PREVIOUS_INPUT_COLOR(
        createAsciiTable([["user >", event.message]], {
          columnWidths: [7, process.stdout.columns ? process.stdout.columns - 7 : 65],
          padding: 0,
          grid: false,
        }),
      ),
    );
    this.lastWriteHadNewline = true;
    this.currentLine = "";
  }

  // ── Terminal I/O primitives ────────────────────────────────────────

  private write(data: string): void {
    process.stdout.write(data);
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
  ): Promise<[ParsedQuestionRequest, z.output<typeof QuestionResponseSchema>]> {
    const renderScreen =
      this.options.config.uiFramework === "ink" ? renderScreenInk : renderScreenOpenTUI;
    const Screen =
      this.options.config.uiFramework === "ink"
        ? InkQuestionInputScreen
        : OpenTUIQuestionInputScreen;

    const response = await renderScreen(
      Screen,
      { request, agent: this.agent, config: this.options.config },
      signal,
    );
    return [request, response];
  }

  // ── Signal / readline helpers ──────────────────────────────────────

  private resetSigintHandlers(): void {
    this.options.rl?.close();
    process.removeAllListeners("SIGINT");
    process.stdin.removeAllListeners("keypress");
    process.stdin.setRawMode(true);

    this.options.rl = readline.createInterface(process.stdin, process.stdout);

    this.options.rl.on("SIGINT", () => {
      if (this.humanAbort) {
        this.humanAbort.abort();
      } else {
        // Whether we're at the input prompt or not, Ctrl-C exits the loop.
        // The input prompt will be cleaned up by cancelInput() in finally.
        this.shutdown();
      }
    });
  }
}