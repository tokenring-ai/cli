/**
 * Executes the multi command to open an editor for multiline input
 * @param {string} args - Any arguments provided (unused)
 * @param {import('@token-ring/registry').Registry} registry - The service registry
 * @returns {Promise<void>}
 */
export function execute(_args: any, registry: import("@token-ring/registry").Registry): Promise<void>;
/**
 * Command description for help display
 * @type {string}
 */
export const description: string;
