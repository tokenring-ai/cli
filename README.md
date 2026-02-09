# @tokenring-ai/cli

Command-line interface for interacting with TokenRing AI agents. This package provides an interactive terminal-based interface for managing AI agents, executing commands, handling human interface requests, and real-time agent event rendering.

## Overview

A comprehensive command-line interface (CLI) for managing TokenRing AI agents with support for two UI frameworks: **OpenTUI** (default) and **Ink**. This package serves as the primary CLI entry point for the TokenRing AI system, providing an interactive terminal experience with agent management, chat capabilities, custom inputs, and real-time agent event streaming. The CLI centers around two core service classes: `AgentCLI` (main entry point) and `AgentLoop` (agent execution handler).

## Installation

```bash
bun install @tokenring-ai/cli
```

## Features

- **Dual UI Framework Support**: Choose between OpenTUI (default) or Ink rendering engines
- **Agent Management**: Select from running agents, spawn new agents, connect to existing ones, or execute workflows via tree-based selection interface
- **Interactive Chat**: Communicate with AI agents through a terminal interface with real-time event streaming
- **Chat Commands**: Execute slash-prefixed commands (`/edit`, `/multi`) for prompt creation and multi-line input
- **Human Interface Requests**: Handle confirmations, text inputs, password prompts, form submissions, tree selections, file selections, and custom responses
- **Responsive Layout**: Automatically adjusts to terminal window size with different layouts for minimal, narrow, short, and wide screens (40x10 minimum)
- **Keyboard Shortcuts**: Intuitive key combinations for navigation, selection, and interaction
- **Real-time Event Streaming**: Stream agent outputs (chat, reasoning, system messages, errors) with color-coded formatting via event subscription
- **Interactive Screens**: Render agent selection, loading, and question input screens
- **Command History**: Input history with up/down arrow navigation and auto-completion for slash commands
- **Editor Integration**: Built-in editor commands for complex prompt creation using system editor (`EDITOR` environment variable)
- **Markdown Styling**: Auto-formatted markdown responses with custom coloring and horizontal line dividers
- **Loading States**: Visual feedback with spinner animations during agent busy operations
- **Exit Handling**: Graceful Ctrl-C handling with stack-based abort signal management and terminal cleanup

## UI Frameworks

The CLI supports two rendering frameworks that can be selected via the `uiFramework` configuration option:

### OpenTUI (Default)

- **Package**: `@opentui/react` and `@opentui/core`
- **Features**: Advanced terminal rendering with alternate screen buffer support
- **Components**: Uses `<box>` and `<text>` JSX elements
- **Hooks**: `useTerminalDimensions()`, `useKeyboard()`
- **Best for**: Full-featured terminal applications with complex layouts

### Ink

- **Package**: `ink`
- **Features**: React-based terminal rendering with simpler API
- **Components**: Uses `<Box>` and `<Text>` JSX elements (capitalized)
- **Hooks**: `useStdout()`, `useInput()`
- **Best for**: Simpler terminal UIs with React-like development experience

### Framework Selection

```typescript
// Use OpenTUI (default)
const config = {
  cli: {
    // ... other config
    uiFramework: "opentui"
  }
};

// Use Ink
const config = {
  cli: {
    // ... other config
    uiFramework: "ink"
  }
};
```

Both frameworks provide identical functionality and component interfaces. The choice is primarily based on preference and specific use case requirements.

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
  uiFramework: z.enum(['ink', 'opentui']).default('opentui'),
});
```

### Configuration Options

- **chatBanner**: Banner message displayed during agent chat sessions at the top of the terminal
- **loadingBannerNarrow**: Banner message for narrow terminal windows (`width < 80` but `not minimal`) during loading states
- **loadingBannerWide**: Banner message for wide terminals (`width >= 80`) during loading states (default)
- **loadingBannerCompact**: Banner message for compact terminal layouts (`minimal` mode) during loading
- **screenBanner**: Banner message displayed on all interactive screens and selection menus
- **uiFramework**: UI rendering framework to use - `'opentui'` (default) or `'ink'`

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
    screenBanner: "TokenRing CLI",
    uiFramework: "opentui" // or "ink"
  }
});

// Start the CLI (blocks until exit)
await app.start();
```

