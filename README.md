# @tokenring-ai/cli

## Overview

The `@tokenring-ai/cli` package provides a comprehensive command-line interface for interacting with TokenRing AI agents. This terminal-based interface enables users to manage agents, execute commands, and handle human interface requests with a rich, responsive UI using raw terminal rendering with ANSI escape codes.

## Key Features

- **Agent Management**: Spawn, select, and interact with multiple agent types
- **Interactive Chat**: Real-time streaming of agent output with markdown formatting
- **Command History**: Navigate previous inputs with Ctrl+P/N or arrow keys
- **Command Auto-completion**: Tab completion for slash commands
- **Human Interface Handling**: Interactive forms for agent questions and requests
- **Customizable Theme**: Full theming support for colors and styling
- **Background Loading Screen**: Optional loading screen while agents initialize
- **Graceful Shutdown**: Proper signal handling and cleanup
- **Markdown Styling**: Applied markdown formatting to terminal output
- **Bracketed Paste**: Support for bracketed paste mode for efficient text input
- **Workspace File Search**: File path completion using `@` syntax
- **Inline Question Handling**: Support for text input, tree selection, and file selection questions
- **Follow-up Interactions**: Handle agent follow-up requests for additional input

## Installation

```bash
bun add @tokenring-ai/cli
```

## Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@tokenring-ai/app` | 0.2.0 | Base application framework |
| `@tokenring-ai/ai-client` | 0.2.0 | AI model client integration |
| `@tokenring-ai/chat` | 0.2.0 | Chat service integration |
| `@tokenring-ai/agent` | 0.2.0 | Agent orchestration |
| `@tokenring-ai/utility` | 0.2.0 | Shared utilities |
| `@tokenring-ai/web-host` | 0.2.0 | Web hosting service |
| `@tokenring-ai/workflow` | 0.2.0 | Workflow management |
| `@tokenring-ai/filesystem` | 0.2.0 | File system operations |
| `zod` | ^4.3.6 | Schema validation |
| `chalk` | ^5.6.2 | Terminal styling |
| `open` | ^11.0.0 | Open URLs in browser |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vitest` | ^4.1.1 | Testing framework |
| `typescript` | ^6.0.2 | TypeScript compiler |
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

The main chat UI component that handles terminal rendering, input editing, and interaction management. This is a raw terminal-based UI that works directly with ANSI escape codes for a responsive, full-featured terminal experience.

**Interface:**
```typescript
class RawChatUI {
  constructor(options: RawChatUIOptions);

  start(): void;
  stop(): void;
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
  onOpenAgentSelection: () => void;
  onDeleteIdleAgent: () => void;
  onAbortCurrentActivity: () => boolean;
}
```

**Properties:**
- `chatEditor`: Multi-line input editor for chat messages with cursor navigation
- `transcript`: Array of transcript entries showing conversation history
- `followupEditors`: Map of editors for follow-up interactions
- `questionSessions`: Map of inline question sessions for agent questions

**Methods:**

| Method | Description | Parameters |
|--------|-------------|------------|
| `start` | Attaches terminal, enables raw mode, and starts rendering | - |
| `stop` | Detaches terminal and stops rendering | - |
| `renderEvent` | Renders an agent event to the transcript incrementally | `event: AgentEventEnvelope` |
| `syncState` | Synchronizes UI with current agent state | `state: AgentEventState` |
| `flash` | Shows a temporary flash message in the hint line | `text: string`, `tone?: FlashMessage["tone"]`, `durationMs?: number` |

**Features:**
- Incremental rendering with efficient screen updates
- Markdown styling with color themes
- Multi-line text editing with cursor navigation
- Command completion with Tab/arrow keys
- File search with `@` syntax and arrow key navigation
- Bracketed paste support for efficient text input
- Keyboard shortcuts for agent selection, model/tools selection, verbose mode
- Inline question handling for text input, tree selection, and file selection
- Follow-up interaction handling for agent requests
- Context-aware status line showing model, tokens, cost, and working directory

**Keyboard Shortcuts:**

### General

- `Ctrl+C`: Cancel current activity or shut down idle agent
- `Ctrl+L`: Clear and replay the screen
- `Alt+A` / `F1`: Open agent selection screen

### Model and Tools

- `Alt+M` / `F3`: Open model selector
- `Alt+T` / `F2`: Open tools selector
- `Alt+V` / `F4`: Toggle verbose mode (show/hide reasoning and artifacts)

### Questions and Interactions

- `Alt+Q` / `F6`: Toggle optional questions picker

### Input Editing

- `Tab`: Command completion or insert selected file search match
- `Escape`: Cancel current activity or dismiss completion/search
- `Ctrl+O` / `Meta+Enter` / `Shift+Enter`: Insert newline
- `Ctrl+P` / `Up`: Browse command history (previous) or move up in completions
- `Ctrl+N` / `Down`: Browse command history (next) or move down in completions
- `PageUp` / `PageDown`: Page through completions

**Input Editor Features:**

- Multi-line text editing with cursor navigation
- Word navigation (Alt+B/F for left/right)
- Line navigation (Home/End)
- Delete operations (Ctrl+U/K/W/D)
- Bracketed paste support for efficient text input
- Automatic command and file search completion


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
| `uiFramework` | 'ink' \| 'opentui' | No | 'opentui' | UI rendering framework to use (Note: Currently only raw terminal is implemented) |
| `verbose` | boolean | No | false | Enable verbose output including reasoning and artifacts |
| `startAgent` | object | No | undefined | Optional agent to automatically spawn on startup |
| `startAgent.type` | string | If startAgent | - | Agent type to spawn |
| `startAgent.prompt` | string | If startAgent | undefined | Initial prompt to send to the agent |
| `startAgent.shutdownWhenDone` | boolean | If startAgent | true | Whether to shutdown after agent completes |

## Theme Configuration

The CLI uses a color theme defined in `theme.ts` that controls the appearance of all UI elements. The theme is applied throughout the raw terminal interface using `chalk.hex()` for colored output.

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
  loadingBannerBackground: '#2c2e32',
  loadingScreenText: '#f0f9ff',
} as const;
```

