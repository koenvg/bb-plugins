export const TASKS_PLUS_API_BASE = "/api/v1/plugins/tasks-plus";
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

export function attachmentDownloadUrl(attachmentId: string): string {
  return `${TASKS_PLUS_API_BASE}/http/attachments/download?attachmentId=${encodeURIComponent(attachmentId)}`;
}
