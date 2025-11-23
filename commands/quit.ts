import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";

const description = "/quit - Quit the current agent" as const;

import {execute} from "./exit.ts";

export function help(): string[] {
  return ["/quit - Quit the current agent and return to agent selection"];
}
export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand