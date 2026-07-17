import { Outlet, NavLink } from "react-router-dom";
import { CalendarDays, CheckSquare, Clock3, History, LayoutDashboard, Menu, PieChart, Settings, Search, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { getSnapshot } from "@/lib/api";
import { useUiStore } from "@/store/uiStore";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/CommandPalette";

const nav = [
  { to: "/", label: "Today", icon: LayoutDashboard },
  { to: "/timeline", label: "Timeline", icon: Clock3 },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/history", label: "History", icon: History },
  { to: "/reports", label: "Reports", icon: PieChart },
  { to: "/settings", label: "Settings", icon: Settings }
];

export function AppShell() {
  const navigate = useNavigate();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const commandPaletteOpen = useUiStore((state) => state.commandPaletteOpen);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const { data } = useQuery({ queryKey: ["snapshot"], queryFn: getSnapshot, refetchInterval: 30_000 });
  const activeMutations = useIsMutating();
  const [showActivity, setShowActivity] = useState(false);
  const loadingLabel = !data ? "Loading schedule..." : activeMutations > 0 ? "Saving changes..." : "";
  useEffect(() => {
    if (!loadingLabel) {
      setShowActivity(false);
      return;
    }
    const timer = window.setTimeout(() => setShowActivity(true), 180);
    return () => window.clearTimeout(timer);
  }, [loadingLabel]);
  useEffect(() => {
    const theme = data?.settings.theme ?? "dark";
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && prefersDark));
  }, [data?.settings.theme]);
  useEffect(() => {
    const unsubscribeNavigate = window.tt?.onNavigate?.((path) => navigate(path)) ?? (() => undefined);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (event.ctrlKey && event.key === "1") navigate("/");
      if (event.ctrlKey && event.key === "2") navigate("/timeline");
      if (event.ctrlKey && event.key === "3") navigate("/tasks");
      if (event.key === "Escape") setCommandPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribeNavigate();
    };
  }, [navigate, setCommandPaletteOpen]);
  return (
    <div className="flex h-full overflow-hidden bg-surface text-ink">
      <motion.aside animate={{ width: collapsed ? 72 : 232 }} transition={{ duration: 0.16 }} className="border-r border-line bg-panel/95 px-3 py-3 shadow-panel">
        <div className={`mb-5 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && (
            <div className="flex min-w-0 items-center gap-2">
              <img src="logo.svg" alt="" className="h-8 w-8 shrink-0" />
              <div className="truncate text-[15px] font-semibold tracking-normal">TT Manager</div>
            </div>
          )}
          <button className="focus-ring rounded-[10px] p-2 hover:bg-surface" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">
            <Menu size={18} />
          </button>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `focus-ring flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14px] transition ${isActive ? "bg-accent text-white shadow-sm shadow-orange-950/40" : "text-muted hover:bg-surface hover:text-ink"}`}>
              <item.icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </motion.aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-line bg-panel/90 px-5">
          <button className="focus-ring flex items-center gap-2 rounded-[12px] border border-line bg-surface px-3 py-2 text-left text-muted hover:border-accent hover:text-ink" onClick={() => setCommandPaletteOpen(true)}>
            <Search size={16} />
            <span className="w-72 text-[13px]">Search tasks, periods, tags, and notes</span>
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px]">Ctrl K</kbd>
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-muted">{data?.settings.defaultTimezone ?? "America/Denver"}</span>
            <button className="focus-ring inline-flex items-center gap-2 rounded-[12px] bg-accent px-3 py-2 font-semibold text-surface hover:opacity-90" onClick={() => navigate("/timeline?add=period")}>
              <Plus size={16} /> Add
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
        <footer className="flex h-8 items-center justify-between border-t border-line bg-panel px-5 text-[12px] text-muted">
          <span>Scheduler active</span>
          <span>{data ? `${data.tasks.filter((t) => t.status !== "completed").length} open tasks` : "Connecting to local service"}</span>
        </footer>
      </div>
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
      {showActivity && loadingLabel && <AppActivityOverlay label={loadingLabel} />}
    </div>
  );
}

function AppActivityOverlay({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/25 backdrop-blur-[2px]">
      <div className="flex min-w-72 items-center gap-3 rounded-[14px] border border-line bg-panel/95 px-5 py-4 shadow-panel">
        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <div>
          <div className="text-[14px] font-semibold">{label}</div>
          <div className="mt-0.5 text-[12px] text-muted">Working locally on this computer.</div>
        </div>
      </div>
    </div>
  );
}
