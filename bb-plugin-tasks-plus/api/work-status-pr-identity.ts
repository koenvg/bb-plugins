/** GitHub URL is the identity, not the PR number or an attachment. */
export function canonicalPrIdentity(
  urlValue: unknown,
  number: unknown,
): string | null {
  if (typeof urlValue !== "string" || !Number.isSafeInteger(number))
    return null;
  try {
    const url = new URL(urlValue);
    const match = /^\/([a-z\d_.-]+)\/([a-z\d_.-]+)\/pull\/([1-9]\d*)\/?$/i.exec(
      url.pathname,
    );
    if (
      url.protocol !== "https:" ||
      !["github.com", "www.github.com"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      !match ||
      number !== Number(match[3])
    )
      return null;
    return `https://github.com/${match[1]!.toLowerCase()}/${match[2]!.toLowerCase()}/pull/${number}`;
  } catch {
    return null;
  }
}
