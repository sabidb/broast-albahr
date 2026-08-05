# Broast Albahr customer app — Agent instructions

## Architecture

This is an Astro + React + Tailwind + Framer Motion app.

- Entry: `src/pages/index.astro` mounts `src/components/App.tsx` with `client:load`.
- All screens live in `src/components/`. Shared data + Firebase in `src/lib/`.
- Global styling: `src/styles/global.css` + `tailwind.config.mjs` (light-cream `#FFF6EA` theme, red `#E10600` accent).
- Old single-file dark-theme app is preserved at `legacy/index.html` for reference only — never edit or re-deploy it.

Build: `npm install && npm run build` → static output in `dist/`. Vercel auto-detects Astro.

## App version

`export const APP_VERSION` in `src/lib/utils.ts` is the single source of truth for the visible customer-app version. Render it as a tiny `v<x.y.z>` stamp somewhere on the app root (Splash, header, or footer).

### Auto-bump policy — do this on every commit that changes any file under `src/`

Before committing any code change under `src/`, bump `APP_VERSION` in place. Follow semver:

- **patch** (`x.y.Z`) — every non-trivial fix, small tweak, copy change, wiring update. Default.
- **minor** (`x.Y.0`) — a new customer-facing feature (new screen, new interaction, new tab).
- **major** (`X.0.0`) — breaking change to the Firestore schema or a redesigned flow.

Never skip the bump. Never batch — one commit that changes `src/` = one version bump. Do not require the user to remind you.

Docs-only commits (README, CLAUDE.md, comments-only) do not bump the version.

Current baseline established: `3.0.0` (Astro rebuild with light-cream theme).

## Branching

Work on `claude/list-projects-se6li4` unless the user tells you otherwise. When the user asks to push to `main`, do a fast-forward merge from the feature branch and push `main` — Vercel auto-deploys `main` to production.
