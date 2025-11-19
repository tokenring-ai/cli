import {editor} from "@inquirer/prompts";
import {Agent} from "@tokenring-ai/agent";

// Command description for help display
export const description: string =
  "Opens an editor for multiline input. The entered text will be processed as the next input to the AI.";

/**
 * Executes the multi command to open an editor for multiline input
 */
export async function execute(_args: string, agent: Agent): Promise<void> {
  const message = await editor({
    message: "Enter your multiline text (save and close editor to submit):",
    // Preserve original option from JS implementation
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    waitForUseInput: false,
  });

  if (message) {
    agent.handleInput({message});
  }
}

/**
 * Returns help information for the multi command
 */
// noinspection JSUnusedGlobalSymbols
export function help(): Array<string> {
  return [
    "/multi - Opens an editor for multiline input.",
    "  - Opens an interactive editor where you can write multiline text",
    "  - Save and close the editor to submit your text as input to the AI",
    "  - If you cancel or provide empty input, nothing will be sent",
  ];
}