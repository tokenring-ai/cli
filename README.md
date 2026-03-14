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
- **Markdown Styling**: Applied markdown formatting to terminal output
- **File Selection**: Interactive file system browser for file selection questions
- **Tree Selection**: Hierarchical tree-based selection for complex choices
- **Multi-field Forms**: Support for multi-section forms with various field types
- **Bracketed Paste**: Support for bracketed paste mode for efficient text input

## Installation

```bash
bun add @tokenring-ai/cli
```

## Dependencies

### Runtime Dependencies

- `@tokenring-ai/app` (0.2.0)
- `@tokenring-ai/ai-client` (0.2.0)
- `@tokenring-ai/chat` (0.2.0)
- `zod` (^4.3.6)
- `@inquirer/prompts` (^8.3.0)
- `@tokenring-ai/agent` (0.2.0)
- `@tokenring-ai/utility` (0.2.0)
- `@tokenring-ai/web-host` (0.2.0)
- `@tokenring-ai/workflow` (0.2.0)
- `@tokenring-ai/filesystem` (0.2.0)
- `@mishieck/ink-titled-box` (^0.4.2)
- `execa` (^9.6.1)
- `chalk` (^5.6.2)
- `open` (^11.0.0)
- `@opentui/core` (^0.1.86)
- `@opentui/react` (^0.1.86)
- `react` (^19.2.4)
- `ink` (^6.8.0)
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
  availableCommands: CommandDefinition[];
  config: z.infer<typeof CLIConfigSchema>;
}
```

**Properties:**
- `agent`: The `Agent` instance to interact with
- `options`: Configuration including available commands and CLI config

**Methods:**

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `run` | Starts the agent interaction loop | `externalSignal: AbortSignal` | `Promise<void>` |

**Event Handling:**
The `AgentLoop` processes the following agent events:
- `agent.created`: Display agent creation message
- `agent.stopped`: Shutdown the interaction loop
- `output.chat`: Stream chat output with formatting
- `output.reasoning`: Stream reasoning output with formatting
- `output.info/warning/error`: Display system messages
- `output.artifact`: Display artifact information
- `input.received`: Display user input
- `question.request`: Display agent question to user
- `question.response`: Display response to agent question

**State Management:**
- Tracks event cursor for incremental updates
- Subscribes to `AgentEventState` for real-time updates
- Handles abort signals for graceful cancellation

### RawChatUI Class

The main chat UI component that handles terminal rendering, input editing, and interaction management. This is a raw terminal-based UI that works directly with ANSI escape codes.

**Interface:**
```typescript
class RawChatUI {
  constructor(options: RawChatUIOptions);

  start(): void;
  stop(): void;
  suspend(): void;
  resume(): void;
  renderEvent(event: AgentEventEnvelope): void;
  syncState(state: AgentEventState): void;
  flash(text: string, tone?: FlashMessage["tone"], durationMs?: number): void;
}
```

**RawChatUIOptions Interface:**
```typescript
interface RawChatUIOptions {
  agent: Agent;
  config: z.output<typeof CLIConfigSchema>;
  commands: CommandDefinition[];
  onSubmit: (message: string) => void;
  onExit: () => void;
  onAbortCurrentActivity: () => boolean;
}
```

**Properties:**
- `chatEditor`: Multi-line input editor for chat messages
- `transcript`: Array of transcript entries showing conversation history
- `followupEditors`: Map of editors for follow-up interactions
- `questionSessions`: Map of inline question sessions

**Methods:**

| Method | Description | Parameters |
|--------|-------------|------------|
| `start` | Attaches terminal and starts rendering | - |
| `stop` | Detaches terminal and stops rendering | - |
| `suspend` | Temporarily detaches terminal | - |
| `resume` | Re-attaches terminal and replays UI | - |
| `renderEvent` | Renders an agent event to the transcript | `event: AgentEventEnvelope` |
| `syncState` | Synchronizes UI with agent state | `state: AgentEventState` |
| `flash` | Shows a temporary flash message | `text: string`, `tone?: FlashMessage["tone"]`, `durationMs?: number` |

**Keyboard Shortcuts:**
- `Ctrl+C`: Exit the CLI
- `Ctrl+L`: Clear and replay the screen
- `Alt+M` / `F3`: Open model selector
- `Alt+T` / `F4`: Open tools selector
- `Alt+V` / `F5`: Toggle verbose mode
- `Alt+Q` / `F6`: Toggle optional questions
- `Tab`: Command completion
- `Escape`: Cancel current activity
- `Ctrl+O`: Insert newline
- `Ctrl+P` / `Up`: Browse command history (previous)
- `Ctrl+N` / `Down`: Browse command history (next)

**Input Editor Features:**
- Multi-line text editing
- Word navigation (Alt+B/F or Ctrl+Left/Right)
- Line navigation (Home/End)
- Delete operations (Ctrl+U/K/W/D)
- Bracketed paste support

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

### PartialInputError Class

Error class thrown when input is interrupted but contains non-empty buffer.

**Interface:**
```typescript
class PartialInputError extends Error {
  constructor(public buffer: string);
}
```

**Usage:**
```typescript
try {
  const input = await commandPrompt({ rl, message: '>', signal });
} catch (err) {
  if (err instanceof PartialInputError) {
    console.log('Input interrupted with buffer:', err.buffer);
  }
}
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
  verbose: z.boolean().default(false),
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
| `uiFramework` | 'ink' \| 'opentui' | No | 'opentui' | UI rendering framework to use |
| `verbose` | boolean | No | false | Enable verbose output including reasoning and artifacts |
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

