import { afterEach, expect, it, vi } from "vitest";

const channels = vi.hoisted(() => ({ opened: vi.fn() }));
vi.mock("./bridge-channel.js", () => ({
  PiBridgeChannel: class {
    constructor() {
      channels.opened();
    }
    close() {}
  },
}));

import { PiRpcChild, PI_BRIDGE_ARGS_ENV, PI_BRIDGE_COMMAND_ENV } from "./rpc-child.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it.each(["not-json", "[1]", "{}"])(
  "rejects invalid launch arguments %s before allocating a channel",
  (args) => {
    vi.stubEnv(PI_BRIDGE_COMMAND_ENV, process.execPath);
    vi.stubEnv(PI_BRIDGE_ARGS_ENV, args);
    expect(
      () =>
        new PiRpcChild({
          cwd: process.cwd(),
          env: process.env,
          args: [],
          recordThreadId: null,
          onEvent: () => undefined,
          onChannelMessage: () => undefined,
          onExit: () => undefined,
        }),
    ).toThrow();
    expect(channels.opened).not.toHaveBeenCalled();
  },
);
