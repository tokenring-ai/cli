import formatLogMessages from "@token-ring/utility/formatLogMessage";
import chalk from "chalk";
import ora from "ora";

/**
 * Output formatter for REPL interface with color coding and spinner support
 */
export default class REPLOutputFormatter {
  /** Tracks if the last write operation ended with a newline */
  lastWriteHadNewline: boolean = true;

  /** Current output type for styling */
  currentOutputType: string | null = null;

  /** Spinner instance for loading states */
  spinner: import("ora").Ora | null = null;

  /**
   * Sets the output type for styling
   */
  outputType(type: string): void {
    this.currentOutputType = type;
  }

  /**
   * Starts a loading spinner with a message
   */
  waiting(msg: string): void {
    this.spinner = ora(msg);
    this.spinner.start();
    this.lastWriteHadNewline = true;
  }

  /** Stops the loading spinner */
  doneWaiting(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  /** Outputs a system message in blue */
  systemLine(...msgs: (string | unknown)[]): void {
    if (this.spinner) {
      this.spinner.stop();
    }
    if (!this.lastWriteHadNewline) {
      console.log();
    }
    console.log(chalk.blue(formatLogMessages(msgs)));
    this.lastWriteHadNewline = true;
    if (this.spinner) {
      this.spinner.start();
    }
  }

  /** Outputs an error message in red */
  errorLine(...msgs: (string | unknown)[]): void {
    if (this.spinner) {
      this.spinner.stop();
    }
    if (!this.lastWriteHadNewline) {
      console.log();
    }
    console.error(
      ...msgs.map((msg) => chalk.red(formatLogMessages([msg as unknown as string]))),
    );
    this.lastWriteHadNewline = true;
    if (this.spinner) {
      this.spinner.start();
    }
  }

  /** Outputs a warning message in yellow */
  warningLine(...msgs: (string | unknown)[]): void {
    if (this.spinner) {
      this.spinner.stop();
    }
    if (!this.lastWriteHadNewline) {
      console.log();
    }
    console.error(chalk.yellow(formatLogMessages(msgs)));
    this.lastWriteHadNewline = true;
    if (this.spinner) {
      this.spinner.start();
    }
  }

  /** Outputs an info message in green */
  infoLine(...msgs: (string | unknown)[]): void {
    if (this.spinner) {
      this.spinner.stop();
    }
    if (!this.lastWriteHadNewline) {
      console.log();
    }
    console.log(chalk.green(formatLogMessages(msgs)));
    this.lastWriteHadNewline = true;
    if (this.spinner) {
      this.spinner.start();
    }
  }

  /** Prints a horizontal line separator */
  printHorizontalLine(): void {
    if (this.spinner) {
      this.spinner.stop();
    }
    if (!this.lastWriteHadNewline) {
      console.log();
    }
    const lineChar = "─";
    const lineWidth = process.stdout.columns
      ? Math.floor(process.stdout.columns * 0.8)
      : 60;
    console.log(chalk.dim(lineChar.repeat(lineWidth)));
    this.lastWriteHadNewline = true;
  }

  /**
   * Writes raw output to stdout with appropriate styling
   */
  stdout(msg: string): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
      this.printHorizontalLine();
    }

    if (this.currentOutputType === "chat") {
      process.stdout.write(chalk.green(msg));
    } else if (this.currentOutputType === "reasoning") {
      process.stdout.write(chalk.yellow(msg));
    } else {
      process.stdout.write(msg);
    }

    this.lastWriteHadNewline = msg.endsWith("\n");
  }

  /** Notifies that a job has been queued */
  jobQueued(jobInfo: { name: string; queueLength: number }): void {
    this.systemLine(
      `Job [${jobInfo.name}] queued. Queue length: ${jobInfo.queueLength}`,
    );
  }

  /** Notifies that a job has started */
  jobStarted(jobInfo: { name: string }): void {
    this.systemLine(`Job [${jobInfo.name}] started`);
  }

  /** Notifies that a job has completed successfully */
  jobCompleted(jobInfo: { name: string }): void {
    this.systemLine(`Job [${jobInfo.name}] completed successfully`);
  }

  /** Notifies that a job has failed */
  jobFailed(jobInfo: { name: string; error: Error | unknown }): void {
    if (jobInfo.error instanceof Error) {
      this.errorLine(
        `Job [${jobInfo.name}] failed:`,
        `Error: ${jobInfo.error.message}`,
      );
    } else {
      this.errorLine(`Job [${jobInfo.name}] failed:`, String(jobInfo.error));
    }
  }
}
