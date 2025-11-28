# @tokenring-ai/cli

A comprehensive command-line interface for interacting with TokenRing AI agents. This package provides an interactive REPL (Read-Eval-Print Loop) experience for managing AI agents, executing commands, and handling human interface requests.

## Overview

The `@tokenring-ai/cli` package serves as the primary CLI entry point for the TokenRing AI system. It enables users to:

- **Agent Management**: Select from running agents or create new ones
- **Interactive Chat**: Communicate with AI agents through a terminal interface
- **Built-in Commands**: Execute slash-prefixed commands like `/help`, `/edit`, `/multi`
- **Human Interface Requests**: Handle confirmations, selections, password prompts, and more
- **Keyboard Shortcuts**: Use Ctrl-T for quick actions and navigation
- **Real-time Events**: Stream agent outputs (chat, reasoning, system messages)

## Installation

This package is part of the TokenRing AI monorepo. To install and use:

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test
```

### Dependencies

- **Core**: `@tokenring-ai/agent`, `@tokenring-ai/app`, `@tokenring-ai/utility`
- **CLI Prompts**: `@inquirer/prompts`, `@tokenring-ai/inquirer-command-prompt`, `@tokenring-ai/inquirer-tree-selector`
- **Utilities**: `chalk`, `ora`, `execa`, `open`
- **Development**: `typescript`, `vitest`

### Environment Variables

- `EDITOR`: Default editor for `/edit` command (defaults to `vi` on Unix, `notepad` on Windows)

## Usage

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

### Plugin Integration

The CLI is designed as a TokenRing plugin that integrates seamlessly with the main application:

```typescript
export default {
  name: "@tokenring-ai/cli",
  version: "0.1.0", 
  description: "TokenRing CLI",
  install(app: TokenRingApp) {
    app.waitForService(AgentCommandService, agentCommandService =>
      agentCommandService.addAgentCommands(chatCommands)
    );
    const config = app.getConfigSlice('cli', CLIConfigSchema);
    app.addServices(new AgentCLIService(app, config));
  },
} as TokenRingPlugin;
```

## Configuration

### CLI Configuration Schema

```typescript
export const CLIConfigSchema = z.object({
  banner: z.string().optional().default("Welcome to TokenRing CLI"),
  bannerColor: z.string().optional().default("cyan"),
});
```

### Configuration Options

- **banner**: Welcome message displayed on startup
- **bannerColor**: Color for the banner (uses Chalk color names)

## Core Features

### Agent Selection & Management

- Connect to existing running agents
- Create new agents of various types
- Switch between running agents
- Exit or detach from agents

### Interactive Commands

| Command  | Description                     | Usage          |
|----------|---------------------------------|----------------|
| `/help`  | Show available commands         | `/help`        |
| `/exit`  | Exit current agent              | `/exit`        |
| `/quit`  | Quit current agent              | `/quit`        |
| `/multi` | Open editor for multiline input | `/multi`       |
| `/edit`  | Open system editor for prompt   | `/edit [text]` |

### Keyboard Shortcuts

**Ctrl-T Actions:**
- `Ctrl-T` - Show help for shortcuts
- `Ctrl-T c` - Create new agent (same type as current)
- `Ctrl-T n` - Switch to next running agent
- `Ctrl-T p` - Switch to previous running agent
- `Ctrl-T s` - Return to agent selector
- `Ctrl-T x` - Exit current agent
- `Ctrl-T d` - Detach from agent (keeps running)

**General:**
- `↑/↓` - Navigate command history
- `Esc` - Cancel current operation
- `Ctrl-C` - Exit or abort current operation

### Human Interface Requests

The CLI handles various types of human interface requests:

- **Ask**: Open editor for multi-line responses
- **Confirm**: Yes/no prompts
- **Selection**: Single choice from list
- **Multiple Selection**: Choose multiple items
- **Tree Selection**: Navigate hierarchical structures
- **Password**: Secure input prompts
- **Open Web Page**: Launch URLs in browser

## API Reference

### AgentCLIService

Main service class implementing the CLI functionality.

```typescript
export default class AgentCLIService implements TokenRingService {
  constructor(app: TokenRingApp, config: z.infer<typeof CLIConfigSchema>)
  async start(): Promise<void>
}
```

### Input Handlers

Utility functions for handling different types of user input:

```typescript
// Command input with auto-completion
askForCommand(options: AskForCommandOptions, signal: AbortSignal): Promise<string | ExitToken | CancellationToken>

