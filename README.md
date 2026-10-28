# Family 100: Cloudflare

Indonesian Family 100 quiz adapted from the supplied artifact. The original files in artifact/ are preserved. One Cloudflare Worker serves the host page, six team pages, API and live updates; one SQLite Durable Object stores the game. No Claude account or Google Sheets connector is needed.

## Local preview without downloads

When Wrangler cannot be installed, use the included dependency-free preview with Node.js 22.13 or newer:

~~~powershell
npm run dev:local
~~~

This reads the ignored .dev.vars file, serves http://127.0.0.1:8787, and persists preview gameplay in .cache/local-game.sqlite. It runs the same game engine, authentication and API with Node SQLite; live updates use Server-Sent Events. The deployed Cloudflare version still uses Durable Objects and WebSockets. This preview does not validate Cloudflare-specific runtime behavior. The server binds only to this computer. Use a separate browser profile or incognito window to test a team alongside the host.

## Local setup

Use Node.js 22.13 or newer (tests use the built-in node:sqlite module).

~~~powershell
npm install
Copy-Item .dev.vars.example .dev.vars
~~~

Edit .dev.vars with a unique HOST_PASSWORD of at least 12 characters and SESSION_SECRET of at least 32 random characters. Never commit this file. Then:

~~~powershell
npm test
npm run dev
~~~

Open the local URL printed by Wrangler. Local HTTP cookies work only on localhost/127.0.0.1. The six team invitations appear in the host settings after login. Joining via an invitation exchanges its token for an HttpOnly scoped cookie. Invitation links are private credentials; share each link only with its own team. A browser has one active role at a time; use a separate browser profile or incognito window when testing teams alongside the host.

## Deploy to your Cloudflare Free account

Workers Free supports SQLite Durable Objects. This project uses Workers Static Assets rather than a static-only Pages upload, because the teams need a shared authoritative server. A workers.dev hostname is sufficient.

~~~powershell
npx wrangler login
npx wrangler secret put HOST_PASSWORD
npx wrangler secret put SESSION_SECRET
npm run deploy:check
npm run deploy
~~~

Each secret command prompts locally for the value. Use the same length requirements as local setup, with production values separate from development. Wrangler applies the v1 SQLite migration and creates the GAME binding defined in wrangler.jsonc. No account ID or credentials are committed. Deployments do not reset stored games.

If changing the Worker name, update wrangler.jsonc before deploying or adding secrets. The name identifies the deployment; keep it stable to retain the same hosted game. Cloudflare account login and deployment have not been performed in this environment.

Free plans have usage limits and can stop serving when limits are exhausted. WebSocket hibernation reduces idle compute. This is intended for one game and six teams, with a maximum of 50 simultaneous live connections, 100 questions, 10 answers per question and one accepted submission per team per question. See Cloudflare's current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/) before a large event.

## Operate the game

1. Log in as host, edit questions and synonyms, then copy each team's private short link or show/download its QR code from the team-link panel. Have participants scan on their phones or use a separate browser profile from the host. Each short link redirects to a team invitation; rotating an invitation invalidates its old short link and QR code. Existing full invitation links continue to work.
2. Select a question. Each team submits one answer. The server orders arrivals; the first matching submission owns that answer's points. Other teams may submit the same correct answer, but earn zero points for it. A team's second submission is rejected; a retry of the same accepted request remains safe.
3. Lock answers, then reveal the board. Revealing the first answer also locks the round. Scores are awarded only for revealed answers, with the round multiplier applied. Hiding reverses those points; revealing again does not add them twice.
4. Move to the next question. Scores accumulate centrally and survive reloads. Reset clears gameplay and score adjustments, retaining questions and team names.

Set the multiplier before any submissions or lock. Started questions cannot be changed or deleted until gameplay is reset. Host manual score controls set a team's total by adjusting its base score until winners have been fixed. Once results are settled, earlier points and question order are frozen; new questions can still be appended.

