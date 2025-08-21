import ChatService from "@token-ring/chat/ChatService";
import HistoryStorage from "@token-ring/chat/HistoryStorage";
import {runCommand} from "@token-ring/chat/runCommand";
import commandPrompt from "@token-ring/inquirer-command-prompt";
import {Registry, Service} from "@token-ring/registry";
import chalk from "chalk";
import REPLOutputFormatter from "./utility/REPLOutputFormatter.js";

/**
 * REPL (Read-Eval-Print Loop) service for interactive command-line interface
 */
export default class REPLService extends Service {
  /**
   * Service name identifier
   */
  name = "REPLService";

  /**
   * Service description
   */
  description = "Provides REPL functionality";

  /**
   * Output formatter for REPL display
   */
  out: REPLOutputFormatter = new REPLOutputFormatter();

  /**
   * Flag indicating if a prompt is currently active
   */
  isPromptActive: boolean = false;

  /**
   * Flag to control REPL exit
   */
  shouldExit: boolean = false;

  /**
   * Accumulated input buffer
   */
  inputSoFar: string = "";

  /**
   * Abort controller for current operation
   */
  abortController: AbortController | null = null;

  /**
   * Queue for pending prompts
   */
  promptQueue: string[] = [];

  /**
   * Abort controller for main input
   */
  mainInputAbortController: AbortController | null = new AbortController();

  /**
   * Available commands for autocompletion
   */
  availableCommands: string[] = [
    "/help",
    "/quit",
    "/exit",
    "/multi",
    "/clear",
    "/history",
    "/model",
    "/instructions",
  ];


  private registry!: Registry;

  /**
   * Unsubscribe function for chat service
   */
  private unsubscribe: (() => void) | null = null;

  /**
   * History storage for command history
   */
  private readonly historyStorage: HistoryStorage | undefined;

  /**
   * Creates a new REPLService instance
   */
  constructor({historyStorage}: { historyStorage?: HistoryStorage } = {}) {
    super();
    this.historyStorage = historyStorage;
  }

  /**
   * Stops the REPL service
   */
  async stop(_registry: Registry): Promise<void> {
    this.out.systemLine("Shutting down REPL.");
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  /**
   * Starts the REPL service
   */
  async start(registry: Registry): Promise<void> {
    this.registry = registry;

    const chatService = registry.requireFirstServiceByType(ChatService);

    this.unsubscribe = chatService.subscribe(this.out);

    this.out.systemLine(
      "Entering chat mode. Type your questions and hit Enter. Commands start with /. Type /quit to quit, or /help for a list of commands.",
    );
    this.out.systemLine("(Tip: For multi-line input, try the /multi command.)");
    this.out.systemLine("(Use ↑/↓ arrow keys to navigate command history)");

    // Populate availableCommands from the registry
    if (registry?.chatCommands) {
      const allCommandsObject = registry.chatCommands.getCommands();
      const commandNames = Object.keys(allCommandsObject).map(
        (name) => `/${name}`,
      );
      this.updateCommands(commandNames);
      this.out.systemLine(
        `Loaded ${commandNames.length} commands for autocompletion.`,
      );
    } else {
      this.out.warningLine(
        "Chat command registry not found. Autocompletion may be limited to defaults.",
      );
    }

    // Add global SIGINT handler
    process.on("SIGINT", () => this.handleGlobalSIGINT(chatService));

    // noinspection ES6MissingAwait
    this.mainLoop(chatService, registry)
      .then(() => process.exit(0))
      .catch(err => {
        console.error("Error in main loop:", err);
        process.exit(1);
      });
  }

  /**
   * Injects a prompt into the processing queue
   */
  async injectPrompt(prompt: string): Promise<void> {
    this.promptQueue.push(prompt);

    if (
      this.mainInputAbortController &&
      !this.mainInputAbortController.signal.aborted
    ) {
      this.mainInputAbortController.abort();
    }
  }

  /**
   * Updates the list of available commands for autocompletion
   */
  updateCommands(newCommands: string[]): void {
    this.availableCommands = [...newCommands];
  }

  /**
   * Adds a single command to the available commands list
   */
  addCommand(command: string): void {
    if (!this.availableCommands.includes(command)) {
      this.availableCommands.push(command);
    }
  }

  /**
   * Main REPL loop
   */
  private async mainLoop(chatService: ChatService, registry: Registry): Promise<void> {
    // Use the historyStorage provided in constructor or get it from the registry
    const historyStorage = this.historyStorage || registry.getFirstServiceByType(HistoryStorage);
    while (!this.shouldExit) {
      this.out.printHorizontalLine();

      // Handle any queued prompts
      while (this.promptQueue.length > 0) {
        const prompt = this.promptQueue.shift();
        if (prompt !== undefined) {
          await this.handleInput(prompt, chatService, registry);
        }
      }

      // Always create a fresh AbortController for each prompt
      this.mainInputAbortController = new AbortController();

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
            historyHandler: historyStorage,
          },
          {
            signal: this.mainInputAbortController.signal,
          },
        );

        // Clear the controller after successful prompt
        this.mainInputAbortController = null;

        await this.handleInput(userInput, chatService, registry);
      } catch (e) {
        if (emptyPrompt) {
          this.out.systemLine("\nExiting application.");
          this.shouldExit = true;
        } else {
          this.out.warningLine("[Input cancelled by user]");
        }
      }
    }
  }

  /**
   * Handles user input processing
   */
  private async handleInput(line: string, chatService: ChatService, registry: Registry): Promise<void> {
    this.inputSoFar = "";
    let processedInput = (line ?? "").trim();
    if (processedInput === "") {
      processedInput = "/help";
    }

    try {
      chatService.resetAbortController();

      let commandName = "chat";
      let remainder = processedInput.replace(/^\s*\/(\S*)/, (_unused, matchedCommandName) => {
        commandName = matchedCommandName;
        return "";
      }).trim();

      await runCommand(commandName, remainder, registry);
    } catch (err) {
      const abortSignal = chatService.getAbortSignal();
      if (abortSignal?.aborted) {
        this.out.errorLine("[Operation cancelled by user]");
      } else {
        this.out.errorLine("[Error while processing request] ", err as Error);
      }
    }

    chatService.clearAbortController();
    this.out.doneWaiting();
  }

  /**
   * Handles global SIGINT (Ctrl+C) signals
   */
  private handleGlobalSIGINT(chatService: ChatService): void {
    if (this.mainInputAbortController) {
      this.out.warningLine("\n[Cancelling input operation]");
      this.mainInputAbortController.abort();
    } else if (chatService.getAbortController) {
      this.out.warningLine("\n[Cancelling chat operation]");
      chatService.getAbortController()?.abort()
    } else {
      this.out.warningLine("\n[Couldn't find operation to cancel]");
    }
  }
}