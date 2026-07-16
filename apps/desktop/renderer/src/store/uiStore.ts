import { create } from "zustand";

type ThemeMode = "light" | "dark" | "system";

type UiState = {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  theme: ThemeMode;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  theme: "system",
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setTheme: (theme) => set({ theme })
}));
