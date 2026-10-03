import type { Folder } from "../shared/contract.js";

export function folderPath(folder: Folder, folders: Folder[]): string {
  const names = [folder.name];
  const seen = new Set([folder.id]);
  let parentId = folder.parentFolderId;
  while (parentId !== null && !seen.has(parentId)) {
    const parent = folders.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    seen.add(parent.id);
    names.unshift(parent.name);
    parentId = parent.parentFolderId;
  }
  return names.join(" / ");
}
