import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ localOnly: void }>({
  localOnly: [
    async ({ context, page, baseURL }, use) => {
      const errors: string[] = [];
      const external: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await context.route("**/*", (route) => {
        if (new URL(route.request().url()).origin === baseURL) return route.continue();
        external.push(route.request().url());
        return route.abort();
      });
      try {
        await use();
      } finally {
        expect(errors, "No browser exceptions").toEqual([]);
        expect(external, "No attempted external traffic").toEqual([]);
      }
    },
    { auto: true },
  ],
});
export { expect };