## Package Structure

```
pkg/cli/
├── index.ts                         # Main entry point (exports AgentCLI, AgentLoop, CLIConfigSchema)
├── AgentCLI.ts                      # Main CLI service class with framework selection
├── AgentLoop.ts                     # Agent execution loop handler with framework selection
├── commandPrompt.ts                 # Command prompt with history support and partial input error
├── plugin.ts                        # Token Ring plugin registration
├── chatCommands.ts                  # Chat commands export (/edit, /multi)
├── schema.ts                        # Configuration schema definition
├── theme.ts                         # Color theme definitions for CLI components
│
├── opentui/                         # OpenTUI-specific implementations
│   ├── renderScreen.tsx             # OpenTUI screen rendering utility
│   ├── components/
│   │   └── inputs/
│   │       ├── TextInput.tsx        # Text input component
│   │       ├── TreeSelect.tsx       # Tree selection component
│   │       ├── FileSelect.tsx       # File selection component
│   │       ├── FormInput.tsx        # Form input component
│   │       └── types.ts             # Component prop types
│   ├── hooks/
│   │   └── useResponsiveLayout.ts   # OpenTUI responsive layout hook
│   └── screens/
│       ├── AgentSelectionScreen.tsx # Agent selection interface
│       ├── LoadingScreen.tsx        # Loading screen
│       └── QuestionInputScreen.tsx  # Question input screen
│
├── ink/                             # Ink-specific implementations
│   ├── renderScreen.tsx             # Ink screen rendering utility
│   ├── components/
│   │   └── inputs/
│   │       ├── TextInput.tsx        # Text input component
│   │       ├── TreeSelect.tsx       # Tree selection component
│   │       ├── FileSelect.tsx       # File selection component
│   │       ├── FormInput.tsx        # Form input component
│   │       └── types.ts             # Component prop types
│   ├── hooks/
│   │   └── useResponsiveLayout.ts   # Ink responsive layout hook
│   └── screens/
│       ├── AgentSelectionScreen.tsx # Agent selection interface
│       ├── LoadingScreen.tsx        # Loading screen
│       └── QuestionInputScreen.tsx  # Question input screen
│
├── hooks/
│   └── useAbortSignal.ts            # Shared abort signal management hook
│
├── utility/
│   └── applyMarkdownStyles.ts       # Markdown styling utility
│
├── commands/
│   ├── edit.ts                      # /edit command implementation
│   └── multi.ts                     # /multi command implementation
│
├── SimpleSpinner.ts                 # Spinner component for loading states with 10 frames
├── package.json                     # Package metadata and dependencies
└── vitest.config.ts                 # Test configuration
```

## Dependencies

### Core Dependencies

- `@tokenring-ai/app` (0.2.0) - Application framework and plugin system
- `@tokenring-ai/chat` (0.2.0) - Chat service and tool definitions
- `@tokenring-ai/agent` (0.2.0) - Agent framework and capabilities
- `@tokenring-ai/utility` (0.2.0) - Utility functions (formatLogMessage, asciiTable)
- `zod` (^4.3.6) - Runtime type validation for configuration and schemas

### UI Frameworks

- `@opentui/core` (^0.1.75) - OpenTUI core components and keyboard management
- `@opentui/react` (^0.1.75) - OpenTUI React bindings and terminal components
- `ink` (^6.6.0) - Ink terminal rendering framework
- `react` (^19.2.4) - React library for component implementations

### Prompt Handling

- `@inquirer/prompts` (^8.2.0) - Modern interactive prompts for /multi editor
- `chalk` (^5.6.2) - Terminal coloring and formatting

### Node.js Utilities

- `execa` (^9.6.1) - Executable process runner for editor commands (/edit)
- `open` (^11.0.0) - Opening URLs in default browser

## License

MIT License - see [package.json](./package.json) file for details.
