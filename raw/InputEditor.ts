import {clamp} from "@tokenring-ai/utility/number/clamp";

type LineRange = {
  start: number;
  end: number;
};

export default class InputEditor {
  private buffer = "";
  private cursor = 0;
  private preferredColumn: number | null = null;

  constructor(initialValue = "") {
    this.setText(initialValue);
  }

  getText(): string {
    return this.buffer;
  }

  getCursor(): number {
    return this.cursor;
  }

  setText(value: string, cursor = value.length): void {
    this.buffer = value;
    this.cursor = clamp(cursor, 0, value.length);
    this.preferredColumn = null;
  }

  clear(): void {
    this.setText("");
  }

  insert(text: string): void {
    if (text.length === 0) return;

    this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
    this.preferredColumn = null;
  }

  insertNewline(): void {
    this.insert("\n");
  }

  backspace(): void {
    if (this.cursor === 0) return;

    this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
    this.cursor -= 1;
    this.preferredColumn = null;
  }

  deleteForward(): void {
    if (this.cursor >= this.buffer.length) return;

    this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
    this.preferredColumn = null;
  }

  deleteWordBackward(): void {
    if (this.cursor === 0) return;

    let start = this.cursor;
    while (start > 0 && /\s/.test(this.buffer[start - 1] ?? "")) {
      start -= 1;
    }
    while (start > 0 && !/\s/.test(this.buffer[start - 1] ?? "")) {
      start -= 1;
    }

    this.buffer = this.buffer.slice(0, start) + this.buffer.slice(this.cursor);
    this.cursor = start;
    this.preferredColumn = null;
  }

  deleteToStartOfLine(): void {
    const {lineStart} = this.getCursorLocation();
    if (lineStart === this.cursor) return;

    this.buffer = this.buffer.slice(0, lineStart) + this.buffer.slice(this.cursor);
    this.cursor = lineStart;
    this.preferredColumn = null;
  }

  deleteToEndOfLine(): void {
    const {lineEnd} = this.getCursorLocation();
    if (lineEnd === this.cursor) return;

    this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(lineEnd);
    this.preferredColumn = null;
  }

  moveLeft(): void {
    if (this.cursor === 0) return;

    this.cursor -= 1;
    this.preferredColumn = null;
  }

  moveRight(): void {
    if (this.cursor >= this.buffer.length) return;

    this.cursor += 1;
    this.preferredColumn = null;
  }

  moveWordLeft(): void {
    if (this.cursor === 0) return;

    let nextCursor = this.cursor;
    while (nextCursor > 0 && /\s/.test(this.buffer[nextCursor - 1] ?? "")) {
      nextCursor -= 1;
    }
    while (nextCursor > 0 && !/\s/.test(this.buffer[nextCursor - 1] ?? "")) {
      nextCursor -= 1;
    }

    this.cursor = nextCursor;
    this.preferredColumn = null;
  }

  moveWordRight(): void {
    if (this.cursor >= this.buffer.length) return;

    let nextCursor = this.cursor;
    while (nextCursor < this.buffer.length && /\s/.test(this.buffer[nextCursor] ?? "")) {
      nextCursor += 1;
    }
    while (nextCursor < this.buffer.length && !/\s/.test(this.buffer[nextCursor] ?? "")) {
      nextCursor += 1;
    }

    this.cursor = nextCursor;
    this.preferredColumn = null;
  }

  moveHome(): void {
    const {lineStart} = this.getCursorLocation();
    this.cursor = lineStart;
    this.preferredColumn = null;
  }

  moveEnd(): void {
    const {lineEnd} = this.getCursorLocation();
    this.cursor = lineEnd;
    this.preferredColumn = null;
  }

  moveUp(): void {
    const lines = this.getLineRanges();
    const {lineIndex, column} = this.getCursorLocation();
    if (lineIndex === 0) return;

    const preferredColumn = this.preferredColumn ?? column;
    const targetLine = lines[lineIndex - 1];
    this.cursor = clamp(targetLine.start + preferredColumn, targetLine.start, targetLine.end);
    this.preferredColumn = preferredColumn;
  }

  moveDown(): void {
    const lines = this.getLineRanges();
    const {lineIndex, column} = this.getCursorLocation();
    if (lineIndex >= lines.length - 1) return;

    const preferredColumn = this.preferredColumn ?? column;
    const targetLine = lines[lineIndex + 1];
    this.cursor = clamp(targetLine.start + preferredColumn, targetLine.start, targetLine.end);
    this.preferredColumn = preferredColumn;
  }

  getCursorLocation(): {
    lineIndex: number;
    column: number;
    lineStart: number;
    lineEnd: number;
  } {
    const lines = this.getLineRanges();
    let lineIndex = lines.length - 1;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (this.cursor <= line.end || index === lines.length - 1) {
        lineIndex = index;
        break;
      }
    }

    const line = lines[lineIndex];
    return {
      lineIndex,
      column: this.cursor - line.start,
      lineStart: line.start,
      lineEnd: line.end,
    };
  }

  getLineCount(): number {
    return this.getLineRanges().length;
  }

  private getLineRanges(): LineRange[] {
    const ranges: LineRange[] = [];
    let start = 0;

    for (let index = 0; index < this.buffer.length; index += 1) {
      if (this.buffer[index] === "\n") {
        ranges.push({start, end: index});
        start = index + 1;
      }
    }

    ranges.push({start, end: this.buffer.length});

    return ranges;
  }
}
