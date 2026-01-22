# @tokenring-ai/cli

## Overview

A command-line interface for interacting with TokenRing AI agents. This package provides an interactive terminal-based interface for managing AI agents, executing commands, and handling human interface requests. It serves as the primary CLI entry point for the TokenRing AI system, enabling seamless agent management and interaction through a terminal.

## Features

- **Agent Management**: Select from running agents, spawn new agents, or connect to existing ones
- **Interactive Chat**: Communicate with AI agents through a terminal interface
- **Chat Commands**: Execute slash-prefixed commands like `/edit` and `/multi`
- **Human Interface Requests**: Handle confirmations, text inputs, password prompts, form submissions, tree selections, file selections, and web page interactions
- **Keyboard Shortcuts**: Intuitive key combinations for navigation and interaction
- **Real-time Events**: Stream agent outputs (chat, reasoning, system messages) with color-coded formatting
- **Custom Screens**: Render interactive UI screens for various interaction types using OpenTUI
- **Responsive Layout**: Automatically adjusts to terminal window size
- **Command History**: Input history with up/down arrow navigation
- **Auto-completion**: Command auto-completion with tab key support
- **Editor Integration**: Built-in editor commands for complex prompt creation

## Installation

```bash
bun install @tokenring-ai/cli
```

## Chat Commands

Built-in commands that can be executed within agent sessions:

### /edit

Opens your system's default text editor to create or edit a prompt.

**Usage:**
```
/edit [initial-text]
```

**Arguments:**
- `initial-text` (optional): Text to pre-fill in the editor

**Behavior:**
- Creates a temporary file for editing
- Opens your configured editor (uses `EDITOR` environment variable or defaults to `vi`/`notepad`)
- When you save and close the editor, the content is sent as input to the current agent
- The temporary file is automatically cleaned up after use

**Examples:**
```
/edit                    # Open editor with blank content
/edit Write a story...   # Open editor with initial text
```

### /multi

Opens an editor for multiline input. The entered text will be processed as the next input.

**Usage:**
```
/multi
```

**Behavior:**
- Opens your system's default text editor (uses `EDITOR` environment variable or defaults to `vi`/`notepad`)
- Start with a blank editor or continue from previous input
- Save and close the editor to submit your text as input
- If you cancel or provide empty input, nothing will be sent

**Examples:**
```
/multi                    # Open editor with blank content
/multi Write a story...   # Open editor with initial text
```

## Plugin Configuration

The CLI configuration is optional and defined in the plugin configuration schema:

```typescript
import { z } from "zod";

export const CLIConfigSchema = z.object({
  chatBanner: z.string(),
  loadingBannerNarrow: z.string(),
  loadingBannerWide: z.string(),
  loadingBannerCompact: z.string(),
  screenBanner: z.string(),
});

const packageConfigSchema = z.object({
  cli: CLIConfigSchema.optional()
});
```

### Configuration Options

- **chatBanner**: Banner message displayed during agent chat sessions
- **loadingBannerNarrow**: Banner message for narrow terminal windows during loading
- **loadingBannerWide**: Banner message for wide terminal windows during loading (default)
- **loadingBannerCompact**: Banner message for compact terminal layouts during loading
- **screenBanner**: Banner message displayed on all interactive screens

### Configuration Example

```typescript
import TokenRingApp from "@tokenring-ai/app";
import cliPlugin from "@tokenring-ai/cli";

// Create and configure the app
const app = new TokenRingApp();
app.install(cliPlugin, {
  cli: {
    chatBanner: "TokenRing CLI",
    loadingBannerNarrow: "Loading...",
    loadingBannerWide: "Loading TokenRing CLI...",
    loadingBannerCompact: "Loading...",
    screenBanner: "TokenRing CLI"
  }
});

// Start the CLI
await app.start();
```

## Services

### AgentCLI

Main service class implementing the CLI functionality.

