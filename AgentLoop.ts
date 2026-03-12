import Agent from "@tokenring-ai/agent/Agent";
import {
  AgentEventEnvelope,
  type ParsedAgentResponse,
  type ParsedInteractionRequest,
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
  "agent.response": chalk.hex(theme.chatInputHandledSuccess),
  "input.received": chalk.hex(theme.chatInputReceived),
  "input.interaction": chalk.hex(theme.chatQuestionResponse),
  "reset": chalk.hex(theme.chatReset),
} as const;

const PREVIOUS_INPUT_COLOR = chalk.hex(theme.chatPreviousInput);
const DIVIDER_COLOR = chalk.hex(theme.chatDivider);
const BANNER_COLOR = chalk.hex(theme.agentSelectionBanner);

type OutputColorKey = keyof typeof OUTPUT_COLORS;
type QuestionInteraction = Extract<ParsedInteractionRequest, {type: "question"}>;
type PendingQuestion = {requestId: string; interaction: QuestionInteraction};

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
  | { kind: "human"; abort: AbortController; promise: Promise<void>; requestId: string; interactionId: string };

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
    for await (const state of subscription) {
      if (signal.aborted) return;

      for (const event of state.yieldEventsByCursor(this.eventCursor)) {
        this.renderEvent(event);
      }

      this.handleAgentState(state);
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


    this.handleAgentState(state);
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

      case "agent.status":
      case "input.execution":
      case "cancel":
        // Do nothing, handled elsewhere
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

      case "agent.response":
        this.renderAgentResponse(event);
        break;

      case "input.received":
        this.renderInputReceived(event);
        break;

      case "input.interaction":
        this.renderInteractionResponse(event);
        break;

      default: {
        // noinspection UnnecessaryLocalVariableJS
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  }

  // ── Agent state handling ───────────────────────────────────────────

  private handleAgentState(state: AgentEventState): void {
    this.syncSpinner(state);
    this.synchronizePrompt(state);
  }

  // ── Spinner management ─────────────────────────────────────────────

  private syncSpinner(state: AgentEventState): void {
    const currentActivity = state.currentlyExecutingInputItem?.executionState.currentActivity;

    if (!currentActivity) {
      if (this.spinner) {
        this.stopSpinner();
        this.spinner = null;
      }
      return;
    }

    if (!this.spinner) {
      this.spinner = new SimpleSpinner(currentActivity, theme.chatSpinner);
      this.spinnerRunning = true;
      this.spinner.start();
      return;
    }

    this.spinner.updateMessage(currentActivity);
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

  private getPendingQuestion(state: AgentEventState): PendingQuestion | null {
    const currentItem = state.currentlyExecutingInputItem;
    if (!currentItem) return null;

    const interaction = currentItem.executionState.availableInteractions.find(
      (availableInteraction): availableInteraction is QuestionInteraction => availableInteraction.type === "question"
    );

    if (!interaction) return null;

    return {
      requestId: currentItem.request.requestId,
      interaction
    };
  }

  private isPromptStillPending(
    state: AgentEventState,
    prompt: Extract<PromptMode, {kind: "human"}>
  ): boolean {
    const pendingQuestion = this.getPendingQuestion(state);
    return !!pendingQuestion
      && pendingQuestion.requestId === prompt.requestId
      && pendingQuestion.interaction.interactionId === prompt.interactionId;
  }

  private synchronizePrompt(state: AgentEventState): void {
    const idle = state.status === "running" && state.idle;
    const pendingQuestion = this.getPendingQuestion(state);

    if (this.prompt) {
      if (this.prompt.kind === "human") {
        if (!this.isPromptStillPending(state, this.prompt)) {
          this.cancelPrompt();
        }
      } else if (!idle) {
        this.cancelPrompt();
      }
    }

    if (this.prompt) return;

    if (pendingQuestion) {
      const ac = new AbortController();
      const promise = this.handleHumanRequest(pendingQuestion.interaction, ac.signal)
        .then((response) => {
          if (ac.signal.aborted) return;

          const latestPendingQuestion = this.getPendingQuestion(this.agent.getState(AgentEventState));
          if (!latestPendingQuestion
            || latestPendingQuestion.requestId !== pendingQuestion.requestId
            || latestPendingQuestion.interaction.interactionId !== pendingQuestion.interaction.interactionId) {
            return;
          }

          this.agent.sendInteractionResponse({
            requestId: pendingQuestion.requestId,
            interactionId: pendingQuestion.interaction.interactionId,
            result: response
          });
        })
        .catch((err) => {
          if (ac.signal.aborted) return;

          this.agent.errorMessage("Error while handling human request in CLI: ", err.message);

          const latestPendingQuestion = this.getPendingQuestion(this.agent.getState(AgentEventState));
          if (!latestPendingQuestion
            || latestPendingQuestion.requestId !== pendingQuestion.requestId
            || latestPendingQuestion.interaction.interactionId !== pendingQuestion.interaction.interactionId) {
            return;
          }

          this.agent.sendInteractionResponse({
            requestId: pendingQuestion.requestId,
            interactionId: pendingQuestion.interaction.interactionId,
            result: null
          });
        })
        .finally(() => {
          if (this.prompt?.kind === "human"
            && this.prompt.requestId === pendingQuestion.requestId
            && this.prompt.interactionId === pendingQuestion.interaction.interactionId) {
            this.prompt = null;
          }

          this.redraw(this.agent.getState(AgentEventState));
          this.resetSigintHandlers();
        });

      this.prompt = {
        kind: "human",
        abort: ac,
        promise,
        requestId: pendingQuestion.requestId,
        interactionId: pendingQuestion.interaction.interactionId
      };
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
      this.agent.handleInput({
        from: "CLI user",
        message
      });
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

  private renderAgentResponse(event: ParsedAgentResponse): void {
    this.stopSpinner();
    this.ensureNewline();
    if (event.status === "cancelled" || event.status === "error") {
      this.write(OUTPUT_COLORS["output.error"](event.message.trimEnd() + "\n"));
    } else if (event.status === "success") {
      this.write(OUTPUT_COLORS["agent.response"](event.message.trimEnd() + "\n"));
    }
    this.lastWriteHadNewline = true;
    this.currentLine = "";
  }

  private renderInputReceived(event: AgentEventEnvelope & { type: "input.received" }): void {
    this.ensureNewline();
    this.write(
      PREVIOUS_INPUT_COLOR(
        createAsciiTable([[`user >`, event.input.message.trimEnd() + "\n"]], {
          columnWidths: [7, process.stdout.columns ? process.stdout.columns - 7 : 65],
          padding: 0,
          grid: false,
        }),
      ),
    );
    this.lastWriteHadNewline = true;
    this.currentLine = "";
  }

  private renderInteractionResponse(event: AgentEventEnvelope & { type: "input.interaction" }): void {
    this.stopSpinner();
    this.ensureNewline();
    const responseStr = JSON.stringify(event.result, null, 2);
    this.write(OUTPUT_COLORS["input.interaction"](`Response: ${responseStr}\n`));
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
    request: QuestionInteraction,
    signal: AbortSignal,
  ): Promise<unknown> {
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
