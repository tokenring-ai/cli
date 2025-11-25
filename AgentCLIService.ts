import {select} from '@inquirer/prompts';
import {AgentCommandService} from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import TokenRingApp from "@tokenring-ai/app";
import {
  AskForConfirmationRequest,
  AskForMultipleSelectionsRequest,
  AskForMultipleTreeSelectionRequest,
  AskForPasswordOptions,
  AskForSelectionRequest,
  AskForSingleTreeSelectionRequest,
  AskRequest,
  HumanInterfaceRequest,
  HumanInterfaceResponse,
  OpenWebPageRequest
} from "@tokenring-ai/agent/HumanInterfaceRequest";
import {CommandHistoryState} from "@tokenring-ai/agent/state/commandHistoryState";
import {formatAgentId} from "@tokenring-ai/agent/util/formatAgentId";
import {TokenRingService} from "@tokenring-ai/app/types";
import chalk, {ChalkInstance} from "chalk";
import * as process from "node:process";
import * as readline from "node:readline";
import ora, {Ora} from "ora";
import {z} from "zod";
import {CtrlTAction, ctrlTHandler} from "./ctrlTHandler.js";
import {
  ask,
  askForCommand,
  askForConfirmation,
  askForMultipleSelections,
  askForMultipleTreeSelection,
  askForPassword,
  askForSelection,
  askForSingleTreeSelection,
  CancellationToken,
  ExitToken,
  openWebPage
} from "./inputHandlers.js";
import {setTimeout} from "node:timers/promises";


export const CLIConfigSchema = z.object({
  banner: z.string().optional().default("Welcome to TokenRing CLI"),
  bannerColor: z.string().optional().default("cyan"),
})

/**
 * AgentCLI is a command-line interface for interacting with an TokenRingApp.
 */
export default class AgentCLIService implements TokenRingService {
  name = "AgentCLI";
  description = "Command-line interface for interacting with agents";

  private shouldExit = false;
  private inputAbortController: AbortController | undefined;
  private eventLoopDisconnectController: AbortController | undefined;

  private availableCommands: string[] = [];
  private pendingCtrlTAction: CtrlTAction | null = null;
  private currentAgent: Agent | null = null;


  private readonly app: TokenRingApp;
  private readonly agentManager: AgentManager;
  private readonly config: z.infer<typeof CLIConfigSchema>;

  /**
   * Creates a new AgentCLI instance.
   * @param app The TokenRingApp instance to manage agents.
   * @param config The configuration for the CLI.
   */
  constructor(app: TokenRingApp, config: z.infer<typeof CLIConfigSchema>) {
    this.app = app;
    this.config = config;
    this.agentManager = app.requireService(AgentManager);
  }


  async start(): Promise<void> {
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
        await setTimeout( 1000);
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

    const agentCommandService = agent.requireServiceByType(AgentCommandService);

    const commandNames = agentCommandService.getCommandNames().map(cmd => `/${cmd}`);
    this.availableCommands = [...commandNames, '/switch'];

    const listener = (action: CtrlTAction) => {
      this.pendingCtrlTAction = action;
    };
    ctrlTHandler.addListener(listener);

    try {
      await this.mainLoop(agent);
    } finally {
      ctrlTHandler.removeListener(listener);
      this.currentAgent = null;
      console.log("Agent session ended.");
    }
  }

