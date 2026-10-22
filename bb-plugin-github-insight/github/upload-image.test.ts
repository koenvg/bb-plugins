import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { uploadImage, type UploadImageDeps } from "./upload-image";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const ASSET = "https://github.com/user-attachments/assets/1bc7aa19-b5b1-40ea-95c8-ab8be878d7ba";

interface Sent {
  url: URL;
  init: RequestInit;
}

function respond(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

function github(answers: (Response | Error)[]) {
  const sent: Sent[] = [];
  const deps: UploadImageDeps = {
    fetch: async (url, init) => {
      sent.push({ url: new URL(String(url)), init: init ?? {} });
      const answer = answers.shift() ?? respond(500, "no answer left");
      if (answer instanceof Error) throw answer;
      return answer;
    },
    gh: async (args) => {
      if (args.join(" ") === "api repos/octo/app --jq .id") return "4242\n";
      if (args.join(" ") === "auth token") return "gho_secret\n";
      throw new Error(`unexpected gh ${args.join(" ")}`);
    },
  };
  return { deps, sent };
}

describe("uploadImage", () => {
  let dir: string;
  const signal = new AbortController().signal;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "upload-image-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function upload(path: string, deps: UploadImageDeps) {
    return uploadImage({ owner: "octo", repo: "app", path, cwd: dir }, signal, deps);
  }

  it("posts the image to the repository's attachments and returns the asset URL", async () => {
    await writeFile(join(dir, "shot.png"), PNG);
    const { deps, sent } = github([respond(201, { url: ASSET })]);

    const result = await upload("shot.png", deps);

    expect(result).toEqual({ ok: true, url: ASSET });
    expect(sent).toHaveLength(1);
    const [{ url, init }] = sent as [Sent];
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://uploads.github.com/user-attachments/assets",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      content_type: "image/png",
      name: "shot.png",
      repository_id: "4242",
    });
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "token gho_secret",
      "Content-Type": "image/png",
    });
    expect(Buffer.from(init.body as Uint8Array)).toEqual(PNG);
  });

  it("names the file after its real type", async () => {
    await writeFile(join(dir, "shot.png"), JPEG);
    const { deps, sent } = github([respond(201, { url: ASSET })]);

    await upload("shot.png", deps);

    expect(sent[0]!.url.searchParams.get("name")).toBe("shot.jpg");
    expect(sent[0]!.url.searchParams.get("content_type")).toBe("image/jpeg");
  });

  it("names GitHub's validation errors", async () => {
    await writeFile(join(dir, "shot.png"), PNG);
    const { deps, sent } = github([
      respond(422, {
        message: "Validation Failed",
        errors: [{ message: "content_type is not included in the list of allowed content types" }],
      }),
    ]);

    const result = await upload("shot.png", deps);

    expect(result).toEqual({
      ok: false,
      message:
        "GitHub refused the upload (HTTP 422): Validation Failed: content_type is not included in the list of allowed content types",
    });
    expect(sent).toHaveLength(1);
  });

  it("does not retry a refused token", async () => {
    await writeFile(join(dir, "shot.png"), PNG);
    const { deps, sent } = github([respond(401, { message: "Bad credentials" })]);

    const result = await upload("shot.png", deps);

    expect(result).toEqual({
      ok: false,
      message: "GitHub refused the upload (HTTP 401): Bad credentials",
    });
    expect(sent).toHaveLength(1);
  });

  it("retries a server error and a network error, then succeeds", async () => {
    await writeFile(join(dir, "shot.png"), PNG);
    const { deps, sent } = github([
      respond(502, "Bad gateway"),
      new TypeError("fetch failed"),
      respond(201, { url: ASSET }),
    ]);

    expect(await upload("shot.png", deps)).toEqual({ ok: true, url: ASSET });
    expect(sent).toHaveLength(3);
  });

  it("gives up after three server errors", async () => {
    await writeFile(join(dir, "shot.png"), PNG);
    const { deps, sent } = github([
      respond(500, ""),
      respond(503, ""),
      respond(503, { message: "Service unavailable" }),
    ]);

    expect(await upload("shot.png", deps)).toEqual({
      ok: false,
      message: "GitHub refused the upload (HTTP 503): Service unavailable",
    });
    expect(sent).toHaveLength(3);
  });

  it("refuses a 201 without an attachment URL", async () => {
    await writeFile(join(dir, "shot.png"), PNG);
    const { deps } = github([respond(201, { url: "https://example.com/x.png" })]);

    expect(await upload("shot.png", deps)).toEqual({
      ok: false,
      message: "GitHub answered the upload without an attachment URL",
    });
  });

  it("refuses a file over 10 MB without posting it", async () => {
    await writeFile(join(dir, "big.png"), PNG);
    await truncate(join(dir, "big.png"), 10 * 1024 * 1024 + 1);
    const { deps, sent } = github([]);

    expect(await upload("big.png", deps)).toEqual({
      ok: false,
      message: "File is larger than 10 MB",
    });
    expect(sent).toEqual([]);
  });

  it("refuses a file that is not a PNG, JPEG, or GIF", async () => {
    await writeFile(join(dir, "notes.png"), "just text");
    const { deps, sent } = github([]);

    expect(await upload("notes.png", deps)).toEqual({
      ok: false,
      message: "Not a PNG, JPEG, or GIF image",
    });
    expect(sent).toEqual([]);
  });

  it("names a missing file", async () => {
    const { deps, sent } = github([]);

    expect(await upload("missing.png", deps)).toEqual({ ok: false, message: "File not found" });
    expect(sent).toEqual([]);
  });

  it("refuses a directory", async () => {
    const { deps } = github([]);

    expect(await upload(".", deps)).toEqual({ ok: false, message: "Not a regular file" });
  });

  it("names a gh failure", async () => {
    await writeFile(join(dir, "shot.png"), PNG);
    const { deps, sent } = github([]);
    deps.gh = async () => {
      throw Object.assign(new Error("exit 4"), { code: 4, stderr: "" });
    };

    expect(await upload("shot.png", deps)).toEqual({ ok: false, message: "gh not logged in" });
    expect(sent).toEqual([]);
  });
});
