import chalk from "chalk";
import formatLogMessages from "@token-ring/utility/formatLogMessage";
import ora from "ora";

/**
 * Output formatter for REPL interface with color coding and spinner support
 */
export default class REPLOutputFormatter {
	/**
	 * Tracks if the last write operation ended with a newline
	 * @type {boolean}
	 */
	lastWriteHadNewline = true;

	/**
	 * Current output type for styling
	 * @type {string|null}
	 */
	currentOutputType = null;

	/**
	 * Spinner instance for loading states
	 * @type {import('ora').Ora|null}
	 */
	spinner = null;

	/**
	 * Sets the output type for styling
	 * @param {string} type - The output type (e.g., 'chat', 'reasoning')
	 * @returns {void}
	 */
	outputType(type) {
		this.currentOutputType = type;
	}

	/**
	 * Starts a loading spinner with a message
	 * @param {string} msg - The message to display with the spinner
	 * @returns {void}
	 */
	waiting(msg) {
		this.spinner = ora(msg);
		this.spinner.start();
		this.lastWriteHadNewline = true;
	}

	/**
	 * Stops the loading spinner
	 * @returns {void}
	 */
	doneWaiting() {
		if (this.spinner) {
			this.spinner.stop();
			this.spinner = null;
		}
	}

	/**
	 * Outputs a system message in blue
	 * @param {...(string|Object)} msgs - Messages to output
	 * @returns {void}
	 */
	systemLine(...msgs) {
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

	/**
	 * Outputs an error message in red
	 * @param {...(string|Object)} msgs - Error messages to output
	 * @returns {void}
	 */
	errorLine(...msgs) {
		if (this.spinner) {
			this.spinner.stop();
		}
		if (!this.lastWriteHadNewline) {
			console.log();
		}
		console.error(chalk.red(formatLogMessages(msgs)));
		this.lastWriteHadNewline = true;
		if (this.spinner) {
			this.spinner.start();
		}
	}

	/**
	 * Outputs a warning message in yellow
	 * @param {...(string|Object)} msgs - Warning messages to output
	 * @returns {void}
	 */
	warningLine(...msgs) {
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

	/**
	 * Outputs an info message in green
	 * @param {...(string|Object)} msgs - Info messages to output
	 * @returns {void}
	 */
	infoLine(...msgs) {
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

	/**
	 * Prints a horizontal line separator
	 * @returns {void}
	 */
	printHorizontalLine() {
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
	 * @param {string} msg - The message to write
	 * @returns {void}
	 */
	stdout(msg) {
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

	/**
	 * Notifies that a job has been queued
	 * @param {Object} jobInfo - Job information
	 * @param {string} jobInfo.name - Job name
	 * @param {number} jobInfo.queueLength - Current queue length
	 * @returns {void}
	 */
	jobQueued(jobInfo) {
		this.systemLine(
			`Job [${jobInfo.name}] queued. Queue length: ${jobInfo.queueLength}`,
		);
	}

	/**
	 * Notifies that a job has started
	 * @param {Object} jobInfo - Job information
	 * @param {string} jobInfo.name - Job name
	 * @returns {void}
	 */
	jobStarted(jobInfo) {
		this.systemLine(`Job [${jobInfo.name}] started`);
	}

	/**
	 * Notifies that a job has completed successfully
	 * @param {Object} jobInfo - Job information
	 * @param {string} jobInfo.name - Job name
	 * @returns {void}
	 */
	jobCompleted(jobInfo) {
		this.systemLine(`Job [${jobInfo.name}] completed successfully`);
	}

	/**
	 * Notifies that a job has failed
	 * @param {Object} jobInfo - Job information
	 * @param {string} jobInfo.name - Job name
	 * @param {Error} jobInfo.error - The error that occurred
	 * @returns {void}
	 */
	jobFailed(jobInfo) {
		this.errorLine(`Job [${jobInfo.name}] failed:`, jobInfo.error);
	}
}
