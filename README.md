# Splitbox

**Split trip expenses with friends. Free, no sign-up — just share the link.**

👉 **Use it:** https://splitbox.web.app

Built on a trip to Zero Point, Sikkim, from a phone, with [Claude Code](https://claude.com/claude-code) running in the cloud, after the
"who pays whom" feature of the splitter we used went paid.

<p align="center">
  <img src="docs/screenshots/1-expenses.png" width="240" alt="Trip expenses" />
  <img src="docs/screenshots/3-balances.png" width="240" alt="Who owes whom" />
  <img src="docs/screenshots/2-add-expense.png" width="240" alt="Add an expense with a custom split" />
</p>

## Features

- Create a trip and share its link (or 10-character code) with your group. No accounts.
- Everyone picks who they are on their own phone (remembered on that device).
- Add expenses: who paid, who was involved, and split **equally**, by **exact amounts** or by **shares**.
- **Who pays whom**: your balance, everyone's debts and a per-person breakdown. Tap **Mark paid** when someone settles up.
- **Simplify debts** (on by default): the fewest payments to settle everyone, or switch it off to repay exactly who paid for you.
- **Cost per person**: what the trip cost each person, adding up to the trip total.
- Real-time sync between phones, works offline, installable as an app (PWA), dark mode.
- Always up to date: opening or refreshing loads the latest version. An **Update** button only
  appears if a new version is released while the app is already open.

Money is stored in whole paise/cents and split with largest-remainder rounding, so splits always add up exactly.

## Tech

React + Vite, Cloud Firestore, Firebase Hosting, a Workbox service worker (`src/sw.js`).
Frontend only: there is no backend server. Developer notes (architecture, data model, gotchas)
are in [`CLAUDE.md`](CLAUDE.md).

| Path | What |
| --- | --- |
| `src/logic.js` | Money logic: parsing, splits, balances, settlements (unit-tested in `logic.test.js`) |
| `src/api.js` | Firestore reads/writes (`trips/{code}` and `trips/{code}/entries`) |
| `src/components/` | React UI |
| `firestore.rules` | Database security rules |

## Run it locally (no Firebase account needed)

```bash
npm install
npm run emulators                                   # terminal 1: local Firestore (needs Java)
echo "VITE_USE_EMULATOR=true" > .env.local          # point the app at the emulator
npm run dev                                         # terminal 2
```

## Tests

```bash
npm test        # unit tests for the money logic
npm run e2e     # browser checks against the emulator (setup in e2e/README.md)
```

## Deploy

```bash
rm -f .env.local          # never ship an emulator build (the deploy also checks this)
npx firebase login        # the Google account that owns the Firebase project
npm run deploy            # rebuilds, verifies, deploys hosting and Firestore rules
```

### Host your own copy

1. Create a Firebase project, enable **Firestore**, and add a **Web app**.
2. Put your web config in `.env` (see `.env.example`). It overrides the defaults in `src/firebase.js`.
3. In `.firebaserc`, set your project id and your Hosting site names under `targets` (or remove the
   `legacy` redirect target from `firebase.json`).
4. `npx firebase login && npm run deploy`.

## Security model

There is no login, so the trip code acts as the key: 10 random characters (~10¹⁵ combinations; trips created before
November 2026 have 8, ~10¹²).
`firestore.rules` lets anyone open a trip by its exact code but never list trips, so codes can't be discovered, and
it validates the shape of every write. Anyone with a trip's link can view and edit that trip, so only share it with your group.

The Firebase web config in `src/firebase.js` is public by design (it ships to every browser). Access to data is
controlled by the security rules, not by keeping that config secret.
