import REPLService from "../REPLService.js";

/**
 * Command description for help display
 * @type {string}
 */
export const description = "/exit - Exit the application.";

/**
 * Executes the exit command to exit the application
 * @param {string} args - Any arguments provided (unused)
 * @param {import('@token-ring/registry').Registry} registry - The service registry
 * @returns {void}
 */
export function execute(args, registry) {
	const replService = registry.getFirstServiceByType(REPLService);
	if (replService) {
		replService.shouldExit = true;
	} else {
		// Fallback or error if REPLService not found, though it should be
		console.error("REPLService not found. Exiting directly.");
		process.exit(0);
	}
}

/**
 * Returns help information for the exit command
 * @returns {Array<string>} Help text for the command
 */
export function help() {
	return ["/exit - Exit the application"];
}
