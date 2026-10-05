/** The only default cleanup policy contributed to BB agent sessions. */
export function defaultGuidance(projectId: string): string {
  return `Code Cleanup for BB project ${projectId}:
Record substantial, actionable cleanup in files you edit or adjacent code you read as BB Tasks. Ignore minor style nits and formatting. Continue the assigned work.

Use \`bb tasks\` command help:
1. In \`project list\`, resolve the single tracker whose linkedBbProjectId is ${projectId}. Use its prefix or tracker ID, never a proj_ ID. If the CLI is unavailable or the tracker is missing or ambiguous, report the candidate and limit and ask for a linked tracker or CLI. Never file elsewhere or create a tracker.
2. Search backlog, todo, in_progress, and in_review with relevant terms. Follow every nextCursor page with the same filters. Inspect candidates and reuse matches.
3. For a new issue, \`create\` an actionable title and description with location, evidence, problem, desired outcome, completion criteria, known source task key, and bbthread://THREAD_ID. Verify existing labels with \`label list\`. Add required blockers only with verified task keys.
4. Report the confirmed existing or new key. Failed search, creation, or dependency writes mean incomplete recording: report the candidate and error, never claim success.

Record only: no unrelated cleanup, worker dispatch, notifications, or current-task status changes.`;
}
