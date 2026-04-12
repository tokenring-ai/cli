import {describe, expect, it} from "vitest";
import {
  combineBlocks,
  formatToolCallBody,
  getCommandCompletionSignature,
  getFileSearchTokenSignature,
  getFooterCursorSequence,
  getQuestionLabel,
  getQuestionTitle,
  getRawStreamText,
  moveToFooterTop,
  renderBufferedStream,
  renderEntryText,
} from "./ChatRenderUtils.ts";

describe("ChatRenderUtils", () => {
  it("builds stable completion and file-search signatures", () => {
    expect(
      getCommandCompletionSignature({
        replacementStart: 1,
        replacementEnd: 4,
        query: "he",
        matches: [{name: "help"}, {name: "hello"}],
      }),
    ).toBe("1:4:he:help,hello");

    expect(
      getFileSearchTokenSignature({
        start: 2,
        end: 8,
        query: "RawChatUI",
      }),
    ).toBe("2:8:RawChatUI");
  });

  it("derives question titles and labels", () => {
    expect(
      getQuestionTitle({
        type: "question",
        interactionId: "1",
        timestamp: 0,
        message: "Pick one",
        optional: false,
        question: {
          type: "text",
          label: "  Model  ",
        },
      } as any),
    ).toBe("Model");

    expect(
      getQuestionTitle({
        type: "question",
        interactionId: "2",
        timestamp: 0,
        message: "Pick one",
        optional: true,
        question: {
          type: "form",
          fields: [],
        },
      } as any),
    ).toBe("Optional Question");

    expect(
      getQuestionLabel({
        type: "question",
        interactionId: "3",
        timestamp: 0,
        message: "Fill this out",
        optional: false,
        question: {
          type: "form",
          fields: [],
        },
      } as any),
    ).toBe("Form");
  });

  it("formats terminal cursor movement helpers", () => {
    expect(moveToFooterTop({lineCount: 0, cursorRow: 3})).toBe("");
    expect(moveToFooterTop({lineCount: 4, cursorRow: 2})).toBe("\r\x1b[2F");

    expect(
      getFooterCursorSequence({
        lines: ["one", "two"],
        cursorRow: 0,
        cursorColumn: 2,
        showCursor: false,
      }),
    ).toBe("\r\x1b[1F\x1b[3G\x1b[?25l");
  });

  it("combines blocks and preserves the final cursor position", () => {
    expect(
      combineBlocks([
        {lines: ["hint"], showCursor: false},
        {
          lines: ["prompt", "value"],
          cursorRow: 1,
          cursorColumn: 4,
          showCursor: true,
        },
      ]),
    ).toEqual({
      lines: ["hint", "", "prompt", "value"],
      cursorRow: 3,
      cursorColumn: 4,
      showCursor: true,
    });
  });

  it("formats tool-call actions and optionally includes results", () => {
    const event = {
      result: "\ncommand output\n",
      actions: ["first line\nsecond line", ""],
    };

    expect(formatToolCallBody(event as any, false)).toBe(
      "└ first line\n second line",
    );
    expect(formatToolCallBody(event as any, true)).toBe(
      "└ first line\n second line\ncommand output",
    );
  });

  it("renders transcript entries and streamed markdown without raw markdown markers", () => {
    const entry = renderEntryText(
      {
        id: 1,
        kind: "chat",
        title: "Assistant",
        body: "**bold**",
        tone: "chat",
        markdown: true,
      },
      80,
    );

    expect(entry).toContain("Assistant");
    expect(entry).toContain("bold");
    expect(entry).not.toContain("**bold**");
    expect(entry.endsWith("\n\n")).toBe(true);

    const stream = renderBufferedStream("# Heading", "chat", 80);
    expect(stream).toContain("Heading");
    expect(stream).not.toContain("# Heading");
    expect(getRawStreamText("a\nb")).toBe("a\n   b");
  });
});
