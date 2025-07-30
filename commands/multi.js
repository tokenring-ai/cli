import { editor } from "@inquirer/prompts";
import REPLService from "../REPLService.js";

/**
 * Command description for help display
 * @type {string}
 */
export const description =
	"Opens an editor for multiline input. The entered text will be processed as the next input to the AI.";

/**
 * Executes the multi command to open an editor for multiline input
 * @param {string} args - Any arguments provided (unused)
 * @param {import('@token-ring/registry').Registry} registry - The service registry
 * @returns {Promise<void>}
 */
export async function execute(_args, registry) {
	const replService = registry.requireFirstServiceByType(REPLService);

	const prompt = await editor({
		message: "Enter your multiline text (save and close editor to submit):",
		waitForUseInput: false,
	});

	if (prompt) {
		replService.injectPrompt(prompt);
	}
}

/**
 * Note: The multi command doesn't provide a help function as it's self-explanatory
 * and handled by the command system automatically
 */
