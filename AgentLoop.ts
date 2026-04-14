import type Agent from "@tokenring-ai/agent/Agent";
import type {AgentEventEnvelope} from "@tokenring-ai/agent/AgentEvents";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import {type AgentEventCursor, AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import process from "node:process";
import type {z} from "zod";
import type {CommandDefinition} from "./raw/CommandCompletions.ts";
import RawChatUI from "./raw/RawChatUI.ts";
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

export default class AgentLoop {
  private abort: AbortController | null = null;
  private eventCursor: AgentEventCursor = {position: 0};
  private ui: RawChatUI | null = null;
  private exitAction: "select-agent" | "delete-agent" | null = null;

  constructor(
    readonly agent: Agent,
    readonly options: AgentLoopOptions,
  ) {
  }

  async run(externalSignal: AbortSignal): Promise<void> {
    this.abort = new AbortController();
    this.exitAction = null;
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
      onOpenAgentSelection: () => {
        this.exitAction = "select-agent";
        this.shutdown();
      },
      onDeleteIdleAgent: () => {
        this.exitAction = "delete-agent";
        this.shutdown();
      },
      onAbortCurrentActivity: () =>
        this.agent.abortCurrentOperation("Cancelled from CLI"),
    });

    for (const event of initialState.events) {
      this.renderEvent(event);
    }
    this.eventCursor = initialState.getEventCursorFromCurrentPosition();
    this.handleAgentState(initialState);
    this.ui.start();

    try {
      const events$ = this.agent.subscribeStateAsync(AgentEventState, signal);
      await raceAbort(this.consumeEvents(events$, signal), signal);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
      } else if (error instanceof Error && error.name === "AbortError") {
      } else {
        process.stderr.write(
          formatLogMessages(["Error while running agent loop", error as Error]),
        );
      }
    } finally {
      this.ui?.stop();
      this.ui = null;
      this.abort.abort();
      this.abort = null;
      externalSignal.removeEventListener("abort", onExternalAbort);
    }

    if (this.exitAction === "delete-agent") {
      this.deleteCurrentAgent();
    }
    this.exitAction = null;
  }

  private shutdown(): void {
    this.abort?.abort();
  }

  private deleteCurrentAgent() {
    try {
      const agentManager = this.agent.app.requireService(AgentManager);
      agentManager.deleteAgent(
        this.agent.id,
        "Agent was shut down from the CLI",
      );
    } catch (error: unknown) {
      process.stderr.write(
        formatLogMessages([
          "Error while deleting agent from CLI",
          error as Error,
        ]),
      );
    }
  }

  private async consumeEvents(
    subscription: AsyncIterable<AgentEventState>,
    signal: AbortSignal,
  ): Promise<void> {
    for await (const state of subscription) {
      if (signal.aborted) return;

      for (const event of state.yieldEventsByCursor(this.eventCursor)) {
        try {
          this.renderEvent(event);
        } catch (error: unknown) {
          this.ui?.flash(
            `Failed to render event: ${error instanceof Error ? error.message : String(error)}`,
            "error",
            10_000,
          );
        }
      }

      try {
        this.handleAgentState(state);
      } catch (error: unknown) {
        this.ui?.flash(
          `Failed to sync agent state: ${error instanceof Error ? error.message : String(error)}`,
          "error",
          10_000,
        );
      }
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
  }
}
