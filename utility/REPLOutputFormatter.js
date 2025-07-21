import chalk from "chalk";
import formatLogMessages from "@token-ring/utility/formatLogMessage";
import ora from "ora";

export default class REPLOutputFormatter {
	lastWriteHadNewline = true;
	currentOutputType = null; // Ensure this property is added

	outputType(type) {
		this.currentOutputType = type;
	}

	waiting(msg) {
		this.spinner = ora(msg);

		this.spinner.start();
		this.lastWriteHadNewline = true; // So first AI chunk doesn't get unwanted newline
	}

	doneWaiting() {
		if (this.spinner) {
			this.spinner.stop();
			this.spinner = null;
		}
	}

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
			: 60; // 80% of width or 60 chars
		console.log(chalk.dim(lineChar.repeat(lineWidth))); // Make line dim
		this.lastWriteHadNewline = true;
	}

	// Ensure aiLine method is removed if it exists from a previous modification.

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

	// Unchanged methods:
	jobQueued(jobInfo) {
		this.systemLine(
			`Job [${jobInfo.name}] queued. Queue length: ${jobInfo.queueLength}`,
		);
	}

	jobStarted(jobInfo) {
		this.systemLine(`Job [${jobInfo.name}] started`);
	}

	jobCompleted(jobInfo) {
		this.systemLine(`Job [${jobInfo.name}] completed successfully`);
	}

	jobFailed(jobInfo) {
		this.errorLine(`Job [${jobInfo.name}] failed:`, jobInfo.error);
	}
}
