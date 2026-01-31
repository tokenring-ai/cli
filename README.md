# @tokenring-ai/cli

Command-line interface for interacting with TokenRing AI agents. This package provides an interactive terminal-based interface for managing AI agents, executing commands, handling human interface requests, and real-time agent event rendering.

## Overview

A comprehensive command-line interface (CLI) for managing TokenRing AI agents. This package serves as the primary CLI entry point for the TokenRing AI system, providing an interactive terminal experience with agent management, chat capabilities, custom inputs, and real-time agent event streaming. The CLI centers around two core service classes: `AgentCLI` (main entry point) and `AgentLoop` (agent execution handler).

## Installation

```bash
bun install @tokenring-ai/cli
```

## Features

- **Agent Management**: Select from running agents, spawn new agents, connect to existing ones, or execute workflows via tree-based selection interface
- **Interactive Chat**: Communicate with AI agents through a terminal interface with real-time event streaming
- **Chat Commands**: Execute slash-prefixed commands (`/edit`, `/multi`) for prompt creation and multi-line input
- **Human Interface Requests**: Handle confirmations, text inputs, password prompts, form submissions, tree selections, file selections, and custom responses
- **Responsive Layout**: Automatically adjusts to terminal window size with different layouts for minimal, narrow, short, and wide screens (40x10 minimum)
- **Keyboard Shortcuts**: Intuitive key combinations for navigation, selection, and interaction
- **Real-time Event Streaming**: Stream agent outputs (chat, reasoning, system messages, errors) with color-coded formatting via event subscription
- **Interactive Screens**: Render agent selection, loading, and question input screens using OpenTUI components
- **Command History**: Input history with up/down arrow navigation and auto-completion for slash commands
- **Editor Integration**: Built-in editor commands for complex prompt creation using system editor (`EDITOR` environment variable)
- **Markdown Styling**: Auto-formatted markdown responses with custom coloring and horizontal line dividers
- **Loading States**: Visual feedback with spinner animations during agent busy operations
- **Exit Handling**: Graceful Ctrl-C handling with stack-based abort signal management and terminal cleanup

## Configuration

The CLI configuration is optional and defined via a Zod schema:

```typescript
import { z } from "zod";

export const CLIConfigSchema = z.object({
  chatBanner: z.string(),
  loadingBannerNarrow: z.string(),
  loadingBannerWide: z.string(),
  loadingBannerCompact: z.string(),
  screenBanner: z.string(),
});
```

### Configuration Options

- **chatBanner**: Banner message displayed during agent chat sessions at the top of the terminal
- **loadingBannerNarrow**: Banner message for narrow terminal windows (`width < 80` but `not minimal`) during loading states
- **loadingBannerWide**: Banner message for wide terminals (`width >= 80`) during loading states (default)
- **loadingBannerCompact**: Banner message for compact terminal layouts (`minimal` mode) during loading
- **screenBanner**: Banner message displayed on all interactive screens and selection menus

### Configuration Example

```typescript
import TokenRingApp from "@tokenring-ai/app";
import cliPlugin from "@tokenring-ai/cli";

// Create and configure the application
const app = new TokenRingApp();

// Install CLI plugin with custom configuration
app.install(cliPlugin, {
  cli: {
    chatBanner: "TokenRing CLI",
    loadingBannerNarrow: "Loading...",
    loadingBannerWide: "Loading TokenRing CLI...",
    loadingBannerCompact: "Loading",
    screenBanner: "TokenRing CLI"
  }
});

// Start the CLI (blocks until exit)
await app.start();
```

### Plugin Registration Integration

The package provides a built-in plugin that automatically registers the CLI with the Token Ring application:

```typescript
import cliPlugin from "@tokenring-ai/cli";
import TokenRingApp from "@tokenring-ai/app";

const app = new TokenRingApp();

// Register plugin with optional CLI configuration
app.install(cliPlugin, {
  cli: {
    chatBanner: "TokenRing CLI",
    loadingBannerNarrow: "Loading...",
    loadingBannerWide: "Loading TokenRing CLI...",
    loadingBannerCompact: "Loading",
    screenBanner: "TokenRing CLI"
  }
});

// Start the CLI automatically
await app.start();
```

**Plugin Features:**
- Waits for `AgentCommandService` availability before registering chat commands
- Adds `/edit` and `/multi` commands to agent command registry
- Initializes `AgentCLI` service with configuration
- Conditional setup based on CLI configuration presence

## Core Components

### AgentCLI

Main service class implementing the CLI functionality and orchestrating the complete user experience.

**Interface:**
```typescript
export default class AgentCLI implements TokenRingService {
  name = "AgentCLI";
  description = "Command-line interface for interacting with agents";

  constructor(app: TokenRingApp, config: z.infer<typeof CLIConfigSchema>);

  async run(signal: AbortSignal): Promise<void>;
}
```

**Properties:**
- `app`: TokenRingApp instance for agent management
- `config`: CLI configuration schema
- `rl`: Readline interface for user input (initialized internally)

**Methods:**

- `async run(signal: AbortSignal): Promise<void>` - Start the CLI application and begin processing user input
  - Displays the `LoadingScreen` with appropriate banner based on terminal width (`loadingBannerWide`, `loadingBannerNarrow`, or `loadingBannerCompact`)
  - Enters an infinite loop to select and interact with agents
  - Handles errors gracefully and maintains UI state between sessions
  - Cleans up terminal on exit (clears all input, shows "Goodbye!")

