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
