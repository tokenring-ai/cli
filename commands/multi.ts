import {editor} from "@inquirer/prompts";
import type {Registry} from "@token-ring/registry";
import {abandon} from "@token-ring/utility/abandon";
import REPLService from "../REPLService.ts";

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

/**
 * Returns help information for the multi command
 */
export function help(): Array<string> {
  return [
    "/multi - Opens an editor for multiline input.",
    "  - Opens an interactive editor where you can write multiline text",
    "  - Save and close the editor to submit your text as input to the AI",
    "  - If you cancel or provide empty input, nothing will be sent",
  ];
}