import Agent from "@tokenring-ai/agent/Agent";
import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import process from "node:process";
import readline from "node:readline";
import {setTimeout} from "node:timers/promises";
import {z} from "zod";
import AgentLoop from "./AgentLoop";
import {renderScreen} from "./renderScreen.tsx";
import {CLIConfigSchema} from "./schema.ts";
import AgentSelectionScreen from "./screens/AgentSelectionScreen.tsx";
import LoadingScreen from "./screens/LoadingScreen.tsx";

/**
 * AgentCLI is a command-line interface for interacting with an TokenRingApp.
 */
export default class AgentCLI implements TokenRingService {
  name = "AgentCLI";
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
    await renderScreen(LoadingScreen, {
      config: this.config
    }, signal);

    for (let agent = await this.selectOrCreateAgent(signal); agent; agent = await this.selectOrCreateAgent(signal)) {
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
      if (signal.aborted) return;
    }

    process.stdout.write(`\x1b[${process.stdout.rows || 24};0H`);
    process.stdout.write("Goodbye!");
    process.exit(0);
  }

  private async selectOrCreateAgent(signal: AbortSignal): Promise<Agent | null> {
    return renderScreen(AgentSelectionScreen, {
      app: this.app,
      config: this.config,
    }, signal);
  }
}
