/**
 * 全局状态管理
 *
 * 仅保留纯客户端状态：
 * - 主题偏好（useThemeStore）
 * - Tab 标签管理（useTabStore）
 * - 书签管理（useBookmarkStore）
 *
 * 服务端状态（文件列表、提交历史、分支信息等）由 TanStack Query 管理
 * 仓库路径和分支信息从路由参数 + Query 获取，不再存入 Store
 */

import { create } from "zustand";
import {
  loadBookmarks,
  saveBookmarks,
  saveTabs,
  loadTheme,
  saveTheme,
} from "@/utils/persist";

// ===== 主题状态 =====

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (loadTheme() as Theme) || "light",
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      document.documentElement.classList.toggle("dark", next === "dark");
      saveTheme(next);
      return { theme: next };
    }),
  setTheme: (theme: Theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    saveTheme(theme);
    set({ theme });
  },
}));

// ===== Tab 状态（多仓库 Tab 管理） =====

export interface Tab {
  id: string;       // 唯一标识，使用路径
  path: string;     // 仓库路径
  name: string;     // 显示名称（文件夹名）
  branch: string;   // 当前分支
}

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (path: string, branch?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateBranch: (id: string, branch: string) => void;
}

/** 从路径中提取仓库名称 */
function repoNameFromPath(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (path: string, branch = "") => {
    const state = get();
    const id = path;

    // 如果标签已存在，直接切换
    const existing = state.tabs.find((t) => t.id === id);
    if (existing) {
      // 如果有新分支信息，更新
      if (branch && branch !== existing.branch) {
        set({
          activeTabId: id,
          tabs: state.tabs.map(t => t.id === id ? { ...t, branch } : t),
        })
      } else {
        set({ activeTabId: id })
      }
      return;
    }

    // 创建新标签
    const name = repoNameFromPath(path);
    const newTab: Tab = { id, path, name, branch };
    const newTabs = [...state.tabs, newTab];
    set({ tabs: newTabs, activeTabId: id });
  },

  closeTab: (id: string) => {
    const state = get();
    const newTabs = state.tabs.filter((t) => t.id !== id);

    if (newTabs.length === 0) {
      set({ tabs: [], activeTabId: null });
      return;
    }

    // 如果关闭的是当前标签，切换到相邻标签
    let newActiveId = state.activeTabId;
    if (state.activeTabId === id) {
      const closedIndex = state.tabs.findIndex((t) => t.id === id);
      const nextIndex = Math.min(closedIndex, newTabs.length - 1);
      newActiveId = newTabs[nextIndex].id;
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (id: string) => {
    set({ activeTabId: id });
  },

  updateBranch: (id: string, branch: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, branch } : t)),
    }));
  },
}));

// Tab 状态变化时自动持久化到 localStorage
useTabStore.subscribe((state) => {
  saveTabs(state.tabs, state.activeTabId);
});

// ===== 书签状态 =====

export interface Bookmark {
  name: string;
  path: string;
}

interface BookmarkState {
  bookmarks: Bookmark[];
  addBookmark: (name: string, path: string) => void;
  removeBookmark: (path: string) => void;
}

export const useBookmarkStore = create<BookmarkState>((set) => ({
  bookmarks: loadBookmarks(),
  addBookmark: (name, path) =>
    set((state) => {
      // 避免重复
      if (state.bookmarks.some((b) => b.path === path)) return state;
      const newBookmarks = [...state.bookmarks, { name, path }];
      saveBookmarks(newBookmarks);
      return { bookmarks: newBookmarks };
    }),
  removeBookmark: (path) =>
    set((state) => {
      const newBookmarks = state.bookmarks.filter((b) => b.path !== path);
      saveBookmarks(newBookmarks);
      return { bookmarks: newBookmarks };
    }),
}));