**Theme Usage:**

The theme is automatically applied to all UI components using `chalk.hex()`:

```typescript
import { theme } from '@tokenring-ai/cli/theme';
import chalk from 'chalk';

// Apply theme colors
const outputText = chalk.hex(theme.chatOutputText)('Assistant message');
const warningText = chalk.hex(theme.chatSystemWarningMessage)('Warning!');
const errorText = chalk.hex(theme.chatSystemErrorMessage)('Error occurred');
```

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
  verbose: false,
}));

await app.start();
```

## RPC Endpoints

The CLI package does not define RPC endpoints directly. It relies on the `@tokenring-ai/web-host` package for any web-based RPC communication.

## Chat Commands

Available commands are dynamically loaded from the `AgentCommandService` registered in the application. The CLI provides auto-completion for all registered commands when typing `/` in the chat input.

**Command Auto-completion:**

- Type `/` to trigger command completion
- Use Up/Down arrow keys or Ctrl+P/N to navigate suggestions
- Press Tab or Enter to insert the selected command
- Press Escape to dismiss the completion list

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
    verbose: false,
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

## Integration

### Integration with Agent System

The CLI integrates with the agent system through:

1. **Agent Selection**: Presents available agents from `AgentManager` service, including running agents, agent types, workflows, and web applications
2. **Event Subscription**: Subscribes to `AgentEventState` for real-time event streaming and incremental rendering
3. **Input Handling**: Sends user input via `agent.handleInput({ from: "CLI user", message })`
4. **Question Responses**: Sends responses to agent questions via `agent.sendInteractionResponse({ requestId, interactionId, result })`
5. **Command Integration**: Uses commands registered with `AgentCommandService` for auto-completion

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
    verbose: false,
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
  verbose: false,
}));
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
    verbose: false,
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
  verbose: false,
}));

await app.start();
```

### Starting a Specific Agent

```typescript
const config = {
  cli: {
    chatBanner: 'TokenRing CLI',
    startAgent: {
      type: 'coder',
      prompt: 'Help me debug this issue...',
      shutdownWhenDone: false, // Keep agent running after completion
    },
  },
};
```

### Enable Verbose Mode

```typescript
const config = {
  cli: {
    chatBanner: 'TokenRing CLI',
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
import chalk from 'chalk';

// Access theme colors for custom components
const successColor = theme.chatOutputText;
const warningColor = theme.chatSystemWarningMessage;
const errorColor = theme.chatSystemErrorMessage;

// Apply colors
console.log(chalk.hex(successColor)('Success!'));
console.log(chalk.hex(warningColor)('Warning!'));
console.log(chalk.hex(errorColor)('Error!'));
```

## Input Handling

The CLI package handles interactive input through the `RawChatUI` class, which supports various agent interaction types.

### Question Types

The CLI supports the following question types from agents:

| Type | Description | Interaction |
|------|-------------|-------------|
| **Text Input** | Multi-line text input with cursor navigation | Enter to submit, Esc to cancel |
| **Tree Select** | Hierarchical tree selection for structured choices | Arrows to navigate, Space to toggle, Enter to submit |
| **File Select** | File system browser for file/directory selection | Arrows to navigate, Space to expand/select, Enter to submit |
| **Form** | Multi-section forms combining multiple field types | Navigate through fields, Enter to advance |
| **Followup** | Simple follow-up prompts for additional input | Enter to submit, Alt+Enter for newline |

All question handling is done inline in the terminal with responsive layout adaptation.

### File Search

The CLI provides workspace file search using the `@` syntax:

```
# Type @ followed by a search query to find files
Write code for @utils/helper.ts
```

**File Search Features:**
- Real-time indexing of workspace files
- Scoring-based match ranking (exact matches, path depth, character sequences)
- Navigation with Up/Down arrow keys or Ctrl+P/N
- Insert selected path with Tab or Enter
- Dismiss with Escape

**File Search API:**