- `private async selectOrCreateAgent(signal: AbortSignal): Promise<Agent | null>` - Display agent selection menu and create/return selected agent
  - Renders the `AgentSelectionScreen`
  - Returns the selected agent or `null` to exit
  - Handles agent spawning, connecting, web application launching, and workflow execution

**Configuration Dependencies:**
- `chatBanner`: Banner for chat sessions
- `screenBanner`: Banner for selection screens
- Loading banners used based on terminal dimensions

### AgentLoop

Agent execution loop handler that manages the continuous interactive session with an agent.

**Interface:**
```typescript
export default class AgentLoop implements TokenRingService {
  name = "AgentLoop";
  description = "Agent execution loop handler";

  constructor(agent: Agent, options: AgentLoopOptions);
}
```

**Properties:**
- `agent`: Current Agent instance for operations
- `options`: AgentLoop configuration options
- `abortControllerStack`: Stack of abort controllers for nested operation cancellation
- `spinner`: SimpleSpinner instance for loading states
- `spinnerRunning`: Boolean flag for spinner state
- `currentInputPromise`: Promise for current user input
- `humanInputPromise`: Promise for current human request handling
- `eventCursor`: Cursor position for event streaming
- `currentOutputType`: Current output type ("chat" or "reasoning")
- `currentLine`: Current line buffer for real-time rendering

**AgentLoopOptions:**
```typescript
interface AgentLoopOptions {
  availableCommands: string[];     // Available slash commands (e.g., ["/edit", "/multi", "/switch"])
  rl: readline.Interface;          // Readline interface for user input
  config: z.infer<typeof CLIConfigSchema>; // CLI configuration
}
```

**Core Functionality:**

- **Agent Event Streaming**: Subscribes to agent events and renders them in real-time with color-coded formatting
  - `output.chat` (green): Regular chat messages from the agent
  - `output.reasoning` (yellow): Agent thinking/reasoning process
  - `output.info` (blue): Informational messages
  - `output.warning` (yellow): Warning messages
  - `output.error` (red): Error messages
  - `input.received`: User input received (yellow table format)
  - `input.handled`: User input processing result (colored based on status)
  - `agent.created`: Agent creation event
  - `agent.stopped`: Agent stopping event
  - `reset`: Agent reset event
  - `abort`: Agent abort event
  - `output.artifact`: Agent artifact output event

- **Horizontal Line Dividers**: Shows "Chat" or "Reasoning" headers between different output types with decorative lines

- **Nested Loop Management**: Handles both event processing loop and execution loop concurrently
  - `processEvents()`: Continuously streams agent events via subscription
  - `processExecution()`: Handles agent execution state and user input

- **Human Input Queue**: Manages concurrent human inputs with proper cancellation and priority handling
  - Cancels current input when agent becomes busy
  - Cancels pending human request when agent becomes idle

- **Abort Signal Handling**: Stack-based abort signal management for proper cancellation and cleanup
  - Pushes new AbortController at start of operation
  - Aborts all in stack when necessary (agent busy, waiting on human input)
  - Automatic cleanup on normal completion or asynchrony

**Key Methods:**

- `async run(signal: AbortSignal): Promise<void>` - Main agent interaction loop
  - Sets up `AgentEventState` and `AgentExecutionState` subscriptions
  - Enters race between event processing and execution handling
  - Manages spinner animations during agent busy states
  - Handles Ctrl-C to abort execution and return to agent selection
  - Clears terminal on resize or exit

- `private async gatherInput(signal: AbortSignal): Promise<string>` - Collects user input from command prompt
  - Uses `commandPrompt` with readline interface
  - Supports command history (from agent command history state)
  - Supports auto-completion for `/` commands
  - Handles interrupt/abort signals gracefully via `PartialInputError`
  - Cleans up multi-line prompt on completion or abort

- `private async handleHumanRequest(request: ParsedQuestionRequest, signal: AbortSignal): Promise<[request: ParsedQuestionRequest, response: z.output<typeof QuestionResponseSchema>]>` - Renders question screens and collects responses
  - Routes to appropriate input component based on question type
  - Catches abort signals to cancel pending responses
  - Returns both request and response for agent processing
  - Updates screen via redraw after human response

- `private ensureSigintHandlers()` - Manages SIGINT handling for Ctrl-C
  - Closes previous readline interface
  - Removes all existing SIGINT/keypress listeners
  - Creates new readline interface in raw mode
  - Handles Ctrl-C based on abort controller stack state
  - Allows multiple SIGINT handlers to coexist if stack not empty

- `private withAbortSignal<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T>` - Manages abort controller lifecycle
  - Stack-based abort signal management for nested operations
  - Creates new AbortController at start
  - Aborts controller at end via `finally` block
  - Ensures all stack entries properly terminate

### commandPrompt

Command prompt implementation managing user input with readline interface.

**Interface:**
```typescript
export interface CommandPromptOptions {
  rl: readline.Interface; // Accepts interface from caller
  message: string;        // Prompt message (default: ">")
  prefix?: string;        // Prefix text (default: "user")
  history?: string[];     // Command history array
  autoCompletion?: string[] | ((line: string) => Promise<string[]> | string[]); // Command completion
  signal?: AbortSignal;   // Abort signal for cancellation
}

export class PartialInputError extends Error {
  constructor(public buffer: string);
}
```