// Multi-line editor input
ask(options: AskRequest, signal: AbortSignal): Promise<string>

// Confirmation prompts
askForConfirmation(options: AskForConfirmationOptions, signal: AbortSignal): Promise<boolean>

// Selection prompts
askForSelection(options: AskForSelectionOptions, signal: AbortSignal): Promise<string>
askForMultipleSelections(options: AskForMultipleSelectionOptions, signal: AbortSignal): Promise<string[]>

// Tree-based selection
askForSingleTreeSelection(options: AskForSingleTreeSelectionOptions, signal: AbortSignal): Promise<string | null>
askForMultipleTreeSelection(options: AskForMultipleTreeSelectionOptions, signal: AbortSignal): Promise<string[] | null>

// Password input
askForPassword(options: AskForPasswordOptions, signal: AbortSignal): Promise<string>

// Web page opening
openWebPage(options: OpenWebPageRequest): Promise<void>
```

### Chat Commands

Built-in commands that can be executed within agent sessions:

```typescript
// Each command exports:
{
  description: string;
  execute(args: string, agent: Agent): Promise<void>;
  help(): string[];
}
```

## Package Structure

```
pkg/cli/
├── index.ts                 # Main entry point and plugin definition
├── AgentCLIService.ts       # Core CLI service implementation
├── inputHandlers.ts         # Human interface request handlers
├── chatCommands.ts          # Command exports
├── ctrlTHandler.ts          # Ctrl-T keyboard shortcut handler
├── commands/                # Individual command implementations
│   ├── help.ts
│   ├── exit.ts
│   ├── quit.ts
│   ├── multi.ts
│   └── edit.ts
├── package.json
├── tsconfig.json
├── vitest.config.js
└── README.md
```

## Event Handling

The CLI processes various agent events in real-time:

- **output.chat**: Chat messages (green color)
- **output.reasoning**: Agent reasoning (yellow color)
- **output.system**: System messages with levels (error/warning/info)
- **state.busy**: Loading states with spinners
- **state.idle**: Ready for user input
- **state.exit**: Agent exit notifications
- **input.received**: Echo user input
- **human.request**: Handle interactive prompts

## Examples

### Basic Agent Interaction

```typescript
// 1. Start the CLI
await app.start();

// 2. Select or create an agent
// CLI will show agent selection menu

// 3. Chat with the agent
// Type your questions and press Enter

// 4. Use commands
/help          # Show available commands
/edit          # Open editor for prompt
/multi         # Open multiline editor
/exit          # Return to agent selection
```

### Custom Command Integration

```typescript
// Add custom commands to chatCommands.ts
export const customCommand = {
  description: "/custom - Execute custom functionality",
  async execute(args: string, agent: Agent): Promise<void> {
    agent.handleInput({message: `Custom command: ${args}`});
  },
  help(): string[] {
    return ["/custom - Execute custom functionality"];
  }
};
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Adding New Commands

1. Create a new file in `commands/` directory
2. Implement the command interface:
   ```typescript
   export default {
     description: string,
     execute(args: string, agent: Agent): Promise<void>,
     help(): string[]
   } as TokenRingAgentCommand;
   ```
3. Export the command in `chatCommands.ts`

## License

MIT License - see LICENSE file for details.

## Contributing

1. Follow TypeScript best practices
2. Add appropriate error handling
3. Include tests for new functionality
4. Update documentation as needed

This CLI package provides a robust, extensible interface for interacting with TokenRing AI agents, featuring real-time event processing, comprehensive command support, and intuitive user interactions.