import {AgentCommandService} from "@tokenring-ai/agent";
import {TokenRingPlugin} from "@tokenring-ai/app";
import {z} from "zod";
import AgentCLI, {CLIConfigSchema} from "./AgentCLI.ts";

import chatCommands from "./chatCommands.ts";
import packageJSON from './package.json' with {type: 'json'};

const packageConfigSchema = z.object({
  cli: CLIConfigSchema.optional()
});

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    if (config.cli) {
      app.waitForService(AgentCommandService, agentCommandService =>
        agentCommandService.addAgentCommands(chatCommands)
      );
      // const config = app.getConfigSlice('cli', CLIConfigSchema);
      app.addServices(new AgentCLI(app, config.cli));
    }
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
