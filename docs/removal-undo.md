# Safe removal Undo

Removing an icon in Settings offers **Undo removal** for up to 15 seconds, with an explicit deadline and status feedback. Switching projects dismisses the offer, including switching away and back while a request is pending. A newer icon revision received through realtime refresh also dismisses it. Settings retains at most one offer and one expiry timer; switching projects, starting another mutation, expiry and unmount clear them. Late responses keep the initiating operation's project and cannot attach an offer or feedback to a later selection.

## Compatible RPC extensions

Existing `save({ projectId, base64 }) -> { revision }` and `remove({ projectId }) -> { removed }` remain available. Settings uses these additional methods:

- `removeWithUndo({ projectId }) -> { removed, undo: { token, expiresAt } | null }`. An offer is returned only after the removal writes succeed and image bytes were retained. `expiresAt` is server Unix time in milliseconds.
- `restore({ projectId, token }) -> { status: "restored" | "expired" | "conflict", revision? }`. Only successful restoration returns a new revision. Conflict means unavailable, superseded, replayed, cross-project, evicted or invalidated by reload. Timer-pruned expired offers also return conflict; clients must handle both unavailable outcomes safely.

The opaque random token identifies one deletion of one project. All save, remove, restore and project reconciliation operations share the existing backend factory's promise queue. Restore checks project existence, token identity, both wall-clock and monotonic deadlines, and absence of an icon after awaited project/storage lookups, inside that queue. A successful mutation from another client sharing the factory cannot be interleaved between this check and restoration. Both remove methods invalidate an earlier offer even when there is no icon to remove. Failed validation before writes preserves an offer; mutation attempts invalidate it before the first write, and restore consumes it before writes, so a partial write failure cannot leave reusable authority.

## Retention and reload

Offers and removed image bytes are **ephemeral**, never stored in KV. The backend retains at most one offer per project, 16 offers globally, and at most 90,000 base64 characters per offer (1,440,000 characters globally; normal valid images decode to at most 64 KiB each). Oldest offers are evicted at capacity. One cleanup timer removes expired offers; mutation/reconciliation also prune them, deleted projects lose their offers, and backend disposal clears the timer and map. Event-loop delays may postpone physical cleanup; expiry validation still rejects overdue restoration. Undo is best effort within the deadline and can end earlier on eviction or newer mutation.

**Server/plugin reload, disable or restart invalidates every offer.** Reopening Settings does not recover an offer. Undo cannot be retried by this UI after a restore response or transport error: a request may already have consumed its token. Refresh shows the authoritative icon. No durable recovery is promised.

Icon bytes and index still use the existing separate KV writes. These writes are not a transaction: write failure or process crash can leave image/index inconsistency. Undo fails closed and never rolls back over a later mutation. The queue coordinates clients served by one backend factory, not independent writers or overlapping factory generations; this change does not introduce cross-process locking or crash-atomic storage. A persistent `revisionHighwater` value reserves increasing safe-integer revisions before image writes, incorporating existing index values and the wall clock. Failed writes may leave gaps; same-millisecond operations and subsequent reloads/clock rollback do not reuse cache revisions under this ownership boundary.

## Verification and integration

Legacy assignments may predate `revisionHighwater`. Both removal APIs and reconciliation persist the maximum of the complete pre-discard index and existing watermark before deleting any image or indexed revision. A failed watermark read/write aborts before destructive storage writes. If a later destructive write is applied but reports failure, the already persisted maximum still prevents cache revision reuse after reload and clock rollback. This preserves revision identity; image/index writes remain non-transactional.

Run `npm ci`, then `npm run check` on a supported Node version. Accepted CI/tooling includes the SDK harness dependency and discovers root and scripts test suites. On Windows without the native build prerequisites, `npm ci --ignore-scripts` supports local validation; exact-head Ubuntu CI separately verifies normal installation. Backend tests exercise the built server via the SDK fake host; state tests exercise ownership, delayed responses, expiry and feedback. They do not establish live BB rendering, screen-reader behavior, multi-host routing or crash recovery.

The original reviewed code base was #4 / PR #23 at `c9fcf0ec8f45478ccb0c22076352811ea5b81c9b`, inheriting #3 / PR #21 (`b3b8969`). After #3/#4/#5 and #32 acceptance, the branch additively synchronized accepted `develop` at `c1f42b7fb9b3b6b79757d8c1053d41cb7e18a6a8` and targets `develop`. The accepted #5 input/drop/paste implementation and #32 slider labels are retained. `app.tsx` changes remain restricted to removal RPC wiring and the removal/status region. Signed source history is preserved; integration still requires final review and checks of the synchronized head.
