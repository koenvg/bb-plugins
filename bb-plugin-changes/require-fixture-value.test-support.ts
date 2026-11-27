export function requireFixtureValue<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Expected a fixture value, but it was missing");
  }
  return value;
}
