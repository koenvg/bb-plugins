type TokenCountText = Readonly<{ readable: string; exact: string }>;

const readable = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "long",
  maximumFractionDigits: 2,
});
const exact = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Display text for an already validated nonnegative safe integer token count. */
export function tokenCountText(value: number): TokenCountText {
  return { readable: readable.format(value), exact: exact.format(value) };
}
