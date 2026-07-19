import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import { z } from "zod";

export const CLIConfigSchema = z
  .object({
    chatBanner: z.string().meta({ hidden: true } satisfies ConfigFieldMeta), // runtime-injected branding
    loadingBannerNarrow: z.string().meta({ hidden: true } satisfies ConfigFieldMeta), // runtime-injected branding
    loadingBannerWide: z.string().meta({ hidden: true } satisfies ConfigFieldMeta), // runtime-injected branding
    loadingBannerCompact: z.string().meta({ hidden: true } satisfies ConfigFieldMeta), // runtime-injected branding
    screenBanner: z.string().meta({ hidden: true } satisfies ConfigFieldMeta), // runtime-injected branding
    uiFramework: z
      .enum(["ink", "opentui"])
      .default("opentui")
      .meta({ restartRequired: true, description: "Terminal UI rendering framework" } satisfies ConfigFieldMeta),
    verbose: z
      .boolean()
      .default(false)
      .meta({ description: "Print verbose diagnostic output" } satisfies ConfigFieldMeta),
    startAgent: z
      .object({
        type: z.string(),
        prompt: z.string().exactOptional(),
        shutdownWhenDone: z.boolean().default(true),
      })
      .exactOptional()
      .meta({ hidden: true } satisfies ConfigFieldMeta), // injected from --startAgent launch args
  })
  .meta({ label: "CLI", description: "Interactive terminal UI settings" } satisfies ConfigFieldMeta);
