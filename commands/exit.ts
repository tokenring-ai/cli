import REPLService from "../REPLService.ts";
import type {Registry} from "@token-ring/registry";

// Command description for help display
export const description: string = "/exit - Exit the application.";

/**
 * Executes the exit command to exit the application
 * @param _args Any arguments provided (unused)
 * @param registry The service registry
 */
export function execute(_args: string, registry: Registry): void {
	const replService = registry.getFirstServiceByType(
		REPLService,
	);
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
 */
export function help(): Array<string> {
	return ["/exit - Exit the application"];
}
