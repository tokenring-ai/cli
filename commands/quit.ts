import Agent from "@tokenring-ai/agent/Agent";

export const description = "/quit - Quit the current agent" as const;

export { execute } from "./exit.ts";

export function help(): string[] {
  return ["/quit - Quit the current agent and return to agent selection"];
}