/** The only default cleanup policy contributed to BB agent sessions. */
export function defaultGuidance(projectId: string): string {
  return `Code Cleanup for project ${projectId}:
While doing your assigned work, notice substantial, actionable cleanup in files you edit or directly adjacent code you read. Examples: a fragile boundary, repeated logic that makes changes risky, or a hard-to-test module with a concrete improvement. Use judgment; minor style nits, formatting, and taste alone do not merit follow-ups.
Stay focused on the current task. For a worthwhile separate follow-up, report the candidate to the user with its location, problem, and desired outcome. Do not claim to have created a task.`;
}
