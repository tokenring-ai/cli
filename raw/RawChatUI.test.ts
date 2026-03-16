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

    (ui as any).footerSnapshot = {
      lineCount: 6,
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
      cursorRow: 2,
      cursorColumn: 0,
      showCursor: false,
    };

    (ui as any).renderIncremental({kind: "none"});

    expect(renderFullReplay).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });
});
