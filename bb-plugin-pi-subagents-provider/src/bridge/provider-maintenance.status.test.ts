import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  experimental_npmLatestVersion,
  experimental_probeNpmGlobalPackage,
} from "@get-bb/plugin-sdk-runtime/provider-bridge";
import { fakePiPath } from "./test-support.js";
import { getPiProviderInstallationStatus, PI_NPM_PACKAGE } from "./provider-maintenance.js";

vi.mock("@get-bb/plugin-sdk-runtime/provider-bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@get-bb/plugin-sdk-runtime/provider-bridge")>()),
  experimental_npmLatestVersion: vi.fn(async () => "0.84.0"),
  experimental_probeNpmGlobalPackage: vi.fn(async () => ({
    npmBin: null,
    npmGlobalPackageVersion: null,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BB_PI_BRIDGE_COMMAND", process.execPath);
  vi.stubEnv("BB_PI_BRIDGE_ARGS", JSON.stringify([fakePiPath]));
  vi.stubEnv("FAKE_PI_VERSION", "0.84.0");
});
afterEach(() => vi.unstubAllEnvs());

it("checks the local executable without querying npm or offering an install action", async () => {
  const status = await getPiProviderInstallationStatus(false);
  expect(status).toMatchObject({
    installed: true,
    currentVersion: "0.84.0",
    latestVersion: null,
    installAction: null,
    versionUnsupported: false,
  });
  expect(experimental_npmLatestVersion).not.toHaveBeenCalled();
  expect(experimental_probeNpmGlobalPackage).not.toHaveBeenCalled();
});

it("still reports a known unsupported executable during a local-only check", async () => {
  vi.stubEnv("FAKE_PI_VERSION", "0.83.0");
  expect(await getPiProviderInstallationStatus(false)).toMatchObject({
    currentVersion: "0.83.0",
    minimumSupportedVersion: "0.84.0",
    versionUnsupported: true,
    installAction: null,
  });
  expect(experimental_npmLatestVersion).not.toHaveBeenCalled();
  expect(experimental_probeNpmGlobalPackage).not.toHaveBeenCalled();
});

it("retains full discovery when checkUpdates is omitted", async () => {
  expect(await getPiProviderInstallationStatus()).toMatchObject({
    currentVersion: "0.84.0",
    latestVersion: "0.84.0",
    versionUnsupported: false,
  });
  expect(experimental_npmLatestVersion).toHaveBeenCalledExactlyOnceWith(PI_NPM_PACKAGE);
  expect(experimental_probeNpmGlobalPackage).toHaveBeenCalledExactlyOnceWith(PI_NPM_PACKAGE);
});
