import {select} from '@inquirer/prompts';
import {AgentCommandService} from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import {HumanInterfaceRequest, HumanInterfaceResponseFor,} from "@tokenring-ai/agent/HumanInterfaceRequest";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import {AgentEventCursor, AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import {CommandHistoryState} from "@tokenring-ai/agent/state/commandHistoryState";
import {formatAgentId} from "@tokenring-ai/agent/util/formatAgentId";
import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import chalk, {ChalkInstance} from "chalk";
import * as process from "node:process";
import * as readline from "node:readline";
import {setTimeout} from "node:timers/promises";
import ora, {Ora} from "ora";
import {z} from "zod";
import {CtrlTAction, ctrlTHandler} from "./ctrlTHandler.js";
import {
  askForCommand,
  askForConfirmation,
  askForMultipleTreeSelection,
  askForPassword,
  askForSingleTreeSelection,
  askForText,
  CancellationToken,
  ExitToken,
  openWebPage
} from "./inputHandlers.js";

export const CLIConfigSchema = z.object({
  banner: z.string().optional().default("Welcome to TokenRing CLI"),
  bannerColor: z.string().optional().default("cyan"),
})

/**
 * AgentCLI is a command-line interface for interacting with an TokenRingApp.
 */
export default class AgentCLI implements TokenRingService {
  name = "AgentCLI";
  description = "Command-line interface for interacting with agents";

  private shouldExit = false;
  private inputAbortController: AbortController | undefined;
  private humanInputAbortController: AbortController | undefined;
  private eventLoopDisconnectController: AbortController = new AbortController();

  private availableCommands: string[] = [];
  private currentAgent: Agent | null = null;
  private eventCursor: AgentEventCursor = { position: 0 };

  private readonly app: TokenRingApp;
  private agentManager!: AgentManager;
  private readonly config: z.infer<typeof CLIConfigSchema>;

  /**
   * Creates a new AgentCLI instance.
   * @param app The TokenRingApp instance to manage agents.
   * @param config The configuration for the CLI.
   */
  constructor(app: TokenRingApp, config: z.infer<typeof CLIConfigSchema>) {
    this.app = app;
    this.config = config;
  }

  async start(): Promise<void> {
    this.agentManager = this.app.requireService(AgentManager);

    if (this.config.banner) {
      const color = chalk[this.config.bannerColor as keyof ChalkInstance] as typeof chalk.cyan ?? chalk.cyan;
      console.log(color(this.config.banner));
    }

    process.on("SIGINT", () => {
      if (this.currentAgent) {
        this.currentAgent.requestAbort('User pressed Ctrl-C');
      } else if (this.inputAbortController) {
        this.inputAbortController.abort();
      } else if (this.eventLoopDisconnectController) {
        this.eventLoopDisconnectController.abort();
      } else {
        console.log("Ctrl-C pressed. Exiting...");
        process.exit(0);
      }
    });

    // Enable keypress events
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      readline.emitKeypressEvents(process.stdin);

      // Handle escape key to cancel operations
      process.stdin.on('keypress', (str, key) => {
        if (key && key.name === 'escape') {
          if (this.currentAgent) {
            this.currentAgent.requestAbort('User pressed escape');
          } else if (this.inputAbortController) {
            this.inputAbortController.abort();
          }
        }
      });
    }

    while (!this.shouldExit) {
      const agent = await this.selectOrCreateAgent();
      if (!agent) {
        this.shouldExit = true;
        break;
      }

      try {
        await this.runAgentLoop(agent);
      } catch (error) {
        console.error("Error while running agent loop", error);
        await setTimeout(1000);
      }
    }

    console.log("Goodbye!");
  }

  private async selectOrCreateAgent(): Promise<Agent | null> {
    const choices: { name: string; value: (() => Promise<Agent>) | null }[] = [];

    for (const agent of this.agentManager.getAgents()) {
      choices.push({
        value: async () => {
          console.log(`Connected to agent: ${agent.name}`);
          return agent;
        },
        name: `Connect to: ${agent.config.name} (${formatAgentId(agent.id)})`
      });
    }

    const agentConfigs = this.agentManager.getAgentConfigs();
    const sortedConfigs = Object.entries(agentConfigs).sort((a, b) => {
      if (a[1].type === b[1].type) return a[1].name.localeCompare(b[1].name);
      return a[1].type === 'interactive' ? -1 : 1;
    })

    for (const [type, agentConfig] of sortedConfigs) {
      choices.push({
        value: async () => {
          console.log(`Starting new agent: ${agentConfig.name}`);
          const agent = await this.agentManager.spawnAgent(type);
          console.log(`Agent ${agent.id} started`);
          return agent;
        },
        name: `${agentConfig.name} (${agentConfig.type === 'interactive' ? 'general purpose' : 'specialized'})`
      });
    }

    choices.push({name: "Exit", value: null});

    this.inputAbortController = new AbortController();

    const result = await select({
      message: "Select a running agent to connect to, or create a new one:",
      choices,
      loop: false,
    }, {signal: this.inputAbortController?.signal});

    this.inputAbortController = undefined;

    return result ? await result() : null;
  }

  private async runAgentLoop(agent: Agent): Promise<void> {
    this.currentAgent = agent;
    this.eventCursor = { position: 0 };

    const agentCommandService = agent.requireServiceByType(AgentCommandService);

    const commandNames = agentCommandService.getCommandNames().map(cmd => `/${cmd}`);
    this.availableCommands = [...commandNames, '/switch'];

    try {
      await this.mainLoop(agent);
    } finally {
      this.currentAgent = null;
      console.log("Agent session ended.");
    }
  }

  private async mainLoop(agent: Agent): Promise<void> {
    let lastWriteHadNewline = true;
    let currentOutputType: string = "chat";
    let spinner: Ora | null = null;
    let currentInputPromise: Promise<string | typeof ExitToken> | null = null
    let humanInputPromise: Promise<void> | null = null;

    function stopSpinner() {
      if (spinner) {
        spinner.stop();
        spinner = null;
      }
    }

    function ensureNewline() {
      if (!lastWriteHadNewline) {
        console.log();
        lastWriteHadNewline = true;
      }
    }

    function printHorizontalLine() {
      ensureNewline();
      const lineChar = "─";
      const lineWidth = process.stdout.columns ? Math.floor(process.stdout.columns * 0.8) : 60;
      console.log(chalk.dim(lineChar.repeat(lineWidth)));
      lastWriteHadNewline = true;
    }

    function writeOutput(content: string, type: "chat" | "reasoning") {
      stopSpinner();

      if (type !== currentOutputType) {
        printHorizontalLine();
        currentOutputType = type;
      }

      const color = type === "chat" ? chalk.green : chalk.yellow;
      process.stdout.write(color(content));
      lastWriteHadNewline = content.endsWith("\n");
    }

    console.log(chalk.yellow("Type your questions and hit Enter. Commands start with /. Type /switch to change agents, /quit or /exit to return to agent selection."));
    console.log(chalk.yellow("(Use ↑/↓ arrow keys to navigate command history, Ctrl-T for shortcuts, Esc to cancel)"));

    this.eventLoopDisconnectController = new AbortController();

    // Create a promise that resolves when the loop should exit
    return await new Promise<void>((resolve) => {
      // Subscribe to agent events
      const unsubscribe = agent.subscribeState(AgentEventState, async (state) => {
        if (state.busyWith) {
          if (!spinner) {
            spinner = ora(state.busyWith);
            spinner.start();
          }
        } else {
          if (spinner) {
            stopSpinner();
          }
        }

        if (state.idle && ! currentInputPromise) {
          this.inputAbortController = new AbortController();
          currentInputPromise = this.gatherInput(agent, this.inputAbortController.signal);

          currentInputPromise.then(message => {
              if (message === ExitToken) {
                resolve();
              } else {
                agent.handleInput({ message });
              }
            });
        } else if (!state.idle && currentInputPromise) {
          this.inputAbortController?.abort();
          currentInputPromise = null;
          this.inputAbortController = undefined;
        }

        if (state.waitingOn && ! humanInputPromise) {
          this.humanInputAbortController = new AbortController();
          this.handleHumanRequest(state.waitingOn.data, agent, this.humanInputAbortController.signal);
        } else if (!state.waitingOn && humanInputPromise) {
          this.humanInputAbortController?.abort();
        }

        for (const event of state.yieldEventsByCursor(this.eventCursor)) {
          switch (event.type) {
            case 'output.chat':
              writeOutput(event.data.content, "chat");
              break;
            case 'output.reasoning':
              writeOutput(event.data.content, "reasoning");
              break;
            case 'output.system': {
              stopSpinner();
              ensureNewline();
              const color = event.data.level === 'error' ? chalk.red :
                event.data.level === 'warning' ? chalk.yellow : chalk.blue;
              console.log(color(event.data.message));
              lastWriteHadNewline = true;
              break;
            }

            case 'input.received':
              ensureNewline();
              console.log(chalk.cyan(`> ${event.data.message}`));
              lastWriteHadNewline = true;
              break;
            case 'input.handled':
              if (event.data.status === 'error') {
                console.log(chalk.red(event.data.message));
              } else if (event.data.status === 'cancelled') {
                console.log(chalk.yellow(event.data.message));
              } else {
                console.log(chalk.blue(event.data.message));
              }
              return;
          }
        }
      });
      this.eventLoopDisconnectController.signal.addEventListener('abort', () => {
        unsubscribe();
        resolve();
      });
    });
  }

  private async gatherInput(agent: Agent, signal: AbortSignal): Promise<string | typeof ExitToken> {
    const history = agent.getState(CommandHistoryState).commands;

    const userInput = await askForCommand({
      autoCompletion: this.availableCommands,
      history
    }, signal);

    if (userInput === '/switch' || userInput === ExitToken) {
      agent.systemMessage("Returning to agent selection.", "info");
      return ExitToken;
    }

    if (userInput === CancellationToken) {
      agent.systemMessage("[Input cancelled by user]", 'warning');
      return this.gatherInput(agent, signal);
    }

    return userInput;
  }

  private async handleHumanRequest(
    {request, id}: { request: HumanInterfaceRequest, id: string }, agent: Agent, signal: AbortSignal) {
    let result: HumanInterfaceResponseFor<typeof request.type>;

    switch (request.type) {
      case "askForText":
        result = await askForText(request, signal);
        break;
      case "askForConfirmation":
        result = await askForConfirmation(request, signal);
        break;
      case "askForMultipleTreeSelection":
        result = await askForMultipleTreeSelection(request, signal);
        break;
      case "askForSingleTreeSelection":
        result = await askForSingleTreeSelection(request, signal);
        break;
      case "openWebPage":
        result = await openWebPage(request);
        break;
      case "askForPassword":
        result = await askForPassword(request, signal);
        break;
      default:
        throw new Error(`Unknown HumanInterfaceRequest type: ${(request as any)?.type}`);
    }
    agent.sendHumanResponse(id, result);
  }
}