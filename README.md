# Heap Snapshot Viewer

A browser-based tool for analyzing Node.js / Chrome `.heapsnapshot` files. Drop a snapshot to explore memory usage with DevTools-style views: summary tables, treemap, top objects, search, and retainer paths.

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`), then drag and drop a `.heapsnapshot` file onto the page.

## Features

- **Summary** — Sortable table of constructors with count, shallow size, retained size, and distance from GC roots
- **Treemap** — Visual breakdown of retained memory by constructor (top 40 + Other)
- **Top Objects** — Largest individual objects by shallow size
- **Search** — Find objects by name or `@nodeId`
- **Inspector** — Object details and retainer path from GC roots (weak edges skipped)

## Scripts

| Command         | Description                    |
|-----------------|--------------------------------|
| `npm run dev`   | Start dev server               |
| `npm run build` | Build static site to `dist/`   |
| `npm run preview` | Preview production build   |

## How to capture a snapshot

**Node.js:**

```bash
node --heapsnapshot-near-heap-limit=3 -e "require('v8').writeHeapSnapshot()"
```

Or programmatically:

```js
import { writeHeapSnapshot } from 'node:v8'
writeHeapSnapshot()
```

**Chrome DevTools:** Memory tab → Take snapshot → Save (exports `.heapsnapshot`)

## Tech stack

- [Vite](https://vitejs.dev/) — dev server and bundling
- [heap-snapshot-toolkit](https://www.npmjs.com/package/heap-snapshot-toolkit) — V8 heap snapshot parsing
- Vanilla JS — no React/Vue; Web Worker for parsing
