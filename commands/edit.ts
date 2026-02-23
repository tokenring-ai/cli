import {Agent} from "@tokenring-ai/agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {execa} from "execa";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function getDefaultEditor(): string {
  return process.env.EDITOR || (process.platform === "win32" ? "notepad" : "vi");
}

// Command description for help display
const description: string = "/edit - Open your editor to write a prompt.";

/**
 * Executes the edit command to open an editor for prompt creation
 */
async function execute(remainder: string, agent: Agent): Promise<string> {

  // Create a temp file for editing
  const tmpFile = path.join(os.tmpdir(), `aider_edit_${Date.now()}.txt`);
  await fs.writeFile(tmpFile, remainder || "", "utf8");

  const editor = getDefaultEditor();

  try {
    await execa(editor, [tmpFile], {stdio: "inherit"});
  } catch (error: unknown) {
    const err = error as { shortMessage?: string; message?: string };
    try {
      await fs.unlink(tmpFile);
    } catch {
      /* ignore cleanup error */
    }
    throw new CommandFailedError(`Editor process failed: ${err.shortMessage || err.message}`);
  }

  // Read the edited content
  const editedContent = await fs.readFile(tmpFile, "utf8");

  // Clean up the temporary file
  try {
    await fs.unlink(tmpFile);
  } catch {
    /* ignore cleanup error */
  }

  return `Edited prompt:\n${editedContent}`;
}

/**
 * Returns help information for the edit command
 */
const help: string = `# /edit - Open your editor to write a prompt

## Description

Opens your system's default text editor to create or edit a prompt. This is useful for writing complex prompts, code examples, or detailed instructions that benefit from proper formatting and editing capabilities.

## Usage

/edit [initial-text]

## Arguments

- **initial-text** (optional): Text to pre-fill in the editor
  - If provided, starts the editor with this text
  - If omitted, starts with a blank editor

## Editor Selection

- Uses the EDITOR environment variable if set
- Falls back to 'vi' on Unix/Linux systems
- Falls back to 'notepad' on Windows systems
- You can configure your preferred editor by setting EDITOR

## Behavior

- Creates a temporary file for editing
- Opens your configured editor with the file
- When you save and close the editor, the content is sent as input to the current agent
- The temporary file is automatically cleaned up after use

## Examples

/edit                    # Open editor with blank content
/edit Write a story...   # Open editor with initial text
/edit #include <stdio.h> # Start with code snippet

## Tips

- Set EDITOR=vim in your shell config to use vim
- Set EDITOR=code in your shell config to use VS Code
- Use this for complex prompts that need formatting
- The editor will close automatically when you save

## Related Commands

- \`/multi\` - Open editor for multi-line input (simpler interface)`;

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand;