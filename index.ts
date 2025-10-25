import {AgentCommandService, AgentTeam, TokenRingPackage} from "@tokenring-ai/agent";

import * as chatCommands from "./chatCommands.ts";
import packageJSON from './package.json' with {type: 'json'};

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(agentTeam: AgentTeam) {
    agentTeam.waitForService(AgentCommandService, agentCommandService =>
      agentCommandService.addAgentCommands(chatCommands)
    );
  }
} as TokenRingPackage;

export {default as REPLService} from "./agentCLI.ts";