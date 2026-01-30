import chalk from "chalk";
import process from "node:process";
import readline from "node:readline";

export class PartialInputError extends Error {
  constructor(public buffer: string) {
    super("Input was interrupted");
    this.name = "PartialInputError";
  }
}
export interface CommandPromptOptions {
  rl: readline.Interface; // Accept the interface from the caller
  message: string;
  prefix?: string;
  history?: string[];
  autoCompletion?: string[] | ((line: string) => Promise<string[]> | string[]);
  signal?: AbortSignal;
}

/**
 * A prompt implementation using a shared Node.js readline interface.
 */
export async function commandPrompt(options: CommandPromptOptions): Promise<string> {
  const {
    rl,
    message = ">",
    prefix = chalk.yellowBright("user"),
    history = [],
    autoCompletion = [],
    signal
  } = options;

  if (signal?.aborted) {
    throw new Error("Aborted");
  }

  const promptLabel = `${prefix} ${message} `;

  // Update completer for this specific prompt call
  // Note: readline doesn't have a public 'setCompleter', but we can replace the internal one
  // or use the one provided at interface creation. Since we are reusing 'rl',
  // we rely on the caller having set up the interface appropriately or we'd need to
  // handle complex completer swapping. For simplicity here, we'll assume the caller
  // manages the interface's configuration.

  // Seed history
  if (history.length > 0) {
    // @ts-ignore
    rl.history = [...history].reverse();
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const currentLine = rl.line;
      cleanup();
      reject(new PartialInputError(currentLine));
    };

    const onLine = (line: string) => {
      const trimmed = line.trim();

      cleanup();
      readline.clearLine(process.stdout, 0);
      readline.moveCursor(process.stdout, 0, -1);
      resolve(trimmed);
    };

    const cleanup = () => {
      rl.removeListener("line", onLine);
      signal?.removeEventListener("abort", onAbort);

      // Robustly clear the multi-line prompt and input
      const {rows} = rl.getCursorPos();
      for (let i = 0; i <= rows; i++) {
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
        if (i < rows) {
          readline.moveCursor(process.stdout, 0, -1);
        }
      }
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    rl.on("line", onLine);
    rl.setPrompt(promptLabel);

    rl.prompt();
  });
}