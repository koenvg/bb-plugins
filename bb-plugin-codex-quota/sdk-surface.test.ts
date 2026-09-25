import { describe, expect, it } from "vitest";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";

describe("public SDK and quota-only boundary", () => {
  it("imports only public SDK surfaces and declared host/frontend dependencies", () => {
    const scan = experimental_scanPublicSdkOnly(import.meta.dirname, {
      allow: [/^@earendil-works\/pi-(ai|coding-agent)(\/.*)?$/, /^react(\/.*)?$/, /^@testing-library\/react$/, /^vitest$/],
    });
    expect(scan.privateDependencies).toEqual([]);
    expect(scan.violations).toEqual([]);
    expect(scan.files.length).toBeGreaterThan(10);
  });
});
