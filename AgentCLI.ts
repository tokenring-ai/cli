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

  private abortControllerStack: Array<AbortController> = [];
  private availableCommands: string[] = [];

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
    process.on("SIGINT", () => {
      if (this.abortControllerStack.length > 0) {
        this.abortControllerStack[length -1].abort();
      } else {
        console.log("Ctrl-C pressed. Exiting...");
        process.exit(0);
      }
    });
  }

  async start(): Promise<void> {
    this.agentManager = this.app.requireService(AgentManager);

    if (this.config.banner) {
      const color = chalk[this.config.bannerColor as keyof ChalkInstance] as typeof chalk.cyan ?? chalk.cyan;
      console.log(color(this.config.banner));
    }

    // Enable keypress events
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      readline.emitKeypressEvents(process.stdin);
    }

    for (let agent = await this.selectOrCreateAgent(); agent; agent = await this.selectOrCreateAgent()) {
      try {
        await this.runAgentLoop(agent);
      } catch (error) {
        console.error("Error while running agent loop", error);
        await setTimeout(1000);
      }
    }

    console.log("Goodbye!");
    process.exit(0);
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

    for (const [agentType, agentConfig] of sortedConfigs) {
      choices.push({
        value: async () => {
          console.log(`Starting new agent: ${agentConfig.name}`);
          const agent = await this.agentManager.spawnAgent({agentType, headless: false});
          console.log(`Agent ${agent.id} started`);
          return agent;
        },
        name: `${agentConfig.name} (${agentConfig.type === 'interactive' ? 'general purpose' : 'specialized'})`
      });
    }

    choices.push({name: "Exit", value: null});


    try {
      const result = await this.withAbortSignal(signal =>
        select({
          message: "Select a running agent to connect to, or create a new one:",
          choices,
          loop: false,
        }, {signal})
      );

      return result ? await result() : null;
    } catch (e) {
      return null;
    }
  }

  private async runAgentLoop(agent: Agent): Promise<void> {
    let lastWriteHadNewline = true;
    let currentOutputType: string = "chat";
    let spinner: Ora | null = null;
    let spinnerRunning = false;
    let currentInputPromise: Promise<string | typeof ExitToken> | null = null
    let humanInputPromise: Promise<[id: string, reply: any]> | null = null;

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
      if (type !== currentOutputType) {
        printHorizontalLine();
        currentOutputType = type;
      }

      const color = type === "chat" ? chalk.green : chalk.yellow;
      process.stdout.write(color(content));
      lastWriteHadNewline = content.endsWith("\n");
    }

    const agentCommandService = agent.requireServiceByType(AgentCommandService);

    const availableCommands = agentCommandService.getCommandNames().map(cmd => `/${cmd}`);
    availableCommands.push('/switch');

    console.log(chalk.yellow("Type your questions and hit Enter. Commands start with /. Type /switch to change agents, /quit or /exit to return to agent selection."));
    console.log(chalk.yellow("(Use ↑/↓ arrow keys to navigate command history, Ctrl-T for shortcuts, Esc to cancel)"));


    try {
      await this.withAbortSignal(async signal => {
        const eventCursor: AgentEventCursor = {position: 0};

        function cancelAgentOnEscapeKey(str: any, key: any) {
          if (key && key.name === 'escape') {
            agent.requestAbort('User pressed escape');
          }
        }

        for await (const state of agent.subscribeStateAsync(AgentEventState, signal)) {
          if (signal.aborted) break;

          /**
           * The pattern here is to cancel any currently running stuff before outputting content in the event loop,
           * and to schedule any new stuff to run after the event loop has finished.
           */

          if (!state.busyWith && spinner) {
            if (spinnerRunning) {
              spinner.stop();
              spinnerRunning = false;
            }
            spinner = null;
          }

          if (!state.idle && currentInputPromise) {
            process.stdin.on('keypress', cancelAgentOnEscapeKey);

            this.abortControllerStack[this.abortControllerStack.length - 1].abort();
          }

          if (!state.waitingOn && humanInputPromise) {
            this.abortControllerStack[this.abortControllerStack.length - 1].abort();
          }

          for (const event of state.yieldEventsByCursor(eventCursor)) {
            switch (event.type) {
              case 'output.chat':
                if (spinnerRunning) {
                  spinner!.stop();
                  spinnerRunning = false;
                }

                writeOutput(event.content, "chat");
                break;
              case 'output.reasoning':
                if (spinnerRunning) {
                  spinner!.stop();
                  spinnerRunning = false;
                }

                writeOutput(event.content, "reasoning");
                break;
              case 'output.system': {
                if (spinnerRunning) {
                  spinner!.stop();
                  spinnerRunning = false;
                }

                ensureNewline();
                const color = event.level === 'error' ? chalk.red :
                  event.level === 'warning' ? chalk.yellow : chalk.blue;
                console.log(color(event.message));
                lastWriteHadNewline = true;
                break;
              }
              case 'input.handled':
                if (spinnerRunning) {
                  spinner!.stop();
                  spinnerRunning = false;
                }

                if (event.status === 'cancelled' || event.status === 'error') {
                  ensureNewline();
                  console.log(chalk.red(event.message));
                  lastWriteHadNewline = true;
                }
                break;
              case 'input.received':
                ensureNewline();
                console.log(chalk.cyan(`> ${event.message}`));
                lastWriteHadNewline = true;
                break;
            }
          }

          /**
           * The pattern here is to start any new stuff after the event loop has finished.
           * If any of this stuff needs to be cancelled, it will be cancelled before the event loop starts.
           */

          if (state.busyWith && !spinner) {
            spinner = ora(state.busyWith);
            spinnerRunning = true;
            spinner.start();
          }

          if (state.idle && !currentInputPromise) {
            process.stdin.off('keypress', cancelAgentOnEscapeKey);

            const abortController = new AbortController();
            this.abortControllerStack.push(abortController);

            ensureNewline();

            currentInputPromise = this.gatherInput(agent, abortController.signal);
            currentInputPromise.finally(() => {
              this.abortControllerStack.pop()!.abort();
            }).then(message => {
              if (message === ExitToken) {
                this.abortControllerStack[this.abortControllerStack.length - 1].abort();
              } else {
                agent.handleInput({message});
                currentInputPromise = null;
              }
            });
          }

          if (state.waitingOn && !humanInputPromise) {
            const abortController = new AbortController();
            this.abortControllerStack.push(abortController);

            humanInputPromise = this.handleHumanRequest(state.waitingOn, abortController.signal)
            humanInputPromise.finally(() => {
                this.abortControllerStack.pop()!.abort();
              }).then(([id, response]) => {
              agent.sendHumanResponse(id, response);
              humanInputPromise = null;
            });
          }
        }
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        console.log("Agent session aborted.");
      } else {
        console.error("Error while running agent loop", e);
      }
    }
    printHorizontalLine();
  }

  private async gatherInput(agent: Agent, signal: AbortSignal): Promise<string | typeof ExitToken> {
    const history = agent.getState(CommandHistoryState).commands;

    const userInput = await askForCommand({
      autoCompletion: this.availableCommands,
      history
    }, signal);


    process.stdout.write('\x1b[2K'); // Clears the entire current line
    process.stdout.write('\x1b[0G'); // Moves the cursor to the beginning of the line
    process.stdout.write('\x1b[1A'); // Moves the cursor up one line
    process.stdout.write('\x1b[2K'); // Clears the entire current line

    if (userInput === '/switch' || userInput === ExitToken) {
      return ExitToken;
    }

    if (userInput === CancellationToken) {
      console.log(chalk.yellow("[Input cancelled by user]", ));
      return this.gatherInput(agent, signal);
    }

    return userInput;
  }

  private async handleHumanRequest(
    {request, id}: { request: HumanInterfaceRequest, id: string },signal: AbortSignal) : Promise<[id: string, reply: any]> {

    switch (request.type) {
      case "askForText":
        return [id, await askForText(request, signal)];
      case "askForConfirmation":
        return [id, await askForConfirmation(request, signal)];
      case "askForMultipleTreeSelection":
        return [id, await askForMultipleTreeSelection(request, signal)];
      case "askForSingleTreeSelection":
        return [id, await askForSingleTreeSelection(request, signal)];
      case "openWebPage":
        return [id, await openWebPage(request)];
      case "askForPassword":
        return [id, await askForPassword(request, signal)];
      default:
        throw new Error(`Unknown HumanInterfaceRequest type: ${(request as any)?.type}`);
    }
  }

  private async withAbortSignal<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const abortController = new AbortController();
    this.abortControllerStack.push(abortController);

    try {
      return await fn(abortController.signal);
    } finally {
      abortController.abort();
      this.abortControllerStack.pop();
    }
  }
}