import { editor } from "@inquirer/prompts";
import REPLService from "../REPLService.ts";
import type { Registry } from "@token-ring/registry";
import {abandon} from "@token-ring/utility/abandon";

// Command description for help display
export const description: string =
	"Opens an editor for multiline input. The entered text will be processed as the next input to the AI.";

/**
 * Executes the multi command to open an editor for multiline input
 * @param _args Any arguments provided (unused)
 * @param registry The service registry
 */
export async function execute(_args: string, registry: Registry): Promise<void> {
	const replService = registry.requireFirstServiceByType(REPLService);

	const prompt = await editor({
		message: "Enter your multiline text (save and close editor to submit):",
		// Preserve original option from JS implementation
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		waitForUseInput: false,
	});

	if (prompt) {
		abandon(replService.injectPrompt(prompt));
	}
}
