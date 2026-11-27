import { useCallback } from "react";
import { createRoot } from "react-dom/client";
import { ReviewVideoDiff } from "../../../review-ui/video-diff";
import { imageBlobResult } from "../../../review-ui/image-diff";
import type { ImageSide } from "../../../review-ui/image-diff";
import { requireFixtureValue } from "../../require-fixture-value.test-support.js";

const Fixture = () => {
  const load = useCallback(async (side: ImageSide, signal: AbortSignal) => {
    const response = await fetch(
      `/content?side=${side}&codec=${new URLSearchParams(location.search).get("codec") ?? "vp9"}`,
      { signal },
    );
    return imageBlobResult(await response.json());
  }, []);
  return (
    <ReviewVideoDiff
      active
      before={{ path: "before.mp4", revision: "Pinned base" }}
      after={{ path: "after.webm", revision: "Pinned head" }}
      load={load}
    />
  );
};
createRoot(requireFixtureValue(document.getElementById("root"))).render(<Fixture />);