**Features:**
- Shared readline interface from caller
- Command history support (auto-populated from agent command history)
- Auto-completion with configurable completers
- Graceful cancellation with aborted signal
- Multi-line prompt clearing on completion or abort
- `PartialInputError` for handling incomplete input on interrupt

**Usage Example:**
```typescript
import {commandPrompt, PartialInputError} from './commandPrompt.ts';
import readline from 'node:readline';

const rl = readline.createInterface(process.stdin, process.stdout);

try {
  const input = await commandPrompt({
    rl,
    prefix: chalk.yellowBright('user'),
    message: chalk.yellowBright('>'),
    history: ['previous command 1', 'previous command 2'],
    autoCompletion: ['/edit', '/multi', '/switch'],
  });
  console.log('Input:', input);
} catch (err) {
  if (err instanceof PartialInputError) {
    console.log('Interrupted input:', err.buffer);
  }
}
```

### chatCommands

Exports all agent chat commands available within agent sessions.

**Current Commands:**
- `/edit` - Open system editor for prompt creation
- `/multi` - Open editor for multi-line input with inquirer prompts

**Structure:**
```typescript
export default {
  edit: AgentCommand,
  multi: AgentCommand,
};
```

Each command implements the `TokenRingAgentCommand` interface with:
- `description`: String for help display
- `execute`: Async function receiving remainder args and agent
- `help`: Multi-line help text with usage and examples

### Plugin Registration Pattern

```typescript
export default {
  name: "@tokenring-ai/cli",
  version: "0.2.0",
  description: "TokenRing CLI",
  install(app, config) {
    if (config.cli) {
      app.waitForService(AgentCommandService, agentCommandService =>
        agentCommandService.addAgentCommands(chatCommands)
      );
      app.addServices(new AgentCLI(app, config.cli));
    }
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
```

**Plugin Features:**
- Waits for `AgentCommandService` before registering commands
- Adds `/edit` and `/multi` commands to agent command registry
- Initializes `AgentCLI` service with configuration
- Conditional setup based on CLI configuration presence

## Usage Examples

### Basic Usage

```typescript
import TokenRingApp from "@tokenring-ai/app";
import cliPlugin from "@tokenring-ai/cli";

// Create and configure the application
const app = new TokenRingApp();

// Register CLI plugin
app.install(cliPlugin, {
  cli: {
    chatBanner: "TokenRing CLI",
    loadingBannerNarrow: "Loading...",
    loadingBannerWide: "Loading TokenRing CLI...",
    loadingBannerCompact: "Loading",
    screenBanner: "TokenRing CLI"
  }
});

// Start the CLI (this blocks until exit)
await app.start();
```

### With Custom CLI Service

If you prefer manual service registration:

```typescript
import TokenRingApp from "@tokenring-ai/app";
import AgentCLI from "@tokenring-ai/cli";
import chatCommands from "./chatCommands.ts";

const app = new TokenRingApp();

// Wait for AgentCommandService and add commands
app.waitForService(AgentCommandService, agentCommandService =>
  agentCommandService.addAgentCommands(chatCommands)
);

// Add CLI service with configuration
app.addServices(new AgentCLI(app, {
  chatBanner: "TokenRing CLI",
  loadingBannerNarrow: "Loading...",
  loadingBannerWide: "Loading TokenRing CLI...",
  loadingBannerCompact: "Loading",
  screenBanner: "TokenRing CLI"
}));

// Start the CLI
await app.start();
```

### Agent-Only Access

Accessing CLI resources from within agent code:

```typescript
// Access CLI service from agent
const cliService = agent.requireServiceByType(AgentCLI);
```

## Components

### TextInput

Modern multi-line text input component with line-by-line editing and rich keyboard controls.

**Features:**
- Infinite vertical scrolling with line management
- Line-by-line backspace handling (delete character vs. move up and delete entire line)
- Current line cursor indicator (█ at end of line)
- Ctrl+D to submit, Esc/Q to cancel
- Real-time rendering with minimalMode detection
- Automatic prompt display and cleanup
- Command type guessing for advanced completions

**Keyboard Controls:**
- Arrow Up/Down: Navigate lines (managed internally by component)
- Backspace: Delete character or move up/delete entire line
- Enter: Add new empty line
- Ctrl+D: Submit input (write all lines joined by newlines)
- Esc/Q: Cancel and return null
- Any printable character: Append to current line

**Keyboard Events:**
```typescript
{
  name: 'escape' | 'q' | 'return' | 'backspace' | 'd' (when ctrl)
  raw?: string  // Raw character input
  ctrl?: boolean
  shift?: boolean
}
```

**Responsive Behavior:**
- Shows warning message in minimalMode (terminal < 40x10): "Terminal too small. Minimum: 40x10"

### TreeSelect

Interactive hierarchical tree selection with expandable branches, multiple selection, and selection constraints.

**Features:**
- Expandable/collapsible all branches
- Single or multiple selection modes
- Selection constraints (minimum/maximum items, allowFreeform)
- Keyboard navigation with page up/down
- Visual indicators for expanded branches (▶/▼), checked items (◉/◯), selection (❯)
- Flash messages for validation errors
- Truncated labels for long text
- Scroll offset management for overflow
- Descendant selection parent/child relationships

