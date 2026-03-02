# @tokenring-ai/cli

## Overview

The `@tokenring-ai/cli` package provides a comprehensive command-line interface for interacting with TokenRing AI agents. This terminal-based interface enables users to manage agents, execute commands, and handle human interface requests with a rich, responsive UI. The package supports two UI frameworks: **OpenTUI** (default) and **Ink**, allowing you to choose the rendering engine that best fits your needs.

## Key Features

- **Dual UI Framework Support**: Choose between OpenTUI or Ink for rendering
- **Agent Management**: Spawn, select, and interact with multiple agent types
- **Interactive Chat**: Real-time streaming of agent output with syntax highlighting
- **Command History**: Navigate previous inputs with arrow keys
- **Auto-completion**: Command and input auto-completion support
- **Human Interface Handling**: Interactive forms for agent questions and requests
- **Responsive Layout**: Adapts to different terminal sizes (narrow, compact, wide)
- **Customizable Theme**: Full theming support for colors and styling
- **Background Loading Screen**: Optional loading screen while agents initialize
- **Graceful Shutdown**: Proper signal handling and cleanup

## Installation

```bash
bun add @tokenring-ai/cli
```

## Dependencies

### Runtime Dependencies

- `@tokenring-ai/app` (0.2.0)
- `@tokenring-ai/chat` (0.2.0)
- `@tokenring-ai/agent` (0.2.0)
- `@tokenring-ai/utility` (0.2.0)
- `@tokenring-ai/web-host` (0.2.0)
- `@tokenring-ai/workflow` (0.2.0)
- `@tokenring-ai/filesystem` (0.2.0)
- `zod` (^4.3.6)
- `@inquirer/prompts` (^8.3.0)
- `execa` (^9.6.1)
- `chalk` (^5.6.2)
- `open` (^11.0.0)
- `@opentui/core` (^0.1.84)
- `@opentui/react` (^0.1.84)
- `react` (^19.2.4)
- `ink` (^6.6.0)
- `fullscreen-ink` (^0.1.0)

### Development Dependencies

- `vitest` (^4.0.18)
- `typescript` (^5.9.3)
- `@types/react` (^19.2.14)

## Chat Commands

Available commands in the agent CLI interface:

### /multi - Open an editor for multiline input

The `/multi` command opens your default text editor where you can write and edit multi-line text. This is useful for complex prompts, code examples, or detailed instructions that would be difficult to type line by line.

**Usage:**
```
/multi
```

**Behavior:**
- Opens your system's default text editor (`EDITOR` environment variable)
- If no `EDITOR` is set, uses `vi` on Unix/Linux, `notepad` on Windows
- Start with a blank editor or continue from previous input
- Save and close the editor to submit your text as input
- If you cancel or provide empty input, nothing will be sent

**Examples:**
```
/multi                    # Open editor with blank content
/multi Write a story...   # Open editor with initial text
/multi #include <stdio.h> # Start with code snippet
```

## Core Components/API

### AgentCLI Service

The main service that manages CLI operations, including user input, agent selection, and interaction handling.

**Interface:**
```typescript
class AgentCLI implements TokenRingService {
  readonly name = "AgentCLI";
  description = "Command-line interface for interacting with agents";

  constructor(
    readonly app: TokenRingApp,
    readonly config: z.infer<typeof CLIConfigSchema>
  );

  async run(signal: AbortSignal): Promise<void>;
}
```

**Constructor Parameters:**
- `app`: The `TokenRingApp` instance to manage agents
- `config`: CLI configuration object matching `CLIConfigSchema`

**Methods:**

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `run` | Starts the CLI interface and manages agent interactions | `signal: AbortSignal` | `Promise<void>` |

**Behavior:**
- Displays loading screen (if no auto-start agent configured)
- Presents agent selection screen
- Spawns selected agent and enters interaction loop
- Handles SIGINT for graceful shutdown
- Restarts agent selection after agent completion (unless `startAgent.shutdownWhenDone` is true)

### AgentLoop Class

Handles the interactive loop for individual agents, managing input collection, event rendering, and human request handling.

**Interface:**
```typescript
class AgentLoop {
  constructor(
    readonly agent: Agent,
    readonly options: AgentLoopOptions
  );

  async run(externalSignal: AbortSignal): Promise<void>;
}
```

**AgentLoopOptions Interface:**
```typescript
interface AgentLoopOptions {
  availableCommands: string[];
  rl: readline.Interface;
  config: z.infer<typeof CLIConfigSchema>;
}
```

