import {
  MAX_VIDEO_BYTES,
  videoBytes,
  videoError,
  type VideoWireResult,
} from "../core/video-content";
import type { RepoFile } from "../core/repo-file";
import { readRepoFile } from "./repo-file";

let activeReads = 0;
const videoFailures = {
  too_large: "Video exceeds the 8 MiB preview limit. Use a local player for larger files.",
  auth: "GitHub credentials on this host cannot read this video",
  missing: "Video not found at this revision",
  read: "Could not read video from GitHub. Retry or use a local player.",
} as const;
export async function readPrVideo(file: RepoFile, signal: AbortSignal): Promise<VideoWireResult> {
  if (activeReads >= 2)
    return videoError("read", "Two video reads are already running. Wait and retry.");
  activeReads++;
  try {
    const read = await readRepoFile(file, MAX_VIDEO_BYTES, signal);
    return read.ok ? videoBytes(read.bytes) : videoError(read.code, videoFailures[read.code]);
  } finally {
    activeReads--;
  }
}
