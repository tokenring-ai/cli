import REPLService from "../REPLService.ts";
import type {Registry} from "@token-ring/registry";

// Command description for help display
export const description: string = "/quit - Exit the application.";

/**
 * Executes the quit command to exit the application
 * @param _args Any arguments provided (unused)
 * @param registry The service registry
 */
export function execute(_args: string, registry: Registry): void {
	const replService = registry.getFirstServiceByType(REPLService as unknown as new (...args: any[]) => any);
	if (replService) {
		replService.shouldExit = true;
	} else {
		console.error("REPLService not found. Exiting directly.");
		process.exit(0);
	}
}

/**
 * Returns help information for the quit command
 */
export function help(): Array<string> {
	return ["/quit - Exit the application"];
}
