/**
 * Output formatter for REPL interface with color coding and spinner support
 */
export default class REPLOutputFormatter {
    /**
     * Tracks if the last write operation ended with a newline
     * @type {boolean}
     */
    lastWriteHadNewline: boolean;
    /**
     * Current output type for styling
     * @type {string|null}
     */
    currentOutputType: string | null;
    /**
     * Spinner instance for loading states
     * @type {import('ora').Ora|null}
     */
    spinner: import("ora").Ora | null;
    /**
     * Sets the output type for styling
     * @param {string} type - The output type (e.g., 'chat', 'reasoning')
     * @returns {void}
     */
    outputType(type: string): void;
    /**
     * Starts a loading spinner with a message
     * @param {string} msg - The message to display with the spinner
     * @returns {void}
     */
    waiting(msg: string): void;
    /**
     * Stops the loading spinner
     * @returns {void}
     */
    doneWaiting(): void;
    /**
     * Outputs a system message in blue
     * @param {...(string|Object)} msgs - Messages to output
     * @returns {void}
     */
    systemLine(...msgs: (string | any)[]): void;
    /**
     * Outputs an error message in red
     * @param {...(string|Object)} msgs - Error messages to output
     * @returns {void}
     */
    errorLine(...msgs: (string | any)[]): void;
    /**
     * Outputs a warning message in yellow
     * @param {...(string|Object)} msgs - Warning messages to output
     * @returns {void}
     */
    warningLine(...msgs: (string | any)[]): void;
    /**
     * Outputs an info message in green
     * @param {...(string|Object)} msgs - Info messages to output
     * @returns {void}
     */
    infoLine(...msgs: (string | any)[]): void;
    /**
     * Prints a horizontal line separator
     * @returns {void}
     */
    printHorizontalLine(): void;
    /**
     * Writes raw output to stdout with appropriate styling
     * @param {string} msg - The message to write
     * @returns {void}
     */
    stdout(msg: string): void;
    /**
     * Notifies that a job has been queued
     * @param {Object} jobInfo - Job information
     * @param {string} jobInfo.name - Job name
     * @param {number} jobInfo.queueLength - Current queue length
     * @returns {void}
     */
    jobQueued(jobInfo: {
        name: string;
        queueLength: number;
    }): void;
    /**
     * Notifies that a job has started
     * @param {Object} jobInfo - Job information
     * @param {string} jobInfo.name - Job name
     * @returns {void}
     */
    jobStarted(jobInfo: {
        name: string;
    }): void;
    /**
     * Notifies that a job has completed successfully
     * @param {Object} jobInfo - Job information
     * @param {string} jobInfo.name - Job name
     * @returns {void}
     */
    jobCompleted(jobInfo: {
        name: string;
    }): void;
    /**
     * Notifies that a job has failed
     * @param {Object} jobInfo - Job information
     * @param {string} jobInfo.name - Job name
     * @param {Error} jobInfo.error - The error that occurred
     * @returns {void}
     */
    jobFailed(jobInfo: {
        name: string;
        error: Error;
    }): void;
}
