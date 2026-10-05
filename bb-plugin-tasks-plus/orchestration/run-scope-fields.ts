// Tracker scope excludes status, dependencies, comments and reported artifacts.
// Both runtime-specific hashes use this ordered projection without altering it.
type TrackerScopeTask = {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  description: string;
};

export function trackerScopeFields(task: TrackerScopeTask) {
  return [task.id, task.projectId, task.parentTaskId, task.title, task.description] as const;
}
