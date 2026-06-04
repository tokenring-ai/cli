import type Agent from "@tokenring-ai/agent/Agent";
import { ChatModelRegistry } from "@tokenring-ai/ai-client/ModelRegistry";
import { parseModelAndSettings } from "@tokenring-ai/ai-client/util/modelSettings";
import { ChatService } from "@tokenring-ai/chat";
import { clamp } from "@tokenring-ai/utility/number/clamp";
import { visibleLength } from "@tokenring-ai/utility/string/visibleLength";
import { wrapPlainText } from "@tokenring-ai/utility/string/wrapPlainText";
import process from "node:process";

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
  if (value < 1_000_000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k${suffix}`;
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

export function flattenWrappedLines(lines: string[], width: number, prefix = ""): string[] {
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
  return lines.reduce((total, line) => total + countWrappedRows(line, columns), 0);
}

export function getOutputWrapWidth(columns: number): number {
  return clamp(columns, 1, Math.min(150, columns - 3));
}

export function findFirstDifferentLineIndex(previousLines: string[], nextLines: string[]): number {
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
  const modelRegistry = agent.getServiceByType(ChatModelRegistry);
  if (!chatService || !modelRegistry) return null;

  const message = chatService.getLastMessage(agent);
  if (!message) return 100;

  const model = chatService.getModel(agent);
  if (!model) return null;

  const { base } = parseModelAndSettings(model.toLowerCase());
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

export function getTokenUsage(agent: Agent): number | null {
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

  return messages.reduce((total, message) => total + (message.response.cost.total ?? 0), 0);
}

export function getTerminalSize(): { columns: number; rows: number } {
  return {
    columns: process.stdout.columns ?? 80,
    rows: process.stdout.rows ?? 24,
  };
}
