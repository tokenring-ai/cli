import {AgentManager} from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import createLocalRPCClient from "@tokenring-ai/rpc/createLocalRPCClient";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import process from "node:process";
import readline from "node:readline";
import {setTimeout} from "node:timers/promises";
import {z} from "zod";
import AgentLoop from "./AgentLoop";
import {renderScreen as renderScreenInk} from "./ink/renderScreen.tsx";
import InkAgentSelectionScreen from "./ink/screens/AgentSelectionScreen.tsx";
import InkLoadingScreen from "./ink/screens/LoadingScreen.tsx";
import {renderScreen as renderScreenOpenTUI} from "./opentui/renderScreen.tsx";
import OpenTUIAgentSelectionScreen from "./opentui/screens/AgentSelectionScreen.tsx";
import OpenTUILoadingScreen from "./opentui/screens/LoadingScreen.tsx";
import {CLIConfigSchema} from "./schema.ts";

/**
 * AgentCLI is a command-line interface for interacting with an TokenRingApp.
 */
export default class AgentCLI implements TokenRingService {
  readonly name = "AgentCLI";
  description = "Command-line interface for interacting with agents";

  private rl!: readline.Interface;

  /**
   * Creates a new AgentCLI instance.
   * @param app The TokenRingApp instance to manage agents.
   * @param config The configuration for the CLI.
   */
  constructor(readonly app: TokenRingApp, readonly config: z.infer<typeof CLIConfigSchema>) {
  }

  async run(signal: AbortSignal): Promise<void> {
    const renderScreen = this.config.uiFramework === 'ink' ? renderScreenInk : renderScreenOpenTUI;
    const LoadingScreen = this.config.uiFramework === 'ink' ? InkLoadingScreen : OpenTUILoadingScreen;
    const AgentSelectionScreen = this.config.uiFramework === 'ink' ? InkAgentSelectionScreen : OpenTUIAgentSelectionScreen;

    let initialAgent: Agent | undefined;
    if (this.config.startAgent) {
      try {
        const agentManager = this.app.requireService(AgentManager);
        initialAgent = await agentManager.spawnAgent({agentType: this.config.startAgent.type, headless: true});
        if (this.config.startAgent.prompt) {
          initialAgent.handleInput({ message: this.config.startAgent.prompt });
          if (this.config.startAgent?.shutdownWhenDone) {
            initialAgent.handleInput({ message: "/agent shutdown" });
          }
        }
      } catch (error) {
        process.stderr.write(formatLogMessages(["Error while spawning agent", error as Error]));
        process.exit(1);
      }
    } else {
      await renderScreen(LoadingScreen, {
        config: this.config
      }, signal);
    }

    for (let agent = initialAgent ?? await renderScreen(AgentSelectionScreen, {app: this.app, config: this.config}, signal); agent; agent = await renderScreen(AgentSelectionScreen, {app: this.app, config: this.config}, signal)) {
      initialAgent = undefined;
      try {
        const agentLoop = new AgentLoop(agent, {
          availableCommands: [],
          rl: this.rl,
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

    process.stdout.write(`\x1b[${process.stdout.rows || 24};0H`);
    process.exit(0);
  }
}
