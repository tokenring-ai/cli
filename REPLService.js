import ChatService from "@token-ring/chat/ChatService";
import { runCommand } from "@token-ring/chat/runCommand";
import commandPrompt from "@token-ring/inquirer-command-prompt";
import { Service } from "@token-ring/registry";
import chalk from "chalk";
import REPLOutputFormatter from "./utility/REPLOutputFormatter.js";

/**
 * @typedef {import('@token-ring/registry').Registry} Registry
 * @typedef {import('@token-ring/chat/ChatService').default} ChatService
 */

/**
 * REPL (Read-Eval-Print Loop) service for interactive command-line interface
 * @extends {Service}
 */
export default class REPLService extends Service {
	/**
	 * Service name identifier
	 * @type {string}
	 */
	name = "REPLService";

	/**
	 * Service description
	 * @type {string}
	 */
	description = "Provides REPL functionality";

	/**
	 * Output formatter for REPL display
	 * @type {REPLOutputFormatter}
	 */
	out = new REPLOutputFormatter();

	/**
	 * Flag indicating if a prompt is currently active
	 * @type {boolean}
	 */
	isPromptActive = false;

	/**
	 * Flag to control REPL exit
	 * @type {boolean}
	 */
	shouldExit = false;

	/**
	 * Accumulated input buffer
	 * @type {string}
	 */
	inputSoFar = "";

	/**
	 * Abort controller for current operation
	 * @type {AbortController|null}
	 */
	abortController = null;

	/**
	 * Queue for pending prompts
	 * @type {Array<string>}
	 */
	promptQueue = [];

	/**
	 * Abort controller for main input
	 * @type {AbortController}
	 */
	mainInputAbortController = new AbortController();

	/**
	 * Available commands for autocompletion
	 * @type {Array<string>}
	 */
	availableCommands = [
		"/help",
		"/quit",
		"/exit",
		"/multi",
		"/clear",
		"/history",
		"/model",
		"/instructions",
	];

	/**
	 * Flag for handling SIGINT double-press
	 * @type {boolean}
	 * @private
	 */
	sigintPending = false;

	/**
	 * Unsubscribe function for chat service
	 * @type {Function|null}
	 * @private
	 */
	unsubscribe = null;

	/**
	 * Stops the REPL service
	 * @param {Registry} registry - The service registry
	 * @returns {Promise<void>}
	 */
	async stop(registry) {
		this.out.systemLine("Shutting down REPL.");
		if (this.unsubscribe) {
			this.unsubscribe();
		}
	}

