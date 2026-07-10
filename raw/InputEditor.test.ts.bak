import InputEditor from "./InputEditor.ts";

describe("InputEditor", () => {
  it("moves vertically while preserving the preferred column", () => {
    const editor = new InputEditor("alpha\nbeta");

    editor.moveUp();

    expect(editor.getCursorLocation()).toMatchObject({
      lineIndex: 0,
      column: 4,
    });

    editor.moveDown();

    expect(editor.getCursorLocation()).toMatchObject({
      lineIndex: 1,
      column: 4,
    });
  });

  it("clamps vertical movement to the target line length", () => {
    const editor = new InputEditor("short\nmuch longer");
    editor.setText(editor.getText(), "short\nmuch lo".length);

    editor.moveUp();

    expect(editor.getCursorLocation()).toMatchObject({
      lineIndex: 0,
      column: 5,
    });
  });

  it("deletes the previous word", () => {
    const editor = new InputEditor("hello world");

    editor.deleteWordBackward();

    expect(editor.getText()).toBe("hello ");
    expect(editor.getCursor()).toBe("hello ".length);
  });
});
