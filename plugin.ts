import type {TokenRingPlugin} from "@tokenring-ai/app";
import {z} from "zod";
import AgentCLI from "./AgentCLI.ts";

import packageJSON from "./package.json" with {type: "json"};
import {CLIConfigSchema} from "./schema.ts";

const packageConfigSchema = z.object({
  cli: CLIConfigSchema.optional(),
});

export default {
  name: packageJSON.name,
  displayName: "Interactive CLI",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    if (config.cli) {
      app.addServices(new AgentCLI(app, config.cli));
    }
  },
  config: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
