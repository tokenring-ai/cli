import type Agent from "@tokenring-ai/agent/Agent";
import {ChatModelRegistry} from "@tokenring-ai/ai-client/ModelRegistry";
import {parseModelAndSettings} from "@tokenring-ai/ai-client/util/modelSettings";
import {ChatService} from "@tokenring-ai/chat";
import {clamp} from "@tokenring-ai/utility/number/clamp";
import {visibleLength} from "@tokenring-ai/utility/string/visibleLength";
import {wrapPlainText} from "@tokenring-ai/utility/string/wrapPlainText";
import process from "node:process";

const ANSI_SGR_PATTERN = /\x1b\[([0-9;]*)m/g;

export function trimBoundaryNewlines(text: string): string {
  return text.replace(/^\n+|\n+$/g, "");
}

export function shortenPath(path: string): string {
  const home = process.env.HOME;
  if (home && path.startsWith(home)) {
    return `~${path.slice(home.length) || "/"}`;
  }
  return path;
}

export function formatPercentLeft(value: number | null): string {
  if (value === null) return "-- left";
  return `${value}% left`;
}

export function formatCompactNumber(value: number | null, suffix = ""): string {
  if (value === null) return `--${suffix}`;
  if (value < 1000) return `${value}${suffix}`;
  if (value < 1_000_000)
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k${suffix}`;
  return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}m${suffix}`;
}

export function formatCurrency(value: number | null): string {
  if (value === null) return "$--";
  if (value >= 100) return `$${value.toFixed(0)}`;
  if (value >= 10) return `$${value.toFixed(1)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

export function formatTimer(timestamp: number): string {
  const remainingMs = Math.max(0, timestamp - Date.now());
  const seconds = Math.ceil(remainingMs / 1000);
  return `auto ${seconds}s`;
}

export function flattenWrappedLines(
  lines: string[],
  width: number,
  prefix = "",
): string[] {
  const result: string[] = [];
  const innerWidth = Math.max(1, width - visibleLength(prefix));

  for (const line of lines) {
    for (const wrapped of wrapPlainText(line, innerWidth)) {
      result.push(`${prefix}${wrapped}`);
    }
  }

  return result.length > 0 ? result : [prefix];
}

export function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split("\n");
}

function countWrappedRows(line: string, columns: number): number {
  const width = Math.max(1, columns);
  return Math.max(1, Math.ceil(visibleLength(line) / width));
}

export function countScreenRows(lines: string[] | undefined, columns: number): number {
  if (!lines || lines.length === 0) return 0;
  return lines.reduce(
    (total, line) => total + countWrappedRows(line, columns),
    0,
  );
}

type AnsiWrapState = {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  hidden: boolean;
  strikethrough: boolean;
  foreground: string | null;
  background: string | null;
};

function createAnsiWrapState(): AnsiWrapState {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    inverse: false,
    hidden: false,
    strikethrough: false,
    foreground: null,
    background: null,
  };
}

function cloneAnsiWrapState(state: AnsiWrapState): AnsiWrapState {
  return {...state};
}

function hasAnsiWrapState(state: AnsiWrapState): boolean {
  return (
    state.bold ||
    state.dim ||
    state.italic ||
    state.underline ||
    state.inverse ||
    state.hidden ||
    state.strikethrough ||
    state.foreground !== null ||
    state.background !== null
  );
}

function serializeAnsiWrapState(state: AnsiWrapState): string {
  const sequences: string[] = [];
  if (state.bold) sequences.push("\x1b[1m");
  if (state.dim) sequences.push("\x1b[2m");
  if (state.italic) sequences.push("\x1b[3m");
  if (state.underline) sequences.push("\x1b[4m");
  if (state.inverse) sequences.push("\x1b[7m");
  if (state.hidden) sequences.push("\x1b[8m");
  if (state.strikethrough) sequences.push("\x1b[9m");
  if (state.foreground) sequences.push(`\x1b[${state.foreground}m`);
  if (state.background) sequences.push(`\x1b[${state.background}m`);
  return sequences.join("");
}

function applyAnsiSgrSequence(state: AnsiWrapState, paramsText: string): void {
  const params =
    paramsText.length === 0
      ? [0]
      : paramsText.split(";").map((part) => Number.parseInt(part, 10) || 0);

  for (let index = 0; index < params.length; index += 1) {
    const code = params[index];

    switch (code) {
      case 0:
        Object.assign(state, createAnsiWrapState());
        break;
      case 1:
        state.bold = true;
        break;
      case 2:
        state.dim = true;
        break;
      case 3:
        state.italic = true;
        break;
      case 4:
        state.underline = true;
        break;
      case 7:
        state.inverse = true;
        break;
      case 8:
        state.hidden = true;
        break;
      case 9:
        state.strikethrough = true;
        break;
      case 22:
        state.bold = false;
        state.dim = false;
        break;
      case 23:
        state.italic = false;
        break;
      case 24:
        state.underline = false;
        break;
      case 27:
        state.inverse = false;
        break;
      case 28:
        state.hidden = false;
        break;
      case 29:
        state.strikethrough = false;
        break;
      case 39:
        state.foreground = null;
        break;
      case 49:
        state.background = null;
        break;
      default:
        if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
          state.foreground = `${code}`;
          break;
        }
        if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
          state.background = `${code}`;
          break;
        }
        if (code === 38 || code === 48) {
          const mode = params[index + 1];
          if (mode === 5 && index + 2 < params.length) {
            const sequence = `${code};${mode};${params[index + 2]}`;
            if (code === 38) {
              state.foreground = sequence;
            } else {
              state.background = sequence;
            }
            index += 2;
          } else if (mode === 2 && index + 4 < params.length) {
            const sequence = `${code};${mode};${params[index + 2]};${params[index + 3]};${params[index + 4]}`;
            if (code === 38) {
              state.foreground = sequence;
            } else {
              state.background = sequence;
            }
            index += 4;
          }
        }
        break;
    }
  }
}

export function wrapAnsiStyledLine(text: string, width: number): string[] {
  if (width <= 0) return [""];
  if (text.length === 0) return [""];

  const segments = Array.from(text.matchAll(ANSI_SGR_PATTERN));
  const wrapped: string[] = [];
  const state = createAnsiWrapState();
  let segmentIndex = 0;
  let current = "";
  let visibleCount = 0;
  let textIndex = 0;

  while (textIndex < text.length) {
    const nextSegment = segments[segmentIndex];
    if (nextSegment && nextSegment.index === textIndex) {
      current += nextSegment[0];
      applyAnsiSgrSequence(state, nextSegment[1] ?? "");
      textIndex += nextSegment[0].length;
      segmentIndex += 1;
      continue;
    }

    const codePoint = text.codePointAt(textIndex);
    if (codePoint === undefined) {
      break;
    }

    const character = String.fromCodePoint(codePoint);
    current += character;
    visibleCount += 1;
    textIndex += character.length;

    if (visibleCount >= width && textIndex < text.length) {
      const nextPrefix =
        "   " + serializeAnsiWrapState(cloneAnsiWrapState(state));
      wrapped.push(`${current}${hasAnsiWrapState(state) ? "\x1b[0m" : ""}`);
      current = nextPrefix;
      visibleCount = 0;
    }
  }

  wrapped.push(current.length > 0 ? current : "");
  return wrapped;
}

export function getOutputWrapWidth(columns: number): number {
  return Math.max(1, Math.min(150, columns - 3));
}

export function findFirstDifferentLineIndex(
  previousLines: string[],
  nextLines: string[],
): number {
  const sharedLength = Math.min(previousLines.length, nextLines.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (previousLines[index] !== nextLines[index]) {
      return index;
    }
  }
  return sharedLength;
}


export function getCurrentModelLabel(agent: Agent): string {
  const chatService = agent.getServiceByType(ChatService);
  return chatService?.getModel(agent) ?? "(no model)";
}

export function getRemainingContextPercent(agent: Agent): number | null {
  const chatService = agent.getServiceByType(ChatService);
  const modelRegistry =
    agent.getServiceByType(ChatModelRegistry);
  if (!chatService || !modelRegistry) return null;

  const message = chatService.getLastMessage(agent);
  if (!message) return 100;

  const model = chatService.getModel(agent);
  if (!model) return null;

  const {base} = parseModelAndSettings(model.toLowerCase());
  const spec = modelRegistry.modelSpecs.get(base);
  if (!spec?.maxContextLength) return null;

  const usage = message.response.lastStepUsage;
  const usedTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  const remaining = 1 - usedTokens / spec.maxContextLength;
  return clamp(Math.round(remaining * 100), 0, 100);
}

export function getActiveToolCount(agent: Agent): number | null {
  const chatService = agent.getServiceByType(ChatService);
  if (!chatService) return null;
  return chatService.getEnabledTools(agent).length;
}

export function getTokenUsage(agent: Agent ): number | null {
  const chatService = agent.getServiceByType(ChatService);
  if (!chatService) return null;

  const messages = chatService.getChatMessages(agent);
  if (messages.length === 0) return 0;

  const usage = messages[messages.length - 1].response.totalUsage;
  return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
}

export function getChatCost(agent: Agent): number | null {
  const chatService = agent.getServiceByType(ChatService);
  if (!chatService) return null;

  const messages = chatService.getChatMessages(agent);
  if (messages.length === 0) return 0;

  return messages.reduce(
    (total, message) => total + (message.response.cost.total ?? 0),
    0,
  );
}

export function getTerminalSize(): { columns: number; rows: number } {
  return {
    columns: process.stdout.columns ?? 80,
    rows: process.stdout.rows ?? 24,
  };
}