# Splitbox: notes for Claude Code

Trip expense splitter (a free Kittysplit alternative). Frontend-only React app; data lives in Cloud
Firestore; hosted on Firebase Hosting. No accounts: the trip code is the key.

- Live: https://splitbox.web.app (the old https://splitter-61a04.web.app redirects there, keeping the path)
- Firebase project: `splitter-61a04` (Spark/free plan, billing disabled, so it cannot generate a bill)
- Default and only branch: `main`

## Commands

```bash
npm run dev          # Vite dev server
npm test             # unit tests (vitest): src/logic.test.js
npm run emulators    # local Firestore + Auth emulators (needs Java 21+), project demo-splitter
npm run e2e          # Playwright browser checks (need emulator + dev server; see e2e/README.md)
npm run build        # production build to dist/
npm run deploy       # firebase deploy hosting + firestore rules (predeploy rebuilds and verifies)
npm run screenshots  # regenerate docs/screenshots/*.png and linkedin/cover.png (needs emulator + dev server)
```

For local work against the emulator, put `VITE_USE_EMULATOR=true` in `.env.local` (git-ignored).
**Delete it before deploying.** `scripts/verify-dist.mjs` runs as a predeploy step and blocks any
build that points at the emulator. This exact mistake once took the live app down.

## Layout

