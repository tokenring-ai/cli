import type {AgentEventEnvelope, ParsedInteractionRequest} from "@tokenring-ai/agent/AgentEvents";
import chalk from "chalk";
import {theme} from "../theme.ts";
import applyMarkdownStyles from "../utility/applyMarkdownStyles.ts";
import type {FileSearchToken} from "./FileSearch.ts";
import type {RenderBlock} from "./InlineQuestions.ts";
import {getOutputWrapWidth, splitLines, trimBoundaryNewlines, wrapAnsiStyledLine} from "./utility.ts";

export type TranscriptTone =
  | "chat"
  | "reasoning"
  | "info"
  | "warning"
  | "error"
  | "input"
  | "success"
  | "muted";

export type TranscriptEntryKind =
  | "system"
  | "input"
  | "chat"
  | "reasoning"
  | "info"
  | "warning"
  | "error"
  | "artifact"
  | "toolCall"
  | "response";

export type TranscriptEntry = {
  id: number;
  kind: TranscriptEntryKind;
  title: string | null;
  body: string;
  tone: TranscriptTone;
  markdown: boolean;
};

export type QuestionInteraction = Extract<
  ParsedInteractionRequest,
  { type: "question" }
>;

export type ToolCallEvent = Extract<AgentEventEnvelope, { type: "toolCall" }>;
export type ArtifactEvent = Extract<AgentEventEnvelope, { type: "output.artifact" }>;

export const TONE_COLORS: Record<TranscriptTone, (text: string) => string> = {
  chat: chalk.hex(theme.chatOutputText),
  reasoning: chalk.hex(theme.chatReasoningText),
  info: chalk.hex(theme.chatSystemInfoMessage),
  warning: chalk.hex(theme.chatSystemWarningMessage),
  error: chalk.hex(theme.chatSystemErrorMessage),
  input: chalk.hex(theme.chatPreviousInput),
  success: chalk.hex(theme.chatInputHandledSuccess),
  muted: chalk.hex(theme.chatDivider),
};

export const TITLE_COLOR = chalk.hex(theme.boxTitle).bold;
export const HEADER_PREFIX = " · ";
export const TEXT_INDENT = "   ";

export function getCommandCompletionSignature(context: {
  replacementStart: number;
  replacementEnd: number;
  sourceQuery?: string;
  query?: string;
  matches: Array<{ name: string }>;
}): string {
  const sourceQuery = context.sourceQuery ?? context.query ?? "";
  return `${context.replacementStart}:${context.replacementEnd}:${sourceQuery}:${context.matches.map((command) => command.name).join(",")}`;
}

export function getFileSearchTokenSignature(token: FileSearchToken): string {
  return `${token.start}:${token.end}:${token.query}`;
}

export function getQuestionTitle(question: QuestionInteraction): string {
  const inner = question.question;
  if ("label" in inner && inner.label.trim().length > 0) {
    return inner.label.trim();
  }
  return question.optional ? "Optional Question" : "Question";
}

export function getQuestionLabel(question: QuestionInteraction): string {
  switch (question.question.type) {
    case "text":
    case "treeSelect":
    case "fileSelect":
      return question.question.label;
    case "form":
      return "Form";
  }
}

export function moveToFooterTop(snapshot: {
  lineCount: number;
  cursorRow: number;
}): string {
  if (snapshot.lineCount === 0) {
    return "";
  }

  let output = "\r";
  if (snapshot.cursorRow > 0) {
    output += `\x1b[${snapshot.cursorRow}F`;
  }
  return output;
}

export function getFooterCursorSequence(block: RenderBlock): string {
  const lineCount = block.lines.length;
  if (lineCount === 0) {
    return block.showCursor === false ? "\x1b[?25l" : "\x1b[?25h";
  }

  const cursorRow = block.cursorRow ?? Math.max(0, lineCount - 1);
  const cursorColumn = block.cursorColumn ?? 0;
  const moveUp = Math.max(0, lineCount - 1 - cursorRow);

  let output = "\r";
  if (moveUp > 0) {
    output += `\x1b[${moveUp}F`;
  }
  output += `\x1b[${cursorColumn + 1}G`;
  output += block.showCursor === false ? "\x1b[?25l" : "\x1b[?25h";
  return output;
}