**Interface:**
```typescript
class AgentCLI implements TokenRingService
```

**Constructor:**
```typescript
new AgentCLI(app: TokenRingApp, config: z.infer<typeof CLIConfigSchema>)
```

**Methods:**

- `async run(): Promise<void>` - Start the CLI application and begin processing user input
- `private async selectOrCreateAgent(): Promise<Agent | null>` - Display agent selection menu and create new agents if needed

### AgentLoop

Main loop for interacting with a selected agent, handling events and user input.

**Interface:**
```typescript
class AgentLoop implements TokenRingService
```

**Constructor:**
```typescript
new AgentLoop(agent: Agent, options: AgentLoopOptions)
```

**AgentLoopOptions:**
```typescript
{
  availableCommands: string[];
  rl: readline.Interface;
  config: z.infer<typeof CLIConfigSchema>;
}
```

**Methods:**

- `async run(): Promise<void>` - Main execution loop for agent interaction
- `private async gatherInput(signal: AbortSignal): Promise<string>` - Handle command input with auto-completion
- `private async handleHumanRequest(request: ParsedQuestionRequest, signal: AbortSignal): Promise<[request, response]>` - Handle various human interface requests
- `private async withAbortSignal<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T>` - Execute functions with abort signal support
- `private ensureSigintHandlers()` - Ensure SIGINT handlers are properly set up

## Human Interface Request Types

The CLI handles the following human interface request types through the QuestionInputScreen:

| Request Type | Description | Component |
|--------------|-------------|-----------|
| `text` | Text input prompt | TextInput |
| `treeSelect` | Tree-based item selection | TreeSelect |
| `fileSelect` | File selection from filesystem | FileSelect |
| `form` | Form input with multiple fields | FormInput |

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

### Custom CLI Configuration

```typescript
import TokenRingApp from "@tokenring-ai/app";
import cliPlugin from "@tokenring-ai/cli";

// Create and configure the app with custom CLI settings
const app = new TokenRingApp();
app.install(cliPlugin, {
  cli: {
    chatBanner: "My TokenRing CLI",
    loadingBannerNarrow: "Loading...",
    loadingBannerWide: "Loading My TokenRing CLI...",
    loadingBannerCompact: "Loading...",
    screenBanner: "My TokenRing CLI"
  }
});

await app.start();
```

### Accessing CLI from Agents

```typescript
// Access CLI service from agent
const cliService = agent.requireServiceByType(AgentCLI);
```

## Integration

### TokenRing Plugin

The CLI integrates seamlessly with TokenRing applications:

```typescript
import {AgentCommandService} from "@tokenring-ai/agent";
import {TokenRingPlugin} from "@tokenring-ai/app";
import {z} from "zod";
import AgentCLI from "./AgentCLI.ts";

import chatCommands from "./chatCommands.ts";
import packageJSON from './package.json' with {type: 'json'};
import {CLIConfigSchema} from "./schema.ts";

const packageConfigSchema = z.object({
  cli: CLIConfigSchema.optional()
});

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    if (config.cli) {
      app.waitForService(AgentCommandService, agentCommandService =>
        agentCommandService.addAgentCommands(chatCommands)
      );
      app.addServices(new AgentCLI(app, config.cli));
    }
  },
  config: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
```

### Agent Integration

The CLI service can be accessed by agents through service dependency injection:

```typescript
// Inside an agent's tool or command
const cliService = this.app.requireServiceByType(AgentCLI);
```

## Package Structure

