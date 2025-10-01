import {select} from '@inquirer/prompts';
import Agent from "@tokenring-ai/agent/Agent";
import {AgentEvents} from "@tokenring-ai/agent/AgentEvents";
import AgentTeam from "@tokenring-ai/agent/AgentTeam";
import {
  AskForConfirmationRequest, AskForMultipleSelectionsRequest, AskForMultipleTreeSelectionRequest, AskForPasswordOptions,
  AskForSelectionRequest, AskForSingleTreeSelectionRequest,
  AskRequest,
  HumanInterfaceRequest,
  HumanInterfaceResponse, OpenWebPageRequest
} from "@tokenring-ai/agent/HumanInterfaceRequest";
import {CommandHistoryState} from "@tokenring-ai/agent/state/commandHistoryState";
import chalk from "chalk";
import * as process from "node:process";
import ora, {Ora} from "ora";
import {
  ask,
  askForCommand,
  askForConfirmation,
  askForMultipleSelections,
  askForMultipleTreeSelection,
  askForSelection,
  askForSingleTreeSelection,
  askForPassword,
  CancellationToken,
  ExitToken,
  openWebPage
} from "./inputHandlers.js";
import {
  setupCtrlTHandler,
  cleanupCtrlTHandler,
  CtrlTToken,
  CreateAgentToken,
  NextAgentToken,
  PrevAgentToken,
  AgentSelectorToken,
  ExitAgentToken,
  DetachAgentToken
} from "./ctrlTHandler.js";

/**
 * AgentCLI is a command-line interface for interacting with an AgentTeam.
 */
export default class AgentCLI {
  private shouldExit = false;
  private inputAbortController: AbortController | undefined;
  private eventLoopDisconnectController: AbortController | undefined;
  private agentCancelController: AbortController | undefined;
  private availableCommands: string[] = [];
  private pendingCtrlTAction: symbol | null = null;
  private currentAgent: Agent | null = null;


  private readonly agentManager: AgentTeam;

  /**
   * Creates a new AgentCLI instance.
   * @param agentManager The AgentTeam instance to manage agents.
   */
  constructor(agentManager: AgentTeam) {
    this.agentManager = agentManager;
  }


  async run(): Promise<void> {
    process.on("SIGINT", () => {
      if (this.agentCancelController) {
        this.agentCancelController.abort();
      } else if (this.inputAbortController) {
        this.inputAbortController.abort();
      } else if (this.eventLoopDisconnectController) {
        this.eventLoopDisconnectController.abort();
      } else {
        console.log("Ctrl-C pressed. Exiting...");
        process.exit(0);
      }
    });

    while (!this.shouldExit) {
      try {
        const agent = await this.selectOrCreateAgent();
        if (!agent) {
          this.shouldExit = true;
          break;
        }

        await this.runAgentLoop(agent);
      } catch (error) {
        console.error(`Error in REPL: ${error}`);
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
        name: `Connect to: ${agent.options.name} (${agent.id.slice(0, 8)})`
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
          const agent = await this.agentManager.createAgent(type);
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
    }, { signal: this.inputAbortController?.signal});

    this.inputAbortController = undefined;

    return result ? await result() : null;
  }

  private async runAgentLoop(agent: Agent): Promise<void> {
    this.currentAgent = agent;
    const commandNames = agent.team.chatCommands.getAllItemNames().map(cmd => `/${cmd}`);
    this.availableCommands = [...commandNames, '/switch'];

    setupCtrlTHandler((token) => {
      this.pendingCtrlTAction = token;
    });

    try {
      await this.mainLoop(agent);
    } finally {
      cleanupCtrlTHandler();
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
    console.log(chalk.yellow("(Use ↑/↓ arrow keys to navigate command history, Ctrl-T for shortcuts)"));

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
            await agent.team.deleteAgent(agent);
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
            this.agentCancelController = undefined;
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
    {request, sequence}: { request: HumanInterfaceRequest & { type: T }, sequence: number}, agent: Agent) {
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
    const agentType = currentAgent.options.type;
    console.log(`\nCreating new ${agentType} agent...`);
    const newAgent = await this.agentManager.createAgent(agentType);
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
    console.log(`\nSwitching to agent: ${nextAgent.name} (${nextAgent.id.slice(0, 8)})`);
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
    console.log(`\nSwitching to agent: ${prevAgent.name} (${prevAgent.id.slice(0, 8)})`);
    await this.runAgentLoop(prevAgent);
    return false;
  }

  private async handleCtrlTAction(action: symbol, agent: Agent): Promise<boolean> {
    if (action === CtrlTToken) {
      this.showCtrlTHelp(agent);
      return this.gatherInput(agent);
    }
    if (action === CreateAgentToken) {
      await this.createAgentAsCurrent(agent);
      return this.gatherInput(agent);
    }
    if (action === NextAgentToken) {
      return await this.switchToNextAgent();
    }
    if (action === PrevAgentToken) {
      return await this.switchToPrevAgent();
    }
    if (action === AgentSelectorToken) {
      console.log("\nReturning to agent selection.");
      return false;
    }
    if (action === ExitAgentToken) {
      agent.requestExit();
      return true;
    }
    if (action === DetachAgentToken) {
      console.log("\nDetaching from agent. Agent continues running.");
      return false;
    }
    return true;
  }
}