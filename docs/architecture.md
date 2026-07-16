# TT Manager Runtime Architecture

TT Manager uses one React renderer and one Go service in both development modes.

## Web Development Mode

```text
Browser -> Vite dev server -> /rpc proxy -> Go service -> SQLite
                                             -> MongoDB mirror
```

- Vite listens on `127.0.0.1:5173`.
- The Go service listens on `127.0.0.1:39111` with `x-session-token: ttmanager-dev-token`.
- The Go service stores SQLite data in `%APPDATA%\ttmanager\ttmanager.db` unless `TTMANAGER_DATA_DIR` is set.
- MongoDB mirroring uses `MONGODB_URI=mongodb://localhost:27017` and `MONGODB_DB_NAME=ttmanager`.

## Windows Desktop Mode

```text
Electron renderer -> preload API -> Electron main IPC -> Go service -> SQLite
                                                        -> MongoDB mirror
Go reminder queue -> Electron native notification adapter -> Windows notifications
```

- Electron owns window lifecycle, tray, single-instance behavior, startup, power events, and native Windows notifications.
- Electron launches the hidden Go service with a random localhost port and a fresh session token.
- Electron passes the same canonical data directory, `%APPDATA%\ttmanager`, to the Go service.
- The renderer never receives `ipcRenderer`, filesystem access, shell access, or direct database access.

## Recurring Timeline Model

Recurring periods are stored as series plus exceptions, not thousands of future rows.

- A parent period owns the recurrence rule.
- Generated occurrences use synthetic IDs like `period-id#occ#YYYYMMDDTHHMMSSZ`.
- Deleted single occurrences are stored in `recurrence_exceptions`.
- Editing a generated occurrence supports:
  - `this`: create or preserve a single occurrence exception.
  - `following`: end the old series before the selected date and create a new future series.
  - `series`: update the parent series.
- Deleting a generated occurrence supports:
  - `this`: cancel only the selected occurrence.
  - `following`: end the series before the selected occurrence.
  - `series`: delete the whole series.

This matches the Google Calendar mental model while keeping storage compact and local.
