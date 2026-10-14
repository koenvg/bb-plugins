export const graphSeconds = 600;
export const smoothSeconds = 30;
export const streamingSeconds = 5;
export const contributorSeconds = 60;
// The oldest graph point needs the preceding smoothing buckets.
export const retainedSeconds = graphSeconds + smoothSeconds - 1;
