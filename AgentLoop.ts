import {AgentCommandService} from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import {AgentEventEnvelope, type ParsedQuestionRequest, QuestionResponseSchema} from "@tokenring-ai/agent/AgentEvents";
import {AgentEventCursor, AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import {AgentExecutionState} from "@tokenring-ai/agent/state/agentExecutionState";
import {CommandHistoryState} from "@tokenring-ai/agent/state/commandHistoryState";
import {TokenRingService} from "@tokenring-ai/app/types";
import {createAsciiTable} from "@tokenring-ai/utility/string/asciiTable";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import chalk from "chalk";
import process from "node:process";
import readline from "node:readline";
import {z} from "zod";
import {commandPrompt, PartialInputError} from "./commandPrompt.ts";
import {renderScreen} from "./renderScreen.tsx";
import type {CLIConfigSchema} from "./schema.ts";
import QuestionInputScreen from "./screens/QuestionInputScreen.tsx";
import {SimpleSpinner} from "./SimpleSpinner.ts";
import {theme} from "./theme.ts";
import applyMarkdownStyles from "./utility/applyMarkdownStyles.ts";

const outputColors = {
  "output.chat": chalk.hex(theme.chatOutputText),
  "output.reasoning": chalk.hex(theme.chatReasoningText),
  "output.info": chalk.hex(theme.chatSystemInfoMessage),
  "output.warning": chalk.hex(theme.chatSystemWarningMessage),
  "output.error": chalk.hex(theme.chatSystemErrorMessage),
};
const previousInputColor = chalk.hex(theme.chatPreviousInput);
const dividerColor = chalk.hex(theme.chatDivider);
const bannerColor = chalk.hex(theme.agentSelectionBanner);

export interface AgentLoopOptions {
  availableCommands: string[];
  rl: readline.Interface;
  config: z.infer<typeof CLIConfigSchema>;
}

export default class AgentLoop implements TokenRingService {
  name = "AgentLoop";
  description = "Agent execution loop handler";

  // Hoisted variables from runAgentLoop
  private abortControllerStack: Array<AbortController> = [];
  private lastWriteHadNewline = true;
  private currentOutputType: string = "chat";
  private spinner: SimpleSpinner | null = null;
  private spinnerRunning = false;
  private currentInputPromise: Promise<void> | null = null;
  private humanInputPromise: Promise<void> | null = null;
  private eventCursor: AgentEventCursor = { position: 0 };
  private currentLine: string = "";

  private readonly agent: Agent;
  private readonly options: AgentLoopOptions;

  constructor(agent: Agent, options: AgentLoopOptions) {
    this.agent = agent;
    this.options = options;
  }

  async run(): Promise<void> {
    const ensureNewline = () => {
      if (!this.lastWriteHadNewline) {
        process.stdout.write("\n");
        this.lastWriteHadNewline = true;
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
      this.lastWriteHadNewline = true;
    };

    const turnOffSpinner = () => {
      if (this.spinnerRunning) {
        this.spinnerRunning = false;
        this.spinner?.stop();
      }
    }

    const renderEvent = (event: AgentEventEnvelope) => {
      // noinspection FallThroughInSwitchStatementJS
      switch (event.type) {
        case 'agent.created':
          turnOffSpinner();
          ensureNewline();
          process.stdout.write(outputColors["output.info"](`${this.agent.config.name} created\n`));
          this.currentLine = "";
          break;
        case 'agent.stopped':
          turnOffSpinner();
          ensureNewline();
          process.stdout.write(outputColors["output.info"](`Agent stopped\n`));
          this.currentLine = "";
          break;
        case 'reset':
          turnOffSpinner();
          ensureNewline();
          process.stdout.write(outputColors["output.info"](`Agent reset: ${event.what.join(', ')}\n`));
          this.currentLine = "";
          break;
        case 'abort':
          turnOffSpinner();
          ensureNewline();
          process.stdout.write(outputColors["output.info"](`Agent aborted: ${event.reason}\n`));
          this.currentLine = "";
          break;
        case 'output.artifact':
          turnOffSpinner();
          ensureNewline();
          process.stdout.write(outputColors["output.info"](`Agent outputed artifact: ${event.name}\n`));
          this.currentLine = "";
          break;
        case 'output.warning':
        case 'output.error':
        case 'output.info':
          if (! event.message.endsWith("\n")) {
            event = {
              ...event,
              message: event.message + "\n"
            }
          }
        case 'output.chat':
        case 'output.reasoning':
          if (this.spinnerRunning) {
            this.spinner!.stop();
            this.spinnerRunning = false;
          }

          if (event.type !== this.currentOutputType) {
            ensureNewline();
            if (event.type === 'output.chat') {
              printHorizontalLine("Chat");
            } else if (event.type === 'output.reasoning') {
              printHorizontalLine("Reasoning");
            }
            this.currentOutputType = event.type;
          }

          let outputMessage = event.message;

          for (let i = 0; i < outputMessage.length; i++) {
            const char = outputMessage[i];
            if (char === '\n') {
              const lineToOutput = applyMarkdownStyles(this.currentLine);
              process.stdout.write(outputColors[event.type as keyof typeof outputColors](lineToOutput + "\n"));
              this.currentLine = "";
            } else {
              this.currentLine += char;
            }
          }

          this.lastWriteHadNewline = event.message.endsWith("\n");
          break;
        case 'input.handled':
          if (this.spinnerRunning) {
            this.spinner!.stop();
            this.spinnerRunning = false;
          }
          ensureNewline();
          if (event.status === 'cancelled' || event.status === 'error') {
            process.stdout.write(outputColors['output.error'](event.message));
            this.lastWriteHadNewline = true;
          }
          this.currentLine = "";
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

          this.lastWriteHadNewline = true;
          this.currentLine = "";
          break;
        case 'question.request':
        case 'question.response':
          break;

        default:
          // noinspection JSUnusedLocalSymbols
          const foo: never = event;
      }
    };

    const redraw = (state: AgentEventState) => {
      // Clear screen, move to top-left, and wipe scrollback buffer
      process.stdout.write('\x1b[2J\x1b[0f\x1b[3J');
      process.stdout.write(bannerColor(this.options.config.chatBanner) + "\n");
      process.stdout.write(outputColors['output.chat'](
        "Type your questions and hit Enter. Commands start with /\n" +
        "Use ↑/↓ for command history, Esc to cancel your current activity\n" +
        "Ctrl-C to return to the agent selection screen\n\n"
      ));

      this.lastWriteHadNewline = true;
      this.currentOutputType = "chat";

      for (const event of state.yieldEventsByCursor({ position: 0 })) {
        renderEvent(event);
      }

      this.eventCursor.position = state.events.length;
      process.stdout.write("\n");
    };

    const agentCommandService = this.agent.requireServiceByType(AgentCommandService);

    const availableCommands = agentCommandService.getCommandNames().map(cmd => `/${cmd}`);
    availableCommands.push('/switch');

    redraw(this.agent.getState(AgentEventState));

    const resizeHandler = () => {
      redraw(this.agent.getState(AgentEventState));
    };

    process.stdout.on('resize', resizeHandler);

    try {
      await this.withAbortSignal(async signal => {
        const eventStateSubscription = this.agent.subscribeStateAsync(AgentEventState, signal);
        const execStateSubscription = this.agent.subscribeStateAsync(AgentExecutionState, signal);

        const processEvents = async () => {
          for await (const eventState of eventStateSubscription) {
            if (signal.aborted) break;

            if (this.currentInputPromise) await this.currentInputPromise;
            if (this.humanInputPromise) await this.humanInputPromise;

            for (const event of eventState.yieldEventsByCursor(this.eventCursor)) {
              renderEvent(event);
            }
          }
        };

        const processExecution = async () => {
          for await (const execState of execStateSubscription) {
            if (signal.aborted) break;

            if (!execState.busyWith && this.spinner) {
              if (this.spinnerRunning) {
                this.spinner.stop();
                this.spinnerRunning = false;
              }
              this.spinner = null;
            }

            if (!execState.idle && this.currentInputPromise) {
              this.abortControllerStack[this.abortControllerStack.length - 1].abort();
            }

            if (execState.waitingOn.length === 0 && this.humanInputPromise) {
              this.abortControllerStack[this.abortControllerStack.length - 1].abort();
            }

            if (execState.busyWith && !this.spinner) {
              this.spinner = new SimpleSpinner(execState.busyWith, theme.chatSpinner);
              this.spinnerRunning = true;
              this.spinner.start();
            }

            if (execState.idle && !this.currentInputPromise) {
              ensureNewline();

              const createInputPromise = () => {
                const abortController = new AbortController();
                this.abortControllerStack.push(abortController);

                return this.gatherInput(abortController.signal)
                  .finally(() => {
                    this.abortControllerStack.pop()!.abort();
                  }).then(message => {
                    this.currentInputPromise = null;
                    this.ensureSigintHandlers();
                    this.agent.handleInput({message});
                  }).catch(err => {
                    this.currentInputPromise = null;
                    if (err instanceof PartialInputError) {
                      if (err.buffer.trim() === "") {
                        this.abortControllerStack[this.abortControllerStack.length - 1].abort();
                      } else {
                        this.currentInputPromise = createInputPromise();
                      }
                    }
                  });
              };

              this.currentInputPromise = createInputPromise();
            }

            if (execState.waitingOn.length > 0 && !this.humanInputPromise) {
              const abortController = new AbortController();
              this.abortControllerStack.push(abortController);

              this.humanInputPromise = this.handleHumanRequest(execState.waitingOn[0], abortController.signal)
                .finally(() => {
                  this.abortControllerStack.pop()!.abort();
                }).then(([request, response]) => {
                  redraw(this.agent.getState(AgentEventState));
                  this.ensureSigintHandlers();
                  this.agent.sendQuestionResponse(request.requestId, {result: response});
                  this.humanInputPromise = null;
                });
            }
          }
        };

        await Promise.race([processEvents(), processExecution()]);
        this.spinner?.stop();
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        process.stdout.write("Agent session aborted.\n");
      } else {
        process.stderr.write(formatLogMessages(["Error while running agent loop", e as Error]));
      }
    } finally {
      process.stdout.removeListener('resize', resizeHandler);
    }
    ensureNewline();
  }

  private ensureSigintHandlers() {
    this.options.rl?.close()
    process.removeAllListeners('SIGINT');
    process.stdin.removeAllListeners('keypress');

    process.stdin.setRawMode(true); // Switch to raw mode to capture Ctrl+C manually

    this.options.rl = readline.createInterface(process.stdin, process.stdout)

    this.options.rl.on('SIGINT', () => {
      if (this.abortControllerStack.length > 0) {
        this.abortControllerStack[this.abortControllerStack.length - 1].abort();
      } else {
        process.stdout.write("Ctrl-C pressed. Exiting...\n");
        process.exit(0);
      }
    });
  }

  private async gatherInput(signal: AbortSignal): Promise<string> {
    const history = this.agent.getState(CommandHistoryState).commands;

    this.ensureSigintHandlers();

    return await commandPrompt(
      {
        rl: this.options.rl!,
        prefix: chalk.yellowBright("user"),
        message: chalk.yellowBright(">"),
        autoCompletion: this.options.availableCommands,
        history,
        signal,
      }
    );
  }

  private async handleHumanRequest(
    request: ParsedQuestionRequest, signal: AbortSignal): Promise<[request: ParsedQuestionRequest, response: z.output<typeof QuestionResponseSchema>]> {

    const response = await renderScreen(QuestionInputScreen, { request, agent: this.agent, config: this.options.config }, signal);
    return [request, response];
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


