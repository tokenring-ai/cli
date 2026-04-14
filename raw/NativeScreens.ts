import type Agent from "@tokenring-ai/agent/Agent";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import {AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import type TokenRingApp from "@tokenring-ai/app";
import type {ChatAgentConfig} from "@tokenring-ai/chat/schema";
import {brailleSpinner} from "@tokenring-ai/utility/string/brailleSpinner";
import getRandomItem from "@tokenring-ai/utility/string/getRandomItem";
import ridiculousMessages from "@tokenring-ai/utility/string/ridiculousMessages";
import {visibleLength} from "@tokenring-ai/utility/string/visibleLength";
import {wrapPlainText} from "@tokenring-ai/utility/string/wrapPlainText";
import {WebHostService} from "@tokenring-ai/web-host";
import SPAResource from "@tokenring-ai/web-host/SPAResource";
import WorkflowService from "@tokenring-ai/workflow/WorkflowService";
import chalk from "chalk";
import process from "node:process";
import readline from "node:readline";
import {setInterval as setIntervalPromise} from "node:timers/promises";
import type {z} from "zod";
import {type AgentSelectionResult, parseAgentSelectionValue} from "../AgentSelection.ts";
import type {CLIConfigSchema} from "../schema.ts";
import {theme} from "../theme.ts";

type CLIConfig = z.infer<typeof CLIConfigSchema>;

type SelectionEntry =
  | { type: "heading"; label: string }
  | {
  type: "option";
  label: string;
  value: string;
  previewTitle: string;
  previewLines: string[];
};

type KeyHandler = (input: string, key: readline.Key) => void;
type ScreenTone = "heading" | "selected" | "normal";
type ScreenLine = { text: string; tone?: ScreenTone };
type TerminalState = {
  rawModeBeforeStart: boolean;
  stdinWasPaused: boolean;
};

const MIN_WIDTH = 40;
const MIN_HEIGHT = 10;
const HEADER_COLOR = chalk.hex(theme.agentSelectionBanner).bold;
const MUTED_COLOR = chalk.hex(theme.chatDivider);
const HIGHLIGHT_COLOR = chalk.hex(theme.treeHighlightedItem).bold;
const INFO_COLOR = chalk.hex(theme.chatSystemInfoMessage);
const WARNING_COLOR = chalk.hex(theme.chatSystemWarningMessage);
const TITLE_COLOR = chalk.hex(theme.boxTitle).bold;
const LOADING_COLOR = chalk.hex(theme.loadingScreenText);

function clearScreen(): void {
  process.stdout.write("\x1b[H\x1b[2J");
}

function hideCursor(): void {
  process.stdout.write("\x1b[?25l");
}

function showCursor(): void {
  process.stdout.write("\x1b[?25h");
}

function getTerminalSize(): { width: number; height: number } {
  return {
    width: process.stdout.columns ?? 80,
    height: process.stdout.rows ?? 24,
  };
}

function centerLine(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - visibleLength(text)) / 2));
  return `${" ".repeat(padding)}${text}`;
}

function fitLine(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleLength(text) <= width) return text;
  if (width <= 1) return "…";
  return `${Array.from(text)
    .slice(0, Math.max(0, width - 1))
    .join("")}…`;
}

function padRight(text: string, width: number): string {
  const fitted = fitLine(text, width);
  return `${fitted}${" ".repeat(Math.max(0, width - visibleLength(fitted)))}`;
}

function formatBanner(config: CLIConfig, width: number): string[] {
  const wideBannerWidth = config.loadingBannerWide
    .split(/\n/)
    .reduce((acc, line) => Math.max(acc, line.length), 0);
  const narrowBannerWidth = config.loadingBannerNarrow
    .split(/\n/)
    .reduce((acc, line) => Math.max(acc, line.length), 0);
  const banner =
    width > wideBannerWidth
      ? config.loadingBannerWide
      : width > narrowBannerWidth
        ? config.loadingBannerNarrow
        : config.loadingBannerCompact;

  return banner.split("\n");
}

