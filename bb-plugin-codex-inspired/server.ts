import type { BbPluginApi } from "@get-bb/plugin-sdk";

// BB requires a backend entry. The manifest contributes the theme; activation
// must not select a palette, inject global styles, or change any user settings.
export default async function plugin(_bb: BbPluginApi): Promise<void> {}
