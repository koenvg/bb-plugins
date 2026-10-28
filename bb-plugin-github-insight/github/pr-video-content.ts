import { z } from "zod";
import { prImageRequestSchema } from "../core/pr-image-basis";
import {
  MAX_VIDEO_BYTES,
  videoBytes,
  videoError,
  type VideoWireResult,
} from "../core/video-content";
import { readRepoFile } from "./pr-image-content";

let activeReads = 0;
const videoFailures = {
  too_large: "Video exceeds the 8 MiB preview limit. Use a local player for larger files.",
  auth: "GitHub credentials on this host cannot read this video",
  missing: "Video not found at this revision",
  read: "Could not read video from GitHub. Retry or use a local player.",
} as const;
export async function readPrVideo(
  value: z.infer<typeof prImageRequestSchema>,
  signal: AbortSignal,
): Promise<VideoWireResult> {
  if (activeReads >= 2)
    return videoError("read", "Two video reads are already running. Wait and retry.");
  activeReads++;
  try {
    const file = await readRepoFile(value, MAX_VIDEO_BYTES, signal);
    return file.ok ? videoBytes(file.bytes) : videoError(file.code, videoFailures[file.code]);
  } finally {
    activeReads--;
  }
}
