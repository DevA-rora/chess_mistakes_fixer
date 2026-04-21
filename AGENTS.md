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

## Roadmap

See `todo.md` for the full task list. Key upcoming work:
- Chess.com / Lichess API integration for game syncing
- Stockfish engine integration for position analysis
- Gemini API for AI coach explanations
- Real database to replace `mock-data.ts`
