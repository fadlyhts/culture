# Family 100 implementation plan

## Goal
Adapt artifact/index.html and artifact/tim/*.html into a standalone Indonesian Family 100 quiz deployable to the user's own Cloudflare Free account. Preserve the supplied studio-style mockup. The original artifact is reference material and must remain intact.

## Scope
One hosted game with six teams: Teh, Tebu, Kopi, Kakao, Tembakau, Hore. Host can rename teams, edit/import/export questions (up to ten answers with points and synonyms), reveal/hide answers, lock a round, move between questions, adjust totals, reset gameplay, and use sounds, fullscreen, and keyboard shortcuts. Teams submit from their own phone pages and see their submissions and round status. First accepted matching answer wins; duplicates earn no extra points. Scores accumulate across rounds.

## Implementation sequence
1. Inspect reference and applicable local instructions. Use public/ for adapted assets; keep artifact/ untouched. Set up package.json, Wrangler configuration, Worker entry, and a SQLite Durable Object migration.
2. Implement a pure game engine with immutable question IDs and round generations, answer normalization, deterministic matching, authoritative arrival sequences, duplicate ownership, server-enforced locks, score computation, and validation.
3. Add a Worker API and one SQLite-backed Durable Object. Persist host settings, questions, round state, accepted submissions, and invitations. Serialize claims, locks, reveals, and resets in the object. Add host authentication using a Cloudflare secret, signed expiring HttpOnly cookies, and separate team invitation/session roles. Reject unauthenticated writes and never return hidden answer keys to team clients.
4. Replace Claude DB/MCP and Google Sheets integration with same-origin APIs and authenticated live updates. Use hibernating WebSockets with role-specific snapshots and reconnect/resync; document any justified simpler alternative. Remove Claude contributor instructions and external artifact links. Team pages use local invitation links.
5. Adapt host and team pages, preserving the palette, typography, board, six-team score area, question editor, sounds, fullscreen, and shortcuts. Default answer peeking OFF. Keep desktop play suited for a 16:9 projector; make phone pages readable and keyboard accessible. Add honest loading, reconnecting, empty, validation, and error states.
6. Validate scoring/duplicates/synonyms, concurrent claims, lock-vs-submit ordering, persistence/reload, reset generation, question edits/reordering, authorization, role projections, malformed inputs, host edits, and reconnect behavior. Run Cloudflare-local integration and deployment dry-run if tools permit. Record exactly what ran and what could not run.
7. Deliver README deployment instructions for the user's Cloudflare account, secret setup without committed passwords, free-plan constraints, backup/restore, and operation flow. Update this plan with results. Deploy only if the user's existing Cloudflare authentication is available; otherwise leave a reviewed deploy-ready project with exact commands and clearly state it has not been deployed.

## Acceptance criteria
- Existing seven reference files remain unchanged.
- Host and six team pages work independently of Claude and Google Sheets.
- Server owns round state, arrival order, lock status, and scores; refreshing does not lose gameplay.
- Late, duplicate, stale-round, and unauthorized writes are rejected server-side.
- A team sees its own submissions and public round status, never unrevealed answers, host secret, or other teams' invitation tokens.
- Host can complete all original core controls, edit and bulk-transfer questions, and restore saved state.
- One Worker deployment serves assets/API and uses SQLite Durable Objects available on the Free plan.
- Critical game/security tests pass; verification limits are explicit.
- README includes install, local dev, test, dry-run, secret setup, and deploy commands.

## Implementation results

The user instructed continuation; Anti Slop DURING was applied with the supplied artifact as direction. The standalone Worker, SQLite Durable Object, signed sessions, invitations, authoritative rules, host editor/board, six phone pages, live transport, backups and deployment guide are implemented. Original artifact files were retained.

Automated source, rule, security, SQLite API and client transport checks passed. npm dependency installation was attempted but the package registry was denied EACCES. Wrangler runtime/dry-run/deployment and visual browser checks remain unexecuted. See VERIFICATION.md and DESIGN.md for exact evidence and limits.
