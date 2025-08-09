/**
 * Executes the edit command to open an editor for prompt creation
 * @param {string} remainder - Initial text to populate the editor with
 * @param {import('@token-ring/registry').Registry} registry - The service registry
 * @returns {Promise<void>}
 */
export function execute(remainder: string, registry: import("@token-ring/registry").Registry): Promise<void>;
/**
 * Returns help information for the edit command
 * @param {Object} chatService - The chat service instance (unused)
 * @returns {Array<string>} Help text for the command
 */
export function help(_chatService: any): Array<string>;
/**
 * Command description for help display
 * @type {string}
 */
export const description: string;
