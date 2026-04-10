import {AgentCommandService, AgentManager} from "@tokenring-ai/agent";
import type Agent from "@tokenring-ai/agent/Agent";
import type TokenRingApp from "@tokenring-ai/app";
import type {TokenRingService} from "@tokenring-ai/app/types";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import WorkflowService from "@tokenring-ai/workflow/WorkflowService";
import process from "node:process";
import {setTimeout as delay} from "node:timers/promises";
import open from "open";
import type {z} from "zod";
import AgentLoop from "./AgentLoop";
import type {AgentSelectionResult} from "./AgentSelection.ts";
import type {CommandDefinition} from "./raw/CommandCompletions.ts";
import {retryAgentSelection, runLoadingScreen} from "./raw/NativeScreens.ts";
import type {CLIConfigSchema} from "./schema.ts";

/**
 * AgentCLI is a command-line interface for interacting with an TokenRingApp.
 */
export default class AgentCLI implements TokenRingService {
  readonly name = "AgentCLI";
  description = "Command-line interface for interacting with agents";

  private loadingScreenAbortController: AbortController = new AbortController();
  private loadingScreenTask: Promise<void> | null = null;

  /**
   * Creates a new AgentCLI instance.
   * @param app The TokenRingApp instance to manage agents.
   * @param config The configuration for the CLI.
   */
  constructor(
    readonly app: TokenRingApp,
    readonly config: z.infer<typeof CLIConfigSchema>,
  ) {
    if (!this.config.startAgent) {
      app.runBackgroundTask(this, async (appAbortSignal) => {
        this.loadingScreenTask = (async () => {
          const abortHandler = () => {
            this.loadingScreenAbortController.abort();
            this.teardown();
          };
          appAbortSignal.addEventListener("abort", abortHandler);

          try {
            await runLoadingScreen(
              app,
              this.config,
              this.loadingScreenAbortController.signal,
            );
          } catch {
          } finally {
            appAbortSignal.removeEventListener("abort", abortHandler);
          }
        })();

        try {
          await this.loadingScreenTask;
        } finally {
          this.loadingScreenTask = null;
        }
      });
    }
  }

  async run(signal: AbortSignal): Promise<void> {
    this.loadingScreenAbortController.abort();
    await this.loadingScreenTask?.catch(() => {
    });

    let initialAgent: Agent | undefined;
    if (this.config.startAgent) {
      try {
        const agentManager = this.app.requireService(AgentManager);
        initialAgent = await agentManager.spawnAgent({
          agentType: this.config.startAgent.type,
          headless: true,
        });
        if (this.config.startAgent.prompt) {
          initialAgent.handleInput({
            from: "CLI startup prompt",
            message: this.config.startAgent.prompt,
          });
          if (this.config.startAgent?.shutdownWhenDone) {
            initialAgent.handleInput({
              from: "CLI startup prompt",
              message: "/agent shutdown",
            });
          }
        }
      } catch (error) {
        throw new Error(
          formatLogMessages(["Error while spawning agent", error as Error]),
        );
      }
    }

    for (
      let agent = initialAgent ?? (await this.promptForAgent(signal));
      agent;
      agent = await this.promptForAgent(signal)
    ) {
      initialAgent = undefined;
      try {
        const agentLoop = new AgentLoop(agent, {
          availableCommands: this.getAvailableCommands(),
          config: this.config,
        });

        await agentLoop.run(signal);
      } catch (error) {
        process.stderr.write(
          formatLogMessages(["Error while running agent loop", error as Error]),
        );
        await delay(1000);
      }
      if (signal.aborted) break;

      if (this.config.startAgent?.shutdownWhenDone) break;
    }

    if (!signal.aborted) {
      this.app.shutdown("User initiated shutdown from CLI");
    }

    this.teardown();
  }

  private teardown() {
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }

    if (!process.stdin.isPaused()) {
      process.stdin.pause();
    }
  }

  private getAvailableCommands(): CommandDefinition[] {
    const agentCommandService = this.app.getService(AgentCommandService);
    if (!agentCommandService) return [];

    const uniqueCommands = new Map<string, CommandDefinition>();
    for (const [, command] of agentCommandService.getCommandEntries()) {
      uniqueCommands.set(command.name, {
        name: command.name,
        description: command.description,
      });
    }

    return Array.from(uniqueCommands.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  private promptForAgent(signal: AbortSignal): Promise<Agent | null> {
    return retryAgentSelection(this.app, this.config, signal, (selection) =>
      this.resolveAgentSelection(selection),
    );
  }

  private async resolveAgentSelection(
    selection: AgentSelectionResult | null,
  ): Promise<Agent | "retry" | null> {
    if (!selection) {
      return null;
    }

    try {
      const agentManager = this.app.requireService(AgentManager);

      switch (selection.type) {
        case "spawn":
          return await agentManager.spawnAgent({
            agentType: selection.agentType,
            headless: false,
          });
        case "connect":
          return agentManager.getAgent(selection.agentId);
        case "open":
          await open(selection.url);
          return "retry";
        case "workflow": {
          const workflowService = this.app.requireService(WorkflowService);
          return await workflowService.spawnWorkflow(selection.workflowKey, {
            headless: false,
          });
        }
      }
    } catch (error) {
      process.stderr.write(
        formatLogMessages(["Error selecting agent", error as Error]),
      );
      await delay(1000);
      return "retry";
    }
  }
}