### Enable Verbose Mode

```typescript
const config = {
  cli: {
    chatBanner: 'TokenRing CLI',
    uiFramework: 'opentui',
    verbose: true, // Show reasoning and artifacts
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

## Input Components

The CLI package provides several interactive input components for handling agent questions and requests.

### TreeSelect Component

A hierarchical tree selection component for navigating complex option structures.

**Features:**
- Expandable/collapsible tree nodes
- Single or multi-select modes
- Minimum and maximum selection constraints
- Visual feedback for selected/partially selected items
- Keyboard navigation (arrow keys, space, enter)

**Usage:**
```typescript
import TreeSelect from '@tokenring-ai/cli/opentui/components/inputs/TreeSelect';

<TreeSelect
  question={{
    label: 'Select Tools',
    tree: [
      {
        name: 'Code',
        children: [
          { name: 'TypeScript', value: 'typescript' },
          { name: 'JavaScript', value: 'javascript' },
        ],
      },
    ],
    minimumSelections: 1,
    maximumSelections: 3,
    defaultValue: [],
  }}
  onResponse={(selected) => console.log(selected)}
/>
```

### FileSelect Component

An interactive file browser for selecting files and directories from the filesystem.

**Features:**
- Async directory loading
- Expandable directory tree
- File and directory selection
- Visual loading indicators
- Integration with FileSystemService

**Usage:**
```typescript
import FileSelect from '@tokenring-ai/cli/opentui/components/inputs/FileSelect';

<FileSelect
  agent={agent}
  question={{
    label: 'Select Files',
    allowFiles: true,
    allowDirectories: false,
    minimumSelections: 1,
    maximumSelections: 5,
    defaultValue: [],
  }}
  onResponse={(selectedPaths) => console.log(selectedPaths)}
/>
```

### TextInput Component

A multi-line text input component for collecting text responses.

**Features:**
- Multi-line text editing
- Cursor navigation
- Submit with Ctrl+D, cancel with Escape
- Responsive layout adaptation

**Usage:**
```typescript
import TextInput from '@tokenring-ai/cli/opentui/components/inputs/TextInput';

<TextInput
  question={{
    label: 'Your Response',
    description: 'Enter your detailed response here',
    required: true,
    expectedLines: 3,
    defaultValue: '',
    masked: false,
  }}
  onResponse={(response) => console.log(response)}
/>
```

### FormInput Component

A multi-section form component that combines multiple field types.

**Features:**
- Multi-section navigation
- Auto-advance on field completion
- Support for text, treeSelect, and fileSelect fields
- Progress tracking

**Usage:**
```typescript
import FormInput from '@tokenring-ai/cli/opentui/components/inputs/FormInput';

<FormInput
  agent={agent}
  question={{
    sections: [
      {
        name: 'Basic Info',
        fields: {
          name: { type: 'text', label: 'Name', required: true },
          files: { type: 'fileSelect', label: 'Select Files' },
        },
      },
    ],
  }}
  onResponse={(responses) => console.log(responses)}
