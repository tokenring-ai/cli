/**
 * @typedef {import('@token-ring/registry').Registry} Registry
 * @typedef {import('@token-ring/chat/ChatService').default} ChatService
 */
/**
 * REPL (Read-Eval-Print Loop) service for interactive command-line interface
 * @extends {Service}
 */
export default class REPLService extends Service {
    /**
     * Output formatter for REPL display
     * @type {REPLOutputFormatter}
     */
    out: REPLOutputFormatter;
    /**
     * Flag indicating if a prompt is currently active
     * @type {boolean}
     */
    isPromptActive: boolean;
    /**
     * Flag to control REPL exit
     * @type {boolean}
     */
    shouldExit: boolean;
    /**
     * Accumulated input buffer
     * @type {string}
     */
    inputSoFar: string;
    /**
     * Abort controller for current operation
     * @type {AbortController|null}
     */
    abortController: AbortController | null;
    /**
     * Queue for pending prompts
     * @type {Array<string>}
     */
    promptQueue: Array<string>;
    /**
     * Abort controller for main input
     * @type {AbortController}
     */
    mainInputAbortController: AbortController;
    /**
     * Available commands for autocompletion
     * @type {Array<string>}
     */
    availableCommands: Array<string>;
    /**
     * Flag for handling SIGINT double-press
     * @type {boolean}
     * @private
     */
    private sigintPending;
    /**
     * Unsubscribe function for chat service
     * @type {Function|null}
     * @private
     */
    private unsubscribe;
    /**
     * Stops the REPL service
     * @param {Registry} registry - The service registry
     * @returns {Promise<void>}
     */
    stop(_registry: any): Promise<void>;
    /**
     * Main REPL loop
     * @param {ChatService} chatService - The chat service instance
     * @param {Registry} registry - The service registry
     * @returns {Promise<void>}
     * @private
     */
    private mainLoop;
    /**
     * Handles user input processing
     * @param {string} line - The user input line
     * @param {ChatService} chatService - The chat service instance
     * @param {Registry} registry - The service registry
     * @returns {Promise<void>}
     * @private
     */
    private handleInput;
    /**
     * Handles global SIGINT (Ctrl+C) signals
     * @param {ChatService} chatService - The chat service instance
     * @returns {void}
     * @private
     */
    private handleGlobalSIGINT;
    /**
     * Injects a prompt into the processing queue
     * @param {string} prompt - The prompt to inject
     * @returns {Promise<void>}
     */
    injectPrompt(prompt: string): Promise<void>;
    /**
     * Updates the list of available commands for autocompletion
     * @param {Array<string>} newCommands - Array of command strings
     * @returns {void}
     */
    updateCommands(newCommands: Array<string>): void;
    /**
     * Adds a single command to the available commands list
     * @param {string} command - The command to add
     * @returns {void}
     */
    addCommand(command: string): void;
}
export type Registry = import("@token-ring/registry").Registry;
export type ChatService = import("@token-ring/chat/ChatService").default;
import { Service } from "@token-ring/registry";
import REPLOutputFormatter from "./utility/REPLOutputFormatter.js";
