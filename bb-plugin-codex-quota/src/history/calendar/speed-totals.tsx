import { speedModes, type SpeedTokens } from "../usage-speed.js";

export function SpeedTotals({ tokens }: { tokens: SpeedTokens | null }) {
  return (
    <div className="mt-4 min-h-20">
      <dl
        role="group"
        aria-label="Recorded tokens by speed"
        className="grid grid-cols-3 gap-3 text-sm"
      >
        {speedModes.map(({ mode, label }) => (
          <div key={mode} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd
              className="mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]"
              aria-label={`${label} tokens`}
              aria-description={
                tokens ? `${tokens[mode].toLocaleString("en-US")} recorded tokens` : undefined
              }
            >
              {tokens
                ? tokens[mode].toLocaleString("en-US", {
                    notation: "compact",
                    maximumFractionDigits: 2,
                  })
                : "—"}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Missing or unknown speed counts as Normal. The graph calls this Default.
      </p>
    </div>
  );
}
