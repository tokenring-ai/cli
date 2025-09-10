import Agent from "@tokenring-ai/agent/Agent";

export const description = "/help - Show this help message" as const;

export async function execute(_remainder: string | undefined, agent: Agent): Promise<void> {
  agent.infoLine("Available chat commands:");

  const commands = agent.team.chatCommands.getAllItems();

  for (const [cmdName, commandInstance] of Object.entries(commands)) {
    if (cmdName === "help") continue;
    if (commandInstance.help) {
      const lines = commandInstance.help();
      for (const line of lines) {
        agent.infoLine(line);
      }
    } else {
      agent.infoLine(`/${cmdName}`);
    }
  }

  agent.infoLine();
  agent.infoLine("Type /<command> to run. Use /quit or /exit to return to agent selection.");

  // Multi-line note
  agent.infoLine(
    "Multi-line entry: Type :paste to enter multi-line mode, type :end on a new line to finish.",
  );
}

// noinspection JSUnusedGlobalSymbols
export function help(): string[] {
  return ["/help - Show this help message"];
}