**Keyboard Controls:**
- Arrow Up/Down: Navigate items
- Page Up/Down: Jump by half screen (maxVisibleItems / 2)
- Right: Expand parent branch
- Left: Collapse expanded branch
- Space (multiple mode): Toggle selection
- Space (single mode): Expand/collapse branch
- Enter: Submit selection
- Q: Cancel and return null

**Selection Logic:**
- Selecting a node selects all descendants
- Deselecting a node deselects all descendants
- Minimum/maximum selection validation with flash messages (orange background warning box)
- Selection counter display
- AllowFreeform mode accepts any input

**Visual State:**
- `isSelected`: Highlighed item with ❯ prefix
- `isChecked`: Fully selected item with ◉ prefix or partial selection with indeterminate colors
- `isExpanded`: Visible children (▼ for expanded, ▶ for collapsed)
- Non-checkable branches expand/collapse via Space (no ◉/◯)
- Partially selected parent items have special coloring

**Component Props:**
```typescript
interface TreeSelectProps {
  question: Omit<ParsedTreeSelectQuestion, "type">;
  onResponse: (response: string[] | null) => void;
  onHighlight?: (value: string) => void;  // Optional highlight callback
  signal?: AbortSignal;  // Optional abort signal
}
```

### FileSelect

Advanced directory tree browser with lazy loading, multiple selection, and agent filesystem integration.

