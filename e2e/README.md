# E2E checks

Browser checks written with Playwright. They drive the real app against the **local Firestore
emulator**, so they never touch production data.

## One-time setup

```bash
npm i -D playwright@latest      # not a regular dependency, install when you need it
npx playwright install chromium
```

## Run the suite

Three terminals:

```bash
# 1. Firestore emulator (needs Java)
npx firebase emulators:start --only firestore --project demo-splitter

# 2. Dev server pointed at the emulator
echo "VITE_USE_EMULATOR=true" > .env.local
npm run dev -- --port 5173 --host 127.0.0.1

# 3. The checks
npm run e2e
```

Delete `.env.local` when you're done. Deploys refuse to ship a build made with it anyway
(`scripts/verify-dist.mjs`).

Screenshots from the runs land in `e2e/screenshots/` (git-ignored). Each script can also be run on
its own: `node e2e/balances.cjs`. Set `E2E_BASE` to use a different dev-server URL.

| Script | What it checks |
| --- | --- |
| `core-flows.cjs` | Create and join a trip (link and code), equal/exact/shares splits, validation, live sync between two users, Mark paid, edit sync, add/remove people, trip not found |
| `new-trip-people.cjs` | People rows on the start page (Enter adds a row, remove), quick-add strip, duplicate names |
| `balances.cjs` | Your-balance card, direct vs simplified debts, the toggle syncing to others, "I paid" |
| `people-tab.cjs` | Cost per person and total (payments excluded), Edit mode rename |
| `big-group.cjs` | 12 people: collapsible per-person rows, "Show all", the Simplify hint |
| `offline.cjs` | Unreachable server shows "Can't reach the server" (not "Trip not found"), offline banner, recovery |
| `responsive.cjs` | No sideways overflow on any screen or dialog at 320, 390, 768 and 1280px |
| `autoupdate.cjs` | *Not in `npm run e2e`.* Service-worker update flow; see the comments in the file. It needs a production build served by the hosting emulator: `npx firebase emulators:start --only firestore,hosting:app --project splitter-61a04` with `.env.local` containing `VITE_USE_EMULATOR=true` and `VITE_FIREBASE_PROJECT_ID=splitter-61a04` |
