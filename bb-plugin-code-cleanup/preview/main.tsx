import { FixtureMarkdown } from "./markdown";
import { FixtureIcon } from "./icons";
import { createRoot } from "react-dom/client";
import type { PluginAppDefinition, PluginSettingsSectionRegistration } from "@get-bb/plugin-sdk";
const rpc = { async call(method: string, input: unknown) {
  const scenario = new URLSearchParams(location.search).get("scenario") ?? "normal";
  const response = await fetch(`/fixture-rpc/${method}?scenario=${encodeURIComponent(scenario)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body.result;
} };
// Implement only the public app hooks used by the actual app entry.
Object.assign(globalThis, { __bbPluginRuntime: { pluginSdkApp: {
  definePluginApp: (setup: PluginAppDefinition["setup"]): PluginAppDefinition => ({ __bbPluginApp: true, setup }),
  useRpc: () => rpc,
  Markdown: FixtureMarkdown,
  experimental_Icon: FixtureIcon,
} } });
const { default: app } = await import("../app");
let section: PluginSettingsSectionRegistration | undefined;
const collector = { slots: { settingsSection: (registration: PluginSettingsSectionRegistration) => { section = registration; } } };
app.setup(collector as Parameters<PluginAppDefinition["setup"]>[0]);
if (!section) throw new Error("The actual app did not register Settings");
const Component = section.component;
createRoot(document.getElementById("app")!).render(<Component />);
