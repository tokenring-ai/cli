/**
 * Executes the quit command to exit the application
 * @param {string} args - Any arguments provided (unused)
 * @param {import('@token-ring/registry').Registry} registry - The service registry
 * @returns {void}
 */
export function execute(_args: any, registry: import("@token-ring/registry").Registry): void;
/**
 * Returns help information for the quit command
 * @returns {Array<string>} Help text for the command
 */
export function help(): Array<string>;
/**
 * Command description for help display
 * @type {string}
 */
export const description: string;
