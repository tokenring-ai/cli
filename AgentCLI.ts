import Agent from "@tokenring-ai/agent/Agent";
import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import process from "node:process";
import readline from "node:readline";
import {setTimeout} from "node:timers/promises";
import {z} from "zod";
import AgentLoop, {AgentLoopOptions} from "./AgentLoop";
import {renderScreen} from "./renderScreen.tsx";
import AgentSelectionScreen from "./screens/AgentSelectionScreen.tsx";

export const CLIConfigSchema = z.object({
  bannerNarrow: z.string(),
  bannerWide: z.string(),
  bannerCompact: z.string(),
})


/**
 * AgentCLI is a command-line interface for interacting with an TokenRingApp.
 */
export default class AgentCLI implements TokenRingService {
  name = "AgentCLI";
  description = "Command-line interface for interacting with agents";

  private readonly app: TokenRingApp;
  private readonly config: z.infer<typeof CLIConfigSchema>;
  private rl!: readline.Interface;

  /**
   * Creates a new AgentCLI instance.
   * @param app The TokenRingApp instance to manage agents.
   * @param config The configuration for the CLI.
   */
  constructor(app: TokenRingApp, config: z.infer<typeof CLIConfigSchema>) {
    this.app = app;
    this.config = config;
  }

  async run(): Promise<void> {
    for (let agent = await this.selectOrCreateAgent(); agent; agent = await this.selectOrCreateAgent()) {
      try {
        const agentLoop = new AgentLoop(agent, {
          availableCommands: [],
          rl: this.rl,
          config: this.config,
        });
        await agentLoop.run();
      } catch (error) {
        process.stderr.write(formatLogMessages(["Error while running agent loop", error as Error]));
        await setTimeout(1000);
      }
    }

    process.stdout.write(`\x1b[${process.stdout.rows || 24};0H`);
    process.stdout.write("Goodbye!");
    process.exit(0);
  }

  private async selectOrCreateAgent(): Promise<Agent | null> {
    return renderScreen(AgentSelectionScreen, {
      app: this.app,
      banner: this.config.bannerWide,
    });
  }
}