**Properties:**
- `agent`: The `Agent` instance to interact with
- `options`: Configuration including available commands, readline interface, and CLI config

**Methods:**

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `run` | Starts the agent interaction loop | `externalSignal: AbortSignal` | `Promise<void>` |

**Event Handling:**
The `AgentLoop` processes the following agent events:
- `agent.created`: Display agent creation message
- `agent.stopped`: Shutdown the interaction loop
- `reset`: Display reset message
- `abort`: Display abort message
- `output.artifact`: Display artifact information
- `output.chat`: Stream chat output with formatting
- `output.reasoning`: Stream reasoning output with formatting
- `output.info/warning/error`: Display system messages
- `input.received`: Display user input
- `input.handled`: Display input handling status
- `question.request`: Display agent question to user
- `question.response`: Display response to agent question

**Spinner Management:**
- Automatically starts/stops spinner based on agent execution state
- Uses `SimpleSpinner` for visual feedback during busy operations
- Syncs with `exec.busyWith` property from execution state

### commandPrompt Function

Provides a prompt implementation using a shared Node.js readline interface with history and auto-completion support.

**Interface:**
```typescript
interface CommandPromptOptions {
  rl: readline.Interface;
  message: string;
  prefix?: string;
  history?: string[];
  autoCompletion?: string[] | ((line: string) => Promise<string[]> | string[]);
  signal?: AbortSignal;
}

async function commandPrompt(options: CommandPromptOptions): Promise<string>
```

**Parameters:**
- `rl`: Shared readline interface instance
- `message`: Prompt message to display
- `prefix`: Optional prefix text (e.g., "user")
- `history`: Array of previous commands for history navigation
- `autoCompletion`: Array of completion suggestions or function to generate them
- `signal`: Optional abort signal for cancellation

**Returns:**
- The trimmed input string if user submits
- Throws `PartialInputError` if aborted with non-empty buffer

**Usage:**
```typescript
import readline from 'node:readline';
import { commandPrompt } from '@tokenring-ai/cli';

const rl = readline.createInterface(process.stdin, process.stdout);

const answer = await commandPrompt({
  rl,
  message: '>',
  prefix: chalk.yellowBright('user'),
  history: ['help', 'status', 'config'],
  autoCompletion: ['help', 'status', 'config', 'shutdown'],
});

console.log('User entered:', answer);
```

### SimpleSpinner Class

Custom spinner class that renders a simple animation in the terminal. Designed to work with abort signals without conflicting with Ctrl-C handling.

**Interface:**
```typescript
class SimpleSpinner {
  constructor(message?: string, hexColor?: string);

  start(message?: string): void;
  stop(): void;
  updateMessage(message: string): void;
}
```

**Constructor Parameters:**
- `message`: Initial message to display next to spinner
- `hexColor`: Hex color code for spinner (default: "#ffffff")

**Methods:**

| Method | Description | Parameters |
|--------|-------------|------------|
| `start` | Starts the spinner animation | `message?: string` |
| `stop` | Stops the spinner and shows cursor | - |
| `updateMessage` | Updates the spinner message | `message: string` |

**Usage:**
```typescript
import { SimpleSpinner } from '@tokenring-ai/cli';

const spinner = new SimpleSpinner('Loading...', '#FFEB3BFF');
spinner.start();

// Perform async operation
await someAsyncOperation();

spinner.stop();
```

**Frames:** The spinner uses 10 frames: `⠋`, `⠙`, `⠹`, `⠸`, `⠼`, `⠴`, `⠦`, `⠧`, `⠇`, `⠏`

### CLIConfigSchema

Zod schema for CLI configuration validation.

**Schema Definition:**
```typescript
const CLIConfigSchema = z.object({
  chatBanner: z.string(),
  loadingBannerNarrow: z.string(),
  loadingBannerWide: z.string(),
  loadingBannerCompact: z.string(),
  screenBanner: z.string(),
  uiFramework: z.enum(['ink', 'opentui']).default('opentui'),
  startAgent: z.object({
    type: z.string(),
    prompt: z.string().optional(),
    shutdownWhenDone: z.boolean().default(true),
  }).optional(),
});
```

