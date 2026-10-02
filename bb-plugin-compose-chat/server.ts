import type { BbPluginApi } from "@get-bb/plugin-sdk";

// BB requires a backend entry. This plugin owns no server behavior or data.
export default function composeChat(_bb: BbPluginApi): void {}
