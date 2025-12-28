import {AgentCommandService} from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import {AgentEventEnvelope} from "@tokenring-ai/agent/AgentEvents";
import {HumanInterfaceRequest,} from "@tokenring-ai/agent/HumanInterfaceRequest";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import {AgentEventCursor, AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import {CommandHistoryState} from "@tokenring-ai/agent/state/commandHistoryState";
import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import {createAsciiTable} from "@tokenring-ai/utility/string/asciiTable";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import chalk from "chalk";
import process from "node:process";
import readline from "node:readline";
import {setTimeout} from "node:timers/promises";
import {z} from "zod";
import {commandPrompt, PartialInputError} from "./commandPrompt.ts";
import {SimpleSpinner} from "./SimpleSpinnter.ts";
import {renderScreen} from "./src/runTUIScreen.js";
import AgentSelectionScreen from "./src/screens/AgentSelectionScreen.js";
import AskScreen from "./src/screens/AskScreen.js";
import ConfirmationScreen from "./src/screens/ConfirmationScreen.js";
import PasswordScreen from "./src/screens/PasswordScreen.js";
import TreeSelectionScreen from "./src/screens/TreeSelectionScreen.js";
import WebPageScreen from "./src/screens/WebPageScreen.js";
import FormScreen from "./src/screens/FormScreen.js";
import {theme} from "./src/theme.js";

export const CLIConfigSchema = z.object({
  bannerNarrow: z.string(),
  bannerWide: z.string(),
  bannerCompact: z.string(),
})

const outputColors = {
  "output.chat": chalk.hex(theme.chatOutputText),
  "output.reasoning": chalk.hex(theme.chatReasoningText),
  "output.info": chalk.hex(theme.chatSystemInfoMessage),
  "output.warning": chalk.hex(theme.chatSystemWarningMessage),
  "output.error": chalk.hex(theme.chatSystemErrorMessage),
}
;
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
      app: this.app,
      banner: this.config.bannerWide,
    });
  }

  private async runAgentLoop(agent: Agent): Promise<void> {
    let lastWriteHadNewline = true;
    let currentOutputType: string = "chat";
    let spinner: SimpleSpinner | null = null;
    let spinnerRunning = false;
    let currentInputPromise: Promise<void> | null = null
    let humanInputPromise: Promise<[id: string, reply: any]> | null = null;
    const eventCursor: AgentEventCursor = { position: 0 };

    const ensureNewline = () => {
      if (!lastWriteHadNewline) {
        process.stdout.write("\n");
        lastWriteHadNewline = true;
      }
    };

    const printHorizontalLine = (message: string) => {
      const lineChar = "─";
      const lineWidth = process.stdout.columns ? Math.floor(process.stdout.columns * 0.8) : 60;
      process.stdout.write(
        dividerColor(
          lineChar.repeat(4)
          + " " + message + " " +
          lineChar.repeat(lineWidth - 6 - message.length)
        ) + "\n"
      );
      lastWriteHadNewline = true;
    };

    const renderEvent = (event: AgentEventEnvelope) => {
      switch (event.type) {
        case 'agent.created':
          process.stdout.write(outputColors["output.info"](`${agent.config.name} created\n`));
          break;
        case 'output.chat':
        case 'output.reasoning':
        case 'output.info':
        case 'output.warning':
        case 'output.error':
          if (spinnerRunning) {
            spinner!.stop();
            spinnerRunning = false;
          }
          if (event.type !== currentOutputType) {
            ensureNewline();
            if (event.type === 'output.chat') {
              printHorizontalLine("Chat");
            } else if (event.type === 'output.reasoning') {
              printHorizontalLine("Reasoning");
            }
            currentOutputType = event.type;
          }

          process.stdout.write(outputColors[event.type](event.message));
          lastWriteHadNewline = event.message.endsWith("\n");
          break;
        case 'input.handled':
          if (spinnerRunning) {
            spinner!.stop();
            spinnerRunning = false;
          }
          ensureNewline();
          if (event.status === 'cancelled' || event.status === 'error') {
            process.stdout.write(outputColors['output.error'](event.message));
            lastWriteHadNewline = true;
          }
          break;
        case 'input.received':
          ensureNewline();
          process.stdout.write(previousInputColor(createAsciiTable(
            [
              ['user >', event.message]
            ], {
            columnWidths: [7, process.stdout.columns ? process.stdout.columns - 7 : 65],
            padding: 0,
            grid: false
          })));

          lastWriteHadNewline = true;
          break;
      }
    };

    const redraw = (state: AgentEventState) => {
      process.stdout.write('\x1b[2J\x1b[0f');
      process.stdout.write(bannerColor(this.config.bannerWide) + "\n");
      process.stdout.write(outputColors['output.chat'](
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



    //process.stdout.write('\x1b[2J\x1b[0f');
    //process.stdout.write(bannerColor(this.config.bannerWide) + "\n");

    const agentCommandService = agent.requireServiceByType(AgentCommandService);

    const availableCommands = agentCommandService.getCommandNames().map(cmd => `/${cmd}`);
    availableCommands.push('/switch');

    /*process.stdout.write(outputColors['output.chat'](
      "Type your questions and hit Enter. Commands start with /. Type /switch to change agents, /quit or /exit to return to agent selection.\n" +
      "(Use ↑/↓ arrow keys to navigate command history, Ctrl-T for shortcuts, Esc to cancel)\n\n"
    ));*/

    redraw(agent.getState(AgentEventState));


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

            ensureNewline();

            const createInputPromise = () => {
              const abortController = new AbortController();
              this.abortControllerStack.push(abortController);

              return this.gatherInput(agent, abortController.signal)
                .finally(() => {
                  this.abortControllerStack.pop()!.abort();
                }).then(message => {
                  currentInputPromise = null;
                  this.ensureSigintHandlers();
                  agent.handleInput({message});
                }).catch(err => {
                  currentInputPromise = null;
                  if (err instanceof PartialInputError) {
                    if (err.buffer.trim() === "") {
                      // Empty prompt + Ctrl-C = Switch agents
                      this.abortControllerStack[this.abortControllerStack.length - 1].abort();
                    } else {
                      // Text in prompt - restart input loop
                      currentInputPromise = createInputPromise();
                    }
                  }
                });
            };

            currentInputPromise = createInputPromise();
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
        spinner?.stop();
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        process.stdout.write("Agent session aborted.\n");
      } else {
        process.stderr.write(formatLogMessages(["Error while running agent loop", e as Error]));
      }
    }
    ensureNewline();
    //printHorizontalLine();
  }

  private async gatherInput(agent: Agent, signal: AbortSignal): Promise<string> {
    const history = agent.getState(CommandHistoryState).commands;

    this.ensureSigintHandlers();

    return await commandPrompt(
      {
        rl: this.rl!,
        prefix: chalk.yellowBright("user"),
        message: chalk.yellowBright(">"),
        autoCompletion: this.availableCommands,
        history,
        signal,
      }
    );
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
      case "askForForm":
        response = await renderScreen(FormScreen, { request });
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