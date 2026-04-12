import {beforeEach, describe, expect, it, vi} from "vitest";
import {AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import {FileSystemState} from "@tokenring-ai/filesystem/state/fileSystemState";
import RawChatUI from "./RawChatUI.ts";

describe("RawChatUI footer redraws", () => {
  function createUI(overrides: Partial<any> = {}) {
    return new RawChatUI({
      agent: {
        getState: vi.fn(),
        getServiceByType: vi.fn(),
        ...overrides,
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
  }

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
    const ui = createUI();

    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const renderFullReplay = vi.spyOn(ui as any, "renderFullReplay").mockImplementation(() => {});
    vi.spyOn(ui as any, "renderFooter").mockReturnValue({
      lines: ["hint", "composer", "status"],
      showCursor: false,
    });

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
    const ui = createUI();

    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const renderFullReplay = vi.spyOn(ui as any, "renderFullReplay").mockImplementation(() => {});
    vi.spyOn(ui as any, "renderFooter").mockReturnValue({
      lines: ["hint", "composer", "status"],
      showCursor: false,
    });

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
    const ui = createUI();

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
    const ui = createUI();

    (ui as any).buildStreamDelta("output.chat", "Assistant", "# Heading", "chat", 80, 24);
    const headingBuffer = (ui as any).activeVisibleStream.displayedBuffer;
    expect(headingBuffer).toContain("Heading");
    expect(headingBuffer).not.toContain("# Heading");
  });

  it("does not overcount exact-width lines", () => {
    const ui = createUI();

    const delta = (ui as any).buildStreamDelta("output.chat", "Assistant", "x".repeat(74), "chat", 80, 1);
    expect(delta.kind).toBe("append");
  });

  it("wraps output three columns narrower than the display", () => {
    const ui = createUI();

    (ui as any).buildStreamDelta("output.chat", "Assistant", "x".repeat(75), "chat", 80, 24);
    const lines = (ui as any).activeVisibleStream.displayedBuffer.split("\n");
    expect(lines).toHaveLength(2);
  });

  it("caps wrapped output width at 150 columns on wide displays", () => {
    const ui = createUI();

    (ui as any).buildStreamDelta("output.chat", "Assistant", "x".repeat(148), "chat", 200, 24);
    const lines = (ui as any).activeVisibleStream.displayedBuffer.split("\n");
    expect(lines).toHaveLength(2);
  });

  it("recovers from render failures with a one-time safe replay", () => {
    const ui = createUI();
    (ui as any).started = true;

    const renderFullReplay = vi
      .spyOn(ui as any, "renderFullReplay")
      .mockImplementationOnce(() => {
        throw new Error("broken render");
      })
      .mockImplementation(() => {});

    expect(() => (ui as any).render()).not.toThrow();
    expect(renderFullReplay).toHaveBeenCalledTimes(2);
    expect((ui as any).latestState).toBeNull();
    expect((ui as any).flashMessage).toMatchObject({
      text: "Render failed: broken render",
      tone: "error",
    });
  });

  it("falls back to cwd when FileSystemState is unavailable", () => {
    const ui = createUI({
      getState: vi.fn((stateType: unknown) => {
        if (stateType === FileSystemState) {
          throw new Error("State slice FileSystemState not found");
        }
        if (stateType === AgentEventState) {
          return {currentlyExecutingInputItem: null};
        }
        return null;
      }),
    });

    const footer = (ui as any).renderFooter(80, 24);
    expect(footer.lines.at(-1)).toContain("tokenring");
    expect((ui as any).flashMessage).toMatchObject({
      text: "File system state unavailable: State slice FileSystemState not found",
      tone: "error",
    });
  });

  it("flashes instead of throwing when event processing fails", () => {
    const ui = createUI();
    vi.spyOn(ui as any, "applyTranscriptEvent").mockImplementation(() => {
      throw new Error("bad event");
    });

    expect(() =>
      ui.renderEvent({type: "output.info", timestamp: Date.now(), message: "hi"} as any),
    ).not.toThrow();
    expect((ui as any).flashMessage).toMatchObject({
      text: "Failed to process event: bad event",
      tone: "error",
    });
  });

  it("clears corrupted state when syncing fails", () => {
    const ui = createUI();
    vi.spyOn(ui as any, "cleanupInteractionState").mockImplementation(() => {
      throw new Error("missing slice");
    });

    ui.syncState({} as AgentEventState);

    expect((ui as any).latestState).toBeNull();
    expect((ui as any).flashMessage).toMatchObject({
      text: "Failed to sync state: missing slice",
      tone: "error",
    });
  });
});
