import Agent from "@tokenring-ai/agent/Agent";

export const description = "/exit - Exit the current agent" as const;

export async function execute(_remainder: string | undefined, agent: Agent): Promise<void> {
  agent.infoLine("Exiting agent...");
  await agent.team.deleteAgent(agent);
}

export function help(): string[] {
  return ["/exit - Exit the current agent and return to agent selection"];
}