Codex Quota reads allowance and account activity through the selected host's Pi Codex sign-in. Collected and imported history stays on that host. These are separate sources, not proof of actual billing or complete account history.

## Account quota and activity

The quota page and sidebar badge show remaining allowance for the binding window. Reset times and countdowns appear when known. Usage collection settings also show additional limits when available. Refresh allowance is separate from activity and history reads. The plugin links to the official Codex Usage page, but the browser account can differ from the selected host's account. The plugin does not redeem resets.

Open Account details and activity in Usage collection settings for account-wide token summaries and daily, weekly or cumulative tables. The selected host supplies authentication, but these values are not selected-host Pi usage. Weeks start Monday in UTC. Cumulative values cover returned daily buckets, not lifetime activity. Missing fields and dates stay unknown. Account activity does not fill local history gaps, establish ownership of old records or set prices. See [Account activity](docs/ACTIVITY.md).

## Collected history

Open Collection and history management in Usage collection settings to check readiness and use Install collector, Repair collector, Pause capture or Resume capture. Readiness checks do not install a collector or read transcripts. They can continue bounded ingestion, identity discovery and storage maintenance. Installation alone does not confirm that sessions have loaded the writer. Restart existing Pi sessions yourself to load or repair it; no session restarts automatically.

Workspace totals count shared paths once and show partial coverage, exclusions and pending work. Verified exact-thread totals require unique public Pi and BB identity evidence. They stay unavailable while discovery or attribution is unfinished. Captured thread fields are claims, not proof. Workspace-only, ambiguous and unattributed usage stays separate. Exact-thread totals are a subset of workspace usage, not extra tokens to add. Missing or deleted thread metadata has stable labels without navigation. Available and archived verified threads use public BB navigation. See [Verified thread identity](docs/IDENTITY.md).

The installed Pi extension can outlive BB's UI or plugin. Pause capture on its host to stop new writes; writes already in progress can finish. Repair preserves earlier records and paused state.

## Imported history

Historical import requires explicit source roots and workspace paths for each selected host. Save import sources configures them; the plugin does not independently discover the effective BB roots. Only Start import and Resume import discover or read transcripts, one bounded cycle at a time. Check import status and reload do not scan transcripts or resume work.

Import saves progress for a frozen source scope and UTC range. Coverage stays partial even when the import completes or finds no records. Imported records do not confirm live writer activation. Cancel stops further work, but committed records remain. Changing hosts does not undo a committed operation. See [Historical import](docs/IMPORT.md) for source, omission and replay limits.

The chart includes uncertain token estimates by default. New manual imports retain readable omissions separately. A dashed chart segment, tooltips and the accessible table keep estimates distinct from recorded usage. There are no uncertainty toggles or combined-total banners. Duplicate checks are approximate. Recorded totals, thread attribution, costs, quota and account activity stay separate. Missing or unreadable token counts are not invented.

## Recorded usage calendar

The quota page shows a read-only chart of retained collected and imported usage for the selected host. The latest range covers 30 dates ending yesterday in the viewer's timezone. Previous 30 days and Next 30 days move within retained bounds. Choose Tokens or Estimated cost. The current chart combines workspace usage; it has no thread-grouping or period-comparison controls. Exact-thread totals are in history management.

Unknown history is not zero usage. The chart separates partial history, observed inactivity, unknown history, stale results and unavailable data. Estimated cost uses originally captured positive prices, not current prices or subscription charges. Missing, zero or invalid prices stay unpriced; their tokens still count. An unavailable estimate does not mean free use. No view proves actual billing.

Opening or refreshing the chart reads the retained index only. It does not read transcripts, run readiness maintenance, start imports or change collector controls. Chart failures do not disable quota. See the [calendar chart UI](src/history/calendar/calendar-panel.tsx) and [public RPC interface](src/plugin/server.ts).
