# Broast Albahr customer app — Agent instructions

## App version

`const APP_VERSION` near the top of `index.html` is the single source of truth for the visible customer-app version. It renders as a tiny `v<x.y.z>` stamp at the bottom of the app root.

### Auto-bump policy — do this on every commit that changes `index.html`

Before committing any code change to `index.html`, bump `APP_VERSION` in place. Follow semver:

- **patch** (`x.y.Z`) — every non-trivial fix, small tweak, copy change, wiring update. Default.
- **minor** (`x.Y.0`) — a new customer-facing feature (new step, new section, new interaction).
- **major** (`X.0.0`) — breaking change to the Firestore schema or a redesigned flow.

Never skip the bump. Never batch — one commit that changes `index.html` = one version bump. Do not require the user to remind you.

Docs-only commits (README, CLAUDE.md, comments-only) do not bump the version.

Current baseline established: `2.1.0`.

## Branching

Work on `claude/printing-customer-data-sync-e4obsw` unless the user tells you otherwise. When the user asks to push to `main`, do a fast-forward merge from the feature branch and push `main`.
