import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it.each([false, true])(
  "rejects an owned FIFO within a hard deadline, replacement race=%s",
  async (race) => {
    const root = await mkdtemp(join(tmpdir(), "bbp22-fifo-"));
    const path = join(root, "pipe.jsonl");
    try {
      if (race) await writeFile(path, "owned regular source\n");
      else execFileSync("mkfifo", [path]);
      // A separate process makes a regression's blocking open bounded even when cancellation cannot reach it.
      const program = `
      import promises from 'node:fs/promises';
      import {unlinkSync} from 'node:fs';
      import {syncBuiltinESMExports} from 'node:module';
      import {execFileSync} from 'node:child_process';
      let opens=0;
      const original=promises.open;
      promises.open=async(path,flags)=>{
        opens++;
        if(${race}) {unlinkSync(path);execFileSync('mkfifo',[path]);}
        return original(path,flags);
      };
      syncBuiltinESMExports();
      const {proveRoot,confinedFile}=await import(${JSON.stringify(new URL("./import-source.ts", import.meta.url).href)});
      try { const source=await confinedFile(await proveRoot(process.argv[1]),'pipe.jsonl'); await source.file.close();console.log(JSON.stringify({rejected:false,opens})); }
      catch {console.log(JSON.stringify({rejected:true,opens}));}
    `;
      const result = spawnSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "--input-type=module",
          "-e",
          program,
          root,
        ],
        { encoding: "utf8", timeout: 3000, killSignal: "SIGKILL" },
      );
      expect(result.error?.message).toBeUndefined();
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        rejected: true,
        opens: race ? 1 : 0,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  10000,
);
