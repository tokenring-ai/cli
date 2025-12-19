import {AgentCommandService} from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import {AgentEventEnvelope} from "@tokenring-ai/agent/AgentEvents";
import {HumanInterfaceRequest,} from "@tokenring-ai/agent/HumanInterfaceRequest";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import {AgentEventCursor, AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import {CommandHistoryState} from "@tokenring-ai/agent/state/commandHistoryState";
import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {WebHostService} from "@tokenring-ai/web-host";
import chalk from "chalk";
import process from "node:process";
import readline from "node:readline";
import {setTimeout} from "node:timers/promises";
import {z} from "zod";
import commandPrompt from "@tokenring-ai/inquirer-command-prompt";
import {SimpleSpinner} from "./SimpleSpinnter.ts";
import {renderScreen} from "./src/runTUIScreen.js";
import AgentSelectionScreen from "./src/screens/AgentSelectionScreen.js";
import AskScreen from "./src/screens/AskScreen.js";
import ConfirmationScreen from "./src/screens/ConfirmationScreen.js";
import PasswordScreen from "./src/screens/PasswordScreen.js";
import TreeSelectionScreen from "./src/screens/TreeSelectionScreen.js";
import WebPageScreen from "./src/screens/WebPageScreen.js";
import {theme} from "./src/theme.js";

export const CLIConfigSchema = z.object({
  bannerNarrow: z.string(),
  bannerWide: z.string(),
  bannerCompact: z.string(),
})


const chatOutputColor = chalk.hex(theme.chatOutputText);
const reasoningColor = chalk.hex(theme.chatReasoningText);
const systemInfoColor = chalk.hex(theme.chatSystemInfoMessage);
const systemErrorColor = chalk.hex(theme.chatSystemErrorMessage);
const systemWarningColor = chalk.hex(theme.chatSystemWarningMessage);
const previousInputColor = chalk.hex(theme.chatPreviousInput);
const dividerColor = chalk.hex(theme.chatDivider);
const bannerColor = chalk.hex(theme.agentSelectionBanner);


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
  private rl: readline.Interface | null = null;

  /**
   * Creates a new AgentCLI instance.
   * @param app The TokenRingApp instance to manage agents.
   * @param config The configuration for the CLI.
   */
  constructor(app: TokenRingApp, config: z.infer<typeof CLIConfigSchema>) {
    this.app = app;
    this.config = config;
  }

  ensureSigintHandlers() {
    this.rl?.close()
    process.removeAllListeners('SIGINT');
    process.stdin.removeAllListeners('keypress');

    process.stdin.setRawMode(true); // Switch to raw mode to capture Ctrl+C manually

    this.rl = readline.createInterface(process.stdin, process.stdout)

    this.rl.on('SIGINT', () => {
      if (this.abortControllerStack.length > 0) {
        this.abortControllerStack[this.abortControllerStack.length - 1].abort();
      } else {
        process.stdout.write("Ctrl-C pressed. Exiting...\n");
        this.app.shutdown();
      }
    });
  }
  async run(): Promise<void> {
    this.agentManager = this.app.requireService(AgentManager);

    for (let agent = await this.selectOrCreateAgent(); agent; agent = await this.selectOrCreateAgent()) {
      this.ensureSigintHandlers()
      try {
        await this.runAgentLoop(agent);
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
      agentManager: this.agentManager,
      webHostService: this.app.getService(WebHostService),
      banner: this.config.bannerWide,
    });
  }

  private async runAgentLoop(agent: Agent): Promise<void> {
    let lastWriteHadNewline = true;
    let currentOutputType: string = "chat";
    let spinner: SimpleSpinner | null = null;
    let spinnerRunning = false;
    let currentInputPromise: Promise<string> | null = null
    let humanInputPromise: Promise<[id: string, reply: any]> | null = null;
    const eventCursor: AgentEventCursor = { position: 0 };

    const ensureNewline = () => {
      if (!lastWriteHadNewline) {
        process.stdout.write("\n");
        lastWriteHadNewline = true;
      }
    };

    const printHorizontalLine = () => {
      ensureNewline();
      const lineChar = "─";
      const lineWidth = process.stdout.columns ? Math.floor(process.stdout.columns * 0.8) : 60;
      process.stdout.write(dividerColor(lineChar.repeat(lineWidth)) + "\n");
      lastWriteHadNewline = true;
    };

    const writeOutput = (content: string, type: "chat" | "reasoning") => {
      if (type !== currentOutputType) {
        printHorizontalLine();
        currentOutputType = type;
      }

      const color = type === "chat" ? chatOutputColor : reasoningColor;
      process.stdout.write(color(content));
      lastWriteHadNewline = content.endsWith("\n");
    };

    const renderEvent = (event: AgentEventEnvelope) => {
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
          const color = event.level === 'error' ? systemErrorColor :
            event.level === 'warning' ? systemWarningColor : systemInfoColor;
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
            process.stdout.write(systemErrorColor(event.message) + "\n");
            lastWriteHadNewline = true;
          }
          break;
        case 'input.received':
          ensureNewline();
          process.stdout.write(previousInputColor(`user > ${event.message}`) + "\n");
          lastWriteHadNewline = true;
          break;
      }
    };

    const redraw = (state: AgentEventState) => {
      process.stdout.write('\x1b[2J\x1b[0f');
      process.stdout.write(bannerColor(this.config.bannerWide) + "\n");
      process.stdout.write(chatOutputColor(
        "Type your questions and hit Enter. Commands start with /. Type /switch to change agents, /quit or /exit to return to agent selection.\n" +
        "(Use ↑/↓ arrow keys to navigate command history, Ctrl-T for shortcuts, Esc to cancel)\n\n"
      ));
      
      lastWriteHadNewline = true;
      currentOutputType = "chat";
      
      for (const event of state.yieldEventsByCursor({ position: 0 })) {
        renderEvent(event);
      }
      
      eventCursor.position = state.events.length;
    };

    process.stdout.write('\x1b[2J\x1b[0f');
    process.stdout.write(bannerColor(this.config.bannerWide) + "\n");

    const agentCommandService = agent.requireServiceByType(AgentCommandService);

    const availableCommands = agentCommandService.getCommandNames().map(cmd => `/${cmd}`);
    availableCommands.push('/switch');

    process.stdout.write(chatOutputColor(
      "Type your questions and hit Enter. Commands start with /. Type /switch to change agents, /quit or /exit to return to agent selection.\n" +
      "(Use ↑/↓ arrow keys to navigate command history, Ctrl-T for shortcuts, Esc to cancel)\n\n"
    ));


    try {
      await this.withAbortSignal(async signal => {
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
            //process.stdin.on('keypress', cancelAgentOnEscapeKey);

            this.abortControllerStack[this.abortControllerStack.length - 1].abort();
          }

          if (!state.waitingOn && humanInputPromise) {
            this.abortControllerStack[this.abortControllerStack.length - 1].abort();
          }

          for (const event of state.yieldEventsByCursor(eventCursor)) {
            renderEvent(event);
          }

          /**
           * The pattern here is to start any new stuff after the event loop has finished.
           * If any of this stuff needs to be cancelled, it will be cancelled before the event loop starts.
           */

          if (state.busyWith && !spinner) {
            spinner = new SimpleSpinner(state.busyWith, theme.chatSpinner);
            spinnerRunning = true;
            spinner.start();
          }

          if (state.idle && !currentInputPromise) {
            //process.stdin.off('keypress', cancelAgentOnEscapeKey);

            const abortController = new AbortController();
            this.abortControllerStack.push(abortController);

            ensureNewline();

            currentInputPromise = this.gatherInput(agent, abortController.signal);
            currentInputPromise.finally(() => {
              this.abortControllerStack.pop()!.abort();
            }).then(message => {
              if (message === "/switch") {
                this.abortControllerStack[this.abortControllerStack.length - 1].abort();
              } else {
                currentInputPromise = null;
                this.ensureSigintHandlers();
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
              redraw(state);
              this.ensureSigintHandlers();
              agent.sendHumanResponse(id, response);
              humanInputPromise = null;
            });
          }
        }
        spinner!.stop();
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

  private async gatherInput(agent: Agent, signal: AbortSignal): Promise<string> {
    const history = agent.getState(CommandHistoryState).commands;

    let emptyPrompt = true;

    try {
      const userInput = await commandPrompt(
        {
          theme: {
            prefix: chalk.yellowBright("user"),
          },
          transformer: (input: string) => {
            if (input.length > 0) {
              emptyPrompt = false;
            }
            return input;
          },
          message: chalk.yellowBright(">"),
          autoCompletion: this.availableCommands,
          history,
        },
        {
          signal,
        },
      );

      process.stdout.write('\x1b[2K'); // Clears the entire current line
      process.stdout.write('\x1b[0G'); // Moves the cursor to the beginning of the line
      process.stdout.write('\x1b[1A'); // Moves the cursor up one line
      process.stdout.write('\x1b[2K'); // Clears the entire current line

      return userInput;
    } catch (e) {
      if (emptyPrompt) return "/switch";
    }

    /**
     * Input was cancelled with text in the input, so we restart gathering input
     */
    process.stdout.write(systemWarningColor("[Input cancelled by user]") + "\n");
    return this.gatherInput(agent, signal);
  }

  private async handleHumanRequest(
    { request, id }: { request: HumanInterfaceRequest, id: string }, signal: AbortSignal): Promise<[id: string, reply: any]> {

    let response: any;

    switch (request.type) {
      case "askForText":
        response = await renderScreen(AskScreen, { request });
        break;
      case "askForConfirmation":
        response = await renderScreen(ConfirmationScreen, {
          message: request.message,
          defaultValue: request.default,
          timeout: request.timeout
        });
        break;
      case "askForMultipleTreeSelection":
      case "askForSingleTreeSelection":
        response = await renderScreen(TreeSelectionScreen, { request });
        break;
      case "openWebPage":
        response = await renderScreen(WebPageScreen, { request });
        break;
      case "askForPassword":
        response = await renderScreen(PasswordScreen, { request });
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