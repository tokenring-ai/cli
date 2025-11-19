# CLI Package Documentation

## Overview

The `@tokenring-ai/cli` package provides a Read-Eval-Print Loop (REPL) service for interactive command-line interaction
with TokenRing AI agents. It enables users to select or create agents, send chat inputs, execute built-in commands (
e.g., `/help`, `/edit`), and handle human interface requests such as confirmations, selections, and multiline inputs.
The package integrates with the `@tokenring-ai/agent` core to manage agent teams, process events (e.g., chat output,
reasoning, system messages), and provide a seamless CLI experience using libraries like Inquirer.js for prompts and
Chalk for colored output.

This package serves as the CLI entry point for the TokenRing AI system, allowing developers and users to interact with
AI agents in a terminal environment. It supports agent lifecycle management (create, connect, exit), real-time event
streaming, and customizable chat commands.

## Installation/Setup

This package is part of the TokenRing AI monorepo. To build and use it:

1. Ensure Node.js (v18+) and npm are installed.
2. Install dependencies: `npm install` (run from the project root, as this package uses workspace dependencies).
3. Build the package: `npm run build` (compiles TypeScript to JavaScript in `dist/`).
4. For development: Use `npm run dev` if configured, or run tests with `npm test`.

Key dependencies (from `package.json`):

- `@tokenring-ai/agent`: Core agent management.
- `@inquirer/prompts`: Interactive CLI prompts.
- `chalk`: Terminal styling.
- `ora`: Spinners for loading states.

To run the REPL: Import and instantiate `REPLService` with an `AgentTeam` instance, then call `run()`.

Environment variables:

- `EDITOR`: Specifies the default editor for `/edit` command (defaults to `vi` on Unix, `notepad` on Windows).

## Package Structure

The package is organized as follows:

- **index.ts**: Main entry point. Exports `packageInfo` (package metadata and chat commands) and `REPLService`.
- **REPLService.ts**: Core REPL implementation. Handles the main loop, agent selection, input gathering, and event
  processing.
