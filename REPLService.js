import chalk from "chalk";
import commandPrompt from "@token-ring/inquirer-command-prompt";
import ChatService from "@token-ring/chat/ChatService";
import { runCommand } from "@token-ring/chat/runCommand";
import REPLOutputFormatter from "./utility/REPLOutputFormatter.js";

import { Service } from "@token-ring/registry";

export default class REPLService extends Service {
	name = "REPLService";
	description = "Provides REPL functionality";

	out = new REPLOutputFormatter();
	isPromptActive = false;
	shouldExit = false;
	inputSoFar = "";
	abortController = null;

	// --- New properties ---
	promptQueue = [];
	mainInputAbortController = new AbortController();
	// Define available commands for autocompletion
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
	// --- End new properties ---

	async stop(registry) {
		this.out.systemLine("Shutting down REPL.");
		this.unsubscribe();
	}

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
			// Let's merge with any pre-existing defaults or allow updateCommands to handle it.
			// For now, let's ensure some core commands are always there if not in registry,
			// or rely on updateCommands to build the full list.
			// Using updateCommands will replace, so ensure it has the full desired list.
			// A safer approach might be to add to the existing hardcoded ones,
			// or ensure all commands (like /quit) are in the registry.
			// Assuming registry provides a comprehensive list including /help, /quit etc.
			this.updateCommands(commandNames);
			this.out.systemLine(
				`Loaded ${commandNames.length} commands for autocompletion.`,
			);
		} else {
			this.out.warningLine(
				"Chat command registry not found. Autocompletion may be limited to defaults.",
			);
		}

		// --- Add global SIGINT handler ---
		process.on("SIGINT", () => this.handleGlobalSIGINT(chatService));

		this.mainLoop(chatService, registry);
	}
	async mainLoop(chatService, registry) {
		while (true) {
			try {
				this.out.printHorizontalLine();

				/* handle any queued prompts */
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
					// Check if this abort was triggered by injectPrompt (i.e., queue is not empty)
					if (this.promptQueue.length === 0) {
						// AbortError received, but the queue was empty. This means it was a user Ctrl+C on the main prompt.
						this.out.warningLine("[Input cancelled by user]");
						// Check if an AI operation was ongoing (not related to the prompt itself but a previous command)
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
					// If queue has items, continue the loop to process them
					continue;
				} else {
					// Handle other types of errors not related to our AbortController
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

	handleGlobalSIGINT(chatService) {
		if (this.sigintPending) {
			this.out.systemLine("\nSIGINT received twice. Exiting REPL.");
			if (this.unsubscribe) this.unsubscribe();
			process.exit(0);
		}

		this.sigintPending = true;
		setTimeout(() => (this.sigintPending = false), 2000);

		if (this.mainInputAbortController) {
			// Cancel the prompt
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

	async injectPrompt(prompt) {
		this.promptQueue.push(prompt);

		if (
			this.mainInputAbortController &&
			!this.mainInputAbortController.signal.aborted
		) {
			this.mainInputAbortController.abort();
		}
	}

	// Method to dynamically update available commands
	updateCommands(newCommands) {
		this.availableCommands = [...newCommands];
	}

	// Method to add a single command
	addCommand(command) {
		if (!this.availableCommands.includes(command)) {
			this.availableCommands.push(command);
		}
	}
}
