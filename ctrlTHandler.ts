/** Enum describing all Ctrl-T actions */
export enum CtrlTAction {
  ShowHelp = "showHelp",
  CreateAgent = "createAgent",
  NextAgent = "nextAgent",
  PrevAgent = "prevAgent",
  OpenSelector = "openSelector",
  ExitAgent = "exitAgent",
  DetachAgent = "detachAgent",
}

type Listener = (action: CtrlTAction) => void;

export class CtrlTHandler {
  private pressed = false;
  private listeners = new Set<Listener>();
  private boundKeypress = this.handleKeypress.bind(this);

  constructor() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.on('data', this.boundKeypress);
    }
  }

  /** Register a listener for Ctrl-T actions */
  addListener(fn: Listener) {
    this.listeners.add(fn);
  }

  /** Unregister a previously added listener */
  removeListener(fn: Listener) {
    this.listeners.delete(fn);
  }

  /** Clean up the raw stdin listener */
  dispose() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.off('data', this.boundKeypress);
    }
    this.listeners.clear();
  }

  private emit(action: CtrlTAction) {
    for (const fn of this.listeners) fn(action);
  }

  private handleKeypress(data: Buffer) {
    const key = data.toString();
    if (key === '\x14') { // Ctrl-T
      if (this.pressed) {
        this.pressed = false;
        this.emit(CtrlTAction.ShowHelp);
        return;
      }
      this.pressed = true;
      return;
    }
    if (this.pressed) {
      this.pressed = false;
      switch (key) {
        case 'c': this.emit(CtrlTAction.CreateAgent); break;
        case 'n': this.emit(CtrlTAction.NextAgent); break;
        case 'p': this.emit(CtrlTAction.PrevAgent); break;
        case 's': this.emit(CtrlTAction.OpenSelector); break;
        case 'x': this.emit(CtrlTAction.ExitAgent); break;
        case 'd': this.emit(CtrlTAction.DetachAgent); break;
      }
    }
  }
}

// Backwards compatibility – a default singleton used throughout the codebase
export const ctrlTHandler = new CtrlTHandler();