  private async mainLoop(agent: Agent): Promise<void> {
    let lastWriteHadNewline = true;
    let currentOutputType: string = "chat";
    let spinner: Ora | null = null;

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

    let suppressNextInput = false;
    try {
      this.eventLoopDisconnectController = new AbortController();
      for await (const event of agent.events(this.eventLoopDisconnectController.signal)) {
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
          case 'state.busy':
            spinner = ora(event.data.message);
            spinner.start();
            lastWriteHadNewline = true;
            break;
          case 'state.notBusy':
            stopSpinner();
            break;
          case 'state.exit':
            console.log("\nAgent exited. Returning to agent selection.");
            await this.agentManager.deleteAgent(agent);
            return;
          case 'input.received':
            if (suppressNextInput) {
              suppressNextInput = false;
              break;
            }

            ensureNewline();
            console.log(chalk.cyan(`> ${event.data.message}`));
            lastWriteHadNewline = true;
            break;
          case 'state.idle':
            if (await this.gatherInput(agent)) {
              suppressNextInput = true;
            } else {
              console.log("\nReturning to agent selection.");
              return;
            }
            break;
          case 'human.request':
            await this.handleHumanRequest(event.data, agent);
            break;
        }
      }
      stopSpinner();
    } finally {
      this.eventLoopDisconnectController = undefined;
    }
  }

  private async gatherInput(agent: Agent): Promise<boolean> {
    if (this.pendingCtrlTAction) {
      const action = this.pendingCtrlTAction;
      this.pendingCtrlTAction = null;
      return await this.handleCtrlTAction(action, agent);
    }

    const history = agent.getState(CommandHistoryState).commands;

    this.inputAbortController = new AbortController();

    const userInput = await askForCommand({
      autoCompletion: this.availableCommands,
      history
    }, this.inputAbortController.signal);

    if (userInput === '/switch' || userInput === ExitToken) {
      console.log("\nReturning to agent selection.");
      return false;
    }

    if (userInput === CancellationToken) {
      agent.systemMessage("[Input cancelled by user]", 'warning');
      return this.gatherInput(agent);
    }

    agent.handleInput({message: userInput});
    return true;
  }

  private async handleHumanRequest<T extends keyof HumanInterfaceResponse>(
    {request, sequence}: { request: HumanInterfaceRequest & { type: T }, sequence: number }, agent: Agent) {
    let result: HumanInterfaceResponse[T];

    try {
      const {signal} = this.inputAbortController = new AbortController()

      switch (request.type) {
        case "ask":
          result = await ask(request as AskRequest, signal) as HumanInterfaceResponse[T];
          break;
        case "askForConfirmation":
          result = await askForConfirmation(request as AskForConfirmationRequest, signal) as HumanInterfaceResponse[T];
          break;
        case "askForMultipleTreeSelection":
          result = await askForMultipleTreeSelection(request as AskForMultipleTreeSelectionRequest, signal) as HumanInterfaceResponse[T];
          break;
        case "askForSingleTreeSelection":
          result = await askForSingleTreeSelection(request as AskForSingleTreeSelectionRequest, signal) as HumanInterfaceResponse[T];
          break;
        case "openWebPage":
          result = await openWebPage(request as OpenWebPageRequest) as HumanInterfaceResponse[T];
          break;
        case "askForSelection":
          result = await askForSelection(request as AskForSelectionRequest, signal) as HumanInterfaceResponse[T];
          break;
        case "askForMultipleSelections":
          result = await askForMultipleSelections(request as AskForMultipleSelectionsRequest, signal) as HumanInterfaceResponse[T];
          break;
        case "askForPassword":
          result = await askForPassword(request as AskForPasswordOptions, signal) as HumanInterfaceResponse[T];
          break;
        default:
          throw new Error(`Unknown HumanInterfaceRequest type: ${(request as any)?.type}`);
      }
    } finally {
      this.inputAbortController = undefined;
    }
    agent.sendHumanResponse(sequence, result);
  }

  private showCtrlTHelp(agent: Agent): void {
    agent.infoLine("Ctrl-T shortcuts:");
    agent.infoLine("  Ctrl-T     - Show this help");
    agent.infoLine("  Ctrl-T c   - Create new agent (same type as current)");
    agent.infoLine("  Ctrl-T n   - Switch to next running agent");
    agent.infoLine("  Ctrl-T p   - Switch to previous running agent");
    agent.infoLine("  Ctrl-T s   - Return to agent selector");
    agent.infoLine("  Ctrl-T x   - Exit current agent");
    agent.infoLine("  Ctrl-T d   - Detach from agent (keeps running)");
  }

  private async createAgentAsCurrent(currentAgent: Agent): Promise<void> {
    console.log(`\nCreating new ${currentAgent.config.type} agent...`);
    const newAgent = await this.agentManager.createAgent(currentAgent.config);
    console.log(`New agent ${newAgent.id} created. Switching to it.`);
    await this.runAgentLoop(newAgent);
  }

  private async switchToNextAgent(): Promise<boolean> {
    const runningAgents = this.agentManager.getAgents();
    if (runningAgents.length <= 1) {
      console.log("\nNo other agents running.");
      return true;
    }

    const currentIndex = runningAgents.findIndex(a => a.id === this.currentAgent?.id);
    const nextIndex = (currentIndex + 1) % runningAgents.length;
    const nextAgent = runningAgents[nextIndex];
    console.log(`\nSwitching to agent: ${nextAgent.name} (${formatAgentId(nextAgent.id)})`);
    await this.runAgentLoop(nextAgent);
    return false;
  }

  private async switchToPrevAgent(): Promise<boolean> {
    const runningAgents = this.agentManager.getAgents();
    if (runningAgents.length <= 1) {
      console.log("\nNo other agents running.");
      return true;
    }

    const currentIndex = runningAgents.findIndex(a => a.id === this.currentAgent?.id);
    const prevIndex = currentIndex <= 0 ? runningAgents.length - 1 : currentIndex - 1;
    const prevAgent = runningAgents[prevIndex];
    console.log(`\nSwitching to agent: ${prevAgent.name} (${formatAgentId(prevAgent.id)})`);
    await this.runAgentLoop(prevAgent);
    return false;
  }

  private async handleCtrlTAction(action: CtrlTAction, agent: Agent): Promise<boolean> {
    switch (action) {
      case CtrlTAction.ShowHelp:
        this.showCtrlTHelp(agent);
        return this.gatherInput(agent);
      case CtrlTAction.CreateAgent:
        await this.createAgentAsCurrent(agent);
        return this.gatherInput(agent);
      case CtrlTAction.NextAgent:
        return await this.switchToNextAgent();
      case CtrlTAction.PrevAgent:
        return await this.switchToPrevAgent();
      case CtrlTAction.OpenSelector:
        console.log("\nReturning to agent selection.");
        return false;
      case CtrlTAction.ExitAgent:
        agent.requestExit();
        return true;
      case CtrlTAction.DetachAgent:
        console.log("\nDetaching from agent. Agent continues running.");
        return false;
      default:
        return true;
    }
  }
}