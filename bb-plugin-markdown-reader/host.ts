import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { hostContract } from "./host-contract";

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async resolve_root({ rootPath }) {
      if (!isAbsolute(rootPath)) throw new Error("The source root must be absolute.");
      return { rootPath: await realpath(rootPath) };
    },
  },
});
