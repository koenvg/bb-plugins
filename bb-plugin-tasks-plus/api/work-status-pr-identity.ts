/** GitHub URL is the identity, not the PR number or an attachment. */
export function canonicalPrIdentity(urlValue: unknown, number: unknown): string | null {
  if (typeof urlValue !== "string" || !Number.isSafeInteger(number)) return null;
  try {
    const url = new URL(urlValue);
    const match = /^\/([a-z\d_.-]+)\/([a-z\d_.-]+)\/pull\/([1-9]\d*)\/?$/i.exec(url.pathname);
    const [, owner, repository] = match ?? [];
    if (
      url.protocol !== "https:" ||
      !["github.com", "www.github.com"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      !match ||
      !owner ||
      !repository ||
      number !== Number(match[3])
    )
      return null;
    return `https://github.com/${owner.toLowerCase()}/${repository.toLowerCase()}/pull/${number}`;
  } catch {
    return null;
  }
}
