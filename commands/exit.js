import REPLService from "../REPLService.js"; // Added import

export const description = "/exit - Exit the application.";

export function execute(args, registry) {
	// Added registry
	const replService = registry.getFirstServiceByType(REPLService);
	if (replService) {
		replService.shouldExit = true;
	} else {
		// Fallback or error if REPLService not found, though it should be
		console.error("REPLService not found. Exiting directly.");
		process.exit(0);
	}
}

export function help() {
	return ["/exit - Exit the application"];
}
