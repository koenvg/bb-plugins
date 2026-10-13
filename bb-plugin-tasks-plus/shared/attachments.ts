export const TASKS_PLUS_API_BASE = "/api/v1/plugins/tasks-plus";
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

export function attachmentDownloadUrl(attachmentId: string): string {
  return `${TASKS_PLUS_API_BASE}/http/attachments/download?attachmentId=${encodeURIComponent(attachmentId)}`;
}
export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const kb = sizeBytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
