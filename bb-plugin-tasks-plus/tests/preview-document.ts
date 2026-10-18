export const previewDocument = {
  id: "fixture-a",
  fileName: "investigation-with-a-long-filename-and-important-observations.MARKDOWN",
  mime: "application/octet-stream",
  source:
    "\uFEFF---\r\ntitle: Investigation\r\n---\r\n\r\n# Investigation\r\n\r\nA generic task report. Read the findings without changing the task.\r\n\r\n## Findings\r\n\r\n- [x] Keep downloads unchanged\r\n- [ ] Check the next step\r\n\r\n[external](https://example.org) ![chart](./chart.png)\r\n\r\n| Observation | Value | Notes |\r\n| --- | --- | --- |\r\n| attachment-identity | fulfilled | " +
    "wide-value-".repeat(15) +
    ' |\r\n\r\n```typescript\r\n\tconst text = "' +
    "long-code-".repeat(25) +
    '";  \r\n```\r\n',
} as const;

export const readingReport = {
  ...previewDocument,
  source:
    "\uFEFF# Technical reading report\r\n\r\nA generic investigation with `fulfilled` and `inconclusive` values. Read the evidence without changing the task. Long prose stays within the document measure and wraps at compact container widths.\r\n\r\n## Findings\r\n\r\nThe attachment snapshot stays immutable while the host theme changes.\r\n\r\n### Evidence\r\n\r\n- [x] Preserve the saved source\r\n- [ ] Review the next observation\r\n\r\n> A quiet note uses the active host foreground tokens.\r\n\r\n#### Method\r\n\r\nOrdinary text is not a status badge.\r\n\r\n##### Detail\r\n\r\nA supporting detail.\r\n\r\n###### Qualification\r\n\r\nLocal fixtures are not installed acceptance.\r\n\r\n## Measurements\r\n\r\n| Observation | Value | Notes |\r\n| --- | --- | --- |\r\n| attachment-identity | fulfilled | " +
    "wide-value-".repeat(20) +
    ' |\r\n\r\n## Code\r\n\r\n```typescript\r\n// Keep source text and whitespace.\r\n\tconst ready: boolean = true;  \r\nconst text = "' +
    "long-code-".repeat(25) +
    '";\r\n```\r\n\r\n```json\r\n{"status":"fulfilled","result":"inconclusive","count":42,"ready":true,"empty":null}\r\n```\r\n',
} as const;

export function navigationDocument(origin: string) {
  const remoteOrigin = origin.replace("127.0.0.1", "localhost");
  return `# Investigation

[Local findings](#findings) [External guide](https://example.org/guide) [Native guide](${remoteOrigin}/tests/native-destination.html) [Relative file](../notes.md) [Malformed](https://example.org/%ZZ)

![Remote chart](${remoteOrigin}/tests/assets/image.png)
![BB private](${origin}/api/private-image)
![Relative chart](./chart.png)
![CORS chart](${remoteOrigin}/tests/assets/cors.png)
![Redirect chart](${remoteOrigin}/tests/assets/redirect.png)
![Broken chart](${remoteOrigin}/tests/assets/broken.png)

## Café **bold** \`code\`

${"A generic report paragraph for local scrolling.\n\n".repeat(25)}

## Findings

The document target is local.

## Findings

Duplicate heading.

## Findings-1

Literal suffix collision.

A note[^1].

[^1]: A local footnote.
`;
}
