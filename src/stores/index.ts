/**
 * 主题状态管理
 */
import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "light",
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      document.documentElement.classList.toggle("dark", next === "dark");
      return { theme: next };
    }),
  setTheme: (theme: Theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    set({ theme });
  },
}));

/**
 * 仓库状态管理
 */
interface RepoState {
  isOpen: boolean;
  currentPath: string | null;
  setRepo: (path: string) => void;
  closeRepo: () => void;
}

export const useRepoStore = create<RepoState>((set) => ({
  isOpen: false,
  currentPath: null,
  setRepo: (path: string) => set({ isOpen: true, currentPath: path }),
  closeRepo: () => set({ isOpen: false, currentPath: null }),
}));