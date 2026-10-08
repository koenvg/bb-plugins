import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const hostContract = defineRpcContract({
  resolve_root: {
    input: z.object({ rootPath: z.string().min(1).max(4096) }).strict(),
    output: z.object({ rootPath: z.string().min(1).max(4096) }).strict(),
  },
});
