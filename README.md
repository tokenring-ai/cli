# @tokenring-ai/cli

## Overview

A command-line interface for interacting with TokenRing AI agents. This package provides an interactive terminal-based interface for managing AI agents, executing commands, and handling human interface requests. It serves as the primary CLI entry point for the TokenRing AI system, enabling seamless agent management and interaction through a terminal.

## Features

- **Agent Management**: Select from running agents, connect to them, or create new ones
- **Interactive Chat**: Communicate with AI agents through a terminal interface
- **Chat Commands**: Execute slash-prefixed commands like `/edit`, `/multi`
- **Human Interface Requests**: Handle confirmations, text inputs, password prompts, form submissions, tree selections, and web page interactions
- **Keyboard Shortcuts**: Intuitive key combinations for navigation and interaction
- **Real-time Events**: Stream agent outputs (chat, reasoning, system messages) with color-coded formatting
- **Custom Screens**: Render interactive UI screens for various interaction types using OpenTUI
- **Responsive Layout**: Automatically adjusts to terminal window size
- **Command History**: Input history with up/down arrow navigation
- **Auto-completion**: Command auto-completion with tab key support

## Installation

```bash
bun install @tokenring-ai/cli
```

## Core Components

### AgentCLI Service

Main service class implementing the CLI functionality.

#### Constructor

```typescript
new AgentCLI(app: TokenRingApp, config: z.infer<typeof CLIConfigSchema>)
```

#### Methods

- `async run(): Promise<void>` - Start the CLI application and begin processing user input

- `private async selectOrCreateAgent(): Promise<Agent | null>` - Display agent selection menu and create new agents if needed

- `private async runAgentLoop(agent: Agent): Promise<void>` - Main loop for interacting with a selected agent

- `private async gatherInput(agent: Agent, signal: AbortSignal): Promise<string>` - Handle command input with auto-completion

- `private async handleHumanRequest(request: HumanInterfaceRequest, id: string, signal: AbortSignal): Promise<[id: string, reply: any]>` - Handle various human interface requests (confirmations, selections, etc.)

- `private async withAbortSignal<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T>` - Execute functions with abort signal support

### Chat Commands

Built-in commands that can be executed within agent sessions:

| Command | Description | Usage |
|---------|-------------|-------|
| `/edit` | Open system editor for prompt | `/edit [text]` |
| `/multi` | Open editor for multiline input | `/multi` |

### Human Interface Request Types

The CLI handles the following human interface request types:

| Request Type | Description |
|--------------|-------------|
| `askForText` | Text input prompt |
| `askForConfirmation` | Yes/no confirmation |
| `askForPassword` | Password input |
| `askForForm` | Form input |
| `askForSingleTreeSelection` | Single item tree selection |
| `askForMultipleTreeSelection` | Multiple item tree selection |
| `openWebPage` | Open web page |

## Configuration

### CLI Configuration Schema

```typescript
export const CLIConfigSchema = z.object({
  bannerNarrow: z.string(),
  bannerWide: z.string(),
  bannerCompact: z.string(),
})
```

### Configuration Options

- **bannerNarrow**: Banner message for narrow terminal windows
- **bannerWide**: Banner message for wide terminal windows (default)
- **bannerCompact**: Banner message for compact terminal layouts

## Usage Examples

### Basic Usage

```typescript
import TokenRingApp from "@tokenring-ai/app";
import cliPlugin from "@tokenring-ai/cli";

// Create and configure the app
const app = new TokenRingApp();
app.install(cliPlugin);

// Start the CLI
await app.start();
```

### Human Interface Request Handling

```typescript
// Handle confirmation request
const response = await agent.askHuman({
  type: "askForConfirmation",
  message: "Do you want to proceed?",
  default: true,
  timeout: 10
});
```

## Integration

### TokenRing Plugin

The CLI integrates seamlessly with TokenRing applications:

```typescript
export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    app.waitForService(AgentCommandService, agentCommandService =>
      agentCommandService.addAgentCommands(chatCommands)
    );
    app.addServices(new AgentCLI(app, config.cli));
  },
  config: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
```

### Agent Integration

```typescript
// Access CLI service from agent
const cliService = agent.requireServiceByType(AgentCLI);
```

## Package Structure

```
pkg/cli/
├── src/
│   ├── runTUIScreen.tsx         # Main screen rendering with OpenTUI
│   ├── theme.ts                 # Color theme definitions
│   └── screens/
│       ├── AgentSelectionScreen.tsx  # Agent selection interface
│       ├── AskScreen.tsx             # Text input screen
│       ├── ConfirmationScreen.tsx    # Confirmation prompt screen
│       ├── FormScreen.tsx            # Form input screen
│       ├── PasswordScreen.tsx        # Password input screen
│       ├── TreeSelectionScreen.tsx   # Tree-based selection
│       ├── WebPageScreen.tsx         # Web page opening screen
│       └── ScreenRegistry.ts         # Screen registry
├── commands/
│   ├── edit.ts                  # Edit command implementation
│   └── multi.ts                 # Multi-line command implementation
├── AgentCLI.ts                  # Main service class
├── chatCommands.ts              # Registered chat commands
├── commandPrompt.ts             # Command input with history and auto-completion
├── SimpleSpinnter.ts            # Spinner component for loading states
├── plugin.ts                    # Plugin definition for TokenRing app integration
├── index.ts                     # Main entry point
├── package.json
├── vitest.config.ts
└── README.md
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.
