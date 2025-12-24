# @tokenring-ai/cli

A comprehensive command-line interface for interacting with TokenRing AI agents. This package provides an interactive terminal-based interface for managing AI agents, executing commands, and handling human interface requests with a rich, responsive UI.

## Overview

The `@tokenring-ai/cli` package serves as the primary CLI entry point for the TokenRing AI system. It enables users to:

- **Agent Management**: Select from running agents, connect to them, or create new ones
- **Interactive Chat**: Communicate with AI agents through a terminal interface
- **Built-in Commands**: Execute slash-prefixed commands like `/help`, `/edit`, `/multi`, `/switch`
- **Human Interface Requests**: Handle confirmations, selections, password prompts, and more
- **Keyboard Shortcuts**: Use Ctrl-T for quick actions and navigation
- **Real-time Events**: Stream agent outputs (chat, reasoning, system messages) with color-coded formatting
- **Custom Screens**: Render interactive UI screens for various interaction types using OpenTUI
- **Workflow Integration**: Connect to and execute workflows
- **Web Host Integration**: Access web applications and resources

## Installation

This package is part of the TokenRing AI monorepo. To install and use:

```bash
# Install dependencies
bun install

# Build the package
bun run build

# Run tests
vitest run
```

### Dependencies

- **Core**: `@tokenring-ai/app`, `@tokenring-ai/agent`, `@tokenring-ai/chat`, `@tokenring-ai/utility`
- **CLI Prompts**: `@inquirer/prompts`, `@tokenring-ai/inquirer-command-prompt`
- **Utilities**: `chalk`, `ora`, `execa`, `open`
- **UI Components**: `@opentui/core`, `@opentui/react`, `react`
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
import {AgentCommandService} from "@tokenring-ai/agent";

export default {
  name: "@tokenring-ai/cli",
  version: "0.2.0", 
  description: "TokenRing CLI",
  install(app) {
    app.waitForService(AgentCommandService, agentCommandService => {
      // Add custom commands from chatCommands.ts
      agentCommandService.addAgentCommands(chatCommands);
    });
    const config = app.getConfigSlice('cli', CLIConfigSchema);
    app.addServices(new AgentCLI(app, config));
  },
} satisfies TokenRingPlugin;
```

## Configuration

### CLI Configuration Schema

```typescript
export const CLIConfigSchema = z.object({
  bannerNarrow: z.string(),
  bannerWide: z.string(),
  bannerCompact: z.string(),
});
```

### Configuration Options

- **bannerNarrow**: Banner message for narrow terminal windows
- **bannerWide**: Banner message for wide terminal windows (default)
- **bannerCompact**: Banner message for compact terminal layouts

## Core Features

### Agent Selection & Management

- Connect to existing running agents
- Create new agents of various types
- Switch between running agents
- Exit or detach from agents
- Agent selection with interactive UI
- Workflow integration and execution
- Web host resource access

### Interactive Commands

| Command  | Description                     | Usage          |
|----------|---------------------------------|----------------|
| `/help`  | Show available commands         | `/help`        |
| `/exit`  | Exit current agent              | `/exit`        |
| `/quit`  | Quit current agent              | `/quit`        |
| `/multi` | Open editor for multiline input | `/multi`       |
| `/edit`  | Open system editor for prompt   | `/edit [text]` |
| `/switch`| Return to agent selector        | `/switch`      |

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
- `Ctrl-D` - Submit multiline input in Ask screen
- `Space` - Toggle selection in Tree screen
- `Right/Left` - Expand/Collapse tree nodes

### Human Interface Requests

The CLI handles various types of human interface requests:

- **Ask**: Open editor for multi-line responses (Ctrl-D to submit)
- **Confirm**: Yes/no prompts with timeout support
- **Selection**: Single choice from list
- **Multiple Selection**: Choose multiple items
- **Tree Selection**: Navigate hierarchical structures with expand/collapse
- **Password**: Secure input prompts
- **Open Web Page**: Launch URLs in browser
- **Form**: Fill out structured forms with multiple field types
- **Workflow**: Execute and manage workflows

## API Reference

### AgentCLI Service

Main service class implementing the CLI functionality.

```typescript
export default class AgentCLI implements TokenRingService {
  constructor(app: TokenRingApp, config: z.infer<typeof CLIConfigSchema>)
  async run(): Promise<void>
  private async selectOrCreateAgent(): Promise<Agent | null>
  private async runAgentLoop(agent: Agent): Promise<void>
  private async gatherInput(agent: Agent, signal: AbortSignal): Promise<string>
  private async handleHumanRequest(request: HumanInterfaceRequest, id: string, signal: AbortSignal): Promise<[id: string, reply: any]>
}
```

### Input Handling

Utility functions for handling different types of user input:

```typescript
// Command input with auto-completion
gatherInput(agent: Agent, signal: AbortSignal): Promise<string>

