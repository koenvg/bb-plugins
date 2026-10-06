import { z } from "zod";

export const settingsDefinition = {
  publicOrigin: {
    type: "string",
    label: "Public HTTPS origin",
    default: "",
    description: "Existing tunnel hostname, without a path. Reload after a change.",
  },
  port: {
    type: "number",
    label: "Loopback port",
    default: 38991,
    description: "Reload after a change. Never use BB's main port.",
  },
  issuer: {
    type: "string",
    label: "OAuth issuer",
    default: "",
    description: "HTTPS OpenID Connect issuer with RS256 access tokens.",
  },
  owner: {
    type: "string",
    label: "Owner subject",
    default: "",
    description: "Exact OAuth sub claim. Removing it denies access immediately.",
  },
  projects: {
    type: "string",
    label: "Allowed project IDs",
    default: "",
    experimental_multiline: true,
    description:
      "One ID per line. Empty means no projects. Allowed content can be sent to ChatGPT.",
  },
  remoteEnabled: {
    type: "boolean",
    label: "Enable remote reads",
    default: false,
    description: "Disable closes the listener. Reload to enable it again.",
  },
  controlEnabled: {
    type: "boolean",
    label: "Enable remote control",
    default: false,
    description: "Reserved. This version exposes no control tools, even when enabled.",
  },
} as const;

export const configSchema = z
  .strictObject({
    publicOrigin: z.string().max(2048),
    port: z
      .number()
      .int()
      .min(1024)
      .max(65535)
      .refine((p) => p !== 38886),
    issuer: z.string().max(2048),
    owner: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => value.trim() === value),
    projects: z.string().max(32768),
    remoteEnabled: z.boolean(),
    controlEnabled: z.boolean(),
  })
  .superRefine((value, ctx) => {
    for (const field of ["publicOrigin", "issuer"] as const) {
      try {
        const url = new URL(value[field]);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !url.hostname.includes(".") ||
          url.hostname === "localhost" ||
          (field === "publicOrigin" && value[field] !== url.origin) ||
          (field === "issuer" && value[field] !== url.href.replace(/\/$/, ""))
        )
          throw new Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Use a canonical public HTTPS URL.",
        });
      }
    }
    const ids = value.projects.split(/\s+/).filter(Boolean);
    if (ids.length > 1000 || ids.some((id) => !/^proj_[A-Za-z0-9_-]{1,120}$/.test(id))) {
      ctx.addIssue({
        code: "custom",
        path: ["projects"],
        message: "Use at most 1000 project IDs.",
      });
    }
  });

export type Config = z.infer<typeof configSchema>;
export type Connection = Pick<Config, "publicOrigin" | "port">;
export function allowedProjects(config: Config): Set<string> {
  return new Set(config.projects.split(/\s+/).filter(Boolean));
}
export function readConfig(raw: unknown): Config | null {
  const parsed = configSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
