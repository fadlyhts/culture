# Verification record

Executed using the actual Node test runner through a Node child process: node --test tests/*.test.js. all 30 checks passed. Early checks were also run through direct Node module imports. Real node:sqlite in-memory storage executes the Durable Object's SQL statements and synchronous transactions for API tests.

- Engine: first claim, synonyms/duplicate rejection, reveal/hide scoring, reset generation, late submissions, idempotency, reordering, started-question protection, role filtering, persistence serialization, bounds, reserved-ID validation.
- Authentication: signed-cookie verification, tampering, wrong key, expiration, same-origin checks, bounded malformed JSON.
- Backup: score restoration, generation increment, team-session revocation, invalid ownership rejection.
- API with real SQLite: unauthorized access, simultaneous claims, host/team command separation, score/object restart persistence, late submission rejection, invitation revocation, bounded login attempts, Worker origin rejection.
- Live snapshot method: host/team projections and expired-session closure.

- Client transport: same-origin cookies and structured errors, reconnect/full resync, revoked-session stop, cancellation of late in-flight snapshots after stop.
- All public JavaScript files pass node --check. Original host second style block (22KB) is retained; six team entry files include no bundled answer bank or Claude connector. Source accessibility/contrast review is recorded in DESIGN.md.

Limits: the shell tool launcher failed with helper_unknown_error, but Node child_process allowed real tests and npm attempts. npm install was attempted; registry.npmjs.org/wrangler access was denied EACCES. Therefore dependencies were not installed, and Wrangler dev, deployment dry-run and deploy were not executed. The SQLite harness does not substitute for a Cloudflare-runtime rehearsal of WebSocket upgrade/hibernation or Static Assets routing. No connected browser was available for visual or interaction verification. Deployment requires the user’s own Cloudflare account.

- Static asset checks verify all seven entry points and local assets, full original board/projector stylesheet, and host control IDs. Maximum legal cumulative scores restore after manual adjustment. Final result: 30 tests passed, 0 failures.

Final storage regressions: a legitimate backup above 200 KB restores successfully, and oversized mutations fail before changing SQLite or in-memory state. Final full run: 30/30 tests passed.

## Local development preview

Ran node scripts/dev-local.js on http://127.0.0.1:8787 with persistent Node SQLite and authenticated SSE updates. Verified HTTP 200 for host and team pages, successful host login and invitation exchange, role-filtered team snapshot, live submission delivery, reveal scoring, and reset to clean gameplay. The server remains running for the user to inspect. Production transport remains WebSocket; the local SSE lifecycle regression passes. Final automated suite:31 tests passed,0 failed. Cloudflare Wrangler/runtime/deployment and browser visual verification remain pending.

## Latest DATN reference update (2026-10-27)

`npm.cmd test`: 38 tests passed, 0 failed. `node --check` passed for host, team, engine and local preview sources. New coverage verifies seven supplied questions, hidden prestart question, prestart submission rejection, idempotent start, exact 30-second cutoff, deadlines surviving serialization, Durable Object alarm rescheduling after restart, persisted automatic lock and broadcast without a host, accepted retry behavior after timeout, reset to question 1, protection of running question edits, restored countdown closure, legacy round compatibility, five-question/main and two-question/extra boundaries, and shared competition rankings.

The original scoring tests use a fixed question fixture independent of the changing production question bank. Production questions and aliases come from the latest supplied HTML. Repeated normalized synonyms within a single answer are allowed; collisions across different answers remain rejected.

Visual gate: incomplete. Computer Use attempted Chrome but stopped because it could not confidently establish the Windows browser URL for policy enforcement. No browser screenshot, viewport QA or complete interactive click-through was completed. The implementation has not been deployed, and Cloudflare alarms/WebSocket behavior still require a Wrangler/runtime rehearsal.

Local HTTP smoke verification also passed against a separate disposable SQLite database: prestart answer rejected; Mulai accepted; team answer accepted; a real 30-second deadline locked the round with no host browser connected; a late answer was rejected. The original local-game.sqlite was not used for this run.

Participant interaction checks: 41/41 automated tests pass. New tests cover countdown rounding, five-second warning boundary, exact-zero lock, manually locked/waiting/legacy states, and every required client control on all six team pages. Local HTTP returns 200 for the participant HTML, stylesheet, client and timer module. Source palette contrast checks exceed 4.5:1 for the question, answer input, placeholder, send button and supporting hint. Browser rendering and interactive click-through remain unverified.