Host and team sessions expire after 12 hours. Rotating a team's invitation invalidates that team's existing sessions. WebSocket reconnect receives a full authoritative snapshot; commands use HTTP. If disconnected, reconnect before submitting; the server rejects stale question/generation requests.

### Audio

The Main page plays an opening jingle and a quiet lobby theme after the first interaction or **Aktifkan suara** click, as browsers may block autoplay. A live question uses a rhythmic background loop; locking the round, reaching its deadline or showing results stops the background music. Revealing a claimed answer plays a correct-answer chime, while revealing an unclaimed answer plays a two-note buzzer. **Buka semua** plays one positive cue if any newly opened answer has a claimant, otherwise the buzzer. Initial snapshots and repeated snapshots do not replay reveal effects. **Suara: ON/OFF** controls all effects and music, including already playing notes, and is remembered in that browser. Settings and participant pages do not play this audio.

## Questions and backups

The game remains on `/`. Its **Soal utama** and **Soal tambahan** links open separate browser tabs at `/settings/soal` and `/settings/tambahan`, so opening settings does not replace the projected play screen. In **Soal tambahan**, select **+ Soal tambahan baru**, enter its question, answers, aliases and points, then select **Simpan ke server**. Additional questions are appended and played in their displayed order. Imports/exports apply only to the selected settings page. The extra-round result screen also has **Atur soal tambahan** to open these settings in another tab. Settings share the host session and save to the same server; live game state stays synchronized across tabs.

Question text format is one block per question, separated by a blank line:

~~~text
Sebutkan sesuatu yang dibawa ke kantor!
Tas | 30 | bag
Laptop | 22 | komputer portabel
~~~

A full host backup is a versioned JSON file from GET /api/host/backup. It contains answers, submissions and invitation credentials: store it privately. Restore through POST /api/host/restore with the backup fields plus confirm: true. Restore validates bounds, replaces the complete game, advances generation and revokes existing team sessions. It retains the deployment's invitation tokens, so existing share links can rejoin. Export a backup before resets or replacement imports.

## Architecture and verification

See docs/PLAN.md, docs/ARCHITECTURE.md and docs/VERIFICATION.md. Source is in src/, deployable assets in public/, automated checks in tests/. npm test covers rules, signed cookies, input limits and SQLite-backed API concurrency/persistence.

The actual Node test runner passed all 30 checks, including real SQLite API tests and client transport tests. npm installation was attempted but package registry access was denied EACCES. Wrangler runtime, deployment dry-run, deployment and browser visual verification were not executed. Run the listed commands and a two-device rehearsal before hosting the event.

The serialized game is capped at 1,800,000 UTF-8 bytes to stay below SQLite’s row-size limit. At the total limit, new changes are rejected with a clear error and the current game is retained; download a backup and reset gameplay to free space. Question commands accept up to 800,000 bytes; restore accepts up to 2,000,000 bytes. Exported backups use compact JSON so every saved game fits the restore limit. Backups retain fixed winners and extra-round score baselines.

## Latest DATN reference

The host and team visuals follow `Kuis Family 100 DATN.html`: green/white JRF stage, supplied logos, answer flips and podium. New games use its seven questions (five main, two extra). Existing stored questions are retained; export a backup before using **Kembalikan soal contoh** to load the new pack and reset the game.

Press **Mulai** to reveal the first question and enable submissions for 30 seconds. A persisted server deadline and Durable Object alarm lock answers even if the host closes the browser. After five main questions, lock the round, reveal its awarded points, and select **Tentukan juara**. Distinct positive leaders receive places 1–3 in order, stopping at a tie. Fixed winners sit out all extra rounds. Remaining teams start from zero and play one extra question at a time. Tied contests accumulate extra points until resolved; after new places are awarded, the next contest starts from zero. As soon as all three places are filled, the podium appears. If questions run out, append another question in Edit and continue; extra rounds are not limited to two. Reset clears winners and returns to question 1. Restoring a backup closes any formerly running countdown rather than granting more time.

The latest automated suite passes 38 tests. Windows browser verification was blocked by Computer Use URL detection, so responsive rendering and full click-through are still unverified. This update has not been deployed.
