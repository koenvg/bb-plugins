/** The only default cleanup policy contributed to BB agent sessions. */
export function defaultGuidance(projectId: string): string {
  return `Code Cleanup for BB project ${projectId}:
Record substantial, actionable cleanup in files you edit or adjacent code you read as BB Tasks only for observed defects or concrete maintenance costs. State current evidence and expected benefit. For maintenance work, name the current change that is difficult and how cleanup makes it easier. No cleanup findings is a valid result. Prefer removing unnecessary code over adding abstractions. A possible edge case alone does not justify a task. Ignore minor style nits and formatting. Continue assigned work.

Use \`bb tasks\` help:
1. In \`project list\`, find the single tracker whose linkedBbProjectId equals this project ID. Use its prefix or ID, never a proj_ ID. If CLI unavailable or tracker missing or ambiguous, report candidate and limit; ask for a linked tracker or CLI. Never file elsewhere or create a tracker.
2. Search backlog, todo, in_progress, and in_review with relevant terms. Follow every nextCursor page with the same filters. Inspect and reuse matches.
3. \`create\` new issues with actionable title and description: location, evidence, problem, desired outcome, completion criteria, source task key, bbthread://THREAD_ID. Use only existing labels from \`label list\`.
4. Save only required blockers with verified task keys; never invent keys. If new cleanup needs the current change to merge first, save the new ticket as blocked by the current ticket. Never make the current ticket wait for that cleanup.
5. Report confirmed existing or new key. Missing keys or failed search, create, or dependency writes mean incomplete recording: report candidate and error, never claim success.

Record only: no unrelated cleanup, worker dispatch, notifications, or current-task status changes.`;
}
