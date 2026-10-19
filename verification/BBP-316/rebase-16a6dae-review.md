Approve the narrow rebase integration. No actionable findings.

- Conflict resolution retains `useEffect`, controlled `DueDateMenu` props in both layouts, and the Info tooltip.
- Auto-merges retain API `changeId` results and main’s board-resource refresh separation.
- `board-resources.spec.ts` now supplies a contract-valid failure. All rollback/resource assertions remain, with a new visible-error assertion. Production guards were not weakened.
- Independently confirmed the old fixture fails schema validation and the replacement passes.
- Final browser log now reports **49 passed**. Reviewed logs also show 1540 unit tests passing and successful typecheck, format, build, and lint with existing warnings.

Limits remain installed BB acceptance and push verification. Neither was performed. No files or repository state were changed by this review.
