import process from "node:process";
import chalk from "chalk";

/**
 * Custom spinner class that renders a simple animation in the terminal.
 * We use this instead of a spinner library, because those libraries all
 * try to handle ctrl-c which conflicts with our signal handling.
 */
export class SimpleSpinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private interval: NodeJS.Timeout | null = null;
  private currentFrame = 0;
  private colorFn: (text: string) => string;

  constructor(private message: string = "", hexColor: string = "#ffffff") {
    // Create a chalk function from the hex color
    this.colorFn = chalk.hex(hexColor);
  }

  start(message?: string) {
    if (message) this.message = message;
    if (this.interval) return;

    // Hide cursor (\x1B[?25l)
    process.stdout.write("\x1B[?25l");

    this.interval = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      // Clear the line (\x1B[K) after returning to start (\r) to ensure clean rendering
      process.stdout.write(`\r\x1B[K${this.colorFn(`${frame} ${this.message}`)}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      // Clear line (\r\x1B[K) and show cursor (\x1B[?25h)
      process.stdout.write("\r\x1B[K\x1B[?25h");
    }
  }

  updateMessage(message: string) {
    this.message = message;
  }
}