const API_ORIGIN = "https://api.github.com";
const GRAPHQL_ENDPOINT = "graphql";
const TOKEN_ARGS = ["auth", "token", "--hostname", "github.com"];
const LOGGED_OUT_STDERR = "gh: not logged in to github.com, run gh auth login\n";
const TRUNCATED_JSON_STDERR = "unexpected end of JSON input\n";
const JSON_CONTENT_TYPE = /[/+]json($|;)/;
const INTEGER = /^[+-]?\d+$/;
const PLACEHOLDER = /\{(owner|repo|branch)\}/;

type FieldValue = string | number | boolean | null | FieldValue[];

interface ApiRequest {
  method: "GET" | "POST";
  endpoint: string;
  body: string | undefined;
}

interface GhApiDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  runGh: (args: string[], signal?: AbortSignal, stdin?: string) => Promise<string>;
}

type GhApi = (args: string[], signal: AbortSignal, stdin?: string) => Promise<string>;

class GhApiError extends Error {
  readonly code = 1;

  constructor(
    readonly stderr: string,
    readonly stdout: string,
    readonly resetAt: number | null = null,
  ) {
    super(stderr.trim());
  }
}

export function rateLimitResetOf(error: unknown): number | null {
  return error instanceof GhApiError ? error.resetAt : null;
}

export function createGhApi({ fetch, runGh }: GhApiDeps): GhApi {
  let token: Promise<string> | null = null;
  const readToken = (): Promise<string> =>
    (token ??= readGhToken(runGh).catch((error: unknown) => {
      token = null;
      throw error;
    }));

  return async (args, signal, stdin) => {
    const request = toApiRequest(args, stdin);
    if (request === null) {
      return runGh(args, signal, stdin);
    }
    const used = readToken();
    let response = await send(fetch, request, await used, signal);
    if (response.status === 401) {
      if (token === used) {
        token = null;
      }
      response = await send(fetch, request, await readToken(), signal);
    }
    return ghStdout(response, request.endpoint === GRAPHQL_ENDPOINT);
  };
}

function toApiRequest(args: readonly string[], stdin: string | undefined): ApiRequest | null {
  if (args[0] !== "api") {
    return null;
  }
  let endpoint: string | undefined;
  let readsStdin = false;
  const fields: Record<string, FieldValue> = {};
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "-f" || arg === "-F") {
      index += 1;
      if (!addField(fields, args[index], arg === "-F")) {
        return null;
      }
    } else if (arg === "--input" && args[index + 1] === "-") {
      index += 1;
      readsStdin = true;
    } else if (arg.startsWith("-") || endpoint !== undefined) {
      return null;
    } else {
      endpoint = arg.replace(/^\//, "");
    }
  }
  const hasFields = Object.keys(fields).length > 0;
  if (endpoint === undefined || endpoint.includes("://") || endpoint.includes("{")) {
    return null;
  }
  if (readsStdin) {
    return hasFields ? null : { method: "POST", endpoint, body: stdin ?? "" };
  }
  if (!hasFields) {
    return { method: "GET", endpoint, body: undefined };
  }
  if (endpoint !== GRAPHQL_ENDPOINT) {
    return null;
  }
  return { method: "POST", endpoint, body: JSON.stringify(graphqlBody(fields)) };
}

function addField(
  fields: Record<string, FieldValue>,
  field: string | undefined,
  typed: boolean,
): boolean {
  const separator = field?.indexOf("=") ?? -1;
  if (field === undefined || separator === -1) {
    return false;
  }
  const key = field.slice(0, separator);
  const value = typed ? typedValue(field.slice(separator + 1)) : field.slice(separator + 1);
  if (value === undefined) {
    return false;
  }
  if (!key.includes("[")) {
    fields[key] = value;
    return true;
  }
  const name = key.slice(0, -2);
  const existing = fields[name] ?? [];
  if (!key.endsWith("[]") || name.includes("[") || !Array.isArray(existing)) {
    return false;
  }
  fields[name] = [...existing, value];
  return true;
}

function typedValue(raw: string): FieldValue | undefined {
  if (raw.startsWith("@") || PLACEHOLDER.test(raw)) {
    return undefined;
  }
  if (INTEGER.test(raw)) {
    const number = Number(raw);
    return Number.isSafeInteger(number) ? number : undefined;
  }
  switch (raw) {
    case "true":
      return true;
    case "false":
      return false;
    case "null":
      return null;
    default:
      return raw;
  }
}

function graphqlBody(fields: Record<string, FieldValue>): Record<string, unknown> {
  const { query, operationName, ...variables } = fields;
  return {
    ...(query === undefined ? {} : { query }),
    ...(operationName === undefined ? {} : { operationName }),
    ...(Object.keys(variables).length === 0 ? {} : { variables }),
  };
}

async function readGhToken(runGh: GhApiDeps["runGh"]): Promise<string> {
  let stdout: string;
  try {
    stdout = await runGh(TOKEN_ARGS);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      throw error;
    }
    throw new GhApiError(LOGGED_OUT_STDERR, "");
  }
  const token = stdout.trim();
  if (token === "") {
    throw new GhApiError(LOGGED_OUT_STDERR, "");
  }
  return token;
}

function send(
  fetch: GhApiDeps["fetch"],
  { method, endpoint, body }: ApiRequest,
  token: string,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(`${API_ORIGIN}/${endpoint}`, {
    method,
    body,
    signal,
    headers: {
      Accept: "*/*",
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      "Time-Zone": Intl.DateTimeFormat().resolvedOptions().timeZone,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

async function ghStdout(response: Response, isGraphql: boolean): Promise<string> {
  const body = await response.text();
  let serverError = "";
  const checksBody = isGraphql || response.status > 299;
  if (checksBody && JSON_CONTENT_TYPE.test(response.headers.get("content-type") ?? "")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new GhApiError(TRUNCATED_JSON_STDERR, "");
    }
    serverError = serverErrorOf(parsed, response.status);
  }
  if (serverError === "" && response.status > 299) {
    serverError = `HTTP ${response.status}`;
  }
  if (serverError === "") {
    return body;
  }
  throw new GhApiError(`gh: ${serverError}\n`, body, headerResetAt(response.headers));
}

function serverErrorOf(body: unknown, status: number): string {
  if (typeof body !== "object" || body === null) {
    return "";
  }
  if ("message" in body && typeof body.message === "string" && body.message !== "") {
    return `${body.message} (HTTP ${status})`;
  }
  const errors = "errors" in body && Array.isArray(body.errors) ? (body.errors as unknown[]) : [];
  return errors.map(errorMessage).join("\n");
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : "";
}

function headerResetAt(headers: Headers): number | null {
  const reset = Number(headers.get("x-ratelimit-reset"));
  return headers.get("x-ratelimit-remaining") === "0" && reset > 0 ? reset * 1000 : null;
}
