import { describe, expect, it } from "vitest";
import { createReadCache } from "./read-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function cache() {
  const clock = { now: 0 };
  return { clock, reads: createReadCache<string>({ now: () => clock.now, sameData: Object.is }) };
}

describe("read cache", () => {
  it("keeps the newer read when an older read ends after it", async () => {
    const { reads } = cache();
    const older = deferred<string>();
    const olderRead = reads.fetch("pr", () => older.promise);
    await reads.fetch("pr", async () => "newer");

    older.resolve("older");

    expect(await olderRead).toEqual({ value: "newer", changed: false });
    expect(reads.peek("pr")).toBe("newer");
  });

  it("is fresh for a minute after a read", async () => {
    const { reads, clock } = cache();
    await reads.fetch("pr", async () => "a");

    clock.now = 59_999;
    const freshBefore = reads.isFresh("pr");
    clock.now = 60_000;

    expect([freshBefore, reads.isFresh("pr")]).toEqual([true, false]);
  });

  it("shares a running read and starts a new one after it ends", async () => {
    const { reads } = cache();
    let count = 0;
    const read = async () => `read ${(count += 1)}`;

    await Promise.all([reads.shared("pr", read), reads.shared("pr", read)]);
    await reads.shared("pr", read);

    expect(count).toBe(2);
  });

  it("forgets the least recently read PR after 30 PRs", async () => {
    const { reads } = cache();
    for (let index = 0; index <= 30; index += 1) {
      await reads.fetch(`pr-${index}`, async () => "data");
    }

    expect([reads.peek("pr-0"), reads.peek("pr-1")]).toEqual([null, "data"]);
  });
});
