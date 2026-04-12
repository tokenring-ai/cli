# @tokenring-ai/cli

## Overview

The `@tokenring-ai/cli` package provides a comprehensive command-line interface for interacting with TokenRing AI agents. This terminal-based interface enables users to manage agents, execute commands, and handle human interface requests with a rich, responsive UI using raw terminal rendering with ANSI escape codes.

The CLI implements the `TokenRingService` interface through the `AgentCLI` class and can be installed as a plugin via `app.install()`.

## Key Features

- **Agent Management**: Spawn, select, and interact with multiple agent types
- **Interactive Chat**: Real-time streaming of agent output with markdown formatting
- **Command History**: Navigate previous inputs with Ctrl+P/N or arrow keys
- **Command Auto-completion**: Tab completion for slash commands (type `/` to trigger)
- **Human Interface Handling**: Interactive forms for agent questions and requests
- **Customizable Theme**: Full theming support for colors and styling via `theme.ts`
- **Background Loading Screen**: Optional loading screen while agents initialize
- **Graceful Shutdown**: Proper signal handling and cleanup
- **Markdown Styling**: Applied markdown formatting to terminal output via `applyMarkdownStyles()`
- **Bracketed Paste**: Support for bracketed paste mode for efficient text input
- **Workspace File Search**: File path completion using `@` syntax with scoring-based matching
- **Inline Question Handling**: Support for text input, tree selection, file selection, and multi-section forms
- **Follow-up Interactions**: Handle agent follow-up requests for additional input
- **Incremental Rendering**: Efficient screen updates using ANSI escape codes
- **Context-Aware Status Line**: Shows model, tokens remaining, active tools, token usage, cost, and working directory

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
| `@tokenring-ai/web-host` | 0.2.0 | Web hosting service (optional for web app support) |
| `@tokenring-ai/workflow` | 0.2.0 | Workflow management (optional for workflow support) |
| `@tokenring-ai/filesystem` | 0.2.0 | File system operations (optional for file search) |
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
export default class AgentCLI implements TokenRingService {
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
- Presents agent selection screen via `promptForAgent()`
- Spawns selected agent and enters interaction loop via `AgentLoop`
- Handles SIGINT for graceful shutdown
- Restarts agent selection after agent completion (unless `config.startAgent.shutdownWhenDone` is true)
- Supports spawning agents, connecting to running agents, opening web applications, and running workflows

### AgentLoop Class

Handles the interactive loop for individual agents, managing input collection, event rendering, and human request handling.

**Interface:**

```typescript
export default class AgentLoop {
  constructor(
    readonly agent: Agent,
    readonly options: AgentLoopOptions
  );

  async run(externalSignal: AbortSignal): Promise<void>;
}
```

**AgentLoopOptions Interface:**

```typescript
export interface AgentLoopOptions {
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
The `AgentLoop` processes the following agent events via `AgentEventState` subscription:

- `agent.created`: Display agent creation message
- `agent.stopped`: Shutdown the interaction loop
- `agent.status`: Update agent status display
- `output.chat`: Stream chat output with formatting
- `output.reasoning`: Stream reasoning output with formatting (when verbose)
- `output.info/warning/error`: Display system messages
- `output.artifact`: Display artifact information (when verbose)
- `input.received`: Display user input
- `input.interaction`: Handle interaction requests
- `agent.response`: Display agent response status

**State Management:**

- Tracks event cursor via `AgentEventCursor` for incremental updates
- Subscribes to `AgentEventState` via `agent.subscribeStateAsync()` for real-time updates
- Handles abort signals for graceful cancellation
- Supports exit actions: "select-agent" or "delete-agent"

### RawChatUI Class

The main chat UI component that handles terminal rendering, input editing, and interaction management. This is a raw terminal-based UI that works directly with ANSI escape codes for a responsive, full-featured terminal experience.

**Interface:**

```typescript
export default class RawChatUI {
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
export interface RawChatUIOptions {
  agent: Agent;
  config: z.output<typeof CLIConfigSchema>;
  commands: CommandDefinition[];
  onSubmit: (message: string) => void;
  onOpenAgentSelection: () => void;
  onDeleteIdleAgent: () => void;
  onAbortCurrentActivity: () => boolean;
}
```

**Internal Components:**

- `chatEditor`: `InputEditor` instance for multi-line chat input with cursor navigation
- `transcript`: Array of `TranscriptEntry` objects showing conversation history
- `followupEditors`: `Map<string, InputEditor>` for follow-up interaction editors
- `questionSessions`: `Map<string, InlineQuestionSession>` for agent question handling
- `completionState`: Command completion state for slash command auto-completion
- `fileSearchState`: File search state for @-syntax file path completion

**Methods:**

| Method | Description | Parameters |
|--------|-------------|------------|
| `start` | Attaches terminal, enables raw mode, starts spinner timer, and requests full replay | - |
| `stop` | Clears footer, detaches terminal, and stops all timers | - |
| `renderEvent` | Applies event to transcript and renders incrementally if started | `event: AgentEventEnvelope` |
| `syncState` | Updates latest state and triggers render for interaction cleanup | `state: AgentEventState` |
| `flash` | Shows a temporary flash message that expires after duration | `text: string`, `tone?: FlashMessage["tone"]`, `durationMs?: number = 2400` |

**Features:**

- Incremental rendering with efficient screen updates using ANSI escape codes
- Markdown styling with color themes via `applyMarkdownStyles()`
- Multi-line text editing with cursor navigation via `InputEditor`
- Command completion with Tab/arrow keys via `CommandCompletions`
- File search with `@` syntax and arrow key navigation via `FileSearch`
- Bracketed paste support for efficient text input
- Keyboard shortcuts for agent selection, model/tools selection, verbose mode
- Inline question handling for text input, tree selection, file selection, and forms via `InlineQuestions`
- Follow-up interaction handling for agent requests
- Context-aware status line showing model, tokens remaining, active tools, token usage, cost, and working directory
- Throttle-based full replay to handle terminal resize efficiently
- Agent activity indicator with braille spinner

**Keyboard Shortcuts:**

### General

- `Ctrl+C`: Cancel current activity or shut down idle agent
- `Ctrl+L`: Clear and replay the screen (full replay)
- `Alt+A` / `F1`: Open agent selection screen

### Model and Tools

- `Alt+M` / `F3`: Trigger "model select" command (opens model selector)
- `Alt+T` / `F2`: Trigger "tools select" command (opens tools selector)
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
- `Ctrl+A`: Move to start of line
- `Ctrl+E`: Move to end of line
- `Ctrl+U`: Delete to start of line
- `Ctrl+K`: Delete to end of line
- `Ctrl+W`: Delete word backward
- `Ctrl+D`: Delete forward
- `Alt+B`: Move word left
- `Alt+F`: Move word right
- `Home`: Move to start of line
- `End`: Move to end of line
- `Backspace`: Delete character before cursor
- `Delete`: Delete character after cursor

**Input Editor Features:**

- Multi-line text editing with cursor navigation via `InputEditor`
- Word navigation (Alt+B/F for left/right)
- Line navigation (Home/End)
- Delete operations (Ctrl+U/K/W/D)
- Bracketed paste support for efficient text input
- Automatic command and file search completion
- Preferred column tracking for vertical cursor movement

### CLIConfigSchema

Zod schema for CLI configuration validation defined in `schema.ts`.

**Schema Definition:**

```typescript
export const CLIConfigSchema = z.object({
  chatBanner: z.string(),
  loadingBannerNarrow: z.string(),
  loadingBannerWide: z.string(),
  loadingBannerCompact: z.string(),
  screenBanner: z.string(),
  uiFramework: z.enum(["ink", "opentui"]).default("opentui"),
  verbose: z.boolean().default(false),
  startAgent: z
    .object({
      type: z.string(),
      prompt: z.string().optional(),
      shutdownWhenDone: z.boolean().default(true),
    })
    .optional(),
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
| `uiFramework` | 'ink' \\| 'opentui' | No | 'opentui' | UI rendering framework (reserved for future use; currently only raw terminal is implemented) |
| `verbose` | boolean | No | false | Enable verbose output including reasoning and artifacts |
| `startAgent` | object | No | undefined | Optional agent to automatically spawn on startup |
| `startAgent.type` | string | If startAgent | - | Agent type to spawn (e.g., 'coder', 'writer') |
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
import AgentCLI, { CLIConfigSchema } from '@tokenring-ai/cli';
import type TokenRingApp from '@tokenring-ai/app';
import type { TokenRingService } from '@tokenring-ai/app/types';

const app: TokenRingApp = new TokenRingApp();

const config = {
  chatBanner: 'TokenRing CLI',
  loadingBannerNarrow: 'Loading...',
  loadingBannerWide: 'Loading TokenRing CLI...',
  loadingBannerCompact: 'Loading',
  screenBanner: 'TokenRing CLI',
  verbose: false,
};

app.addServices(new AgentCLI(app, config));

await app.start();
```

**Required Services:**
The `AgentCLI` service requires the following services to be registered in the application:

- `AgentManager`: For spawning and managing agents
- `AgentCommandService`: For retrieving available commands
- `WorkflowService`: For spawning workflows (optional)
- `WebHostService`: For accessing web applications (optional)
- `FileSystemService`: For workspace file search (via agent)
- `ChatService`: For model and token information display
- `ChatModelRegistry`: For model context length calculations

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

The CLI integrates with the agent system through the following mechanisms:

1. **Agent Selection**: Presents available options from `AgentManager` service including:
   - Running agents (connect to existing sessions)
   - Agent types (spawn new agents)
   - Workflows (spawn workflow instances)
   - Web applications (open in browser via `WebHostService`)

2. **Event Subscription**: Subscribes to `AgentEventState` via `agent.subscribeStateAsync()` for:
   - Real-time event streaming
   - Incremental rendering of chat output, reasoning, and system messages
   - Agent lifecycle events (created, stopped, status updates)

3. **Input Handling**: Sends user input to agents via:

   ```typescript
   agent.handleInput({ from: "CLI user", message: string })
   ```

4. **Question Responses**: Sends responses to agent interaction requests via:

   ```typescript
   agent.sendInteractionResponse({ requestId, interactionId, result })
   ```

5. **Command Integration**: Retrieves available commands from `AgentCommandService`:

   ```typescript
   const agentCommandService = app.getService(AgentCommandService);
   const commands = agentCommandService?.getCommandEntries();
   ```

6. **State Access**: Reads agent state for display purposes:
   - `AgentEventState`: Event history and current activity
   - `CommandHistoryState`: Previous commands for history navigation
   - `FileSystemState`: Working directory for status display

### Plugin Registration

The CLI plugin can be installed via `app.install()`:

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

### Service Registration

The `AgentCLI` service can be added directly:

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

### Starting a Specific Agent on Startup

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

### File Search with @ Syntax

```typescript
// In the CLI chat input, type @ followed by a search query
// Example: Write code for @utils/helper.ts

// Programmatic usage:
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

### Command Completion

```typescript
// In the CLI chat input, type / to trigger command completion
// Example: /agent spawn coder

// Programmatic usage:
import { getCommandCompletionContext } from '@tokenring-ai/cli/raw/CommandCompletions';

const context = getCommandCompletionContext(
  '/agen',  // input
  5,        // cursor position
  [{ name: 'agent', description: 'Agent commands' }]  // available commands
);
// Returns: { query: 'agen', matches: [...], replacementStart: 0, replacementEnd: 5 }
```

## Input Handling

The CLI package handles interactive input through the `RawChatUI` class, which supports various agent interaction types via `InlineQuestionSession` implementations.

### Question Types

The CLI supports the following question types from agents via `ParsedInteractionRequest`:

| Type | Description | Interaction |
|------|-------------|-------------|
| **Text Input** | Multi-line text input with cursor navigation | Enter to submit, Alt+Enter for newline, Esc to cancel |
| **Tree Select** | Hierarchical tree selection for structured choices | Arrows to navigate, Space to toggle, Enter to submit, Right/Left to expand/collapse |
| **File Select** | File system browser for file/directory selection | Arrows to navigate, Space to expand/select directories, Enter to submit, Right/Left to expand/collapse |
| **Form** | Multi-section forms combining multiple field types | Navigate through fields with Enter, Esc to cancel current section |
| **Followup** | Simple follow-up prompts for additional input | Enter to submit, Alt+Enter/Shift+Enter for newline |

All question handling is done inline in the terminal with responsive layout adaptation. Optional questions can be accessed via `Alt+Q` / `F6`.

### File Search

The CLI provides workspace file search using the `@` syntax:

```
# Type @ followed by a search query to find files
Write code for @utils/helper.ts
```

**File Search Features:**

- Real-time indexing of workspace files via `FileSystemService.glob()`
- Scoring-based match ranking (exact matches, path depth, character sequences)
- Navigation with Up/Down arrow keys or Ctrl+P/N
- Page navigation with PageUp/PageDown
- Insert selected path with Tab or Enter
- Dismiss with Escape

**File Search API:**

```typescript
import { getFileSearchMatches, scoreFileSearchMatch, findActiveFileSearchToken, replaceFileSearchToken } from '@tokenring-ai/cli/raw/FileSearch';

// Find an active @-token in text at cursor position
const token = findActiveFileSearchToken('Write code for @utils/helper.ts', 20);
// Returns: { start: 18, end: 38, query: 'utils/helper.ts' }

// Score a file path against a query
const score = scoreFileSearchMatch('src/utils/helper.ts', 'helper');

// Get top matches
const matches = getFileSearchMatches(
  ['src/utils/helper.ts', 'src/main.ts'],
  'helper',
  5  // limit
);

// Replace a token with a selected path
const result = replaceFileSearchToken(
  'Write code for @utils/helper.ts',
  token,
  'src/utils/helper.ts'
);
// Returns: { text: 'Write code for src/utils/helper.ts ', cursor: 34 }
```

### Command Completion

Command completion is triggered by typing `/` at the start of a line:

```
# Type / to trigger command completion
/agen  # Shows: /agent <description>
```

**Command Completion Features:**

- Auto-completion for all registered commands from `AgentCommandService`
- Navigation with Up/Down arrow keys or Ctrl+P/N
- Page navigation with PageUp/PageDown
- Insert selected command with Tab or Enter
- Dismiss with Escape

**Command Completion API:**

```typescript
import { getCommandCompletionContext, getLongestCommonPrefix } from '@tokenring-ai/cli/raw/CommandCompletions';

// Get completion context for current input
const context = getCommandCompletionContext(
  '/agen',  // input
  5,        // cursor position
  [{ name: 'agent', description: 'Agent commands' }]  // available commands
);
// Returns: { query: 'agen', matches: [...], replacementStart: 0, replacementEnd: 5 }

// Find longest common prefix among values
const prefix = getLongestCommonPrefix(['agent', 'agents', 'agentship']);
// Returns: 'agent'
```

## Package Structure

```
pkg/cli/
├── raw/                           # Raw terminal UI components (ANSI-based rendering)
│   ├── CommandCompletions.ts      # Command completion logic and context extraction
│   ├── CommandCompletions.test.ts # Tests for command completions
│   ├── FileSearch.ts              # File search scoring, matching, and @-token handling
│   ├── FileSearch.test.ts         # Tests for file search scoring and matching
│   ├── InlineQuestions.ts         # Inline question session handling (text, tree, file, form)
│   ├── InlineQuestions.test.ts    # Tests for inline question handling
│   ├── InputEditor.ts             # Multi-line text editor with cursor navigation
│   ├── InputEditor.test.ts        # Tests for input editor operations
│   ├── NativeScreens.ts           # Loading screen and agent selection screen implementations
│   └── RawChatUI.ts               # Main chat UI implementation with incremental rendering
├── utility/                       # Utility functions
│   └── applyMarkdownStyles.ts     # Markdown styling utility for terminal output
├── AgentCLI.ts                    # Main CLI service class implementing TokenRingService
├── AgentLoop.ts                   # Agent interaction loop handler with event subscription
├── AgentSelection.ts              # Agent selection result types and parsing utilities
├── commandPrompt.ts               # Readline-based input prompt with history support
├── index.ts                       # Main entry point exporting AgentCLI and CLIConfigSchema
├── plugin.ts                      # Plugin definition for app.install() integration
├── schema.ts                      # Configuration schema definition (CLIConfigSchema)
├── theme.ts                       # Color theme definitions for all UI elements
├── vitest.config.ts               # Vitest test configuration
├── package.json
└── README.md
```

### Key Files

| File | Description |
|------|-------------|
| `AgentCLI.ts` | Main service class implementing `TokenRingService`; coordinates CLI operations, agent selection, and interaction loops |
| `AgentLoop.ts` | Handles the interaction loop for individual agents; subscribes to `AgentEventState` and manages event consumption |
| `RawChatUI.ts` | Core chat UI implementation with terminal rendering, input handling, and incremental screen updates via ANSI codes |
| `NativeScreens.ts` | Loading screen with animated spinner and agent selection screen with category-based agent/workflow/web app listing |
| `commandPrompt.ts` | Provides readline-based input with history support via `CommandPrompt` class |
| `theme.ts` | Defines the color theme used throughout the CLI with hex color values for all UI elements |
| `schema.ts` | Configuration schema using Zod (`CLIConfigSchema`) for type-safe configuration validation |
| `plugin.ts` | Plugin definition implementing `TokenRingPlugin` for easy installation with `app.install()` |
| `index.ts` | Main entry point exporting `AgentCLI` and `CLIConfigSchema` |
| `applyMarkdownStyles.ts` | Utility for applying markdown styling to terminal output (bold, italic, code blocks, lists, etc.) |
| `InputEditor.ts` | Multi-line text editor with cursor navigation, word/line operations, and preferred column tracking |
| `InlineQuestions.ts` | Inline question session handling for text input, tree selection, file selection, and multi-section forms |
| `AgentSelection.ts` | Agent selection result types (`AgentSelectionResult`) and parsing utilities for spawn/connect/open/workflow actions |
| `FileSearch.ts` | Workspace file search with scoring-based matching, @-syntax token handling, and path replacement utilities |
| `CommandCompletions.ts` | Command completion context extraction and utilities for slash command auto-completion |

## Best Practices

### Signal Handling

Always pass abort signals to long-running operations to enable graceful cancellation:

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

Handle errors gracefully in the agent loop with proper logging:

```typescript
import formatLogMessages from '@tokenring-ai/utility/string/formatLogMessage';

try {
  await agentLoop.run(signal);
} catch (error) {
  process.stderr.write(
    formatLogMessages(['Error while running agent loop', error as Error])
  );
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
const infoText = chalk.hex(theme.chatSystemInfoMessage)('Info message');
```

### Markdown Styling

The CLI applies markdown styling to terminal output using `applyMarkdownStyles`:

```typescript
import applyMarkdownStyles from '@tokenring-ai/cli/utility/applyMarkdownStyles';

const styledText = applyMarkdownStyles('# Heading\n- Item 1\n- Item 2');
console.log(styledText);
```

Supported markdown:

- **Bold**: `**text**` or `__text__`
- *Italic*: `*text*` or `_text_`
- ~~Strikethrough~~: `~~text~~`
- `Inline code`: `` `text` ``
- [Links](url): `[text](url)`
- Headings: `# Heading 1`, `## Heading 2`, etc.
- Lists: `- item`, `* item`, `1. item`
- Blockquotes: `> quote`
- Code blocks: ``` ```language ```

### Terminal Requirements

The CLI requires a TTY terminal with minimum dimensions:

- Minimum width: 40 columns
- Minimum height: 10 rows

Resize the terminal if you see "Terminal too small" messages.

### Keyboard Shortcuts

Familiarize yourself with the keyboard shortcuts for efficient interaction:

**General:**

- `Ctrl+C`: Cancel current activity or shut down idle agent
- `Ctrl+L`: Clear and replay the screen (full replay)
- `Alt+A` / `F1`: Open agent selection screen

**Model and Tools:**

- `Alt+M` / `F3`: Trigger model selector command
- `Alt+T` / `F2`: Trigger tools selector command
- `Alt+V` / `F4`: Toggle verbose mode (show/hide reasoning and artifacts)

**Questions and Interactions:**

- `Alt+Q` / `F6`: Toggle optional questions picker

**Input Editing:**

- `Tab`: Command completion or insert selected file search match
- `Escape`: Cancel current activity or dismiss completion/search
- `Ctrl+O` / `Meta+Enter` / `Shift+Enter`: Insert newline
- `Ctrl+P` / `Up`: Browse command history (previous) or move up in completions
- `Ctrl+N` / `Down`: Browse command history (next) or move down in completions
- `PageUp` / `PageDown`: Page through completions
- `Ctrl+A`: Move to start of line
- `Ctrl+E`: Move to end of line
- `Ctrl+U`: Delete to start of line
- `Ctrl+K`: Delete to end of line
- `Ctrl+W`: Delete word backward
- `Alt+B`: Move word left
- `Alt+F`: Move word right

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

### Package Configuration

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

The package includes comprehensive tests for core components using vitest:

| Test File | Tests |
|-----------|-------|
| `InputEditor.test.ts` | Text editing operations (insert, delete, navigate, word operations) |
| `FileSearch.test.ts` | File search scoring, matching, and token handling |
| `CommandCompletions.test.ts` | Command completion context extraction and prefix matching |
| `InlineQuestions.test.ts` | Question session handling for text, tree, file, and form types |
| `RawChatUI.test.ts` | UI rendering, event handling, and transcript management |

### Development Workflow

1. **Install dependencies**: `bun install`
2. **Run type checking**: `bun run build`
3. **Run tests**: `bun run test`
4. **Watch mode**: `bun run test:watch` for iterative development

### Code Style

- TypeScript with strict mode enabled
- ES modules with `.ts` extensions in imports
- Zod schemas for runtime validation
- Proper error handling with typed errors

## Related Components

### Core Foundation Packages

- **@tokenring-ai/agent**: Core agent orchestration with `Agent`, `AgentManager`, and event systems
- **@tokenring-ai/app**: Base application framework with `TokenRingApp` and `TokenRingService`
- **@tokenring-ai/chat**: Chat service integration with `ChatService`
- **@tokenring-ai/ai-client**: AI model client with `ChatModelRegistry`

### Related CLI/Interface Packages

- **@tokenring-ai/web-host**: Web server for serving resources and APIs
- **@tokenring-ai/workflow**: Workflow management with `WorkflowService`
- **@tokenring-ai/filesystem**: File system operations with `FileSystemService`

## License

MIT License - see LICENSE file for details.

```