**Configuration Options:**

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `chatBanner` | string | Yes | - | Banner message displayed during agent chat sessions |
| `loadingBannerNarrow` | string | Yes | - | Banner for narrow terminal windows during loading |
| `loadingBannerWide` | string | Yes | - | Banner for wide terminal windows during loading |
| `loadingBannerCompact` | string | Yes | - | Banner for compact terminal layouts during loading |
| `screenBanner` | string | Yes | - | Banner message displayed on all interactive screens |
| `uiFramework` | 'ink' \\| 'opentui' | No | 'opentui' | UI rendering framework to use |
| `startAgent` | object | No | undefined | Optional agent to automatically spawn on startup |
| `startAgent.type` | string | If startAgent | - | Agent type to spawn |
| `startAgent.prompt` | string | If startAgent | undefined | Initial prompt to send to the agent |
| `startAgent.shutdownWhenDone` | boolean | If startAgent | true | Whether to shutdown after agent completes |

## Theme Configuration

The CLI uses a color theme defined in `theme.ts` that controls the appearance of all UI elements.

**Theme Properties:**

```typescript
const theme = {
  // Agent selection
  agentSelectionBanner: '#ffffff',
  agentSelectionBannerBackground: '#2c2c2c',
  
  // Question screen
  questionScreenBanner: '#ffffff',
  questionScreenBannerBackground: '#cf6e32',
  
  // General panel background style
  panelBackground: '#1e1e1e',
  screenBackground: '#1e1e1e',
  
  // Ask screen
  askMessage: '#00BCD4FF',
  
  // Confirmation screen
  confirmYes: '#66BB6AFF',
  confirmNo: '#EF5350FF',
  confirmInactive: '#9E9E9EFF',
  confirmTimeout: '#FFEB3BFF',
  
  // Chat styles
  chatOutputText: '#66BB6AFF',
  chatReasoningText: '#FFEB3BFF',
  chatPreviousInput: '#8c6ac6',
  chatSystemInfoMessage: '#64B5F6FF',
  chatSystemWarningMessage: '#FFEB3BFF',
  chatSystemErrorMessage: '#EF5350FF',
  chatDivider: '#9E9E9EFF',
  chatSpinner: '#FFEB3BFF',
  chatInputReceived: '#6699CCFF',
  chatInputHandledSuccess: '#99CC99FF',
  chatQuestionRequest: '#00BCD4FF',
  chatQuestionResponse: '#00BCD4FF',
  chatReset: '#AB47BCFF',
  chatAbort: '#EF5350FF',
  
  // Box styles
  boxTitle: '#FFF176FF',
  
  // Tree Selection screen
  treeMessage: '#00BCD4FF',
  treePartiallySelectedItem: '#FFF176FF',
  treeFullySelectedItem: '#66BB6AFF',
  treeNotSelectedItem: '#9E9E9EFF',
  treeHighlightedItem: '#FFEB3BFF',
  treeTimeout: '#FFEB3BFF',
  
  // Loading screen
  loadingScreenBackground: '#27292c',
  loadingScreenBannerBackground: '#2c2e32',
  loadingScreenText: '#f0f9ff',
} as const;
```

**Theme Usage:**

The theme is automatically applied to all UI components:
- **OpenTUI components**: Use `fg` and `backgroundColor` props with theme values
- **Ink components**: Use `color` and `backgroundColor` props with theme values
- **Terminal output**: Uses `chalk.hex()` with theme values

## Services

### AgentCLI

The CLI package implements the `TokenRingService` interface through the `AgentCLI` class.

**Service Registration:**
```typescript
import TokenRingApp from '@tokenring-ai/app';
import AgentCLI from '@tokenring-ai/cli';

const app = new TokenRingApp();

app.addServices(new AgentCLI(app, {
  chatBanner: 'TokenRing CLI',
  loadingBannerNarrow: 'Loading...',
  loadingBannerWide: 'Loading TokenRing CLI...',
  loadingBannerCompact: 'Loading',
  screenBanner: 'TokenRing CLI',
  uiFramework: 'opentui',
}));

await app.start();
```

## Providers

The CLI package does not define any providers that register with a KeyedRegistry.

## RPC Endpoints

The CLI package does not define any RPC endpoints.

## State Management

The CLI package manages the following state components through the agent system:

- **AgentEventCursor**: Tracks current position in the event stream
- **AgentEventState**: Manages agent event history and rendering state
- **AgentExecutionState**: Tracks agent execution status and active operations
- **CommandHistoryState**: Manages input history for command completion

**State Integration:**
```typescript
// Access event state
const eventState = agent.getState(AgentEventState);

// Get events since last cursor position
const events = eventState.yieldEventsByCursor(cursor);

// Update cursor after processing
cursor = eventState.getEventCursorFromCurrentPosition();
```

## Plugin Configuration

The CLI plugin supports configuration options that define the user interface behavior and appearance.

