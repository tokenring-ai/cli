/**
 * Executes the copy command to copy the last assistant message to clipboard
 * @param {string} remainder - Any remaining text after the command (unused)
 * @param {import('@token-ring/registry').Registry} registry - The service registry
 * @returns {Promise<void>}
 */
export function execute(_remainder: any, registry: import("@token-ring/registry").Registry): Promise<void>;
/**
 * Returns help information for the copy command
 * @returns {Array<string>} Help text for the command
 */
export function help(): Array<string>;
/**
 * Command description for help display
 * @type {string}
 */
export const description: string;