- **REPLInput.ts**: Utility functions for human interface interactions (e.g., `askForCommand`, `askForSelection`).
- **chatCommands.ts**: Exports all available chat commands for integration with agents.
- **commands/**: Directory containing individual command modules:
 - `help.ts`: Displays available commands.
 - `exit.ts` / `quit.ts`: Exits the current agent session.
 - `multi.ts`: Opens an editor for multiline input.
 - `edit.ts`: Opens a system editor for prompt editing.
- **package.json**: Defines metadata, dependencies, scripts (build/test), and exports.
- **tsconfig.json** / **vitest.config.js**: TypeScript and testing configurations.
- **LICENSE**: MIT license.

Directories are auto-created as needed; the structure focuses on modularity for easy extension of commands.

## Core Components

### REPLService

The `REPLService` class implements `TokenRingService` and manages the interactive CLI loop.

- **Description**: Orchestrates agent selection/creation, runs the main event loop for agent interactions, handles
  inputs/commands, and processes agent events (chat, reasoning, system messages, busy/idle states). It uses spinners for
  loading and colors output for clarity.

- **Key Methods**:
 - `constructor(agentManager: AgentTeam)`: Initializes with an agent team.
 - `run(): Promise<void>`: Starts the REPL loop. Selects agents and runs sessions until exit.
 - `injectPrompt(prompt: string): Promise<void>`: Queues a prompt to interrupt and inject into the current session (
   useful for multiline or external inputs).
 - `selectOrCreateAgent(): Promise<Agent | null>` (private): Prompts user to connect to existing agents or create new
   ones.
 - `runAgentLoop(agent: Agent): Promise<void>` (private): Sets up commands and runs the agent-specific loop.
 - `mainLoop(agent: Agent): Promise<void>` (private): Processes agent events and gathers user input.
 - `gatherInput(agent: Agent): Promise<boolean>` (private): Collects user commands/inputs, handles special tokens like
   `/switch` or cancellation.
 - `handleHumanRequest(data: AgentEvents['human.request'], agent: Agent)` (private): Delegates to REPLInput functions
   for confirmations, selections, etc.

- **Interactions**: Listens to agent events via `agent.events(signal)`. Outputs are written with color-coding (green for
  chat, yellow for reasoning). Commands are prefixed with `/` and auto-completed.

### REPLInput

Provides prompt utilities for human-AI interactions, implementing `HumanInterfaceProvider` patterns.

- **Description**: Handles various input types using Inquirer.js, including command-line editing, selections, and
  editors. Supports cancellation via Ctrl+C.

- **Key Functions**:
 - `askForCommand(options: AskForCommandOptions): Promise<string | ExitToken | CancellationToken>`: Gets user input with
   auto-completion for commands.
  - Parameters: `options.autoCompletion` (array of command strings).
  - Example:
    ```typescript
    const input = await askForCommand({ autoCompletion: ['/help', '/exit'] });
    if (input === ExitToken) { /* handle exit */ }
    ```
 - `ask({ question }: AskRequest): Promise<string>`: Multi-line editor prompt.
 - `askForConfirmation(options: AskForConfirmationOptions): Promise<boolean>`: Yes/no confirmation.
 - `askForSelection({ title, items }: AskForSelectionOptions): Promise<string>`: Single list selection.
 - `askForMultipleSelections({ title, items, message }: AskForMultipleSelectionOptions): Promise<string[]>`: Multiple
   checkbox selections.
 -
 `askForSingleTreeSelection({ message, tree, initialSelection, loop }: AskForSingleTreeSelectionOptions): Promise<string | null>`:
 Tree-based single selection.
 -
 `askForMultipleTreeSelection({ message, tree, initialSelection, loop }: AskForMultipleTreeSelectionOptions): Promise<string[] | null>`:
 Tree-based multiple selection.
 - `openWebPage({ url }: OpenWebPageRequest): Promise<void>`: Opens URL in default browser.

- **Interactions**: Called by `REPLService.handleHumanRequest` when agents request user input.

### Chat Commands

Exported via `chatCommands.ts` for agent integration. Commands are slash-prefixed and executed in agent context.

- **Description**: Modular commands that agents can invoke. Each has an `execute` function and optional `help()` for
  documentation.

- **Key Commands**:
 - **help**: Lists all available commands with descriptions.
  - `execute(remainder: string, agent: Agent)`: Prints command help.
  - Help: `["/help - Show this help message"]`
 - **exit** / **quit**: Ends current agent session and returns to selection.
  - `execute(remainder: string, agent: Agent)`: Deletes agent and logs exit.
  - Help: `["/exit - Exit the current agent and return to agent selection"]`
 - **multi**: Opens Inquirer editor for multiline input, injects result as prompt.
  - `execute(args: string, agent: Agent)`: Uses `@inquirer/prompts/editor`.
  - Help: Multi-line description of editor usage.
 - **edit**: Opens system editor (via `EDITOR` env) on temp file with optional initial text, displays result.
  - `execute(remainder: string, agent: Agent)`: Creates temp file, runs editor, reads and shows output.
  - Help:
    `["/edit - Open your editor to write a prompt.", "  - With no arguments: Opens editor with blank prompt", "  - With text: Opens editor with provided text as starting point"]`

- **Interactions**: Commands are discovered via `agent.team.chatCommands.getAllItemNames()`. Executed when user types
  `/command`.

### Overall Architecture

- **Entry Point**: `REPLService.run()` starts the loop.
- **Dependencies**: Relies on `@tokenring-ai/agent` for `Agent` and `AgentTeam`.
- **Event Handling**: Streams events like `output.chat`, `state.idle` to update UI and prompt input.
- **Error Handling**: Catches errors in loops, logs via `console.error` or agent system messages. Commands handle
  specific failures (e.g., editor process errors).
- **Exports/Imports**: Public: `REPLService`, `packageInfo`. Imports agent types and utilities.

## Usage Examples

1. **Basic REPL Setup and Run**:
   ```typescript
   import AgentTeam from '@tokenring-ai/agent/AgentTeam';
   import REPLService from '@tokenring-ai/cli';

   const team = new AgentTeam(/* config */);
   const repl = new REPLService(team);
   await repl.run();  // Starts interactive CLI
   ```

2. **Injecting a Prompt Programmatically**:
   ```typescript
   // During a session, inject a prompt
   await repl.injectPrompt("Analyze this code: [code snippet]");
   // Interrupts current input and sends to agent
   ```

3. **Custom Command Integration**:
   ```typescript
   // In agent setup, add custom commands to chatCommands
   import * as customCmd from './my-command';
   // Then in packageInfo: { ...chatCommands, myCmd: customCmd }
   // User can now type /myCmd in REPL
   ```

## Configuration Options

- **Commands**: Extend by adding modules to `commands/` and exporting in `chatCommands.ts`.
- **Prompts**: Customize via Inquirer options in `REPLInput.ts` (e.g., themes, pageSize).
- **Output Styling**: Colors and spinners configurable via Chalk/Ora.
- **Editor**: Set `EDITOR` env var for `/edit` (e.g., `export EDITOR=code` for VS Code).
- **Auto-completion**: Dynamically populated from available commands.

No formal config file; relies on env vars and agent configs.

## API Reference

- **REPLService**:
 - `new REPLService(agentManager: AgentTeam)`
 - `run(): Promise<void>`
 - `injectPrompt(prompt: string): Promise<void>`

- **REPLInput** (utils):
 - `askForCommand(options: { autoCompletion?: string[] }): Promise<string | Symbol>`
 - `ask(question: string): Promise<string>`
 - `askForConfirmation(options: { message: string; default?: boolean }): Promise<boolean>`
 - `askForSelection(options: { title: string; items: string[] }): Promise<string>`
 - `askForMultipleSelections(options: { title: string; items: string[]; message?: string }): Promise<string[]>`
 - `askForSingleTreeSelection(options: AskForSingleTreeSelectionOptions): Promise<string | null>`
 - `askForMultipleTreeSelection(options: AskForMultipleTreeSelectionOptions): Promise<string[] | null>`
 - `openWebPage(url: string): Promise<void>`

- **Chat Commands** (per module):
 - `execute(remainder?: string, agent: Agent): Promise<void>`
 - `help?(): string[]` (optional)

- **packageInfo: TokenRingPackage**:
 - `{ name: string; version: string; description: string; chatCommands: Record<string, any> }`

## Dependencies

External (from `package.json`):

- `@tokenring-ai/agent@0.1.0`, `@tokenring-ai/ai-client@0.1.0`, `@tokenring-ai/utility@0.1.0`
- `@inquirer/prompts@^7.8.2`, `inquirer@^12.9.2`
- `chalk@^5.5.0`, `ora@^8.2.0`
- `@tokenring-ai/inquirer-command-prompt@2.0.0`, `@tokenring-ai/inquirer-tree-selector@2.0.0`
- `open`, `execa@^9.6.0`, `fs/promises` (Node built-in)
- Dev: `vitest@^3.2.4`, `typescript@^5.9.2`

Internal workspace deps like `@dotenvx/dotenvx`, `@dqbd/tiktoken` may be used indirectly.

## Contributing/Notes

- **Testing**: Run `npm test` with Vitest. Focus on unit tests for commands and integration tests for REPL loops.
- **Building**: `npm run build` uses tsconfig.json for compilation.
- **Extensions**: Add new commands by creating `.ts` files in `commands/` with `execute` and optional `help`. Export in
  `chatCommands.ts`.
- **Limitations**: Not fully sandboxed; shell commands (e.g., in `edit`) use `execa` with inherit stdio. Binary files
  skipped in searches. Max 50 results for file searches if using tools.
- **Best Practices**: Code follows TypeScript strict mode. Error handling is basic (console/agent logs); consider adding
  more robust logging.
- **License**: MIT (see LICENSE).

This documentation is based on the current codebase (v0.1.0). For updates, refer to source files.