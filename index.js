/**
 * TokenRing CLI Package - Main exports
 * @module @token-ring/cli
 */

/**
 * Chat commands available in the REPL interface
 * @namespace chatCommands
 */
export * as chatCommands from "./chatCommands.js";

/**
 * REPL Service for interactive command-line interface
 * @type {typeof import('./REPLService.js').default}
 */
export { default as REPLService } from "./REPLService.js";
/**
 * REPL Human Interface Service for terminal-based user interactions
 * @type {typeof import('./ReplHumanInterfaceService.js').default}
 */
export { default as ReplHumanInterfaceService } from "./ReplHumanInterfaceService.js";

/**
 * Package name
 * @type {string}
 */
export const name = "@token-ring/cli";

/**
 * Package description
 * @type {string}
 */
export const description = "TokenRing Coder Application";

/**
 * Package version
 * @type {string}
 */
export const version = "0.1.0";
