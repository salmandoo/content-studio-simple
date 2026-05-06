# Content Studio

One brief, four channels. Claude-powered content generation in seconds.

## What it does

Type one sentence (or paste a paragraph). Pick the channels. Click **Generate**. Claude writes platform-native content for LinkedIn, Instagram, Facebook, and Blog in parallel — long-form posts, carousel slides, short captions, and full Markdown articles. Approve, reject, or send back for review. Done.

No accounts. No database. No background workers. Just the brief in, the content out.

## Architecture

- **Frontend** — single Next.js client page at `/`, three states (`compose` → `generating` → `approve` → `published`). Apple-style UI, Tailwind v4, light theme.
- **Backend** — single API route `/api/generate` that takes `{prompt, channels}`, calls Claude per channel in parallel, returns the array of pieces synchronously.
- **Models** — Claude Opus 4.7 for long-form (LinkedIn, Instagram, Blog), Haiku 4.5 for short copy (Facebook). System prompt cached across calls.

## Run locally

```sh
npm install
cp .env.example .env.local        # add your ANTHROPIC_API_KEY
npm run dev                       # → http://localhost:3000
```

## Deploy

Push to a GitHub repo, then `npx vercel` — set `ANTHROPIC_API_KEY` in the Vercel project settings.

## Files

```
app/
  page.tsx          ← the entire wizard (one client component)
  layout.tsx        ← root layout
  globals.css       ← Apple design tokens + Tailwind v4
  api/generate/
    route.ts        ← POST handler: brief → 4 parallel Claude calls → JSON
lib/
  cn.ts             ← className helper
```
