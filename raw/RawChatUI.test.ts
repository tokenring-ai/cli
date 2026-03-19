import {beforeEach, describe, expect, it, vi} from "vitest";
import RawChatUI from "./RawChatUI.ts";

describe("RawChatUI footer redraws", () => {
  beforeEach(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stdout, "columns", {
      configurable: true,
      value: 80,
    });
    Object.defineProperty(process.stdout, "rows", {
      configurable: true,
      value: 24,
    });
  });

  it("falls back to full replay when a footer-only redraw changes footer height", () => {
    const ui = new RawChatUI({
      agent: {
        getState: vi.fn(),
      } as any,
      config: {
        verbose: false,
      } as any,
      commands: [],
      onSubmit: vi.fn(),
      onOpenAgentSelection: vi.fn(),
      onDeleteIdleAgent: vi.fn(),
      onAbortCurrentActivity: vi.fn(() => false),
    });

    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const renderFullReplay = vi.spyOn(ui as any, "renderFullReplay").mockImplementation(() => {});
    vi.spyOn(ui as any, "renderFooter").mockReturnValue({
      lines: ["hint", "composer", "status"],
      showCursor: false,
    });
    vi.spyOn(ui as any, "moveToFooterTop").mockReturnValue("");
    vi.spyOn(ui as any, "getFooterCursorSequence").mockReturnValue("");

    (ui as any).footerSnapshot = {
      lineCount: 6,
      lines: ["old hint", "old composer", "old status", "", "", ""],
      cursorRow: 5,
      cursorColumn: 0,
      showCursor: false,
    };

    (ui as any).renderIncremental({kind: "none"});

    expect(renderFullReplay).toHaveBeenCalledTimes(1);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("uses incremental redraw when footer height is unchanged", () => {
    const ui = new RawChatUI({
      agent: {
        getState: vi.fn(),
      } as any,
      config: {
        verbose: false,
      } as any,
      commands: [],
      onSubmit: vi.fn(),
      onOpenAgentSelection: vi.fn(),
      onDeleteIdleAgent: vi.fn(),
      onAbortCurrentActivity: vi.fn(() => false),
    });

    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const renderFullReplay = vi.spyOn(ui as any, "renderFullReplay").mockImplementation(() => {});
    vi.spyOn(ui as any, "renderFooter").mockReturnValue({
      lines: ["hint", "composer", "status"],
      showCursor: false,
    });
    vi.spyOn(ui as any, "moveToFooterTop").mockReturnValue("");
    vi.spyOn(ui as any, "getFooterCursorSequence").mockReturnValue("");

    (ui as any).footerSnapshot = {
      lineCount: 3,
      lines: ["hint", "composer", "status"],
      cursorRow: 2,
      cursorColumn: 0,
      showCursor: false,
    };

    (ui as any).renderIncremental({kind: "none"});

    expect(renderFullReplay).not.toHaveBeenCalled();
    expect(writeSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("re-renders the streamed tail when markdown completes mid-stream", () => {
    const ui = new RawChatUI({
      agent: {
        getState: vi.fn(),
      } as any,
      config: {
        verbose: false,
      } as any,
      commands: [],
      onSubmit: vi.fn(),
      onOpenAgentSelection: vi.fn(),
      onDeleteIdleAgent: vi.fn(),
      onAbortCurrentActivity: vi.fn(() => false),
    });

    const first = (ui as any).buildStreamDelta("output.chat", "Assistant", "**bo", "chat", 80, 24);
    expect(first.kind).toBe("append");
    expect((ui as any).activeVisibleStream.displayedBuffer).toContain("bo");

    const second = (ui as any).buildStreamDelta("output.chat", "Assistant", "ld**", "chat", 80, 24);
    expect(second.kind).toBe("rewriteStreamTail");
    expect(second.blockTopOffsetFromFooterTop).toBeGreaterThan(0);
    expect((ui as any).activeVisibleStream.displayedBuffer).not.toBe((ui as any).activeVisibleStream.rawBuffer);
    expect((ui as any).activeVisibleStream.displayedBuffer).not.toContain("**");
    expect((ui as any).activeVisibleStream.displayedBuffer).toContain("bold");
  });

  it("preserves block markdown parsing in streamed output", () => {
    const ui = new RawChatUI({
      agent: {
        getState: vi.fn(),
      } as any,
      config: {
        verbose: false,
      } as any,
      commands: [],
      onSubmit: vi.fn(),
      onOpenAgentSelection: vi.fn(),
      onDeleteIdleAgent: vi.fn(),
      onAbortCurrentActivity: vi.fn(() => false),
    });

    (ui as any).buildStreamDelta("output.chat", "Assistant", "# Heading", "chat", 80, 24);
    const headingBuffer = (ui as any).activeVisibleStream.displayedBuffer;
    expect(headingBuffer).toContain("Heading");
    expect(headingBuffer).not.toContain("# Heading");
  });

  it("does not overcount exact-width lines", () => {
    const ui = new RawChatUI({
      agent: {
        getState: vi.fn(),
      } as any,
      config: {
        verbose: false,
      } as any,
      commands: [],
      onSubmit: vi.fn(),
      onOpenAgentSelection: vi.fn(),
      onDeleteIdleAgent: vi.fn(),
      onAbortCurrentActivity: vi.fn(() => false),
    });

    const delta = (ui as any).buildStreamDelta("output.chat", "Assistant", "x".repeat(74), "chat", 80, 1);
    expect(delta.kind).toBe("append");
  });

  it("wraps output three columns narrower than the display", () => {
    const ui = new RawChatUI({
      agent: {
        getState: vi.fn(),
      } as any,
      config: {
        verbose: false,
      } as any,
      commands: [],
      onSubmit: vi.fn(),
      onOpenAgentSelection: vi.fn(),
      onDeleteIdleAgent: vi.fn(),
      onAbortCurrentActivity: vi.fn(() => false),
    });

    (ui as any).buildStreamDelta("output.chat", "Assistant", "x".repeat(75), "chat", 80, 24);
    const lines = (ui as any).activeVisibleStream.displayedBuffer.split("\n");
    expect(lines).toHaveLength(2);
  });

  it("caps wrapped output width at 150 columns on wide displays", () => {
    const ui = new RawChatUI({
      agent: {
        getState: vi.fn(),
      } as any,
      config: {
        verbose: false,
      } as any,
      commands: [],
      onSubmit: vi.fn(),
      onOpenAgentSelection: vi.fn(),
      onDeleteIdleAgent: vi.fn(),
      onAbortCurrentActivity: vi.fn(() => false),
    });

    (ui as any).buildStreamDelta("output.chat", "Assistant", "x".repeat(148), "chat", 200, 24);
    const lines = (ui as any).activeVisibleStream.displayedBuffer.split("\n");
    expect(lines).toHaveLength(2);
  });
});
