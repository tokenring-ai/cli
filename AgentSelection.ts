export type AgentSelectionResult =
  | {type: "spawn"; agentType: string}
  | {type: "connect"; agentId: string}
  | {type: "open"; url: string}
  | {type: "workflow"; workflowKey: string};

export function parseAgentSelectionValue(value: string): AgentSelectionResult | null {
  const match = value.match(/^(.*?):(.*)$/);
  if (!match) return null;

  const [, action, remainder] = match;
  switch (action) {
    case "spawn":
      return {type: "spawn", agentType: remainder};
    case "connect":
      return {type: "connect", agentId: remainder};
    case "open":
      return {type: "open", url: remainder};
    case "workflow":
      return {type: "workflow", workflowKey: remainder};
    default:
      return null;
  }
}
