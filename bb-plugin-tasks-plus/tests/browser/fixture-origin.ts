import { browserFixtureOrigin } from "../../../scripts/browser-fixture-runner.mjs";

export const origin = browserFixtureOrigin();
export const remoteOrigin = origin.replace("127.0.0.1", "localhost");
