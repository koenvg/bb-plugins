export default {
  test: {
    // Real SQLite fixtures share the CI runner's disk. Avoid competing disk commits.
    maxWorkers: process.env.CI ? 1 : undefined,
  },
};
