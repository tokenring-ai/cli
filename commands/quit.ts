import type {Registry} from "@token-ring/registry";
import REPLService from "../REPLService.ts";

// Command description for help display
export const description: string = "/quit - Exit the application.";

/**
 * Executes the quit command to exit the application
 */
export function execute(_args: string, registry: Registry): void {
  const replService = registry.requireFirstServiceByType(REPLService);
  replService.shouldExit = true;
}

/**
 * Returns help information for the quit command
 */
// noinspection JSUnusedGlobalSymbols
export function help(): Array<string> {
  return ["/quit - Exit the application"];
}
