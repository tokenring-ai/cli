import {z} from "zod";

export const CLIConfigSchema = z.object({
  chatBanner: z.string(),
  loadingBanner: z.string(),
  screenBanner: z.string(),
})