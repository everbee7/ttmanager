import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, powerMonitor, dialog, shell, type OpenDialogOptions } from "electron";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";

type ApiRequest = { type: string; payload?: unknown };
type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
type ReminderEvent = { id: string; title: string; body: string; ownerType: string; ownerId: string; eventType: string; remindAtUtc: string };
type NotificationSettings = {
  notificationsEnabled?: boolean;
  periodNotifications?: boolean;
  taskNotifications?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
};

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let goProcess: ChildProcessWithoutNullStreams | null = null;
let apiBaseUrl = "";
let sessionToken = "";
let allowQuit = false;
let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerEnabled = true;
let notificationsPaused = false;
let notificationsPausedUntil = 0;
const alarmWindows = new Map<string, BrowserWindow>();

function traceStartup(message: string) {
  try {
    const fs = require("node:fs");
    const dir = app.isReady() ? app.getPath("userData") : path.join(process.env.APPDATA ?? process.cwd(), "ttmanager");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "startup-trace.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Startup tracing must not affect app startup.
  }
}

function logStartupError(error: unknown) {
  try {
    const message = error instanceof Error ? `${error.stack ?? error.message}` : String(error);
    require("node:fs").appendFileSync(path.join(app.getPath("userData"), "startup-error.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never become the reason startup fails.
  }
}

function logMessage(message: string) {
  try {
    require("node:fs").appendFileSync(path.join(app.getPath("userData"), "startup-error.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Ignore logging failures.
  }
}

process.on("uncaughtException", logStartupError);
process.on("unhandledRejection", logStartupError);

traceStartup("main loaded");
const gotLock = app.requestSingleInstanceLock();
traceStartup(`single instance lock: ${gotLock}`);
if (!gotLock) app.quit();

const appId = "com.local.ttmanager";
app.setAppUserModelId(appId);
app.disableHardwareAcceleration();

function createWindow(show = true) {
  traceStartup(`createWindow show=${show}`);
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 840,
    minWidth: 1100,
    minHeight: 700,
    show,
    title: "TT Manager",
    icon: appIconPath(),
    backgroundColor: "#f4f5f7",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.on("close", (event) => {
    if (!allowQuit) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    logMessage(`did-fail-load ${code} ${description} ${url}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logMessage(`render-process-gone ${JSON.stringify(details)}`);
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logMessage(`renderer-console level=${level} ${sourceId}:${line} ${message}`);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(path.join(app.getAppPath(), "apps/desktop/renderer/dist/index.html"));
  updateStateIcons();
}

function createTray() {
  traceStartup("createTray");
  tray = new Tray(trayImageForState());
  tray.setToolTip("TT Manager");
  createTrayMenu();
  tray.on("double-click", showMainWindow);
  updateStateIcons();
}

function appIconPath() {
  return path.join(app.getAppPath(), "resources", "icons", "icon.ico");
}

function trayIconPath() {
  return path.join(app.getAppPath(), "resources", "icons", "icon.png");
}

function createTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open", click: () => showMainWindow() },
    { label: notificationsPaused ? "Unmute alerts" : "Mute alerts", click: () => { notificationsPaused = !notificationsPaused; notificationsPausedUntil = 0; createTrayMenu(); updateStateIcons(); } },
    { type: "separator" },
    { label: "Quit", click: () => quitApp() }
  ]));
  updateStateIcons();
}

function updateStateIcons() {
  tray?.setImage(trayImageForState());
  tray?.setToolTip(notificationsPaused ? "TT Manager - alerts muted" : "TT Manager");
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setOverlayIcon(notificationsPaused ? mutedOverlayIcon() : null, notificationsPaused ? "Alerts muted" : "");
}

function trayImageForState() {
  if (!notificationsPaused) return nativeImage.createFromPath(trayIconPath());
  return mutedTrayIcon();
}

function mutedTrayIcon() {
  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#374151"/>
  <rect x="7" y="7" width="18" height="18" rx="5" fill="#111827"/>
  <path d="M10 16h12" stroke="#9ca3af" stroke-width="3" stroke-linecap="round"/>
  <path d="M12 11h8v3h-8zM12 18h8v3h-8z" fill="#9ca3af"/>
</svg>`)}`);
}

function mutedOverlayIcon() {
  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="15" fill="#6b7280"/>
  <path d="M9 16h14" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
</svg>`)}`);
}

function showMainWindow() {
  if (!mainWindow) createWindow(true);
  mainWindow?.show();
  mainWindow?.focus();
  updateStateIcons();
}

function serviceExePath() {
  if (process.env.VITE_DEV_SERVER_URL) return "go";
  return path.join(process.resourcesPath, "bin", "ttmanager-service.exe");
}

function serviceDataDir() {
  if (process.env.TTMANAGER_DATA_DIR) return process.env.TTMANAGER_DATA_DIR;
  const appData = process.env.APPDATA;
  if (appData) return path.join(appData, "ttmanager");
  return path.join(app.getPath("appData"), "ttmanager");
}

function startGoService() {
  traceStartup("startGoService");
  sessionToken = crypto.randomBytes(32).toString("hex");
  const port = 39000 + crypto.randomInt(2000);
  apiBaseUrl = `http://127.0.0.1:${port}`;
  const args = process.env.VITE_DEV_SERVER_URL
    ? ["run", "./core/cmd/ttmanager-service", `--port=${port}`, `--token=${sessionToken}`]
    : [`--port=${port}`, `--token=${sessionToken}`];
  goProcess = spawn(serviceExePath(), args, {
    cwd: process.env.VITE_DEV_SERVER_URL ? app.getAppPath() : undefined,
    windowsHide: true,
    env: {
      ...process.env,
      TTMANAGER_DATA_DIR: serviceDataDir(),
      MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://localhost:27017",
      MONGODB_DB_NAME: process.env.MONGODB_DB_NAME ?? "ttmanager"
    }
  });
  goProcess.on("error", logStartupError);
  goProcess.on("exit", () => {
    goProcess = null;
    if (!allowQuit) setTimeout(startGoService, 1500);
  });
}

function requestBackend<T>(request: ApiRequest): Promise<ApiResponse<T>> {
  return new Promise((resolve) => {
    const body = JSON.stringify(request);
    const req = http.request(`${apiBaseUrl}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-session-token": sessionToken
      },
      timeout: 5000
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
    });
    req.on("error", (error) => resolve({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: error.message } }));
    req.write(body);
    req.end();
  });
}

async function pollReminders() {
  if (notificationsPausedUntil && Date.now() > notificationsPausedUntil) {
    notificationsPaused = false;
    notificationsPausedUntil = 0;
    createTrayMenu();
  }
  if (!schedulerEnabled || notificationsPaused) return;
  const settingsResponse = await requestBackend<{ settings?: NotificationSettings }>({ type: "snapshot" });
  const settings = settingsResponse.ok ? settingsResponse.data.settings : undefined;
  if (!shouldPollNotifications(settings)) return;
  const response = await requestBackend<ReminderEvent[]>({ type: "reminders.due" });
  if (!response.ok) return;
  for (const event of response.data) {
    if (!shouldShowReminderType(event, settings)) continue;
    showAlarm(event);
  }
}

function showAlarm(event: ReminderEvent) {
  const existing = alarmWindows.get(event.id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    existing.flashFrame(true);
    shell.beep();
    return;
  }

  const alarm = new BrowserWindow({
    width: 540,
    height: 500,
    resizable: false,
    frame: false,
    maximizable: false,
    minimizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    title: "TT Manager Alarm",
    icon: appIconPath(),
    backgroundColor: "#0b0d16",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  alarmWindows.set(event.id, alarm);
  alarm.setMenu(null);
  alarm.on("close", (closeEvent) => {
    if (allowQuit) return;
    if (alarmWindows.get(event.id) === alarm) {
      closeEvent.preventDefault();
      alarm.show();
      alarm.focus();
      alarm.flashFrame(true);
    }
  });
  alarm.on("closed", () => {
    if (alarmWindows.get(event.id) === alarm) alarmWindows.delete(event.id);
  });
  alarm.webContents.on("will-navigate", (navigateEvent, url) => {
    if (!url.startsWith("ttmanager-alarm://")) return;
    navigateEvent.preventDefault();
    void handleAlarmAction(event, url);
  });
  void alarm.loadURL(alarmHtmlURL(event)).then(() => {
    alarm.show();
    alarm.focus();
    alarm.flashFrame(true);
    shell.beep();
  });
}

function focusAlarm(id: string) {
  const alarm = alarmWindows.get(id);
  if (!alarm || alarm.isDestroyed()) return;
  alarm.show();
  alarm.focus();
  alarm.flashFrame(true);
  shell.beep();
}

async function handleAlarmAction(event: ReminderEvent, url: string) {
  const action = new URL(url).hostname;
  if (action === "open") {
    openReminder(event);
    focusAlarm(event.id);
    return;
  }
  if (action === "snooze") {
    await requestBackend({ type: "reminders.snooze", payload: { id: event.id, minutes: 10 } });
    closeAlarm(event.id);
    return;
  }
  if (action === "ack") {
    await requestBackend({ type: "reminders.sent", payload: { id: event.id } });
    closeAlarm(event.id);
  }
}

function closeAlarm(id: string) {
  const alarm = alarmWindows.get(id);
  alarmWindows.delete(id);
  if (alarm && !alarm.isDestroyed()) {
    alarm.removeAllListeners("close");
    alarm.close();
  }
}

function alarmHtmlURL(event: ReminderEvent) {
  const title = escapeHtml(event.title || "TT Manager alarm");
  const body = escapeHtml(event.body || "A scheduled reminder is due.");
  const kind = event.ownerType === "period" ? "Time period started" : "Task reminder";
  const due = new Date(event.remindAtUtc);
  const dueText = Number.isNaN(due.getTime()) ? "" : due.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>TT Manager Alarm</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: "Segoe UI Variable", "Segoe UI", sans-serif;
      color: #f8fafc;
      background: radial-gradient(circle at top left, rgba(255, 153, 0, .22), transparent 34%), #0b0d16;
      display: grid;
      place-items: center;
    }
    .card {
      width: calc(100% - 28px);
      height: calc(100% - 28px);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 16px;
      background: linear-gradient(180deg, rgba(28,32,48,.96), rgba(12,14,24,.98));
      box-shadow: 0 24px 80px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.08);
      padding: 22px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .top { display: flex; align-items: center; gap: 12px; -webkit-app-region: drag; }
    .mark {
      width: 42px; height: 42px; border-radius: 13px;
      background: linear-gradient(135deg, #ffb000, #ff6b00);
      display: grid; place-items: center; color: #111827; font-weight: 900; font-size: 22px;
      box-shadow: 0 12px 30px rgba(255, 136, 0, .28);
    }
    .eyebrow { color: #facc15; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    h1 {
      margin: 16px 0 0;
      font-size: 23px;
      line-height: 1.22;
      letter-spacing: 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .body {
      margin-top: 12px;
      padding: 14px;
      border: 1px solid rgba(148,163,184,.18);
      border-radius: 14px;
      background: rgba(2,6,23,.42);
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.5;
      height: 112px;
      overflow: hidden;
      white-space: pre-wrap;
      display: -webkit-box;
      -webkit-line-clamp: 5;
      -webkit-box-orient: vertical;
    }
    .meta { margin-top: 12px; display: flex; justify-content: space-between; gap: 10px; color: #94a3b8; font-size: 12px; }
    .actions { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    button {
      border: 0;
      border-radius: 12px;
      min-height: 44px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
      -webkit-app-region: no-drag;
    }
    .primary { grid-column: 1 / -1; background: linear-gradient(135deg, #ffb000, #ff8700); color: #111827; min-height: 50px; }
    .secondary { background: rgba(148,163,184,.12); color: #e2e8f0; border: 1px solid rgba(148,163,184,.2); }
    .danger { background: rgba(239,68,68,.16); color: #fecaca; border: 1px solid rgba(239,68,68,.28); }
    button:focus { outline: 2px solid #facc15; outline-offset: 2px; }
  </style>
</head>
<body>
  <main class="card">
    <div class="top">
      <div class="mark">!</div>
      <div>
        <div class="eyebrow">TT Manager Alarm</div>
        <div style="color:#94a3b8;font-size:13px;margin-top:2px;">${escapeHtml(kind)}</div>
      </div>
    </div>
    <h1>${title}</h1>
    <div class="body">${body}</div>
    <div class="meta"><span>${escapeHtml(dueText)}</span><span>Waiting for confirmation</span></div>
    <div class="actions">
      <button class="primary" onclick="location.href='ttmanager-alarm://ack'">Ah got it</button>
      <button class="secondary" onclick="location.href='ttmanager-alarm://open'">Open in app</button>
      <button class="danger" onclick="location.href='ttmanager-alarm://snooze'">Snooze 10 min</button>
    </div>
  </main>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function shouldPollNotifications(settings?: NotificationSettings) {
  if (settings?.notificationsEnabled === false) return false;
  if (settings?.quietHoursEnabled && isInsideQuietHours(settings.quietHoursStart ?? "22:00", settings.quietHoursEnd ?? "07:00")) return false;
  return true;
}

function shouldShowReminderType(event: ReminderEvent, settings?: NotificationSettings) {
  if (event.ownerType === "period" && settings?.periodNotifications === false) return false;
  if (event.ownerType === "task" && settings?.taskNotifications === false) return false;
  return true;
}

function isInsideQuietHours(start: string, end: string) {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseClockMinutes(start);
  const endMinutes = parseClockMinutes(end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) return current >= startMinutes && current < endMinutes;
  return current >= startMinutes || current < endMinutes;
}

function parseClockMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function openReminder(event: ReminderEvent) {
  const target = event.ownerType === "period" ? "/timeline" : "/tasks";
  showMainWindow();
  mainWindow?.webContents.send("app:navigate", target);
}

function startScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => void pollReminders(), 30_000);
  setTimeout(() => void pollReminders(), 3_000);
}

async function applyStartupSetting() {
  const response = await requestBackend<{ settings?: { startWithWindows?: boolean } } | any>({ type: "snapshot" });
  if (response.ok) {
    const startWithWindows = Boolean(response.data.settings?.startWithWindows);
    app.setLoginItemSettings({ openAtLogin: startWithWindows, path: process.execPath, args: ["--hidden"] });
  }
}

function quitApp() {
  allowQuit = true;
  goProcess?.kill();
  app.quit();
}

ipcMain.handle("api:request", (_event, request: ApiRequest) => requestBackend(request));
ipcMain.handle("dialog:chooseRestoreFile", async () => {
  const options: OpenDialogOptions = {
    title: "Restore TT Manager backup",
    filters: [{ name: "TT Manager backup", extensions: ["json", "db"] }],
    properties: ["openFile"]
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:close", () => mainWindow?.hide());

app.on("second-instance", showMainWindow);
app.on("before-quit", () => { allowQuit = true; });
powerMonitor.on("resume", () => {
  void pollReminders();
});

void app.whenReady().then(() => {
  traceStartup("whenReady");
  startGoService();
  createTray();
  createWindow(!process.argv.includes("--hidden"));
  startScheduler();
  void applyStartupSetting();
  traceStartup("startup complete");
});
