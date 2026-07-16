# TT Manager

Windows-only desktop time planner and task manager built with Electron, React, TypeScript, Vite, Go, SQLite, Electron Builder, Zustand, TanStack Query, Tailwind CSS, Radix primitives, Framer Motion, and date-fns.

## Runtime Flow

The same React renderer is used in both browser development mode and the packaged Windows app. The Go service owns data, recurrence, reminders, import/export, and validation.

- Web development: browser -> Vite `127.0.0.1:5173` -> `/rpc` proxy -> Go service `127.0.0.1:39111`.
- Desktop: Electron renderer -> strict preload API -> Electron main IPC -> hidden Go service on a random localhost port.
- Both modes use `%APPDATA%\ttmanager\ttmanager.db` by default.
- MongoDB mirroring uses `MONGODB_URI=mongodb://localhost:27017` and `MONGODB_DB_NAME=ttmanager`.
- Electron owns the Windows tray and native notifications, while the Go service owns reminder scheduling and missed-reminder state.

See [docs/architecture.md](docs/architecture.md) for the detailed service structure and recurring timeline model.

## Current Features

This repository contains:

- Secure Electron main/preload setup with `nodeIntegration: false`, `contextIsolation: true`, and sandboxed renderer.
- Single-instance desktop lifecycle.
- Tray menu and close-to-tray behavior.
- Electron-managed Go service startup with a random localhost port and session token.
- SQLite schema migrations and local transactional storage foundation.
- Typed request/response contract shared with the renderer.
- React shell with collapsible sidebar, command bar, status area, Today, Timeline, Tasks, and placeholder secondary sections.
- Zustand UI state, TanStack Query async data, Zod response validation, Tailwind design tokens, Radix context menu, Framer Motion transitions.
- Go tests for task CRUD, completion, invalid period validation, and midnight-crossing periods.

## Development

Install dependencies once:

```powershell
npm install --no-audit --no-fund --ignore-scripts
```

Run the web development UI with the Go service:

```powershell
$env:MONGODB_URI="mongodb://localhost:27017"
$env:MONGODB_DB_NAME="ttmanager"
go -C core run ./cmd/ttmanager-service --port=39111 --token=ttmanager-dev-token
npm run dev:renderer
```

Open `http://127.0.0.1:5173`.

Run the Windows desktop shell:

```powershell
npm run dev
```

Electron launches the Go service itself and passes a generated session token. The renderer never talks to SQLite or system APIs directly.

## Verification

```powershell
npm run typecheck
npm run build
go -C core test ./...
```

## Packaging

```powershell
npm run dist
```

The installer configuration is present through Electron Builder. A production-quality Windows `.ico` should be added at `resources/icons/icon.ico` before final installer packaging.

## Data

The Go service stores data in `%APPDATA%\ttmanager\ttmanager.db` by default. Demo seed data is gated behind `TTMANAGER_DEMO_DATA=1`.
