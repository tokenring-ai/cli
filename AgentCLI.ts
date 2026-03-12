import {AgentCommandService, AgentManager} from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import WorkflowService from "@tokenring-ai/workflow/WorkflowService";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import open from "open";
import process from "node:process";
import {setTimeout} from "node:timers/promises";
import type {ComponentType} from "react";
import {z} from "zod";
import {type AgentSelectionResult} from "./AgentSelection.ts";
import AgentLoop from "./AgentLoop";
import {renderScreen as renderScreenInk} from "./ink/renderScreen.tsx";
import InkAgentSelectionScreen from "./ink/screens/AgentSelectionScreen.tsx";
import InkLoadingScreen from "./ink/screens/LoadingScreen.tsx";
import {renderScreen as renderScreenOpenTUI} from "./opentui/renderScreen.tsx";
import OpenTUIAgentSelectionScreen from "./opentui/screens/AgentSelectionScreen.tsx";
import OpenTUILoadingScreen from "./opentui/screens/LoadingScreen.tsx";
import type {CommandDefinition} from "./raw/CommandCompletions.ts";
import {CLIConfigSchema} from "./schema.ts";

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
  constructor(readonly app: TokenRingApp, readonly config: z.infer<typeof CLIConfigSchema>) {
    if (! this.config.startAgent) {
      const renderScreen = this.config.uiFramework === 'ink' ? renderScreenInk : renderScreenOpenTUI;
      const LoadingScreen = this.config.uiFramework === 'ink' ? InkLoadingScreen : OpenTUILoadingScreen;

      app.runBackgroundTask(this, async appAbortSignal => {
        this.loadingScreenTask = (async () => {
          const abortHandler = () => this.loadingScreenAbortController.abort();
          appAbortSignal.addEventListener("abort", abortHandler);

          try {
            await renderScreen(LoadingScreen, {
              config: this.config
            }, this.loadingScreenAbortController.signal);
          } catch (err) {
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
    await this.loadingScreenTask?.catch(() => {});

    const renderScreen = this.config.uiFramework === 'ink' ? renderScreenInk : renderScreenOpenTUI;
    const AgentSelectionScreen = this.config.uiFramework === 'ink' ? InkAgentSelectionScreen : OpenTUIAgentSelectionScreen;

    let initialAgent: Agent | undefined;
    if (this.config.startAgent) {
      try {
        const agentManager = this.app.requireService(AgentManager);
        initialAgent = await agentManager.spawnAgent({agentType: this.config.startAgent.type, headless: true});
        if (this.config.startAgent.prompt) {
          initialAgent.handleInput({
            from: "CLI startup prompt",
            message: this.config.startAgent.prompt
          });
          if (this.config.startAgent?.shutdownWhenDone) {
            initialAgent.handleInput({
              from: "CLI startup prompt",
              message: "/agent shutdown"
            });
          }
        }
      } catch (error) {
        process.stderr.write(formatLogMessages(["Error while spawning agent", error as Error]));
        process.exit(1);
      }
    }

    for (
      let agent = initialAgent ?? await this.promptForAgent(renderScreen, AgentSelectionScreen, signal);
      agent;
      agent = await this.promptForAgent(renderScreen, AgentSelectionScreen, signal)
    ) {
      initialAgent = undefined;
      try {
        const agentLoop = new AgentLoop(agent, {
          availableCommands: this.getAvailableCommands(),
          config: this.config
        });

        await agentLoop.run(signal);
      } catch (error) {
        process.stderr.write(formatLogMessages(["Error while running agent loop", error as Error]));
        await setTimeout(1000);
      }
      if (signal.aborted) break;

      if (this.config.startAgent?.shutdownWhenDone) break;
    }

    if (! signal.aborted) {
      this.app.shutdown("User initiated shutdown from CLI");
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

    return Array.from(uniqueCommands.values()).sort((left, right) => left.name.localeCompare(right.name));
  }

  private async promptForAgent(
    renderScreen: ScreenRenderer,
    AgentSelectionScreen: ComponentType<{
      app: TokenRingApp;
      config: z.infer<typeof CLIConfigSchema>;
      onResponse: (selection: AgentSelectionResult | null) => void;
      signal?: AbortSignal;
    }>,
    signal: AbortSignal,
  ): Promise<Agent | null> {
    while (!signal.aborted) {
      const selection = await renderScreen(AgentSelectionScreen, {app: this.app, config: this.config}, signal);
      const agent = await this.resolveAgentSelection(selection);
      if (agent === "retry") {
        continue;
      }
      return agent;
    }

    return null;
  }

  private async resolveAgentSelection(selection: AgentSelectionResult | null): Promise<Agent | "retry" | null> {
    if (!selection) {
      return null;
    }

    try {
      const agentManager = this.app.requireService(AgentManager);

      switch (selection.type) {
        case "spawn":
          return await agentManager.spawnAgent({agentType: selection.agentType, headless: false});
        case "connect":
          return agentManager.getAgent(selection.agentId);
        case "open":
          await open(selection.url);
          return "retry";
        case "workflow": {
          const workflowService = this.app.requireService(WorkflowService);
          return await workflowService.spawnWorkflow(selection.workflowKey, {headless: false});
        }
      }
    } catch (error) {
      process.stderr.write(formatLogMessages(["Error selecting agent", error as Error]));
      await setTimeout(1000);
      return "retry";
    }
  }
}

type ScreenRenderer = <P, R>(
  Component: ComponentType<P & {onResponse: (response: R) => void; signal?: AbortSignal}>,
  props: P,
  signal: AbortSignal,
) => Promise<R>;