**Plugin Installation:**
```typescript
import TokenRingApp from '@tokenring-ai/app';
import cliPlugin from '@tokenring-ai/cli';

const app = new TokenRingApp();

const config = {
  cli: {
    chatBanner: 'TokenRing CLI',
    loadingBannerNarrow: 'Loading...',
    loadingBannerWide: 'Loading TokenRing CLI...',
    loadingBannerCompact: 'Loading',
    screenBanner: 'TokenRing CLI',
    uiFramework: 'opentui',
    startAgent: {
      type: 'coder',
      prompt: 'Write a function to calculate Fibonacci',
      shutdownWhenDone: true,
    },
  },
};

app.install(cliPlugin, config);
await app.start();
```

## Usage Examples

### Basic CLI Usage with Plugin

```typescript
import TokenRingApp from '@tokenring-ai/app';
import cliPlugin from '@tokenring-ai/cli';

const app = new TokenRingApp();

const config = {
  cli: {
    chatBanner: 'TokenRing CLI',
    loadingBannerNarrow: 'Loading...',
    loadingBannerWide: 'Loading TokenRing CLI...',
    loadingBannerCompact: 'Loading',
    screenBanner: 'TokenRing CLI',
    uiFramework: 'opentui',
  },
};

app.install(cliPlugin, config);
await app.start();
```

### Manual CLI Usage (without plugin)

```typescript
import TokenRingApp from '@tokenring-ai/app';
import AgentCLI from '@tokenring-ai/cli';

const app = new TokenRingApp();

app.addServices(new AgentCLI(app, {
  chatBanner: 'TokenRing CLI',
  loadingBannerNarrow: 'Loading...',
  loadingBannerWide: 'Loading TokenRing CLI...',
  loadingBannerCompact: 'Loading',
  screenBanner: 'TokenRing CLI',
  uiFramework: 'opentui',
}));

await app.start();
```

### Starting a Specific Agent

```typescript
const config = {
  cli: {
    chatBanner: 'TokenRing CLI',
    uiFramework: 'opentui',
    startAgent: {
      type: 'coder',
      prompt: 'Help me debug this issue...',
      shutdownWhenDone: false, // Keep agent running after completion
    },
  },
};
```

### Using Ink Framework

```typescript
const config = {
  cli: {
    chatBanner: 'TokenRing CLI',
    uiFramework: 'ink', // Use Ink instead of OpenTUI
    loadingBannerNarrow: 'Loading...',
    loadingBannerWide: 'Loading TokenRing CLI...',
    loadingBannerCompact: 'Loading',
    screenBanner: 'TokenRing CLI',
  },
};
```

### Custom Theme Usage

```typescript
import { theme } from '@tokenring-ai/cli/theme';

// Access theme colors for custom components
const successColor = theme.chatOutputText;
const warningColor = theme.chatSystemWarningMessage;
const errorColor = theme.chatSystemErrorMessage;
```

## Package Structure

```
pkg/cli/
├── commands/                      # Chat command implementations
│   └── multi.ts                   # /multi command implementation
├── components/                    # UI components (framework-specific)
│   └── inputs/                    # Input components
│       ├── FileSelect.tsx         # File selection component
│       ├── FormInput.tsx          # Form input component
│       ├── TextInput.tsx          # Text input component
│       ├── TreeSelect.tsx         # Tree selection component
│       └── types.ts               # Input component types
├── hooks/                         # Shared React hooks
│   ├── useAbortSignal.ts          # Shared abort signal hook
│   └── useResponsiveLayout.ts     # Shared responsive layout hook
├── ink/                           # Ink-specific implementations
│   ├── components/                # Ink UI components
│   │   └── inputs/                # Ink input components
│   ├── hooks/                     # Ink React hooks
│   │   └── useResponsiveLayout.ts # Ink responsive layout
│   ├── screens/                   # Ink screen components
│   │   ├── AgentSelectionScreen.tsx
│   │   ├── LoadingScreen.tsx
│   │   └── QuestionInputScreen.tsx
│   └── renderScreen.tsx           # Ink screen rendering
├── opentui/                       # OpenTUI-specific implementations
│   ├── components/                # OpenTUI UI components
│   │   └── inputs/                # OpenTUI input components
│   ├── hooks/                     # OpenTUI React hooks
│   │   └── useResponsiveLayout.ts # OpenTUI responsive layout
│   ├── screens/                   # OpenTUI screen components
│   │   ├── AgentSelectionScreen.tsx
│   │   ├── LoadingScreen.tsx
│   │   └── QuestionInputScreen.tsx
│   └── renderScreen.tsx           # OpenTUI screen rendering
├── utility/                       # Utility functions
│   └── applyMarkdownStyles.ts     # Markdown styling utility
├── AgentCLI.ts                    # Main CLI service class
├── AgentLoop.ts                   # Agent interaction loop handler
├── commandPrompt.ts               # Command prompt with history support
├── SimpleSpinner.ts               # Spinner component for loading states
├── theme.ts                       # Color theme definitions
├── commands.ts                    # Chat commands export
├── plugin.ts                      # Plugin definition
├── index.ts                       # Main entry point
├── schema.ts                      # Configuration schema definition
├── package.json
└── README.md
```