// Human interface request handlers
handleHumanRequest(request: HumanInterfaceRequest, id: string, signal: AbortSignal): Promise<[id: string, reply: any]>
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
├── AgentCLI.ts              # Core CLI service implementation
├── chatCommands.ts          # Command exports
├── commandPrompt.ts         # Custom command prompt implementation
├── SimpleSpinner.ts         # Spinner animation utility
├── src/                    # UI component source
│   ├── runTUIScreen.tsx     # Main UI rendering logic
│   ├── theme.ts            # UI theme configuration
│   ├── screens/            # Interactive screens
│   │   ├── AgentSelectionScreen.tsx
│   │   ├── AskScreen.tsx
│   │   ├── ConfirmationScreen.tsx
│   │   ├── FormScreen.tsx
│   │   ├── PasswordScreen.tsx
│   │   ├── TreeSelectionScreen.tsx
│   │   ├── WebPageScreen.tsx
│   │   └── index.ts        # Screen registry
├── commands/                # Individual command implementations
│   ├── edit.ts
│   └── multi.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Event Handling

The CLI processes various agent events in real-time:

- **output.chat**: Chat messages (green color)
- **output.reasoning**: Agent reasoning (yellow color)
- **output.info**: System messages with levels (info)
- **output.warning**: System warning messages
- **output.error**: System error messages
- **input.handled**: Input processing status
- **input.received**: Echo user input
- **human.request**: Handle interactive prompts
- **busy**: Loading states with spinners
- **idle**: Ready for user input
- **exit**: Agent exit notifications
- **agent.created**: New agent created
- **agent.started**: Agent started
- **agent.stopped**: Agent stopped

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
/switch        # Return to agent selection
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

### Human Interface Request Handling

```typescript
// The CLI automatically handles different request types:
const request = {
  type: "askForConfirmation",
  message: "Are you sure you want to continue?",
  default: true,
  timeout: 10
};

// The CLI will display a confirmation screen and return the user's response
```

## Development

### Testing

```bash
vitest run
```

### Adding New Commands

1. Create a new file in `commands/` directory
2. Implement the command interface:
   ```typescript
   export default {
     description: string,
     execute(args: string, agent: Agent): Promise<void>,
     help(): string[]
   } satisfies TokenRingAgentCommand;
   ```
3. Export the command in `chatCommands.ts`

### Adding New Screens

1. Create a new file in `src/screens/` directory
2. Implement the screen interface:
   ```typescript
   export const YourScreen = ({ /* props */ }) => {
     // Screen implementation
   };
   ```
3. Register the screen in `src/screens/index.ts`

### Adding New Field Types to Form Screen

The FormScreen supports various field types:

```typescript
interface FormField {
  type: 'text' | 'selectOne' | 'selectMany' | 'file' | 'multipleFile' | 'directory';
  label: string;
  defaultValue?: string | string[];
  // Additional field-specific properties
}
```

## License

MIT License - see LICENSE file for details.