import {AgentCommandService} from "@tokenring-ai/agent";
import TokenRingApp from "@tokenring-ai/app";
import {TokenRingPlugin} from "@tokenring-ai/app";
import AgentCLIService, {CLIConfigSchema} from "./AgentCLIService.ts";

import * as chatCommands from "./chatCommands.ts";
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
    app.addServices(new AgentCLIService(app, config));
  },
} as TokenRingPlugin;

export {default as REPLService} from "./AgentCLIService.ts";