| Path | Purpose |
| --- | --- |
| `src/logic.js` | Pure money logic: `parseAmount`, `distribute` (largest remainder), `expenseShares`, `computeBalances` (→ balances/paid/spent), `suggestSettlements` (simplified), `pairwiseDebts` (direct). Unit-tested. |
| `src/api.js` | All Firestore access. People changes go through a transaction (`mutatePeople`). |
| `src/firebase.js` | SDK init. Persistent offline cache plus **forced long-polling** (flaky mobile networks break streaming). Config defaults are inlined; `VITE_FIREBASE_*` env vars override them. App Check, plus silent anonymous Auth (`ensureUser()`, `currentUid()`). |
| `src/sw.js` | Service worker (vite-plugin-pwa `injectManifest`). See "Updates" below. |
| `src/router.js` | Tiny history router: `/` and `/t/:CODE`. |
| `src/storage.js` | localStorage: who you are per trip (`me:CODE`), recent trips, install hint dismissed. |
| `src/settle.js` | `markPaid()`: confirm, then record a payment entry. |
| `src/components/Trip.jsx` | Trip page: loads trip + entries, computes stats/settlements, tabs. |
| `src/components/Balances.jsx` | Your balance (`MySummary`), everyone's debts (simplify toggle, first 5 + Show all, hint), collapsible per-person rows. |
| `src/components/People.jsx` | Cost per person (each person's share, `stats.spent`) + total; rename/remove behind Edit; trip settings. |
| `src/components/Deleted.jsx` | "Recently deleted" dialog with Restore. |
| `src/components/Pwa.jsx` | `UpdateBanner` (only when a deploy lands while the app is open) and `InstallCard` (Android prompt / iOS steps). |
| `src/components/ui.jsx` | `Modal`, `Avatar` (colour by position in trip via `setTripPeople`), `CURRENCIES`. |
| `firestore.rules` | Security rules with strict schema checks. |
| `e2e/` | Playwright scripts + runner. `scripts/` holds the deploy guard, screenshot, cover and icon generators. |
| `docs/screenshots/` | App screenshots (demo data, trip code masked) used by the README. |
| `linkedin/` | Private LinkedIn post draft and cover image. **Git-ignored; never commit it.** |

## Data model (Firestore)

```
trips/{CODE}                      CODE = 8 chars from 23456789ABCDEFGHJKLMNPQRSTUVWXYZ
  name, currency (symbol string), createdAt, createdUid?   (older trips have no createdUid)
  people: [{ id, name }]          APPEND-ONLY (rules). id = random hex; order = avatar colour
  personMeta?: { id: { name?, removed? } }   renames and soft removals, overlaid by tripPeople()
  simplify?: bool                 absent => ON (only an explicit false turns it off)

trips/{CODE}/entries/{id}
  expense: { type:'expense', title, amount, paidBy, date:'YYYY-MM-DD',
             split:{ mode:'equal'|'exact'|'shares', parts:{ personId: n } },
             createdAt, updatedAt, createdBy, updatedBy?, deletedAt?, deletedBy?,
             createdUid?, updatedUid }
           equal: parts = {id: 1}; exact: parts = {id: minor units}; shares: parts = {id: weight}
  payment: { type:'payment', from, to, amount, date, note, createdAt, updatedAt, createdBy,
             updatedBy?, deletedAt?, deletedBy?, createdUid?, updatedUid }
```

- **Entries are never hard-deleted** (the rules deny it). Delete sets `deletedAt`/`deletedBy`
  (`deleteEntry`), restore removes them (`restoreEntry`); the rules only let those two touch the
  bookkeeping fields. `splitDeleted()` separates live entries from the "Recently deleted" list:
  only live entries go into balances, totals and `isPersonUsed`. A deleted entry that mentions a
  removed person can't be restored until that person is brought back (`canRestore`).
- **People are never dropped either.** The rules make `people` append-only (existing items must stay
  identical, new ones only at the end). Renaming writes `personMeta.<id>.name`; removing writes
  `personMeta.<id>.removed` (People tab → Removed → Restore undoes it). Adding a name that matches a
  removed person brings that person back (same id). Use `tripPeople(trip)` everywhere: `Trip.jsx`
  passes `people` (active) and `allPeople` (incl. removed, for names/colours of old entries).
- **Writes need a signed-in device.** The app signs in anonymously and silently (no login screen).
  The rules require `createdUid`/`updatedUid` == `request.auth.uid`, so they're trustworthy
  per-device stamps. `createdBy`/`updatedBy`/`deletedBy` are the person a device *claims* to be,
  so they're a courtesy trail. Edits must pass the original `createdUid` through (the forms do).
  Reads stay open to anyone with the code.
- `createdAt`, `createdBy`, `createdUid` and `type` can't change after creation.

- **All money is integer minor units (paise/cents).** Never use floats for amounts.
- `stats.spent[id]` = that person's share of expenses (the People tab "cost per person");
  `stats.paid[id]` = what they paid for the group; `stats.balances[id]` = paid − share ± payments.
  Payments never count as spending.
- The rules use `keys().hasOnly([...])`. **Any new field must be added to `firestore.rules`**, or
  writes will be rejected, then deployed with `npx firebase deploy --only firestore:rules`. New rules
  take about a minute to propagate.
- A person can't be removed while any live entry references them (`isPersonUsed`).

## Hosting, updates and PWA

- `firebase.json` has two hosting targets (see `.firebaserc`): `app` → site `splitbox`, and
  `legacy` → site `splitter-61a04`, which 302-redirects everything to splitbox (regex rule keeps
  the path). Both deploy together.
- **Updates:** the HTML page is NOT precached. The service worker fetches it network-first (5s
  timeout, then the cached copy), so a refresh or app launch always gets the latest deploy when
  online. Hashed JS/CSS are precached for offline use. A new worker activates immediately.
  `version.json` (emitted at build) plus `__BUILD_ID__` let the open app detect a newer deploy and
  show the **Update** banner; that's the only time a button appears. `window.__SPLITBOX_BUILD__`
  shows the running build.
- `sw.js`, `index.html`, `version.json` and `manifest.webmanifest` are served with
  `Cache-Control: no-cache` (firebase.json headers). Keep it that way.

## Behaviour worth knowing

- A cache-only snapshot of a missing trip means "can't reach the server", not "trip not found"
  (`watchTrip` passes `fromCache`). Don't regress this: it once showed "Trip not found" on a bad
  mobile network.
- Simplify debts is on by default. Off means direct pairwise debts.
- Amount splits use largest-remainder rounding so parts always sum exactly to the total.

## Security

- The Firebase web API key in `src/firebase.js` is public by design. In Google Cloud it's restricted
  to the Cloud Firestore, Firebase App Check, Identity Toolkit and Token Service APIs (the last two
  are for Auth), and to the splitbox/splitter-61a04/localhost
  referrers. Firestore itself ignores the key; **the rules are the real protection** (get by exact
  code only, no listing, schema validation, no hard deletes). If you add a custom domain, add it to
  the key's referrers (Google Cloud Console → APIs & Services → Credentials) and to the reCAPTCHA
  key's domains.
- **App Check** is on: see "App Check" below.
- **Anonymous Auth** must stay enabled (Firebase console → Authentication → Sign-in method →
  Anonymous). If it's turned off, every write fails. Auth uses `initializeAuth` without a
  popup/redirect resolver, so no firebaseapp.com iframe loads (and the CSP doesn't allow one).
- `firebase.json` sends a strict CSP plus `Referrer-Policy: strict-origin` (not `no-referrer`:
  the API key's referrer restriction needs the origin), `X-Frame-Options: DENY` and `nosniff`.
  **Any new third-party host (script, API, font, image) must be added to the CSP**, or the browser
  blocks it. The dev server doesn't send these headers, so check new hosts with a production build.
- Never commit `.env`, `.env.local`, service-account keys or debug logs.

## App Check

Proves Firestore requests come from the real site, so a script can't burn the free daily quota.

- **Provider:** reCAPTCHA Enterprise (Google now calls it "Fraud Defense") via
  `ReCaptchaEnterpriseProvider` in `src/firebase.js`. The classic reCAPTCHA v3 provider no longer
  accepts new App Check registrations, so don't switch back to it.
- **Key:** `Splitbox`, ID `6LcjSC0uAAAAAG1h5NpWSu2LTV20BXykI_ZrQ0MU` (public, inlined as
  `RECAPTCHA_SITE_KEY`). Type Website · Score, domains `splitbox.web.app` and `localhost`, domain
  verification on. It was made in the classic admin console and shows up in Google Cloud →
  Security → reCAPTCHA; manage it there. Its "secret key" isn't used by App Check.
  `VITE_RECAPTCHA_SITE_KEY` overrides it; an empty value turns App Check off.
- **Firebase console → App Check → Apps:** the web app is registered with reCAPTCHA Enterprise and
  a **1-day token TTL**. Keep it long: billing is off, so reCAPTCHA runs on the free tier of
  10,000 checks a month (about one per device per day at this TTL) and returns errors past that
  instead of charging. If App Check were enforced then, the app would stop loading data.
- **Enforcement** (App Check → APIs → Cloud Firestore): off when set up on 2026-11-22, to be
  switched on once the metrics show nearly all requests as Verified. **Unenforce** is the quick
  rollback if real users get rejected.
- **Emulator:** App Check is skipped when `VITE_USE_EMULATOR=true`, so E2E tests don't touch it. A
  dev server on `localhost` without `.env.local` uses the real key and gets real tokens.
- **Check it on the live site:** in the browser, the `exchangeRecaptchaEnterpriseToken` request
  should return 200 with `"ttl": "86400s"`. A request with no token, such as
  `curl "https://firestore.googleapis.com/v1/projects/splitter-61a04/databases/(default)/documents/trips/ZZZZZZZZ?key=<api key>" -H "Referer: https://splitbox.web.app/"`,
  returns 404 while unenforced and a 401/403 App Check error once enforced.
- reCAPTCHA logs `requestStorageAccess: Permission denied` in headless Chrome. It comes from
  Google's frame and is harmless.
- **New domain:** add it to the reCAPTCHA key's domain list, the API key's referrers and (if it
  loads anything new) the CSP.

## Working conventions

- Test against the emulator, never production data. Check new UI at 320px and in dark mode
  (`node e2e/responsive.cjs` catches overflow).
- Run `npm test` and `npm run e2e` before deploying; deploy with `npm run deploy` after
  `npx firebase login` (the account that owns `splitter-61a04`).
- Commit straight to `main`.
