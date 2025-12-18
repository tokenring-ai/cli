import {AgentCommandService} from "@tokenring-ai/agent";
import TokenRingApp, {TokenRingPlugin} from "@tokenring-ai/app";
import AgentCLI, {CLIConfigSchema} from "./AgentCLI.ts";

import chatCommands from "./chatCommands.ts";
import packageJSON from './package.json' with {type: 'json'};



export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app: TokenRingApp) {
    app.waitForService(AgentCommandService, agentCommandService =>
      agentCommandService.addAgentCommands(chatCommands)
    );
    const config = app.getConfigSlice('cli', CLIConfigSchema);
    app.addServices(new AgentCLI(app, config));
  },
} as TokenRingPlugin;
