/**
 * 应用主入口
 *
 * Tab 栏 + 内容区域布局，支持多仓库切换
 * 启动时自动恢复所有上次打开的仓库
 */

import { useEffect, useState, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { greet, getBackendInfo, validateRepoPath, openRepo, getCurrentBranch } from "@/services/git";
import { useThemeStore, useRepoStore, useTabStore, useBookmarkStore } from "@/stores";
import { loadTabs } from "@/utils/persist";
import WelcomePage from "@/components/welcome/WelcomePage";
import RepositoryPage from "@/components/repo/RepositoryPage";

/** 从路径中提取仓库名称 */
function repoNameFromPath(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

/** Tab 标签组件 */
function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabStore();

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center border-b border-border bg-muted/20 px-2 gap-0">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              group flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer
              border-r border-border select-none
              transition-colors
              ${isActive
                ? "bg-background text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
              }
            `}
          >
            {/* 仓库图标 */}
            <svg
              className="w-3.5 h-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className="truncate max-w-[120px]">{tab.name}</span>
            {/* 分支名 */}
            {tab.branch && (
              <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                {tab.branch}
              </span>
            )}
            {/* 关闭按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-1 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition-opacity"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const { theme, toggleTheme } = useThemeStore();
  const { currentPath } = useRepoStore();
  const { tabs, activeTabId, openTab, setActiveTab } = useTabStore();
  const { addBookmark } = useBookmarkStore();
  const [backendMsg, setBackendMsg] = useState("正在连接后端…");
  const [backendInfo, setBackendInfo] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreErrors, setRestoreErrors] = useState<string[]>([]);
  const restoringRef = useRef(false);

  // 初始化：测试 IPC 通信 + 自动恢复所有仓库
  useEffect(() => {
    if (restoringRef.current) return;
    restoringRef.current = true;

    greet("SourceTree")
      .then((msg) => setBackendMsg(msg))
      .catch(() => setBackendMsg("后端未连接（开发前端时正常）"));

    getBackendInfo()
      .then((info) => setBackendInfo(info.status))
      .catch(() => {});

    // 批量恢复所有上次打开的仓库
    (async () => {
      try {
        const { tabs: savedTabs, activeTabId: savedActiveId } = loadTabs();
        if (savedTabs.length === 0) {
          setIsRestoring(false);
          return;
        }

        // 并行验证所有路径
        const results = await Promise.all(
          savedTabs.map(async (st) => {
            const result = await validateRepoPath(st.path);
            return { ...st, valid: result.valid, error: result.error };
          })
        );

        // 过滤出有效的仓库
        const validRepos = results.filter((r) => r.valid);
        const errors: string[] = results
          .filter((r) => !r.valid)
          .map((r) => `「${r.path}」不可用: ${r.error}`);

        setRestoreErrors(errors);

        if (validRepos.length === 0) {
          setIsRestoring(false);
          return;
        }

        // 确定激活哪个 tab
        const activeExists = validRepos.some((r) => r.path === savedActiveId);
        const activePath = activeExists
          ? savedActiveId
          : validRepos[0].path;

        // 逐个打开有效的仓库
        for (const repo of validRepos) {
          try {
            await openRepo(repo.path);
            // 如果保存时有分支信息，直接使用；否则获取当前分支
            let branch = repo.branch;
            if (!branch) {
              branch = await getCurrentBranch(repo.path);
            }
            openTab(repo.path, branch);
          } catch (e: any) {
            setRestoreErrors((prev) => [
              ...prev,
              `「${repo.path}」打开失败: ${e}`,
            ]);
          }
        }

        // 激活指定的 tab
        if (activeExists) {
          setActiveTab(activePath!);
        }
      } catch (e: any) {
        console.warn("自动恢复仓库失败:", e);
      } finally {
        setIsRestoring(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** 打开原生文件夹对话框，选择仓库 */
  const handleAddRepo = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择要打开的 Git 仓库",
      });
      if (!selected) return;

      // 验证并打开
      const result = await validateRepoPath(selected);
      if (!result.valid) {
        setRestoreErrors((prev) => [
          ...prev,
          `打开失败: ${result.error}`,
        ]);
        return;
      }

      // 添加到书签（如果不存在）
      const name = repoNameFromPath(selected);
      addBookmark(name, selected);

      // 打开仓库
      await openRepo(selected);
      const branch = await getCurrentBranch(selected);
      openTab(selected, branch);
    } catch (e: any) {
      setRestoreErrors((prev) => [
        ...prev,
        `选择目录失败: ${e}`,
      ]);
    }
  };

  // 同步 CSS class
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // 恢复中：显示加载状态
  if (isRestoring) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground animate-pulse">
          正在恢复上次打开的仓库…
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col text-sm">
      {/* ===== 顶部标题栏 ===== */}
      <header className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground">
            SourceTree Rust
          </h1>
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-primary/10 text-primary">
            v0.1.0
          </span>
          {/* Tab 数量状态 */}
          <span className="text-[10px] text-muted-foreground/60 border-l border-border pl-3 ml-1">
            {tabs.length > 0 ? `${tabs.length} 个标签页` : "就绪"}
          </span>
          {/* 当前仓库路径 */}
          {currentPath && (
            <span className="text-sm text-muted-foreground/60 truncate max-w-[200px] hidden md:inline">
              {currentPath}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 新增仓库按钮 */}
          <button
            onClick={handleAddRepo}
            className="flex items-center gap-1 px-2 py-1 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            title="新增仓库"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="hidden sm:inline">新增</span>
          </button>
          <span className="text-sm text-muted-foreground">{backendMsg}</span>
          {backendInfo && (
            <span className="text-[10px] text-muted-foreground/60">
              {backendInfo}
            </span>
          )}
          <button
            onClick={toggleTheme}
            className="px-2 py-1 text-sm rounded border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {theme === "light" ? "暗色" : "亮色"}
          </button>
        </div>
      </header>

      {/* ===== Tab 栏 ===== */}
      <TabBar />

      {/* ===== 恢复失败提示 ===== */}
      {restoreErrors.length > 0 && (
        <div className="mx-4 mt-2 p-2 rounded bg-destructive/10 border border-destructive/30 text-sm text-destructive space-y-0.5">
          {restoreErrors.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}

      {/* ===== 内容区域 ===== */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {tabs.length > 0 && activeTabId ? <RepositoryPage /> : <WelcomePage />}
      </div>
    </div>
  );
}

export default App;