### Key Files

| File | Description |
|------|-------------|
| `AgentCLI.ts` | Main service class that coordinates CLI operations |
| `AgentLoop.ts` | Handles the interaction loop for individual agents |
| `commandPrompt.ts` | Provides readline-based input with history and completion |
| `SimpleSpinner.ts` | Custom spinner implementation that integrates with abort signals |
| `renderScreen.tsx` | Renders interactive UI screens (both frameworks) |
| `theme.ts` | Defines the color theme used throughout the CLI |
| `schema.ts` | Configuration schema using Zod |
| `plugin.ts` | Plugin definition for easy installation |
| `index.ts` | Main entry point exporting `AgentCLI` and `CLIConfigSchema` |

## Integration

### Integration with Agent System

The CLI integrates with the agent system through:

1. **Agent Selection**: Presents available agents from `AgentManager` service
2. **Event Subscription**: Subscribes to `AgentEventState` for real-time updates
3. **Input Handling**: Sends user input via `agent.handleInput()`
4. **Question Responses**: Sends responses to agent questions via `agent.sendQuestionResponse()`
5. **Command Registration**: Registers chat commands via `AgentCommandService`

### Plugin Registration

```typescript
import cliPlugin from '@tokenring-ai/cli';

app.install(cliPlugin, {
  cli: {
    chatBanner: 'TokenRing CLI',
    loadingBannerNarrow: 'Loading...',
    loadingBannerWide: 'Loading TokenRing CLI...',
    loadingBannerCompact: 'Loading',
    screenBanner: 'TokenRing CLI',
    uiFramework: 'opentui',
  },
});
```

### Service Registration

```typescript
import AgentCLI from '@tokenring-ai/cli';

app.addServices(new AgentCLI(app, {
  chatBanner: 'TokenRing CLI',
  loadingBannerNarrow: 'Loading...',
  loadingBannerWide: 'Loading TokenRing CLI...',
  loadingBannerCompact: 'Loading',
  screenBanner: 'TokenRing CLI',
  uiFramework: 'opentui',
}));
```

### Command Registration

The plugin automatically registers commands with `AgentCommandService`:

```typescript
// In plugin.ts
app.waitForService(AgentCommandService, agentCommandService =>
  agentCommandService.addAgentCommands(agentCommands)
);
```

## Best Practices

### Signal Handling

Always pass abort signals to long-running operations:

```typescript
async function handleUserInput(signal: AbortSignal) {
  try {
    const input = await commandPrompt({
      rl,
      message: '>',
      signal,
    });
    // Process input
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Handle abort gracefully
    }
  }
}
```

### Responsive Layout

Use the responsive layout hook to adapt UI to terminal size:

```typescript
import { useResponsiveLayout } from '@tokenring-ai/cli/hooks/useResponsiveLayout';

function MyComponent() {
  const { isNarrow, isCompact, maxVisibleItems, width, height } = useResponsiveLayout();
  
  return (
    <Container>
      {isNarrow ? <CompactView /> : <FullView />}
    </Container>
  );
}
```

### Error Handling

Handle errors gracefully in the agent loop:

```typescript
try {
  await agentLoop.run(signal);
} catch (error) {
  process.stderr.write(formatLogMessages(['Error while running agent loop', error]));
  await setTimeout(1000);
}
```

### Theme Consistency

Use theme colors consistently across components:

```typescript
import { theme } from '@tokenring-ai/cli/theme';
import chalk from 'chalk';

const errorText = chalk.hex(theme.chatSystemErrorMessage)('Error occurred');
```

## Testing and Development

### Running Tests

```bash
# Run tests
bun test

# Run tests in watch mode
bun run test:watch

# Run with coverage
bun run test:coverage
```

### Building

```bash
# Type check
bun run build
```

### Package Structure

The package uses TypeScript with ES modules:

```json
{
  "type": "module",
  "exports": {
    ".": "./index.ts",
    "./*": "./*.ts"
  },
  "types": "./dist-types/index.d.ts"
}
```

## License

MIT License - see LICENSE file for details.
