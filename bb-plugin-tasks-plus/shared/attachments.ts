export const TASKS_PLUS_API_BASE = "/api/v1/plugins/tasks-plus";
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_PREVIEW_BYTES = 1024 * 1024;

export function isMarkdownPreviewEligible(attachment: {
  fileName: string;
  isImage: boolean;
}): boolean {
  return !attachment.isImage && /\.(md|markdown)$/i.test(attachment.fileName);
}

export function attachmentPreviewUrl(attachmentId: string): string {
  return `${TASKS_PLUS_API_BASE}/http/attachments/preview?attachmentId=${encodeURIComponent(attachmentId)}`;
}

export function hasBinaryTextControls(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      (code >= 127 && code <= 159)
    )
      return true;
  }
  return false;
}

export function attachmentDownloadUrl(attachmentId: string): string {
  return `${TASKS_PLUS_API_BASE}/http/attachments/download?attachmentId=${encodeURIComponent(attachmentId)}`;
}
export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const kb = sizeBytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
