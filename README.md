# Broast Albahr · بروست البحر

A bilingual (Arabic / English, RTL-first) online ordering app for the Broast
Albahr restaurant in Makkah — broast, seafood, burgers & more, with pickup /
GPS delivery, coupons, live Firebase menu, an admin panel, printable invoices
and a WhatsApp checkout hand-off.

Rebuilt as a modern **Astro + React + Tailwind CSS + Framer Motion** single-page
app with a full animation system (animated splash, staggered menu cards,
page/step transitions, bottom sheets, side drawer, confetti success, etc.).

## Tech stack

| Layer      | Choice                                   |
| ---------- | ---------------------------------------- |
| Framework  | [Astro](https://astro.build) (static)    |
| UI         | React 18 (islands, `client:load`)        |
| Styling    | Tailwind CSS 3 + a custom brand theme    |
| Motion     | Framer Motion                            |
| Data       | Firebase Firestore (live menu / orders)  |

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
```

## Build & deploy

```bash
npm run build    # → ./dist  (static site)
npm run preview  # preview the production build locally
```

The output in `dist/` is a plain static site — deploy it on **Vercel**,
**Netlify**, **Cloudflare Pages**, **GitHub Pages**, or any static host.
On Vercel/Netlify, point the project at this repo; the framework preset is
detected automatically (build command `npm run build`, output dir `dist`).

## Project structure

```
src/
  pages/index.astro       # HTML shell, mounts <App/>
  styles/global.css       # Tailwind + ambient background + component utilities
  components/
    App.tsx               # step machine, header, admin & drawer orchestration
    Splash.tsx            # animated splash screen
    StepBar.tsx           # verify → menu → checkout progress
    VerifyStep.tsx        # name/phone + demo OTP
    MenuStep.tsx          # categories, cards, cart, floating cart bar
    VariantSheet.tsx      # spicy / cheese / pepper bottom sheet
    CheckoutStep.tsx      # order type, branch, GPS delivery, payment, coupon
    OrderSuccess.tsx      # confetti + invoice
    Invoice.tsx           # on-screen + printable receipt (15% VAT)
    HistoryDrawer.tsx     # past orders + AI chat
    AiChat.tsx            # restaurant assistant
    AdminPanel.tsx        # price / availability editor (AdminLogin + AdminPanel)
    motion.ts             # shared Framer Motion variants
  lib/
    data.ts               # menu, branches, coupons, delivery zones, config
    utils.ts              # distance, delivery fee, platform fee, VAT, WhatsApp msg
    fb.ts                 # Firebase integration (fully guarded / offline-safe)
    logo.ts               # base64 brand logo
```

## Notes

- Admin password and branch/coupon config live in `src/lib/data.ts`.
- Firebase keys are client-side (safe to ship); all Firestore calls are guarded
  so the app works even when Firestore is unreachable.
- The previous single-file version is preserved at `legacy/index.html`.
