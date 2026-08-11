# Al-bahr — production deploy runbook (Phase 20)

Two apps, one Firebase project, two Vercel projects.

| Piece | Where it lives | How it deploys |
|---|---|---|
| Customer app | `broast-albahr` (Astro static) | Vercel auto-builds on push to `main`. |
| Admin app | `Al-bahr-admin` (single HTML) | Vercel auto-serves on push to `main`. |
| Cloud Functions | `broast-albahr/functions` | `firebase deploy --only functions` from a workstation. |
| Firestore rules | `broast-albahr/firestore.rules` (source of truth) mirrored in `Al-bahr-admin/firestore.rules` | `firebase deploy --only firestore:rules`. |
| Firestore indexes | `broast-albahr/firestore.indexes.json` | `firebase deploy --only firestore:indexes`. |

## Environment prerequisites (one-time)

```
npm install -g firebase-tools
firebase login
firebase use broast-al-bahr      # sets the active project
firebase functions:secrets:set REWARD_TOKEN_SIGNING_KEY   # already set — rotate only deliberately
```

## Standard deploy — after any Cloud Function / rules change

```
# From the customer-app repo root:
cd broast-albahr
git pull

# Deploy both together — rules go out first so the callables it depends on
# find the new access model. This ordering keeps the client from seeing
# denied reads mid-deploy.
firebase deploy --only firestore:rules,functions
```

Vercel handles the two apps automatically on `git push origin main`.

## Rollback

- **Cloud Function rollback**: `firebase functions:list`, find the previous
  revision, redeploy from a git tag. Every deploy is idempotent, so
  reverting the commit and re-running `firebase deploy --only functions`
  is the fastest path.
- **Firestore rules rollback**: revert the rules file and re-deploy.
  The Firebase console keeps a history under Firestore → Rules → History
  as a safety net.
- **Vercel rollback**: Vercel dashboard → the app → Deployments →
  ⋯ menu → *Promote to Production* on the previous green build.

## Monitoring (already wired)

- **Cloud Function logs**: Firebase Console → Functions → Logs. Filter
  by function name; every callable logs a `[function-name]` prefix.
- **Firestore errors**: Firebase Console → Firestore → Metrics.
- **Client errors**: browser DevTools + Vercel deployment logs. Set up
  Sentry (or Firebase Crashlytics for the customer app) as a Phase-20
  follow-up if the ops team wants alerting.
- **App Check**: Firebase Console → App Check. Blocked requests show
  in the metrics — spikes usually mean a bot or a real client running
  without a valid token.

## Backups

- Firestore: enable **daily scheduled export** from the Firebase console
  → Firestore → Data → Import/Export. Export target is a GCS bucket
  named `gs://broast-al-bahr-backups`.
- Retain 30 daily snapshots + 12 monthly.
- Restore drill: monthly, restore one snapshot into a scratch Firebase
  project and diff the customer/order counts.

## Health checks post-deploy

Run these in order after every rules+functions deploy:

1. Open the admin, sign in as owner. All bottom tabs render.
2. Marketing → Segments → New segment → set an obvious rule → Preview
   count returns a non-zero number without error.
3. Marketing → Campaigns → New campaign → Save → status pill shows
   Draft → Activate → Issue now → summary alert lands.
4. Customer app: place a fake order for a test phone → after status
   flips to Preparing the admin printer emits both receipts, and the
   test customer sees the campaign reward in their Rewards tab.
5. Admin Stats tab shows non-empty Customer funnel + Campaign
   performance cards.
6. Firebase Console → Functions → the deployed functions are on the
   `me-west1` region and are within their memory / CPU limits.

## Growth metrics tracked (Phase 20)

Downloads-alone is not a success metric. Track the funnel end-to-end:

1. **Downloads** — from Play/App Store consoles (customer app is Astro
   web; treat "unique first visit" as the download analog).
2. **Registration** — customers/{uid} doc with `phone` and `name` set.
   Count = phones with a customer doc.
3. **First order** — customer's `totalOrders >= 1` (mirrored on the
   customer doc).
4. **Second order** — customer's `totalOrders >= 2`.
5. **Repeat customer** — `totalOrders >= 3` within 30 days.

The admin Stats tab now surfaces (3)–(5) live. (1)–(2) live in their
respective external dashboards.

Optimise for **incremental orders and repeat rate**, not gross
discounting. Every campaign has a redemption-rate and revenue tally in
its stats block — a campaign whose redemption rate stays under 10%
after two weeks is a candidate to pause.
