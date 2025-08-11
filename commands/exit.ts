import REPLService from "../REPLService.ts";
import type { Registry } from "@token-ring/registry";

// Command description for help display
export const description: string = "/exit - Exit the application.";

/**
 * Executes the exit command to exit the application
 * @param _args Any arguments provided (unused)
 * @param registry The service registry
 */
export function execute(_args: string, registry: Registry): void {
	// The JS version used registry.services.getFirstServiceByType
	// Preserve that logic to avoid behavior changes
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const replService = (registry as any).services?.getFirstServiceByType?.(
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
