import Agent from "@tokenring-ai/agent/Agent";
import {
  AgentEventEnvelope,
  type ParsedInteractionRequest,
} from "@tokenring-ai/agent/AgentEvents";
import {AgentEventCursor, AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import process from "node:process";
import {setTimeout} from "node:timers/promises";
import type {z} from "zod";
import {renderScreen as renderScreenInk} from "./ink/renderScreen.tsx";
import InkQuestionInputScreen from "./ink/screens/QuestionInputScreen.tsx";
import {renderScreen as renderScreenOpenTUI} from "./opentui/renderScreen.tsx";
import OpenTUIQuestionInputScreen from "./opentui/screens/QuestionInputScreen.tsx";
import RawChatUI from "./raw/RawChatUI.ts";
import type {CommandDefinition} from "./raw/CommandCompletions.ts";
import type {CLIConfigSchema} from "./schema.ts";

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, {once: true});

    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export interface AgentLoopOptions {
  availableCommands: CommandDefinition[];
  config: z.infer<typeof CLIConfigSchema>;
}

type QuestionInteraction = Extract<ParsedInteractionRequest, {type: "question"}>;
type PendingQuestion = {requestId: string; interaction: QuestionInteraction};
type PromptMode = null | {
  abort: AbortController;
  requestId: string;
  interactionId: string;
  promise: Promise<void>;
};

export default class AgentLoop {
  private abort: AbortController | null = null;
  private eventCursor: AgentEventCursor = {position: 0};
  private prompt: PromptMode = null;
  private ui: RawChatUI | null = null;

  constructor(
    readonly agent: Agent,
    readonly options: AgentLoopOptions,
  ) {}

  async run(externalSignal: AbortSignal): Promise<void> {
    this.abort = new AbortController();
    const signal = this.abort.signal;

    const onExternalAbort = () => this.abort?.abort();
    externalSignal.addEventListener("abort", onExternalAbort, {once: true});

    const initialState = this.agent.getState(AgentEventState);
    this.eventCursor = {position: 0};

    this.ui = new RawChatUI({
      agent: this.agent,
      config: this.options.config,
      commands: this.options.availableCommands,
      onSubmit: (message) => {
        this.agent.handleInput({
          from: "CLI user",
          message,
        });
      },
      onExit: () => this.shutdown(),
      onAbortCurrentActivity: () => this.agent.abortCurrentOperation("Cancelled from CLI"),
    });

    this.ui.start();

    for (const event of initialState.events) {
      this.renderEvent(event);
    }
    this.eventCursor = initialState.getEventCursorFromCurrentPosition();
    this.handleAgentState(initialState);

    try {
      const events$ = this.agent.subscribeStateAsync(AgentEventState, signal);
      await raceAbort(this.consumeEvents(events$, signal), signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      process.stderr.write(formatLogMessages(["Error while running agent loop", error as Error]));
    } finally {
      this.cancelPrompt();
      this.ui?.stop();
      this.ui = null;
      this.abort.abort();
      this.abort = null;
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }

  private shutdown(): void {
    this.abort?.abort();
  }

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

  private renderEvent(event: AgentEventEnvelope): void {
    this.ui?.renderEvent(event);
    if (event.type === "agent.stopped") {
      this.shutdown();
    }
  }

  private handleAgentState(state: AgentEventState): void {
    this.ui?.syncState(state);
    this.synchronizePrompt(state);
  }

  private cancelPrompt(): void {
    this.prompt?.abort.abort();
    this.prompt = null;
  }

  private getPendingQuestion(state: AgentEventState): PendingQuestion | null {
    const currentItem = state.currentlyExecutingInputItem;
    if (!currentItem) return null;

    const interaction = currentItem.executionState.availableInteractions.find(
      (availableInteraction): availableInteraction is QuestionInteraction => availableInteraction.type === "question",
    );

    if (!interaction) return null;

    return {
      requestId: currentItem.request.requestId,
      interaction,
    };
  }

  private isPromptStillPending(state: AgentEventState, prompt: NonNullable<PromptMode>): boolean {
    const pendingQuestion = this.getPendingQuestion(state);
    return !!pendingQuestion
      && pendingQuestion.requestId === prompt.requestId
      && pendingQuestion.interaction.interactionId === prompt.interactionId;
  }

  private synchronizePrompt(state: AgentEventState): void {
    const pendingQuestion = this.getPendingQuestion(state);

    if (this.prompt && !this.isPromptStillPending(state, this.prompt)) {
      this.cancelPrompt();
    }

    if (this.prompt || !pendingQuestion) return;

    const abortController = new AbortController();
    const promise = this.handleHumanRequest(pendingQuestion.interaction, abortController.signal)
      .then((response) => {
        if (abortController.signal.aborted) return;

        const latestPendingQuestion = this.getPendingQuestion(this.agent.getState(AgentEventState));
        if (!latestPendingQuestion
          || latestPendingQuestion.requestId !== pendingQuestion.requestId
          || latestPendingQuestion.interaction.interactionId !== pendingQuestion.interaction.interactionId) {
          return;
        }

        this.agent.sendInteractionResponse({
          requestId: pendingQuestion.requestId,
          interactionId: pendingQuestion.interaction.interactionId,
          result: response,
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted) return;

        this.ui?.flash(`Question handling failed: ${(error as Error).message}`, "error");

        const latestPendingQuestion = this.getPendingQuestion(this.agent.getState(AgentEventState));
        if (!latestPendingQuestion
          || latestPendingQuestion.requestId !== pendingQuestion.requestId
          || latestPendingQuestion.interaction.interactionId !== pendingQuestion.interaction.interactionId) {
          return;
        }

        this.agent.sendInteractionResponse({
          requestId: pendingQuestion.requestId,
          interactionId: pendingQuestion.interaction.interactionId,
          result: null,
        });
      })
      .finally(() => {
        if (this.prompt?.interactionId === pendingQuestion.interaction.interactionId) {
          this.prompt = null;
        }
        this.ui?.syncState(this.agent.getState(AgentEventState));
      });

    this.prompt = {
      abort: abortController,
      requestId: pendingQuestion.requestId,
      interactionId: pendingQuestion.interaction.interactionId,
      promise,
    };
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

    this.ui?.suspend();

    try {
      await setTimeout(80);
      return await renderScreen(
        Screen,
        {request, agent: this.agent, config: this.options.config},
        signal,
      );
    } finally {
      this.ui?.resume();
    }
  }
}