/>
```

## Package Structure

```
pkg/cli/
├── commands/                      # Chat command implementations
│   └── multi.ts                   # /multi command implementation
├── commands.ts                    # Chat commands export
├── components/                    # UI components (framework-specific)
│   ├── ink/                       # Ink-specific components
│   │   └── components/
│   │       └── inputs/            # Input components
│   │           ├── FileSelect.tsx
│   │           ├── FormInput.tsx
│   │           ├── TextInput.tsx
│   │           ├── TreeSelect.tsx
│   │           └── types.ts
│   │   └── hooks/
│   │       └── useResponsiveLayout.ts
│   │   └── screens/
│   │       ├── AgentSelectionScreen.tsx
│   │       ├── LoadingScreen.tsx
│   │       └── QuestionInputScreen.tsx
│   │   └── renderScreen.tsx
│   └── opentui/                   # OpenTUI-specific components
│       └── components/
│           └── inputs/            # Input components
│               ├── FileSelect.tsx
│               ├── FormInput.tsx
│               ├── TextInput.tsx
│               ├── TreeSelect.tsx
│               └── types.ts
│       └── hooks/
│           └── useResponsiveLayout.ts
│       └── screens/
│           ├── AgentSelectionScreen.tsx
│           ├── LoadingScreen.tsx
│           └── QuestionInputScreen.tsx
│       └── renderScreen.tsx
├── hooks/                         # Shared React hooks
│   ├── useAbortSignal.ts          # Shared abort signal hook
│   └── useResponsiveLayout.ts     # Shared responsive layout hook
├── raw/                           # Raw terminal UI components
│   ├── CommandCompletions.ts      # Command completion logic
│   ├── CommandCompletions.test.ts # Tests for command completions
│   ├── InlineQuestions.ts         # Inline question handling
│   ├── InputEditor.ts             # Multi-line text editor
│   ├── InputEditor.test.ts        # Tests for input editor
│   └── RawChatUI.ts               # Main chat UI implementation
├── utility/                       # Utility functions
│   └── applyMarkdownStyles.ts     # Markdown styling utility
├── AgentCLI.ts                    # Main CLI service class
├── AgentLoop.ts                   # Agent interaction loop handler
├── AgentSelection.ts              # Agent selection parsing utilities
├── commandPrompt.ts               # Command prompt with history support
├── index.ts                       # Main entry point
├── plugin.ts                      # Plugin definition
├── schema.ts                      # Configuration schema definition
├── SimpleSpinner.ts               # Spinner component for loading states
├── theme.ts                       # Color theme definitions
├── vitest.config.ts               # Vitest test configuration
├── package.json
└── README.md
```

### Key Files

| File | Description |
|------|-------------|
| `AgentCLI.ts` | Main service class that coordinates CLI operations |
| `AgentLoop.ts` | Handles the interaction loop for individual agents |
| `RawChatUI.ts` | Core chat UI implementation with terminal rendering |
| `commandPrompt.ts` | Provides readline-based input with history and completion |
| `SimpleSpinner.ts` | Custom spinner implementation that integrates with abort signals |
| `renderScreen.tsx` | (Framework-specific) Renders interactive UI screens |
| `theme.ts` | Defines the color theme used throughout the CLI |
| `schema.ts` | Configuration schema using Zod |
| `plugin.ts` | Plugin definition for easy installation |
| `index.ts` | Main entry point exporting `AgentCLI` and `CLIConfigSchema` |
| `commands.ts` | Exports all chat commands |
| `applyMarkdownStyles.ts` | Utility for applying markdown styling to terminal output |
| `InputEditor.ts` | Multi-line text editor with cursor navigation |
| `InlineQuestions.ts` | Inline question session handling for various question types |

## Integration

### Integration with Agent System

The CLI integrates with the agent system through:

1. **Agent Selection**: Presents available agents from `AgentManager` service
2. **Event Subscription**: Subscribes to `AgentEventState` for real-time updates
3. **Input Handling**: Sends user input via `agent.handleInput()`
4. **Question Responses**: Sends responses to agent questions via `agent.sendInteractionResponse()`
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

## Hooks

### useAbortSignal Hook

A React hook that manages abort signal listeners.

**Usage:**
```typescript
import { useAbortSignal } from '@tokenring-ai/cli/hooks/useAbortSignal';

function MyComponent({ signal }) {
  useAbortSignal(signal, () => {
    console.log('Aborted!');
  });
  
  return <div>Component</div>;
}
```

### useResponsiveLayout Hook

A React hook that provides responsive layout information based on terminal dimensions.

**Returns:**
```typescript
interface ResponsiveLayout {
  maxVisibleItems: number;
  showBreadcrumbs: boolean;
  showHelp: boolean;
  truncateAt: number;
  isCompact: boolean;
  isNarrow: boolean;
  isShort: boolean;
  minimalMode: boolean;
  width: number;
  height: number;
}
```

**Usage:**
```typescript
import { useResponsiveLayout } from '@tokenring-ai/cli/opentui/hooks/useResponsiveLayout';

function MyComponent() {
  const { isNarrow, isCompact, maxVisibleItems, width, height } = useResponsiveLayout();
  
  return (
    <box>
      {isNarrow ? <CompactView /> : <FullView />}
    </box>
  );
}
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
  process.stderr.write(formatLogMessages(['Error while running agent loop', error as Error]));
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

### Markdown Styling

The CLI applies markdown styling to terminal output using `applyMarkdownStyles`:

```typescript
import applyMarkdownStyles from '@tokenring-ai/cli/utility/applyMarkdownStyles';

const styledText = applyMarkdownStyles('# Heading\n- Item 1\n- Item 2');
console.log(styledText);
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