	/**
	 * Starts the REPL service
	 * @param {Registry} registry - The service registry
	 * @returns {Promise<void>}
	 */
	async start(registry) {
		const chatService = registry.getFirstServiceByType(ChatService);

		this.unsubscribe = chatService.subscribe(this.out);

		this.out.systemLine(
			"Entering chat mode. Type your questions and hit Enter. Commands start with /. Type /quit to quit, or /help for a list of commands.",
		);
		this.out.systemLine("(Tip: For multi-line input, try the /multi command.)");
		this.out.systemLine("(Use ↑/↓ arrow keys to navigate command history)");

		// Populate availableCommands from the registry
		if (registry && registry.chatCommands) {
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
		this.mainLoop(chatService, registry);
	}

	/**
	 * Main REPL loop
	 * @param {ChatService} chatService - The chat service instance
	 * @param {Registry} registry - The service registry
	 * @returns {Promise<void>}
	 * @private
	 */
	async mainLoop(chatService, registry) {
		while (true) {
			try {
				this.out.printHorizontalLine();

				// Handle any queued prompts
				while (this.promptQueue.length > 0) {
					const prompt = this.promptQueue.shift();
					await this.handleInput(prompt, chatService, registry);
				}

				// Always create a fresh AbortController for each prompt
				this.mainInputAbortController = new AbortController();

				const userInput = await commandPrompt(
					{
						theme: {
							prefix: chalk.yellowBright("user"),
						},
						message: chalk.yellowBright(">"),
						autoCompletion: this.availableCommands,
					},
					{
						signal: this.mainInputAbortController.signal,
					},
				);

				// Clear the controller after successful prompt
				this.mainInputAbortController = null;

				await this.handleInput(userInput, chatService, registry);
			} catch (e) {
				const wasMainInputAborted =
					this.mainInputAbortController &&
					this.mainInputAbortController.signal.aborted;

				// Always reset the controller after an error
				this.mainInputAbortController = null;

				if (wasMainInputAborted) {
					if (this.promptQueue.length === 0) {
						this.out.warningLine("[Input cancelled by user]");
						const ongoingOpAbortController = chatService.getAbortController();
						if (
							ongoingOpAbortController &&
							!ongoingOpAbortController.signal.aborted
						) {
							this.out.warningLine(
								"Attempting to cancel ongoing AI operation (if any)...",
							);
							ongoingOpAbortController.abort();
						}
					}
					continue;
				} else {
					this.out.errorLine(
						"An unexpected error occurred with the main input prompt:",
						e,
					);
				}
			}

			if (this.shouldExit) {
				break;
			}
		}

		this.out.systemLine("Exiting REPL mode.");
		if (this.unsubscribe) {
			this.unsubscribe();
		}
		process.exit(0);
	}

	/**
	 * Handles user input processing
	 * @param {string} line - The user input line
	 * @param {ChatService} chatService - The chat service instance
	 * @param {Registry} registry - The service registry
	 * @returns {Promise<void>}
	 * @private
	 */
	async handleInput(line, chatService, registry) {
		this.inputSoFar = "";
		let processedInput = (line ?? "").trim();
		if (processedInput === "") {
			processedInput = "/help";
		}

		try {
			chatService.resetAbortController();

			let [, commandName, remainder] =
				processedInput.match(/^\/(\w+)\s*(.*)?$/) ?? [];
			if (!commandName) {
				commandName = "chat";
				remainder = processedInput;
			}

			await runCommand(commandName, remainder, registry);
		} catch (err) {
			if (chatService.getAbortSignal().aborted) {
				this.out.errorLine("[Operation cancelled by user]");
			} else {
				this.out.errorLine("[Error while processing request] ", err);
			}
		}

		chatService.clearAbortController();
	}

	/**
	 * Handles global SIGINT (Ctrl+C) signals
	 * @param {ChatService} chatService - The chat service instance
	 * @returns {void}
	 * @private
	 */
	handleGlobalSIGINT(chatService) {
		if (this.sigintPending) {
			this.out.systemLine("\nSIGINT received twice. Exiting REPL.");
			if (this.unsubscribe) this.unsubscribe();
			process.exit(0);
		}

		this.sigintPending = true;
		setTimeout(() => (this.sigintPending = false), 2000);

		if (this.mainInputAbortController) {
			this.out.warningLine("\n[Cancelling input operation]");
			this.mainInputAbortController.abort();
			return;
		}

		const abortController =
			chatService.getAbortController && chatService.getAbortController();
		if (abortController && !abortController.signal.aborted) {
			this.out.warningLine("\n[Cancelling current chat operation]");
			abortController.abort();
			return;
		}

		this.out.systemLine("\n(Press Ctrl-C again to exit)");
	}

	/**
	 * Injects a prompt into the processing queue
	 * @param {string} prompt - The prompt to inject
	 * @returns {Promise<void>}
	 */
	async injectPrompt(prompt) {
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
	 * @param {Array<string>} newCommands - Array of command strings
	 * @returns {void}
	 */
	updateCommands(newCommands) {
		this.availableCommands = [...newCommands];
	}

	/**
	 * Adds a single command to the available commands list
	 * @param {string} command - The command to add
	 * @returns {void}
	 */
	addCommand(command) {
		if (!this.availableCommands.includes(command)) {
			this.availableCommands.push(command);
		}
	}
}
