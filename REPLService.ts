import {select} from '@inquirer/prompts';
import Agent from "@tokenring-ai/agent/Agent";
import {AgentEvents} from "@tokenring-ai/agent/AgentEvents";
import AgentTeam from "@tokenring-ai/agent/AgentTeam";
import {TokenRingService} from "@tokenring-ai/agent/types";
import chalk from "chalk";
import ora, {Ora} from "ora";
import {
  ask,
  askForCommand,
  askForConfirmation,
  askForMultipleSelections,
  askForMultipleTreeSelection,
  askForSelection,
  askForSingleTreeSelection,
  CancellationToken,
  ExitToken,
  openWebPage
} from "./REPLInput.js";

/**
 * REPL (Read-Eval-Print Loop) service for interactive command-line interface
 */
export default class REPLService implements TokenRingService {
  name = "REPLService";
  description = "Provides REPL functionality";

  private shouldExit = false;
  private promptQueue: string[] = [];
  private mainInputAbortController: AbortController = new AbortController();
  private availableCommands: string[] = [];

  private readonly agentManager: AgentTeam;

  /**
   * Creates a new REPLService instance
   */
  constructor(agentManager: AgentTeam) {
    this.agentManager = agentManager;
  }


  async run(): Promise<void> {
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

  async injectPrompt(prompt: string): Promise<void> {
    this.promptQueue.push(prompt);
    if (this.mainInputAbortController && !this.mainInputAbortController.signal.aborted) {
      this.mainInputAbortController.abort();
    }
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
    for (const type in agentConfigs) {
      const agentConfig = agentConfigs[type];
      choices.push({
        value: async () => {
          console.log(`Starting new agent: ${agentConfig.name}`);
          const agent = await this.agentManager.createAgent(type);
          console.log(`Agent ${agent.id} started`);
          return agent;
        },
        name: `Create a new ${agentConfig.name}`
      });
    }

    choices.push({name: "Exit", value: null});

    const result = await select({
      message: "Select an existing agent to connect to, or create a new one:",
      choices: choices,
      loop: false,
    });

    return result ? await result() : null;
  }

  private async runAgentLoop(agent: Agent): Promise<void> {
    // Setup commands
    const commandNames = agent.team.chatCommands.getAllItemNames().map(cmd => `/${cmd}`);
    this.availableCommands = [...commandNames, '/switch'];

    try {
      // Run main loop until agent exits
      await this.mainLoop(agent);
    } finally {
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
    console.log(chalk.yellow("(Use ↑/↓ arrow keys to navigate command history)"));


    for await (const event of agent.events(this.mainInputAbortController.signal)) {
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
        case 'state.idle':
          if (!await this.gatherInput(agent)) {
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
  }

  private async gatherInput(agent: Agent): Promise<boolean> {
    // Handle any queued prompts
    if (this.promptQueue.length > 0) {
      const prompt = this.promptQueue.shift()!;
      agent.handleInput({message: prompt});
      return true;
    }

    const userInput = await askForCommand({
      autoCompletion: this.availableCommands,
    });

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

  private async handleHumanRequest({request, sequence}: AgentEvents["human.request"], agent: Agent) {
    let result: any;

    switch (request.type) {
      case "ask":
        result = await ask(request);
        break;
      case "askForConfirmation":
        result = await askForConfirmation(request);
        break;
      case "askForMultipleTreeSelection":
        result = await askForMultipleTreeSelection(request);
        break;
      case "askForSingleTreeSelection":
        result = await askForSingleTreeSelection(request);
        break;
      case "openWebPage":
        result = await openWebPage(request);
        break;
      case "askForSelection":
        result = await askForSelection(request);
        break;
      case "askForMultipleSelections":
        result = await askForMultipleSelections(request);
        break;
      default:
        throw new Error(`Unknown HumanInterfaceRequest type: ${(request as any)?.type}`);
    }

    agent.sendHumanResponse(sequence, result);
  }
}