function wrapLines(lines: string[], width: number): string[] {
  const result: string[] = [];
  for (const line of lines) {
    result.push(...wrapPlainText(line, Math.max(1, width)));
  }
  return result;
}

function renderBox(
  title: string,
  bodyLines: string[],
  width: number,
): string[] {
  if (width < 8) return bodyLines.map((line) => fitLine(line, width));

  const innerWidth = Math.max(1, width - 4);
  const top = `┌${"─".repeat(innerWidth + 2)}┐`;
  const heading = `│ ${padRight(title, innerWidth)} │`;
  const divider = `├${"─".repeat(innerWidth + 2)}┤`;
  const lines = wrapLines(bodyLines, innerWidth);
  const content = lines.map((line) => `│ ${padRight(line, innerWidth)} │`);

  return [top, heading, divider, ...content, `└${"─".repeat(innerWidth + 2)}┘`];
}

function findFirstDifferentLineIndex(
  previousLines: string[],
  nextLines: string[],
): number {
  const limit = Math.min(previousLines.length, nextLines.length);
  for (let index = 0; index < limit; index += 1) {
    if (previousLines[index] !== nextLines[index]) {
      return index;
    }
  }
  return limit;
}

class ScreenPainter {
  private previousLines: string[] = [];
  private rendered = false;

  render(lines: string[]): void {
    const nextLines = lines.length > 0 ? lines : [""];

    if (!this.rendered) {
      process.stdout.write(`\x1b[?25l${nextLines.join("\n")}`);
      this.previousLines = [...nextLines];
      this.rendered = true;
      return;
    }

    const firstDifferentLine = findFirstDifferentLineIndex(
      this.previousLines,
      nextLines,
    );
    if (
      firstDifferentLine === this.previousLines.length &&
      firstDifferentLine === nextLines.length
    ) {
      return;
    }

    let output = "\x1b[?25l\r";
    if (this.previousLines.length > 1) {
      output += `\x1b[${this.previousLines.length - 1}F`;
    }
    if (firstDifferentLine > 0) {
      output += `\x1b[${firstDifferentLine}E`;
    }
    output += "\x1b[J";

    const tail = nextLines.slice(firstDifferentLine);
    if (tail.length > 0) {
      output += tail.join("\n");
    }

    process.stdout.write(output);
    this.previousLines = [...nextLines];
  }

  clear(): void {
    if (!this.rendered) {
      showCursor();
      return;
    }

    let output = "\r";
    if (this.previousLines.length > 1) {
      output += `\x1b[${this.previousLines.length - 1}F`;
    }
    output += "\x1b[J\x1b[?25h";
    process.stdout.write(output);
    this.previousLines = [];
    this.rendered = false;
  }
}

function cleanupTerminal(
  terminalState: TerminalState,
  keyHandler: KeyHandler,
  resizeHandler: () => void,
): void {
  process.stdin.off("keypress", keyHandler);
  process.stdout.off("resize", resizeHandler);
  if (process.stdin.isTTY) {
    if (!terminalState.rawModeBeforeStart) {
      process.stdin.setRawMode(false);
    }
    if (terminalState.stdinWasPaused) {
      process.stdin.pause();
    }
  }
  showCursor();
}

function setupTerminal(
  keyHandler: KeyHandler,
  resizeHandler: () => void,
): TerminalState {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      rawModeBeforeStart: false,
      stdinWasPaused: true,
    };
  }

  const stdinWasPaused = process.stdin.isPaused();
  readline.emitKeypressEvents(process.stdin);
  process.stdin.resume();
  const rawModeBeforeStart = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.on("keypress", keyHandler);
  process.stdout.on("resize", resizeHandler);
  hideCursor();
  return {
    rawModeBeforeStart,
    stdinWasPaused,
  };
}