**Features:**
- Directory tree browsing with recursive folder structures
- Lazy loading (load on expand, not all at once)
- Status indicators: expanded (▼ → collapsed (▶ → loading (⏳)
- Multiple file/directory selection with constraints
- Agent context for filesystem operations (FileSystemService)
- Current directory focus (starts at `.`)
- Visual indicators for selection state (◉/◯, indeterminate)
- Flash messages for errors (orange box)
- Support for allowFiles/allowDirectories filtering

**Keyboard Controls:**
- Arrow Up/Down: Navigate items
- Right: Expand directory
- Left: Collapse directory
- Space: Select/unselect file/directory or expand/collapse
- Enter: Submit selection
- Q: Cancel and return null

**Selection Behavior:**
- Multiple mode: Select/unselect individual items with validation
- Multiple mode with constraint: Validation before select/unselect
- Single mode: Select without toggle
- Non-selectable items (not matching allowFiles/allowDirectories) are dimmed gray

**File Filtering:**
- `allowFiles: true/false` - Show/hide file items
- `allowDirectories: true/false` - Show/hide directory items
- Non-selectable items still navigable via arrows

**Visual State:**
- `isSelected`: Highlighted item
- `isChecked`: File selected (◯) or partial (indeterminate colors)
- `isLoading`: Loading indicator (⏳) when expanding directory
- Non-selectable items: Dim gray color
- Selectable items: Normal color with proper expansion indicators

**Component Props:**
```typescript
interface FileSelectProps {
  agent: Agent;  // Agent context for filesystem access
  question: Omit<FileSelectQuestion, "type">;
  onResponse: (response: string[] | null) => void;
  onHighlight?: (value: string) => void;
  signal?: AbortSignal;
}
```

### FormInput

Multi-section form component with auto-advance between fields of different types.

**Features:**
- Multiple sections with fields
- Automatic field progression (sequential field-by-field)
- Automatic section progression (field-by-field)
- Supports text, treeSelect, and fileSelect field types
- Form validation with progress indicator
- Cancel via Esc key
- Auto-submit on last field completion
- Progress tracking (Section X/Y, Field A/B)

**Navigation Flow:**
1. Start at first section, first field
2. Fill out field and press Enter, auto-advance to next field
3. At end of section, auto-advance to next section
4. At end of form, automatically submit all sections
5. Esc to cancel entire form

**Field Type Support:**
- `text`: Uses TextInput component
- `treeSelect`: Uses TreeSelect component
- `fileSelect`: Uses FileSelect component with agent context

**Visual Feedback:**
- Progress indicator: `"Section X/Y, Field A/B"`
- Current section/focused field highlighted
- Tooltips: "Use Esc to cancel, form will auto-advance"

**Tooltips:**
- Single field: root field tooltip
- Multi-field: "Text field - Use Esc to cancel"
- Multi-section: multiple tooltips for each field and section

**State Management:**
- Tracks each section's field responses
- Stores responses indexed by section name and field key
- Increments field and section indices automatically

**Component Props:**
```typescript
interface FormInputProps {
  agent: Agent;  // Agent context for service operations
  question: Omit<FormQuestion, "type">;
  onResponse: (response: Record<string, Record<string, string | string[] | null>> | null) => void;
  signal?: AbortSignal;
}
```

## Hooks

### useAbortSignal

Abort signal management hook for React components with cleanup callback.

**Interface:**
```typescript
function useAbortSignal(
  signal?: AbortSignal,
  onAbort?: () => void
): void;
```

**Usage:**
```typescript
import {useAbortSignal} from "./hooks/useAbortSignal.ts";

function MyComponent({ signal }: { signal?: AbortSignal }) {
  useAbortSignal(signal, () => {
    // Handle abort - close dialogs, clear selections, restore state, etc.
    console.log("Aborted");
  });

  return <div>...</div>;
}
```

**Behavior:**
- Mounts cleanup listener when signal is defined
- Calls onAbort when signal aborts
- Auto-unmounts listener when component unmounts
- Listens for one time only (once: true)

**Example Use Cases:**
- Dialog component cleanup
- Form submission cancellation
- File selection cancellation
- Question prompt with kill signal

### useResponsiveLayout

Responsive layout management hook that calculates layout properties based on terminal dimensions.

**Interface:**
```typescript
interface ResponsiveLayout {
  maxVisibleItems: number;      // Maximum items without scrolling (default: max(5, height - 6))
  showBreadcrumbs: boolean;     // Always false
  showHelp: boolean;            // Always false
  truncateAt: number;           // Length at which text truncates (20)
  isCompact: boolean;           // Terminal is narrow (width < 80)
  isNarrow: boolean;            // Terminal is short (height < 20)
  isShort: boolean;             // Terminal is narrow AND short (width < 80 AND height < 20)
  minimalMode: boolean;         // Terminal too small (width < 40 OR height < 10)
  width: number;                // Terminal width (process.stdout.columns)
  height: number;               // Terminal height (process.stdout.rows)
}
```

**Usage:**
```typescript
import {useResponsiveLayout} from "./hooks/useResponsiveLayout.ts";

function MyComponent() {
  const layout = useResponsiveLayout();

  if (layout.minimalMode) {
    return <div>Terminal too small. Minimum: 40x10</div>;
  }

  if (layout.isNarrow) {
    return <div>Use vertical layout</div>;
  }

  return <div>Content</div>;
}
```

**Layout Properties:**
- `maxVisibleItems` (number): Maximum items that can be shown without scrolling calculated as max(5, height - 6)
- `showBreadcrumbs`: Always false
- `showHelp`: Always false
- `truncateAt` (number): Length at which text truncates (20)
- `isCompact` (boolean): Terminal is narrow (width < 80)
- `isNarrow` (boolean): Terminal is short (height < 20)
- `isShort` (boolean): Terminal is narrow AND short (width < 80 AND height < 20)
- `minimalMode` (boolean): Terminal too small (width < 40 OR height < 10)
- `width` (number): Terminal width (process.stdout.columns)
- `height` (number): Terminal height (process.stdout.rows)

**Dimension Calculation:**
```typescript
const detectResponsiveLayout = (rows: number, cols: number) => {
  return {
    maxVisibleItems: Math.max(5, rows - 6),
    showBreadcrumbs: false,
    showHelp: false,
    truncateAt: Math.max(20, cols - 20),
    isCompact: cols < 80,
    isNarrow: rows < 20,
    isShort: cols < 80 && rows < 20,
    minimalMode: cols < 40 || rows < 10,
    width: cols,
    height: rows,
  };
};
```

## Screens

### LoadingScreen

Initial loading screen that displays a configurable banner message based on terminal dimensions.

**Features:**
- Time-limited display (2 second timeout)
- Automatic timeout to AgentSelectionScreen
- Adaptive banner messages based on terminal width/layout
- Ends with Ctrl-C handling to exit immediately

**Props:**
- `config`: CLI configuration (for banner selection)
- `onResponse`: Callback when loading completes (return null to continue or propagate error)

**Banner Selection Logic:**
- **Wide terminals** (`width >= 80`): Uses `loadingBannerWide`
- **Narrow terminals** (`width < 80` but `not minimal`): Uses `loadingBannerNarrow`
- **Compact layouts** (`minimal`): Uses `loadingBannerCompact`

**Configurable Messages:**
- `loadingBannerWide`: Default banner for most layouts
- `loadingBannerNarrow`: Short banner for narrow screens
- `loadingBannerCompact`: Even shorter banner for minimal layouts

**Usage Example:**
```typescript
import LoadingScreen from "./screens/LoadingScreen";

renderScreen(LoadingScreen, {
  config: {
    loadingBannerWide: "Loading TokenRing System...",
    loadingBannerNarrow: "Loading...",
    loadingBannerCompact: "Loading"
  }
}).then(() => {
  console.log("Loading complete");
}).catch(() => {
  console.log("Loading cancelled");
});
```

### AgentSelectionScreen

Interactive tree-based interface for agent discovery and selection with side preview panel.

**Features:**
- Responsive layout with side preview panel (when space permits)
- Agent type categorization by category property
- Current agents listing with idle/running status indicators
- Workflow execution with descriptions
- Web application launch capability via WebHostService
- Real-time preview panel on right side
- Markdown rendering in preview
- Error display for selection failures
- Click to open links in browser (non-narrow screens)
- Prompt shows deposit and link

**Categories Displayed:**
1. **Web Application**: Connect to web apps hosted via WebHostService
2. Category-based agent types (Other/Browser/Code/etc.)
3. **Current Agents**: Display connected agents with status indicators
4. **Workflows**: Dispatcher workflows with key and description

**Action Types:**
- `spawn:agentType` - Spawn a new agent of the specified type
- `connect:agentId` - Connect to an existing agent by ID
- `open:url` - Open a web application URL in browser
- `workflow:workflowKey` - Execute a workflow by key

**Preview Panel Actions:**

The side preview panel displays details when you highlight items via `onHighlight`:

- `spawn:agentType` - Shows agent config name, description, and enabled tools
- `connect:agentId` - Shows agent ID, name, and status (idle/running)
- `open:url` - Shows web application details and clickable link to tokenring.ai
- `workflow:workflowKey` - Shows workflow name and description

**Layout Modes:**
- **Normal** (width >= 80, not short): Large layout with split screen (tree | preview)
- **Narrow** (width < 80): Mobile column layout (preview on top, tree stacked below)
- **Short** (height < 20): Compact horizontal layout (preview on right, tree on left)

**Empty States:**
- Displays orange error box if selection fails during handleSelect
- Shows warning in minimalMode ("Terminal too small. Minimum: 40x10")

**Tree Structure:**
```typescript
interface FlatTreeItem {
  category: string;       // Category name
  children: TreeLeaf[];   // Agent/workflow items in this category
}

interface TreeLeaf {
  name: string;           // Display name (e.g., "Agent Name (Type)")
  value: string;          // Action:value format (e.g., "spawn:code", "open:http://app:3000")
  children?: TreeLeaf[];  // Nested items (only for non-leaf)
}
```

**Value Format:**
- Action types must prefix tree values: `action:remainder`
- Example: `"spawn:code"`, `"connect:abc-123"`, `"workflow:dispatch-email"`

**Component Props:**
```typescript
interface AgentSelectionScreenProps {
  app: TokenRingApp;      // Application instance
  config: z.output<typeof CLIConfigSchema>; // CLI configuration
  onResponse: (agent: Agent | null) => void; // Selection callback
}
```

**Example Tree Generation:**
```typescript
const tree: TreeLeaf[] = [
  {
    name: "Web Application",
    children: [
      {
        name: "Connect to MyWebApp",
        value: "open:http://example.com:8000"
      }
    ]
  },
  {
    name: "Code",
    children: [
      {
        name: "Code Assistant (code)",
        value: "spawn:code"
      }
    ]
  },
  {
    name: "Current Agents",
    children: [
      {
        name: "My Agent",
        value: "connect:abc-def"
      }
    ]
  },
  {
    name: "Workflows",
    children: [
      {
        name: "Email Dispatcher (email-dispatch)",
        value: "workflow:email-dispatch"
      }
    ]
  }
];
```

### QuestionInputScreen

Displays human interface request prompts with appropriate input components based on question type.

**Features:**
- Configurable banner using screenBanner
- Responsive layout detection
- Agent context for filesystem operations
- Support for all question types (treeSelect, text, fileSelect, form)
- Side link to tokenring.ai (non-narrow screens)
- Flash messages for errors
- Prompt shows deposit and link alongside tree items
- Cancel handling via abort signal

**Props:**
- `agent`: Agent instance for service access (FileSystemService, ChatService, etc.)
- `request`: Parsed question request with question object and message
- `config`: CLI configuration for banner
- `onResponse`: Callback for response value
- `signal`: Abort signal for cancellation handling

**Question Type Mapping:**
```typescript
switch (question.type) {
  case 'treeSelect':
    return <TreeSelect ... />;
  case 'text':
    return <TextInput ... />;
  case 'fileSelect':
    return <FileSelect ... />;
  case 'form':
    return <FormInput ... />;
  default:
    return <box>Unknown question type</box>;
}
```

**Layout:**
- Top row: Banner (left), website link (right, conditionally shown)
- Middle: Question message/text with indent
- Bottom: Input component (full width)

**Agent Context Usage:**
- FileSelect receives agent for FileSystemService operations
- FormInput receives agent for field operations requiring services
- Links to agent services for filesystem access
- Services accessed within component lifecycle (here/here)

**Component Props:**
```typescript
interface QuestionInputScreenProps {
  agent: Agent;                     // Agent context for services
  request: Omit<ParsedQuestionRequest, "question" | "requestId" | "type">; // Question details
  config: z.output<typeof CLIConfigSchema>; // CLI configuration
  onResponse: (response: z.output<typeof QuestionResponseSchema> | null) => void;
  signal?: AbortSignal;
}
```

## Human Interface Request Types

The CLI handles the following human interface request types through the QuestionInputScreen:

| Request Type | Component | Description | Agent Context |
|--------------|-------------|-------------|---------------|
| `text` | TextInput | Simple text input prompt with multi-line editing | No |
| `treeSelect` | TreeSelect | Tree-based item selection with hierarchy | No |
| `fileSelect` | FileSelect | File selection from filesystem with directory navigation | Yes (FileSystemService) |
| `form` | FormInput | Multi-field form input with auto-advance | Yes (various services) |

## Keyboard Shortcuts

### Agent Session Navigation

- **Arrow Up/Down**: Navigate command history
- **Tab**: Auto-complete slash commands
- **Ctrl-C**: Return to agent selection screen (from agent session)

**Note:** Ctrl-C behavior differs based on context:
- **In input mode**: Aborts current input buffer with PartialInputError
- **In agent session**: Aborts agent execution and returns to agent selection screen

### Editor Commands

When using `/edit` or `/multi`:
- **Ctrl-C**: Cancel editor without submitting (`err.buffer` contains partial input)
- **Save and Close**: Submit the edited content to agent

### Text Input

When using text input prompts:
- **Enter**: Add new empty line
- **Backspace**: Delete character or move up and delete entire line
- **Ctrl+D**: Submit input (all lines joined by newlines)
- **Esc/Q**: Cancel input and return null

### Tree and File Selection

When using tree/file selection:
- **Arrow Up/Down**: Navigate items
- **Right**: Expand/collapse branches/directories
- **Space**: Toggle selection (multiple) or expand (single mode)
- **Enter**: Submit selection
- **Page Up/Down**: Jump by half screen (maxVisibleItems / 2)
- **Q**: Cancel and return null

### Form Navigation

When using forms:
- **Esc**: Cancel form and clear all responses (no auto-submit)
- Field progression happens automatically upon Enter key
- Tooltips guide user through navigation

## Event Types

The CLI renders the following agent event types with color-coded formatting. Colors are defined in `theme.ts`:

| Event Type | Description | Color |
|------------|-------------|-------|
| `output.chat` | Regular chat messages from the agent | Green (`#66BB6AF`) |
| `output.reasoning` | Agent reasoning/thinking process | Yellow (`#FFEB3BF`) |
| `output.info` | Informational messages from agent | Blue (`#64B5F6F`) |
| `output.warning` | Warning messages from agent | Yellow (`#FFEB3BF`) |
| `output.error` | Error messages from agent | Red (`#EF5350F`) |
| `input.received` | User input received | Yellow table format with "user" prefix |
| `input.handled` | User input processing result | Colored based on status (cancelled/error with red) |
| `agent.created` | Agent creation event | Blue (`#74C0FC`) |
| `agent.stopped` | Agent stopping event | Gray (`#ADB5BD`) |
| `reset` | Agent reset event | Gray (`#ADB5BD`) |
| `abort` | Agent abort event | Gray (`#ADB5BD`) |
| `output.artifact` | Agent artifact output event | Gray (`#ADB5BD`) |

**Output Formatting:**
- Horizontal line dividers between output types ("Chat", "Reasoning")
- Current line accumulation with cursor indicator (█)
- Markdown styling via `applyMarkdownStyles` utility
- Message links support embedded markdown links
- Multi-line message streaming with proper line concatenation

## Package Structure

```
pkg/cli/
├── index.ts                         # Main entry point (exports AgentCLI, AgentLoop, CLIConfigSchema)
├── AgentCLI.ts                      # Main CLI service class
├── AgentLoop.ts                     # Agent execution loop handler
├── commandPrompt.ts                 # Command prompt with history support and partial input error
├── plugin.ts                        # Token Ring plugin registration
├── chatCommands.ts                  # Chat commands export (/edit, /multi)
├── schema.ts                        # Configuration schema definition
├── theme.ts                         # Color theme definitions for CLI components
│
├── components/
│   ├── inputs/
│   │   ├── TextInput.tsx            # Text input component
│   │   ├── TreeSelect.tsx           # Tree selection component
│   │   ├── FileSelect.tsx           # File selection component
│   │   ├── FormInput.tsx            # Form input component
│   │   └── types.ts                 # Component prop types
│
├── hooks/
│   ├── useAbortSignal.ts            # Abort signal management hook
│   └── useResponsiveLayout.ts       # Responsive layout management
│
├── screens/
│   ├── AgentSelectionScreen.tsx     # Agent selection interface with tree and preview
│   └── QuestionInputScreen.tsx      # Human interface request handling
│
├── utility/
│   └── applyMarkdownStyles.ts       # Markdown styling utility
│
├── commands/
│   ├── edit.ts                      # /edit command implementation
│   └── multi.ts                     # /multi command implementation
│
├── SimpleSpinner.ts                 # Spinner component for loading states with 10 frames
├── renderScreen.tsx                 # Screen rendering utility
├── package.json                     # Package metadata and dependencies
└── vitest.config.ts                 # Test configuration
```

## Dependencies

### Core Dependencies

- `@tokenring-ai/app` (0.2.0) - Application framework and plugin system
- `@tokenring-ai/chat` (0.2.0) - Chat service and tool definitions
  - ChatAgentConfigSchema
- `@tokenring-ai/agent` (0.2.0) - Agent framework and capabilities
  - Agent, CommandHistoryState, AgentCommandService
  - ParsedQuestionRequest, QuestionResponseSchema
  - AgentEventEnvelope, AgentEventState, AgentExecutionState
  - ParsedTreeSelectQuestion
- `@tokenring-ai/utility` (0.2.0) - Utility functions (formatLogMessage, asciiTable)
- `zod` (catalog) - Runtime type validation for configuration and schemas

### UI Framework

- `@opentui/core` (^0.1.75) - OpenTUI core components and keyboard management
- `@opentui/react` (^0.1.75) - OpenTUI React bindings and terminal components
- `react` (^19.2.4) - React library for component implementations

### Prompt Handling

- `@inquirer/prompts` (^8.2.0) - Modern interactive prompts for /multi editor
- `chalk` (^5.6.2) - Terminal coloring and formatting

### Node.js Utilities

- `execa` (^9.6.1) - Executable process runner for editor commands (/edit)
- `open` (^11.0.0) - Opening URLs in default browser
- `node:readline` - Command-line input handling
- `node:process` - Process environment access

### Development

- `typescript` (catalog) - TypeScript language support
- `vitest` (catalog) - Unit testing framework
- `@types/react` (catalog) - React TypeScript definitions

## Development

```bash
# Install dependencies
bun install

# Build the package (TypeScript type checking only)
bun run build

# Run all tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage
```

### TypeScript Configuration

- Entry point: `index.ts`
- Exports: AgentCLI, AgentLoop, CLIConfigSchema, theme
- Module type: ESM (type: "module" in package.json)
- Dist types location: `dist-types/index.d.ts`

### Test Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    environment: 'node',
    globals: true,
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
});
```

## License

MIT License - see [package.json](./package.json) file for details.

## Related Components

- **TokenRingApp**: Main application framework from `@tokenring-ai/app`
- **TokenRingAgentCommand**: Chat command interface from `@tokenring-ai/agent`
- **Agent**: Agent class from `@tokenring-ai/agent`
- **AgentStates**: Event and execution state management
- **AgentCommandService**: Agent command registry
- **Inquirer Prompts**: Modern prompt library for interactive inputs
- **Rich Text References**: Styling for markdown responses

## Troubleshooting

### Terminal Too Small

**Problem:** Components show "Terminal too small. Minimum: 40x10"

**Cause:** Terminal dimensions below minimum requirements

**Solution:** Resize terminal to at least 40 columns x 10 rows

### Editor Not Found

**Problem:** `/edit` or `/multi` fails with "Editor process failed"

**Cause:** System editor not configured or not in PATH

**Solution:**
- Set `EDITOR` environment variable to your preferred editor (vim, nano, code, etc.)
- On Windows, ensure notepad is available
- Check `process.env.EDITOR` value

### Command Auto-Completion Not Working

**Problem:** Tab completion doesn't suggest commands

**Cause:** Readline interface not properly configured with completer

**Solution:** Ensure `AgentLoop` receives proper `availableCommands` array with slash-prefixed commands (/edit, /multi, /switch)

### Agent Selection Screen Not Showing Agents

**Problem:** Agents list stays empty or doesn't show up

**Cause:** AgentManager service not properly initialized or agent types not configured

**Solution:**
- Ensure `AgentCommandService` is available when `install()` runs
- Check agent configuration has proper type definition with category property
- Verify commands are registered using slash prefix (/list, /spawn, etc.)

### Input Gets Lost on Screen Resize

**Problem:** Current line input disappears when terminal resizes

**Cause:** Terminal resize events not properly handled in Linux/Unix

**Solution:**
- This is handled automatically by the `redraw()` function in `AgentLoop`
- Resize events refresh the entire event stream
- Current line is not preserved across resize events (by design)

### File Selection Shows "Loading..."

**Problem:** FileSelect shows "Loading directory..." indefinitely or repeatedly fails

**Cause:** FileSystemService not available, filesystem operation failed, or permission denied

**Solution:**
- Ensure `FileSystemService` is registered in application
- Check agent has proper filesystem access permissions
- Verify base directory path is accessible and valid
- Check terminal height supports directory tree rendering

### Question Terminal Too Small

**Problem:** Minimum vertical size for forms/completeness issues

**Cause:** Form components require more space than available in terminal

**Solution:**
- Ensure terminal is at least 40 columns x 10 rows
- Short forms may require additional height for all sections
- Preview panel can be enabled if space permits

### Agent Commands Not Recognized

**Problem:** `/edit` or `/multi` commands don't appear in help or chat

**Cause:** Chat commands not registered with AgentCommandService

**Solution:**
- Ensure CLI plugin's `install()` function waits for `AgentCommandService`
- Verify `chatCommands` are exported and passed correctly to `addAgentCommands()`
- Check that installation order places CLI before agent commands

### Ctrl-C Behavior Unexpected

**Problem:**
1. While typing input, Ctrl-C cancels entire input buffer
2. In agent session, Ctrl-C returns to agent selection screen

**Cause:** SIGINT handler implementation with abort signal stack and context-dependent behavior

**Solution:**
- Press Ctrl-C in input mode with pending input: Uses stack's abort controller, throws PartialInputError
- Press Ctrl-C in agent session with agent loop running: Aborts agent execution, returns to AgentSelectionScreen
- Press Ctrl-C in agent session after agent completed: Exits application with "Goodbye!" message
- Other listeners remain if stack is not empty (prevent race conditions)

### Partial Input Not Saved

**Problem:** Partial input from PartialInputError is lost on retry

**Cause:** Input buffer cleared on interrupt, user must retype

**Solution:**
1. Use Ctrl-C to cancel and retry
2. Input buffer is not preserved to prevent old incomplete commands from auto-execution
3. User maintains input state in memory or clipboard if needed

### Spinner Hangs

**Problem:** Spinner doesn't stop or displays forever

**Cause:** Agent execution doesn't cleanly change to idle state

**Solution:** This is caught in `processExecution()` where spinner is stopped on any state change

### Color Rendering Incorrect

**Problem:** Terminal shows escape codes instead of colors

**Cause:** Terminal not support ANSI color codes or theme colors not defined

**Solution:** Ensure terminal supports ANSI colors (most modern terminals do)

### Responsive Layout Detection Incorrect

**Problem:** Layout modes switch unexpectedly or don't match terminal size

**Cause:** Terminal dimensions not updating or Jest environment issues

**Solution:**
- Check `process.stdout.columns` and `process.stdout.rows` values
- Use actual terminal dimensions in tests, not Jest mock
- Verify `useResponsiveLayout` hook logic matches terminal measuring logic