```typescript
import { getFileSearchMatches, scoreFileSearchMatch } from '@tokenring-ai/cli/raw/FileSearch';

// Score a file path against a query
const score = scoreFileSearchMatch('src/utils/helper.ts', 'helper');

// Get top matches
const matches = getFileSearchMatches(
  ['src/utils/helper.ts', 'src/main.ts'],
  'helper',
  5  // limit
);
```

## Package Structure

```
pkg/cli/
├── raw/                           # Raw terminal UI components
│   ├── CommandCompletions.ts      # Command completion logic
│   ├── CommandCompletions.test.ts # Tests for command completions
│   ├── FileSearch.ts              # File search and completion logic
│   ├── FileSearch.test.ts         # Tests for file search
│   ├── InlineQuestions.ts         # Inline question handling
│   ├── InputEditor.ts             # Multi-line text editor
│   ├── InputEditor.test.ts        # Tests for input editor
│   ├── NativeScreens.ts           # Loading and agent selection screens
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
├── theme.ts                       # Color theme definitions
├── vitest.config.ts               # Vitest test configuration
├── package.json
└── README.md
```

### Key Files

| File | Description |
|------|-------------|
| `AgentCLI.ts` | Main service class that coordinates CLI operations and agent management |
| `AgentLoop.ts` | Handles the interaction loop for individual agents, managing event consumption |
| `RawChatUI.ts` | Core chat UI implementation with terminal rendering and input handling |
| `NativeScreens.ts` | Loading screen and agent selection screen implementations |
| `commandPrompt.ts` | Provides readline-based input with history and completion support |
| `theme.ts` | Defines the color theme used throughout the CLI |
| `schema.ts` | Configuration schema using Zod (`CLIConfigSchema`) |
| `plugin.ts` | Plugin definition for easy installation with app.install() |
| `index.ts` | Main entry point exporting `AgentCLI` and `CLIConfigSchema` |
| `applyMarkdownStyles.ts` | Utility for applying markdown styling to terminal output |
| `InputEditor.ts` | Multi-line text editor with cursor navigation and editing |
| `InlineQuestions.ts` | Inline question session handling for text, tree, and file selection |
| `AgentSelection.ts` | Agent selection result parsing and value extraction utilities |
| `FileSearch.ts` | Workspace file search and @-syntax completion logic |
| `CommandCompletions.ts` | Command completion context and utilities for slash commands |

## Best Practices

### Signal Handling

Always pass abort signals to long-running operations:

```typescript
async function handleUserInput(signal: AbortSignal) {
  try {
    await someOperation({ signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Handle abort gracefully
    }
  }
}
```

### Error Handling

Handle errors gracefully in the agent loop:

```typescript
try {
  await agentLoop.run(signal);
} catch (error) {
  process.stderr.write(formatLogMessages(['Error while running agent loop', error as Error]));
  await delay(1000);
}
```

### Theme Consistency

Use theme colors consistently across components:

```typescript
import { theme } from '@tokenring-ai/cli/theme';
import chalk from 'chalk';

const errorText = chalk.hex(theme.chatSystemErrorMessage)('Error occurred');
const warningText = chalk.hex(theme.chatSystemWarningMessage)('Warning!');
```

### Markdown Styling

The CLI applies markdown styling to terminal output using `applyMarkdownStyles`:

```typescript
import applyMarkdownStyles from '@tokenring-ai/cli/utility/applyMarkdownStyles';

const styledText = applyMarkdownStyles('# Heading\n- Item 1\n- Item 2');
console.log(styledText);
```

### Keyboard Shortcuts

Familiarize yourself with the keyboard shortcuts for efficient interaction:

**General:**
- `Ctrl+C`: Cancel current activity or shut down idle agent
- `Ctrl+L`: Clear and replay the screen
- `Alt+A` / `F1`: Open agent selection screen

**Model and Tools:**
- `Alt+M` / `F3`: Open model selector
- `Alt+T` / `F2`: Open tools selector
- `Alt+V` / `F4`: Toggle verbose mode

**Questions and Interactions:**
- `Alt+Q` / `F6`: Toggle optional questions picker

**Input Editing:**
- `Tab`: Command completion or insert selected file search match
- `Escape`: Cancel current activity or dismiss completion/search
- `Ctrl+O` / `Meta+Enter` / `Shift+Enter`: Insert newline
- `Ctrl+P` / `Up`: Browse command history (previous)
- `Ctrl+N` / `Down`: Browse command history (next)
- `PageUp` / `PageDown`: Page through completions

## Testing and Development

### Running Tests

```bash
# Run tests
bun run test

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

### Test Files

The package includes comprehensive tests for core components:

- `InputEditor.test.ts`: Tests for text editing operations
- `FileSearch.test.ts`: Tests for file search scoring and matching
- `CommandCompletions.test.ts`: Tests for command completion logic
- `InlineQuestions.test.ts`: Tests for question handling
- `RawChatUI.test.ts`: Tests for UI rendering

## License

MIT License - see LICENSE file for details.
```
