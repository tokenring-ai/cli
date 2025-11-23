import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";

const description = "/exit - Exit the current agent" as const;

export async function execute(_remainder: string | undefined, agent: Agent): Promise<void> {
  agent.infoLine("Exiting agent...");
  agent.requestExit();
}

export function help(): string[] {
  return ["/exit - Exit the current agent and return to agent selection"];
}
export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand