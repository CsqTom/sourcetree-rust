/**
 * 持久化工具 - localStorage 封装
 *
 * 用于自动保存书签、所有打开的 Tabs 等状态
 */

import type { Bookmark, Tab } from "@/stores";

// ===== 存储键名 =====

const KEYS = {
  BOOKMARKS: "sourcetree_bookmarks",
  TABS: "sourcetree_tabs",
  ACTIVE_TAB: "sourcetree_active_tab",
  THEME: "sourcetree_theme",
  UI_FONT: "sourcetree_ui_font",
  TERMINAL_FONT: "sourcetree_terminal_font",
} as const;

// ===== 书签持久化 =====

/** 保存书签到 localStorage */
export function saveBookmarks(bookmarks: Bookmark[]): void {
  try {
    localStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(bookmarks));
  } catch (e) {
    console.warn("保存书签失败:", e);
  }
}

/** 从 localStorage 加载书签 */
export function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(KEYS.BOOKMARKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b: any) => typeof b?.name === "string" && typeof b?.path === "string"
    );
  } catch {
    return [];
  }
}

// ===== Tab 多仓库持久化 =====

/** 保存所有打开的标签页 */
export function saveTabs(tabs: Tab[], activeTabId: string | null): void {
  try {
    // 只保存路径和分支信息（name/id 可从路径推导）
    const data = tabs.map((t) => ({ path: t.path, branch: t.branch }));
    localStorage.setItem(KEYS.TABS, JSON.stringify(data));
    if (activeTabId) {
      localStorage.setItem(KEYS.ACTIVE_TAB, activeTabId);
    } else {
      localStorage.removeItem(KEYS.ACTIVE_TAB);
    }
  } catch (e) {
    console.warn("保存标签页失败:", e);
  }
}

/** 加载所有标签页（路径+分支） */
export function loadTabs(): {
  tabs: { path: string; branch: string }[];
  activeTabId: string | null;
} {
  try {
    const raw = localStorage.getItem(KEYS.TABS);
    const tabs: { path: string; branch: string }[] = raw
      ? (JSON.parse(raw) as { path: string; branch: string }[]).filter(
          (t) => typeof t?.path === "string"
        )
      : [];
    const activeTabId = localStorage.getItem(KEYS.ACTIVE_TAB) ?? null;
    return { tabs, activeTabId };
  } catch {
    return { tabs: [], activeTabId: null };
  }
}

// ===== 主题持久化 =====

/** 保存主题偏好 */
export function saveTheme(theme: string): void {
  try {
    localStorage.setItem(KEYS.THEME, theme);
  } catch (e) {
    console.warn("保存主题失败:", e);
  }
}

/** 加载主题偏好 */
export function loadTheme(): string | null {
  try {
    return localStorage.getItem(KEYS.THEME);
  } catch {
    return null;
  }
}

// ===== 字体持久化 =====

/** 保存界面字体 */
export function saveUiFont(font: string): void {
  try {
    localStorage.setItem(KEYS.UI_FONT, font);
  } catch (e) {
    console.warn("保存界面字体失败:", e);
  }
}

/** 加载界面字体 */
export function loadUiFont(): string | null {
  try {
    return localStorage.getItem(KEYS.UI_FONT);
  } catch {
    return null;
  }
}

// ===== 终端字体持久化 =====

/** 保存终端字体 */
export function saveTerminalFont(font: string): void {
  try {
    localStorage.setItem(KEYS.TERMINAL_FONT, font);
  } catch (e) {
    console.warn("保存终端字体失败:", e);
  }
}

/** 加载终端字体 */
export function loadTerminalFont(): string | null {
  try {
    return localStorage.getItem(KEYS.TERMINAL_FONT);
  } catch {
    return null;
  }
}