function applyTone(line: ScreenLine): string {
  switch (line.tone) {
    case "heading":
      return TITLE_COLOR(line.text);
    case "selected":
      return HIGHLIGHT_COLOR(line.text);
    default:
      return line.text;
  }
}

function clipLines(lines: string[], height: number): string[] {
  if (height <= 0) return [];
  return lines.slice(0, height);
}

function buildSelectionEntries(app: TokenRingApp): SelectionEntry[] {
  const agentManager = app.requireService(AgentManager);
  const webHostService = app.getService(WebHostService);
  const workflowService = app.getService(WorkflowService);
  const webHostURL = webHostService?.getURL()?.toString() ?? "";
  const categories = new Map<string, SelectionEntry[]>();

  if (webHostService) {
    const entries: SelectionEntry[] = [];
    for (const [
      resourceName,
      resource,
    ] of webHostService.getResourceEntries()) {
      if (resource instanceof SPAResource) {
        entries.push({
          type: "option",
          label: `Connect to ${resourceName}`,
          value: `open:${webHostURL}${resource.config.prefix.substring(1)}`,
          previewTitle: "Web Application",
          previewLines: [
            "Launch the web application in your system browser.",
            webHostURL
              ? `${webHostURL}${resource.config.prefix.substring(1)}`
              : "Web host URL unavailable.",
          ],
        });
      }
    }
    if (entries.length > 0) {
      categories.set(
        "Web Application",
        entries.sort((left, right) => left.label.localeCompare(right.label)),
      );
    }
  }

  const currentAgents = agentManager.getAgents();
  if (currentAgents.length > 0) {
    const entries = currentAgents
      .map((agent) => {
        const eventState = agent.getState(AgentEventState);
        return {
          type: "option" as const,
          label: agent.displayName,
          value: `connect:${agent.id}`,
          previewTitle: `Agent ${agent.id}`,
          previewLines: [
            agent.config.displayName,
            `Status: ${eventState.idle ? "idle" : "running"}`,
          ],
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));
    categories.set("Running Agents", entries);
  }

  for (const [type, config] of agentManager.getAgentConfigEntries()) {
    const category = config.category || "Other";
    const enabledTools =
      "chat" in config
        ? ((config as unknown as ChatAgentConfig).chat.enabledTools ?? [])
        : [];
    const entries = categories.get(category) ?? [];
    entries.push({
      type: "option",
      label: `${config.displayName} (${type})`,
      value: `spawn:${type}`,
      previewTitle: config.displayName,
      previewLines: [
        config.description,
        `Enabled tools: ${enabledTools.join(", ") || "(none)"}`,
      ],
    });
    categories.set(category, entries);
  }

  if (workflowService) {
    const workflows = workflowService.listWorkflows();
    if (workflows.length > 0) {
      categories.set(
        "Workflows",
        workflows
          .map(({key, workflow}) => ({
            type: "option" as const,
            label: `${workflow.name} (${key})`,
            value: `workflow:${key}`,
            previewTitle: workflow.name,
            previewLines: [workflow.description],
          }))
          .sort((left, right) => left.label.localeCompare(right.label)),
      );
    }
  }

  const pinnedOrder = ["Web Application", "Running Agents"];
  const entries: SelectionEntry[] = [];
  for (const category of pinnedOrder) {
    const categoryEntries = categories.get(category);
    if (!categoryEntries || categoryEntries.length === 0) continue;
    entries.push({type: "heading", label: category});
    entries.push(
      ...categoryEntries.sort((left, right) =>
        left.label.localeCompare(right.label),
      ),
    );
    categories.delete(category);
  }
  for (const [category, categoryEntries] of [...categories.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (categoryEntries.length === 0) continue;
    entries.push({type: "heading", label: category});
    entries.push(
      ...categoryEntries.sort((left, right) =>
        left.label.localeCompare(right.label),
      ),
    );
  }
  return entries;
}

function getSelectedOption(
  entries: SelectionEntry[],
  selectedOptionIndex: number,
): Extract<SelectionEntry, { type: "option" }> | null {
  const options = entries.filter(
    (entry): entry is Extract<SelectionEntry, { type: "option" }> =>
      entry.type === "option",
  );
  return options[selectedOptionIndex] ?? null;
}

function renderSelectionScreen(
  config: CLIConfig,
  entries: SelectionEntry[],
  selectedOptionIndex: number,
): string[] {
  const {width, height} = getTerminalSize();
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return [
      WARNING_COLOR(`Terminal too small. Minimum: ${MIN_WIDTH}x${MIN_HEIGHT}`),
    ];
  }

  const selected = getSelectedOption(entries, selectedOptionIndex);
  let optionCursor = 0;
  let selectedLineIndex = 0;
  const flattenedLines = entries.map((entry, lineIndex) => {
    if (entry.type === "heading") {
      return {
        text: entry.label,
        tone: "heading" as const,
      } satisfies ScreenLine;
    }

    const isSelected = optionCursor === selectedOptionIndex;
    const line = `${isSelected ? "›" : " "} ${entry.label}`;
    if (optionCursor === selectedOptionIndex) {
      selectedLineIndex = lineIndex;
    }
    optionCursor += 1;
    return {
      text: line,
      tone: isSelected ? ("selected" as const) : ("normal" as const),
    } satisfies ScreenLine;
  });

  const headerLine =
    width >= 70
      ? `${HEADER_COLOR(config.screenBanner)}${" ".repeat(Math.max(1, width - visibleLength(config.screenBanner) - visibleLength("https://tokenring.ai")))}${MUTED_COLOR("https://tokenring.ai")}`
      : HEADER_COLOR(config.screenBanner);

  const instructionLine = MUTED_COLOR(
    "Up/Down or j/k to move, Enter to select, q or Esc to quit",
  );
  const listWidth =
    selected && width >= 90 ? Math.max(30, Math.floor(width * 0.45)) : width;
  const detailWidth = width - listWidth - 3;
  const leftBody = flattenedLines;
  const maxBodyHeight = Math.max(1, height - 3);
  const clampedIndex = Math.min(
    selectedLineIndex,
    Math.max(0, leftBody.length - 1),
  );
  const windowStart = Math.max(0, clampedIndex - Math.floor(maxBodyHeight / 2));
  const visibleLeft = leftBody.slice(windowStart, windowStart + maxBodyHeight);

  if (selected && detailWidth >= 24) {
    const detailLines = renderBox(
      selected.previewTitle,
      selected.previewLines,
      detailWidth,
    );
    const rows = Math.max(visibleLeft.length, detailLines.length);
    const body: string[] = [];
    for (let index = 0; index < rows; index += 1) {
      const leftEntry = visibleLeft[index];
      const leftText = padRight(leftEntry?.text ?? "", listWidth);
      const right = detailLines[index] ?? "";
      const left = applyTone({text: leftText, tone: leftEntry?.tone});
      body.push(`${left}   ${right}`);
    }
    return clipLines([headerLine, instructionLine, "", ...body], height);
  }

  const body = visibleLeft.map((line) => applyTone(line));
  const detail = selected
    ? [
      "",
      INFO_COLOR(selected.previewTitle),
      ...wrapLines(selected.previewLines, width),
    ]
    : [];
  return clipLines(
    [headerLine, instructionLine, "", ...body, ...detail],
    height,
  );
}

function renderLoadingScreenLines(
  _app: TokenRingApp,
  config: CLIConfig,
  renderTick: number,
): string[] {
  const {width, height} = getTerminalSize();
  const bannerLines = formatBanner(config, width).map((line) =>
    LOADING_COLOR(centerLine(line, width)),
  );
  const spinnerLine = LOADING_COLOR(
    centerLine(
      `${brailleSpinner[renderTick % brailleSpinner.length]} ${getRandomItem(ridiculousMessages, renderTick / 10)}`,
      width,
    ),
  );
  const reservedLines = bannerLines.length + 2;
  const padding = Math.max(0, (height - reservedLines) / 2);

  return clipLines(
    [
      ...Array.from({length: padding}, () => ""),
      ...bannerLines,
      "",
      spinnerLine,
    ],
    height,
  );
}

export async function runLoadingScreen(
  app: TokenRingApp,
  config: CLIConfig,
  signal: AbortSignal,
): Promise<void> {
  if (!process.stdout.isTTY) return;

  let renderTick = 0;
  const painter = new ScreenPainter();
  const render = () =>
    painter.render(renderLoadingScreenLines(app, config, renderTick));

  const keyHandler: KeyHandler = (_input, key) => {
    if (key.ctrl && key.name === "c") {
      process.kill(process.pid, "SIGINT");
    }
  };
  const resizeHandler = () => render();
  const terminalState = setupTerminal(keyHandler, resizeHandler);

  try {
    render();
    for await (const _ of setIntervalPromise(100, undefined, {signal})) {
      renderTick += 1;
      render();
    }
  } catch (error: unknown) {
    if (!(error instanceof Error) || error.name !== "AbortError") {
      throw error;
    }
  } finally {
    painter.clear();
    cleanupTerminal(terminalState, keyHandler, resizeHandler);
  }
}

export async function promptForAgentSelection(
  app: TokenRingApp,
  config: CLIConfig,
  signal: AbortSignal,
): Promise<AgentSelectionResult | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return null;
  }

  const entries = buildSelectionEntries(app);
  const optionCount = entries.filter((entry) => entry.type === "option").length;
  if (optionCount === 0) {
    clearScreen();
    process.stdout.write(
      `${WARNING_COLOR("No agents, workflows, or web applications are available.")}\n`,
    );
    return null;
  }

  let selectedOptionIndex = 0;

  return await new Promise<AgentSelectionResult | null>((resolve, reject) => {
    const painter = new ScreenPainter();
    let finished = false;

    const finish = (result: AgentSelectionResult | null) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abortHandler);
      painter.clear();
      cleanupTerminal(terminalState, keyHandler, resizeHandler);
      resolve(result);
    };

    const abortHandler = () => finish(null);
    const render = () =>
      painter.render(
        renderSelectionScreen(config, entries, selectedOptionIndex),
      );

    const moveSelection = (delta: number) => {
      selectedOptionIndex =
        (selectedOptionIndex + delta + optionCount) % optionCount;
      render();
    };

    const keyHandler: KeyHandler = (_input, key) => {
      if (key.ctrl && key.name === "c") {
        finish(null);
        return;
      }
      if (key.name === "up" || _input === "k") {
        moveSelection(-1);
        return;
      }
      if (key.name === "down" || _input === "j") {
        moveSelection(1);
        return;
      }
      if (key.name === "return") {
        const selected = getSelectedOption(entries, selectedOptionIndex);
        finish(selected ? parseAgentSelectionValue(selected.value) : null);
        return;
      }
      if (key.name === "escape" || _input === "q") {
        finish(null);
      }
    };

    const resizeHandler = () => render();
    const terminalState = setupTerminal(keyHandler, resizeHandler);

    signal.addEventListener("abort", abortHandler, {once: true});
    try {
      render();
    } catch (error: unknown) {
      signal.removeEventListener("abort", abortHandler);
      cleanupTerminal(terminalState, keyHandler, resizeHandler);
      reject(error);
    }
  });
}

export async function retryAgentSelection(
  app: TokenRingApp,
  config: CLIConfig,
  signal: AbortSignal,
  resolveSelection: (
    selection: AgentSelectionResult | null,
  ) => Promise<Agent | "retry" | null>,
): Promise<Agent | null> {
  while (!signal.aborted) {
    const selection = await promptForAgentSelection(app, config, signal);
    const agent = await resolveSelection(selection);
    if (agent === "retry") {
      continue;
    }
    return agent;
  }

  return null;
}
