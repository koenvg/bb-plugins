import { readFile } from "node:fs/promises";
import { writeFixture, cleanupFixture } from "./fixture.mjs";
import { summarize } from "./report.mjs";

const [command, path, owner] = process.argv.slice(2);
try {
  if (command === "fixture" && path && owner) {
    await writeFixture(path, owner);
    console.log(`Wrote local fixture ${path}. No tracker writes.`);
  } else if (command === "cleanup" && path && owner) {
    await cleanupFixture(path, owner);
    console.log(`Removed verified owned fixture ${path}. No tracker writes.`);
  } else if (command === "report" && path && !owner) {
    const run = JSON.parse(await readFile(path, "utf8"));
    if (run.error) throw new Error(`Run failed: ${run.error}. Keep the raw evidence.`);
    console.log(JSON.stringify(summarize(run), null, 2));
  } else
    throw new Error(
      "Usage: node cli.mjs fixture|cleanup DIRECTORY bbp60-OWNER; node cli.mjs report RUN.json",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
