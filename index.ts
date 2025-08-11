// Combined TypeScript entry for @token-ring/cli
// Keep .ts extensions to be compatible with ESM runtime resolution
export * as chatCommands from "./chatCommands.ts";
export { default as REPLService } from "./REPLService.ts";
export { default as ReplHumanInterfaceService } from "./ReplHumanInterfaceService.ts";

export const name: string = "@token-ring/cli";
export const description: string = "TokenRing CLI Package";
export const version: string = "0.1.0";