```
pkg/cli/
├── components/
│   └── inputs/
│       ├── TextInput.tsx         # Text input component
│       ├── TreeSelect.tsx        # Tree selection component
│       ├── FileSelect.tsx        # File selection component
│       └── FormInput.tsx         # Form input component
├── commands/
│   ├── edit.ts                   # Edit command implementation
│   └── multi.ts                  # Multi-line command implementation
├── hooks/
│   └── useResponsiveLayout.ts    # Responsive layout management
├── screens/
│   ├── AgentSelectionScreen.tsx  # Agent selection and management interface
│   ├── LoadingScreen.tsx         # Initial loading screen
│   └── QuestionInputScreen.tsx   # Human interface request handling
├── utility/
│   └── applyMarkdownStyles.ts    # Markdown styling utility
├── AgentCLI.ts                   # Main CLI service class
├── AgentLoop.ts                  # Agent execution loop handler
├── commandPrompt.ts              # Command input with history and auto-completion
├── renderScreen.tsx              # Screen rendering utility
├── SimpleSpinner.ts              # Spinner component for loading states
├── theme.ts                      # Color theme definitions
├── chatCommands.ts               # Registered chat commands
├── plugin.ts                     # Plugin definition for TokenRing app integration
├── index.ts                      # Main entry point (exports AgentCLI and CLIConfigSchema)
├── schema.ts                     # Configuration schema definition
├── package.json
├── vitest.config.ts
└── README.md
```

## Keyboard Shortcuts

### Navigation and Input

- **Arrow Up/Down**: Navigate command history
- **Tab**: Auto-complete commands
- **Ctrl-C**: Return to agent selection screen (from agent session)
- **Esc**: Cancel current activity

### Editor Commands

When using `/edit` or `/multi`:
- **Ctrl-C**: Cancel editor without submitting
- **Save and Close**: Submit the edited content

## Event Types

The CLI renders the following agent event types with color-coded formatting:

| Event Type | Description | Color |
|------------|-------------|-------|
| `output.chat` | Regular chat messages from the agent | Chat output text |
| `output.reasoning` | Agent reasoning/thinking process | Reasoning text |
| `output.info` | Informational messages | System info message |
| `output.warning` | Warning messages | System warning message |
| `output.error` | Error messages | System error message |
| `input.received` | User input received | Yellow previous input |
| `input.handled` | User input processing result | Error or success status |

## Screens

### LoadingScreen

Displays a loading banner with automatic timeout (2 seconds). Shows different banners based on terminal width:

- **Wide terminals**: Uses `loadingBannerWide`
- **Narrow terminals**: Uses `loadingBannerNarrow`
- **Compact layouts**: Uses `loadingBannerCompact`

### AgentSelectionScreen

Interactive tree-based interface for:

- **Spawning agents**: Create new agents by type
- **Connecting to agents**: Connect to existing running agents
- **Web applications**: Launch web applications via web host service
- **Running workflows**: Execute predefined workflows

**Features:**
- Responsive layout with side preview panel
- Agent type categorization (configured by agents)
- Current agents listing with status indicators
- Workflow execution with descriptions
- Web application launch capability

**Action Types:**
- `spawn:agentType` - Spawn a new agent of the specified type
- `connect:agentId` - Connect to an existing agent by ID
- `open:url` - Open a web application URL in browser
- `workflow:workflowKey` - Execute a workflow by key

### QuestionInputScreen

Displays human interface request prompts with appropriate input components:

- **TreeSelect**: For hierarchical choices
- **TextInput**: For simple text input
- **FileSelect**: For file browsing with agent context
- **FormInput**: For multi-field forms with agent context

## Dependencies

- **@tokenring-ai/app**: Base application framework
- **@tokenring-ai/agent**: Agent orchestration and state management
- **@tokenring-ai/chat**: Chat agent configuration
- **@tokenring-ai/utility**: Shared utilities
- **@tokenring-ai/web-host**: Web application hosting service
- **@tokenring-ai/workflow**: Workflow execution service
- **@opentui/core**: Terminal UI rendering
- **@opentui/react**: React components for CLI
- **@inquirer/prompts**: Interactive prompts (including editor)
- **chalk**: Terminal color output
- **open**: Open external URLs in browser
- **execa**: Execute shell commands (for editor)

## Development

```bash
# Install dependencies
bun install

# Build the package
bun run build

# Run tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.
