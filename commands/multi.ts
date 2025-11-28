import {editor} from "@inquirer/prompts";
import {Agent} from "@tokenring-ai/agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";

// Command description for help display
const description: string =
  "Opens an editor for multiline input. The entered text will be processed as the next input to the AI.";

/**
 * Executes the multi command to open an editor for multiline input
 */
async function execute(_args: string, agent: Agent): Promise<void> {
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
const help: string = `# /multi - Open an editor for multiline input

## Description

Opens your default text editor where you can write and edit multi-line text. This is useful for complex prompts, code examples, or detailed instructions that would be difficult to type line by line.

## Usage

/multi

## Behavior

- Opens your system's default text editor (EDITOR environment variable)
- If no EDITOR is set, uses 'vi' on Unix/Linux, 'notepad' on Windows
- Start with a blank editor or continue from previous input
- Save and close the editor to submit your text as input
- If you cancel or provide empty input, nothing will be sent

## Examples

/multi                    # Open editor with blank content
/multi Write a story...   # Open editor with initial text

## Tips

- Use this for complex code examples, long prompts, or detailed instructions that benefit from proper formatting
- The editor will automatically close when you save
- Your changes are only sent if you save the file`;

export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand;