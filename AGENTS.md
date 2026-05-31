<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Chess Mistakes Fixer

AI-powered chess training app that converts game mistakes into spaced repetition flashcards.

## Tech Stack

- **Next.js 16.2.3** (App Router, React 19, RSC) — treat docs in `node_modules/next/dist/docs/` as source of truth
- **Tailwind CSS v4** via `@tailwindcss/postcss` — no `tailwind.config` file; config lives in `globals.css`
- **shadcn/ui** (radix-nova style, Lucide icons) — add components via `npx shadcn@latest add <name>`
- **chess.js** + **react-chessboard** for board logic and rendering
- **GSAP** + **Motion** (Framer Motion) for animations
- **TypeScript** strict mode, path alias `@/*` → `./src/*`

## Build & Run

```sh
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # ESLint (flat config, v9+)
```

No test framework is configured yet.

## Architecture

```
src/
├── app/              # Next.js App Router pages (each route = folder/page.tsx)
│   ├── page.tsx      # Dashboard — animated stats, SRS queue
│   ├── drill/        # Practice — SRS flashcards with chessboard
│   ├── games/        # Game list + import modal (PGN/FEN)
│   ├── review/       # Move-by-move analysis, eval bar, AI coach placeholder
│   └── profile/      # Stats heatmap, mistake analytics
├── components/
│   ├── ui/           # shadcn/ui primitives (DO NOT hand-edit)
│   └── *.tsx         # App components (sidebar, import modal, etc.)
├── hooks/            # Custom React hooks
└── lib/
    ├── mock-data.ts  # Fake data + core TypeScript interfaces
    ├── chess-pieces.tsx  # Custom SVG pieces for react-chessboard
    └── utils.ts      # cn() helper (clsx + tailwind-merge)
```

## Conventions

- **All pages are client components** (`"use client"`) — no server-side data fetching yet
- **Data types** (`Game`, `Flashcard`, `MistakeType`, `CardStatus`, `SRSRating`) live in `src/lib/mock-data.ts`
- **Styling**: Tailwind utility classes + `cn()` for conditional classes. OKLCh color tokens defined in `globals.css`
- **Animations**: GSAP for number counters; Motion (`motion.div`) for entrance/layout animations
- **Component pattern**: Page files contain all page-specific logic inline; extract to `src/components/` when reused
- **Dark theme only** — no light mode toggle; wood texture background via CSS

## Branching & PRs

We use **GitHub Flow** — trunk-based, no long-lived `develop` branch.

- `main` is always deployable. No direct pushes; everything lands via PR.
- Branch names: `feat/<kebab>` (new feature), `fix/<kebab>` (bug fix), `chore/<kebab>` (tooling, deps, refactor with no behavior change), `docs/<kebab>` (docs / todo / readme only).
- One topic per branch. Short-lived — open the PR the same day if possible.
- PR title is an imperative summary (e.g. "Adopt @clerk/ui and drop UserButton MutationObserver hack").
- Squash-merge into `main` and delete the branch on merge.
- Rebase or merge `main` into a long-running branch before opening the PR to keep history linear.

### Agent checklist — read this BEFORE editing any file

If you are an AI agent (Cursor, Claude, Copilot, Codex, etc.) working in this repo, **the very first thing you do in any non-readonly task** is check what branch you're on and make sure you're not about to commit to `main`.

1. **Check the current branch.** Run `git branch --show-current` (or `git status -sb`).
2. **If the current branch is `main`** — STOP. Do not edit files yet.
   - Run `git fetch origin && git status -sb` to confirm `main` is up to date with `origin/main`. If it is behind, `git pull --ff-only` first.
   - Decide which existing branch fits the task (see "Finding an existing branch" below).
   - If none fits, create a new one: `git checkout -b <type>/<short-kebab> main` using the `feat/`, `fix/`, `chore/`, or `docs/` prefix from above.
   - Only **after** you are on a topic branch should you start editing files.
3. **If the current branch is already a topic branch** — confirm the task you're about to do matches the branch's purpose (its name + recent commits). If it doesn't match, create a separate new branch off `main` for the new task instead of piling unrelated work onto the current one.
4. **Never use `git commit` or `git push` while on `main`.** No exceptions. Even one-line typo fixes go through a branch + PR.
5. **When a task is finished**: push the branch (`git push -u origin HEAD`), open a PR with `gh pr create --base main`, and squash-merge with `gh pr merge --squash --delete-branch` once you're satisfied. Then `git checkout main && git pull`.

#### Finding an existing branch

Before creating a new branch, check whether one already exists for this work:

- `git branch -a` lists local and remote branches.
- `gh pr list --state open` lists open PRs and their branches.
- The "Roadmap branch list" below names the canonical branch for each planned todo item — use those exact names when you start that work.

If an existing branch matches your task and is not yet merged, check it out (`git checkout <name>` or `git checkout -t origin/<name>` for a remote-only branch) and continue on it rather than creating a duplicate.

#### Worked example

User asks: "Add hover tooltips to the move-rating graph."

```sh
git branch --show-current        # outputs: main → STOP, must branch first
git fetch origin
git status -sb                   # confirm clean and up-to-date
git checkout -b feat/move-graph-hover main   # canonical name from roadmap
# ... now make edits, commit, push, PR, squash-merge ...
```

### Roadmap branch list

Created on-demand when work starts (not pre-created — empty placeholder branches become stale clutter).

- **Backend / infra**: `feat/supabase-backend`, `chore/github-workflow`, `chore/vercel-deploy`
- **AI coach**: `fix/ai-coach-lines`, `fix/ai-coach-hallucinations`
- **Review & board UX**: `feat/move-graph-hover`, `feat/play-button-autoadvance`, `fix/chessboard-resize-splitscreen`, `feat/sound-effects`
- **Analysis & profile**: `feat/accuracy-elo-calibration`, `feat/user-statistics`, `feat/user-data-fields`
- **Monetization (later)**: `feat/pricing-clerk-billing`, `feat/profile-themes`

## Roadmap

See `todo.md` for the full task list. Key upcoming work:
- Supabase backend to replace `mock-data.ts`
- AI coach fixes (line rendering, move hallucination)
- Game-review polish (hover tooltips on move graph + eval bar, play-button auto-advance)
- Accuracy / estimated-ELO calibration against Chess.com
- Vercel deployment + GitHub Actions CI
