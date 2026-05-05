# Virus — Autonomous Content Machine

> Generate, render, and schedule dev content for Instagram Reels, TikTok, and YouTube Shorts. Automated. Your voice. Your brand.

![pnpm](https://img.shields.io/badge/pnpm-9.0.0-orange)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)
![Supabase](https://img.shields.io/badge/Supabase-postgres-green)
![Remotion](https://img.shields.io/badge/Remotion-lambda-red)

---

## What Is This?

Virus is a solo-developer content automation system. You give it a topic (or let it run on schedule), and it handles everything from idea generation to a finished MP4 file — using your cloned voice, your brand colors, and platform-specific captions for each channel.

The whole pipeline takes 5–10 minutes per video and runs in the background while you work on something else.

**What it automates:**

1. Generates viral video ideas (Claude Sonnet 4.6 — hook + format + angle)
2. Writes a full second-by-second script (25 words/segment max)
3. Synthesizes voice narration (ElevenLabs — your cloned voice)
4. Generates word-level captions (AssemblyAI)
5. Renders a 1080×1920 MP4 (Remotion on AWS Lambda)
6. Writes platform captions for Instagram, TikTok, and Shorts
7. Saves the video ready to download and post

---

## Demo

_[Placeholder for demo GIF]_

---

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/virus.git
cd virus
pnpm install
cp .env.example .env.local
# Fill in .env.local — see docs/getting-started.md for each variable
pnpm dev
```

Navigate to `http://localhost:3000` to open the dashboard.

### Running the full pipeline locally

```bash
# Terminal 1: Next.js app + Inngest serve endpoint
pnpm dev

# Terminal 2: Inngest dev server (dashboard + local event bus)
pnpm --filter @virus/worker inngest
```

Open `http://localhost:8288` — the Inngest dashboard should show the **virus** app with 6 pipeline functions.
Test by sending `virus/idea.approved` with `{ "videoId": "test", "userId": "test" }` from the **Send event** tab.

---

## Architecture (Overview)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User (Browser)                               │
│                    Next.js Dashboard (Vercel)                       │
│   /dashboard  /ideas  /pipeline  /calendar  /performance  /lab      │
└────────────────────────────┬────────────────────────────────────────┘
                             │  HTTP + Supabase Realtime
          ┌──────────────────┼───────────────────┐
          ▼                  ▼                   ▼
   ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐
   │  Supabase   │   │   Inngest    │   │  Supabase Auth   │
   │  PostgreSQL │   │  Job Queue   │   │  + Storage       │
   │  (12 tables)│   │  (worker)    │   │  (audios/videos) │
   └─────────────┘   └──────┬───────┘   └──────────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
   ┌────────────┐  ┌──────────────┐  ┌──────────────────┐
   │  Anthropic │  │  ElevenLabs  │  │   AssemblyAI     │
   │  Claude    │  │  Voice TTS   │  │   Transcription  │
   │  (scripts) │  │  (audio)     │  │   (captions)     │
   └────────────┘  └──────────────┘  └──────────────────┘
                                             │
                                             ▼
                                   ┌──────────────────┐
                                   │  AWS Lambda      │
                                   │  Remotion Render │
                                   │  (H264 MP4)      │
                                   └──────────────────┘
```

**Pipeline states:** `pending` → `scripting` → `audio` → `captioning` → `rendering` → `captioning_text` → `ready` → `published`

---

## Monorepo Structure

```
virus/
├── apps/
│   ├── web/          — Next.js 15 dashboard + API routes
│   └── worker/       — Inngest background functions (5 pipeline steps)
├── packages/
│   ├── shared/       — Claude prompts, audio client, captions, render client, viral framework
│   ├── db/           — SQL migrations + TypeScript types
│   └── remotion/     — 6 video templates (tip, hot-take, speed-build, listicle, story, comparison)
├── .env.example
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Tech Stack

| Layer         | Technology                                    |
|---------------|-----------------------------------------------|
| Frontend      | Next.js 15 (App Router), React 19, Tailwind 4 |
| UI Components | shadcn/ui, Radix UI, Framer Motion            |
| Database      | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Job Queue     | Inngest (durable background jobs, free tier)  |
| AI            | Claude Sonnet 4.6 (ideas/scripts/captions), Claude Opus 4.7 (insights) |
| Voice         | ElevenLabs (voice cloning + TTS)              |
| Captions      | AssemblyAI (word-level timestamps)            |
| Video Render  | Remotion + AWS Lambda (H264, 1080×1920, 30fps) |
| Monorepo      | pnpm workspaces + Turborepo                   |
| Deploy        | Vercel (web), Supabase Cloud, AWS Lambda      |

---

## Estimated Monthly Cost

| Service         | Cost           |
|-----------------|----------------|
| Supabase        | $0–25          |
| Vercel          | $0 (Hobby)     |
| AWS Lambda      | ~$5–10         |
| ElevenLabs      | $22 (Creator)  |
| Anthropic       | ~$5–15         |
| AssemblyAI      | ~$2            |
| Inngest         | $0 (free tier) |
| **Total**       | **~$35–75/mo** |

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/getting-started.md](docs/getting-started.md) | Zero to first video |
| [docs/architecture-overview.md](docs/architecture-overview.md) | System design, data flow, design decisions |
| [docs/posting-workflow.md](docs/posting-workflow.md) | Daily ops guide (in Spanish) |
| [docs/runbook.md](docs/runbook.md) | Incident response playbook |
| [docs/troubleshooting.md](docs/troubleshooting.md) | FAQ for common issues |
| [docs/contributing.md](docs/contributing.md) | How to add templates, prompts, and migrations |
| [docs/deployment.md](docs/deployment.md) | Lambda + Vercel deployment setup |

---

## Key Routes

| Route | Description |
|-------|-------------|
| `/login` | Google OAuth + magic link |
| `/onboarding` | 4-step setup for new users |
| `/dashboard` | Stats, active pipeline, quick actions |
| `/dashboard/ideas` | Idea pool — generate, approve, reject |
| `/dashboard/pipeline` | Kanban showing video pipeline status |
| `/dashboard/calendar` | Schedule videos, batch generate |
| `/dashboard/performance` | Metrics input + charts + AI insights |
| `/dashboard/lab` | Hook A/B testing (Hook Lab) |
| `/dashboard/settings/voice` | Voice clone wizard |
| `/dashboard/settings/brand` | Content pillars + tone |
