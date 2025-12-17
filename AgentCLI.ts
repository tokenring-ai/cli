import { AgentCommandService } from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import { HumanInterfaceRequest,  } from "@tokenring-ai/agent/HumanInterfaceRequest";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import { AgentEventCursor, AgentEventState } from "@tokenring-ai/agent/state/agentEventState";
import { CommandHistoryState } from "@tokenring-ai/agent/state/commandHistoryState";
import TokenRingApp from "@tokenring-ai/app";
import { TokenRingService } from "@tokenring-ai/app/types";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import chalk, { ChalkInstance } from "chalk";
import * as process from "node:process";
import * as readline from "node:readline";
import { setTimeout } from "node:timers/promises";
import ora, { Ora } from "ora";
import { z } from "zod";
import {
  askForCommand,
  CancellationToken,
  ExitToken,
} from "./inputHandlers.js";
import { runOpenTUIScreen, runAgentSelectionScreen, runAskScreen, runConfirmationScreen, runTreeSelectionScreen, runWebPageScreen, runPasswordScreen } from "./src/OpenTUIBridge.js";
import AgentSelectionScreen from "./src/screens/AgentSelectionScreen.js";
import ConfirmationScreen from "./src/screens/ConfirmationScreen.js";
import PasswordScreen from "./src/screens/PasswordScreen.js";
import TreeSelectionScreen from "./src/screens/TreeSelectionScreen.js";
import WebPageScreen from "./src/screens/WebPageScreen.js";
import AskScreen from "./src/screens/AskScreen.js";
import { WebHostService } from "@tokenring-ai/web-host";

export const CLIConfigSchema = z.object({
  bannerNarrow: z.string(),
  bannerWide: z.string(),
  bannerCompact: z.string(),
  bannerColor: z.string().optional().default('cyan'),
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
        this.abortControllerStack[length - 1].abort();
      } else {
        process.stdout.write("Ctrl-C pressed. Exiting...\n");
        app.shutdown();
      }
    });
  }

  async run(): Promise<void> {
    this.agentManager = this.app.requireService(AgentManager);


    // Enable keypress events
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      readline.emitKeypressEvents(process.stdin);
    }

    for (let agent = await this.selectOrCreateAgent(); agent; agent = await this.selectOrCreateAgent()) {
      try {
        await this.runAgentLoop(agent);
      } catch (error) {
        process.stderr.write(formatLogMessages(["Error while running agent loop", error as Error]));
        await setTimeout(1000);
      }
    }

    process.stdout.write("Goodbye!");
    process.exit(0);
  }

  private async selectOrCreateAgent(): Promise<Agent | null> {
    return runAgentSelectionScreen(AgentSelectionScreen, {
      agentManager: this.agentManager,
      webHostService: this.app.getService(WebHostService),
      banner: this.config.bannerWide,
    });
  }

  private async runAgentLoop(agent: Agent): Promise<void> {
    let lastWriteHadNewline = true;
    let currentOutputType: string = "chat";
    let spinner: Ora | null = null;
    let spinnerRunning = false;
    let currentInputPromise: Promise<string | typeof ExitToken> | null = null
    let humanInputPromise: Promise<[id: string, reply: any]> | null = null;

    process.stdout.write('\x1b[2J\x1b[0f');
    const color = chalk[this.config.bannerColor as keyof ChalkInstance] as typeof chalk.cyan ?? chalk.cyan;
    process.stdout.write(color(this.config.bannerWide) + "\n");

    function ensureNewline() {
      if (!lastWriteHadNewline) {
        process.stdout.write("\n");
        lastWriteHadNewline = true;
      }
    }

    function printHorizontalLine() {
      ensureNewline();
      const lineChar = "─";
      const lineWidth = process.stdout.columns ? Math.floor(process.stdout.columns * 0.8) : 60;
      process.stdout.write(chalk.dim(lineChar.repeat(lineWidth)) + "\n");
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

    process.stdout.write(chalk.yellow("Type your questions and hit Enter. Commands start with /. Type /switch to change agents, /quit or /exit to return to agent selection.\n"));
    process.stdout.write(chalk.yellow("(Use ↑/↓ arrow keys to navigate command history, Ctrl-T for shortcuts, Esc to cancel)\n"));


    try {
      await this.withAbortSignal(async signal => {
        const eventCursor: AgentEventCursor = { position: 0 };

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
                process.stdout.write(color(event.message) + "\n");
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
                  process.stdout.write(chalk.red(event.message) + "\n");
                  lastWriteHadNewline = true;
                }
                break;
              case 'input.received':
                ensureNewline();
                process.stdout.write(chalk.cyan(`> ${event.message}`) + "\n");
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
                currentInputPromise = null;
                agent.handleInput({message});
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
        process.stdout.write("Agent session aborted.\n");
      } else {
        process.stderr.write(formatLogMessages(["Error while running agent loop", e as Error]));
      }
    }
    printHorizontalLine();
  }

  private async gatherInput(agent: Agent, signal: AbortSignal): Promise<string | typeof ExitToken> {
    const history = agent.getState(CommandHistoryState).commands;



// Move cursor to bottom of screen
    const rows = process.stdout.rows || 24;
    //process.stdout.write(`\x1b[${rows};0H`);

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
      process.stdout.write(chalk.yellow("[Input cancelled by user]") + "\n");
      return this.gatherInput(agent, signal);
    }

    return userInput;
  }

  private async handleHumanRequest(
    { request, id }: { request: HumanInterfaceRequest, id: string }, signal: AbortSignal): Promise<[id: string, reply: any]> {

    let response: any;

    switch (request.type) {
      case "askForText":
        response = await runAskScreen(AskScreen, { request });
        break;
      case "askForConfirmation":
        response = await runConfirmationScreen(ConfirmationScreen, {
          message: request.message,
          defaultValue: request.default,
          timeout: request.timeout
        });
        break;
      case "askForMultipleTreeSelection":
      case "askForSingleTreeSelection":
        response = await runTreeSelectionScreen(TreeSelectionScreen, { request });
        break;
      case "openWebPage":
        response = await runWebPageScreen(WebPageScreen, { request });
        break;
      case "askForPassword":
        response = await runPasswordScreen(PasswordScreen, { request });
        break;
      default:
        throw new Error(`Unknown HumanInterfaceRequest type: ${(request as any)?.type}`);
    }
    return [id, response];
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