export function combineBlocks(blocks: RenderBlock[]): RenderBlock {
  const lines: string[] = [];
  let cursorRow: number | undefined;
  let cursorColumn: number | undefined;
  let showCursor = false;

  for (const block of blocks) {
    if (block.lines.length === 0) continue;
    if (lines.length > 0) {
      lines.push("");
    }

    const offset = lines.length;
    lines.push(...block.lines);

    if (block.cursorRow !== undefined) {
      cursorRow = offset + block.cursorRow;
      cursorColumn = block.cursorColumn ?? 0;
      showCursor = block.showCursor !== false;
    }
  }

  return {
    lines,
    cursorRow,
    cursorColumn,
    showCursor,
  };
}

export function renderEntryText(
  entry: TranscriptEntry,
  columns: number,
  keepOpen = false,
): string {
  const lines: string[] = [];
  const outputWidth = getOutputWrapWidth(columns);

  if (entry.title) {
    const styledTitle = TITLE_COLOR(
      `${HEADER_PREFIX}${applyMarkdownStyles(entry.title)}`,
    );
    lines.push(...wrapAnsiStyledLine(styledTitle, outputWidth));
  }

  const body = trimBoundaryNewlines(entry.body);
  if (body.length > 0) {
    for (const sourceLine of body.split("\n")) {
      const styled = entry.markdown
        ? TONE_COLORS[entry.tone](applyMarkdownStyles(sourceLine))
        : TONE_COLORS[entry.tone](sourceLine);
      lines.push(...wrapAnsiStyledLine(`${TEXT_INDENT}${styled}`, outputWidth));
    }
  }

  if (keepOpen) {
    return lines.join("\n");
  }

  return `${lines.join("\n")}\n\n`;
}

export function formatToolCallBody(
  event: ToolCallEvent,
  includeResult = false,
): string {
  const lines: string[] = [];
  const result = trimBoundaryNewlines(event.result);

  if (event.actions?.length) {
    for (const action of event.actions) {
      const actionText = trimBoundaryNewlines(action);
      if (actionText.length === 0) continue;

      const [firstLine, ...remainingLines] = actionText.split("\n");
      lines.push(`└ ${firstLine}`);
      lines.push(...remainingLines.map((line) => ` ${line}`));
    }
  }

  if (result.length > 0 && includeResult) {
    lines.push(result);
  }

  return lines.join("\n");
}

function decodeAsText(body: string, encoding: "text" | "base64"): string {
  switch (encoding) {
    case "text":
      return body;
    case "base64":
      return Buffer.from(body, "base64").toString("utf-8");
    default: {
      // noinspection JSUnusedLocalSymbols
      const _foo: never = encoding;
      throw new Error(`Unsupported encoding: ${encoding as string}`);
    }
  }
}

export function formatArtifactBody(
  event: ArtifactEvent,
  verbose: boolean
): { body: string, markdown: boolean } {
  let markdown = true;
  const lines = [`${event.name} (${event.mimeType})`];
  if (verbose) {
    if (event.encoding === 'href') {
      lines.push(`Artifact can be viewed at: [${event.body}](${event.body})`);
    } else {

      switch (event.mimeType) {
        case "application/json":
          lines.push(`\`\`\`json\n${decodeAsText(event.body, event.encoding)}\n\`\`\``);
          break;
        case "text/markdown":
          lines.push(decodeAsText(event.body, event.encoding));
          break;
        case "text/plain":
        case "message/rfc822":
        case "text/x-diff":
        case "text/html":
          lines.push(decodeAsText(event.body, event.encoding));
          markdown = false;
          break;
        case "image/png":
        case "image/jpeg":
          lines.push("Artifact is an image and cannot be displayed in the CLI");
          markdown = false;
          break;
        default: {
          const _unknownMimeType: never = event.mimeType;
          lines.push(`Unknown MIME type '${_unknownMimeType as string}' encountered. Artifact cannot be displayed.`);
          markdown = false;
          break;
        }
      }
    }
  }
  return {markdown, body: lines.join("\n")};
}

export function renderBufferedStream(
  rawBuffer: string,
  tone: TranscriptTone,
  columns: number,
): string {
  const outputWidth = getOutputWrapWidth(columns);
  return splitLines(rawBuffer)
    .flatMap((line) =>
      wrapAnsiStyledLine(
        TONE_COLORS[tone](applyMarkdownStyles(line)),
        outputWidth,
      ),
    )
    .join("\n");
}

export function getRawStreamText(message: string): string {
  return message.replace(/\n/g, `\n${TEXT_INDENT}`);
}
