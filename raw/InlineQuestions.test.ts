import {vi} from "vitest";
import {createInlineQuestionSession} from "./InlineQuestions.ts";

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("InlineQuestions fileSelect", () => {
  it("loads, expands directories, and submits inline selections", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const onRender = vi.fn();
    const listFileSelectEntries = vi.fn(async (path: string) => {
      if (path === ".") {
        return ["README.md", "src/"];
      }
      if (path === "src") {
        return ["src/z.ts", "src/index.ts"];
      }
      return [];
    });

    const session = createInlineQuestionSession({
      type: "fileSelect",
      label: "Select Files",
      allowFiles: true,
      allowDirectories: false,
      defaultValue: [],
      minimumSelections: 1,
      maximumSelections: 5,
    }, {
      onSubmit,
      onCancel,
      onRender,
      listFileSelectEntries,
    });

    expect(onRender).not.toHaveBeenCalled();
    expect(listFileSelectEntries).not.toHaveBeenCalled();

    await settle();

    expect(listFileSelectEntries).toHaveBeenCalledWith(".");
    const rootRender = session.render({columns: 80, rows: 24}).lines.join("\n");
    expect(rootRender).toContain("README.md");
    expect(rootRender.indexOf("src")).toBeLessThan(rootRender.indexOf("README.md"));

    await session.handleKeypress("", {name: "space"});
    await settle();

    expect(listFileSelectEntries).toHaveBeenCalledWith("src");
    const expandedRender = session.render({columns: 80, rows: 24}).lines.join("\n");
    expect(expandedRender).toContain("index.ts");
    expect(expandedRender.indexOf("index.ts")).toBeLessThan(expandedRender.indexOf("z.ts"));

    await session.handleKeypress("", {name: "down"});
    await session.handleKeypress("", {name: "space"});
    await session.handleKeypress("", {name: "down"});
    await session.handleKeypress("", {name: "down"});
    await session.handleKeypress("", {name: "space"});
    await session.handleKeypress("", {name: "return"});

    expect(onCancel).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(["src/index.ts", "README.md"]);
  });

  it("cancels on q", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const onRender = vi.fn();
    const listFileSelectEntries = vi.fn(async () => ["README.md"]);

    const session = createInlineQuestionSession({
      type: "fileSelect",
      label: "Select Files",
      allowFiles: true,
      allowDirectories: false,
      defaultValue: [],
      maximumSelections: 5,
    }, {
      onSubmit,
      onCancel,
      onRender,
      listFileSelectEntries,
    });

    await settle();
    await session.handleKeypress("", {name: "q"});

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
