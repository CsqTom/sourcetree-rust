/**
 * 仓库主页 - SourceTree 风格布局
 *
 * 布局结构：
 *   顶部：工具栏（提交、拉取、推送等）
 *   左侧：导航栏（WORKSPACE、分支、标签、远程、贮藏）
 *   右侧：根据导航选择切换子页（FileStatus / History / Search）
 */

import { useEffect, useState, useCallback } from "react";
import {
  getStatus,
  getRepoSummary,
  stageFiles,
  unstageFiles,
  getFileDiff,
  commitChanges,
  getRecentCommits,
  listBranches,
  checkoutBranch,
  fetchRemote,
  pullRemote,
  pushRemote,
  getCommitFiles,
  getCommitFileDiff,
} from "@/services/git";
import { useRepoStore, useSelectionStore } from "@/stores";
import type { FileStatus, RepoSummary, CommitEntry } from "@/services/git";
import FileStatusPage from "./FileStatusPage";
import HistoryPage from "./HistoryPage";
import SearchPage from "./SearchPage";

/** 左侧导航区域类型 */
type NavSection = "workspace" | "branches" | "tags" | "remotes" | "stash";
/** WORKSPACE 子类型 */
type WorkspaceTab = "file-status" | "history" | "search";

export default function RepositoryPage() {
  const { currentPath, currentBranch, updateBranch } = useRepoStore();
  const { selectedFile, selectedDiff, setSelectedFile, setSelectedDiff } =
    useSelectionStore();

  // 导航状态
  const [activeNav, setActiveNav] = useState<NavSection>("workspace");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("file-status");

  // 数据状态
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [summary, setSummary] = useState<RepoSummary | null>(null);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // 提交状态
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [amendCommit, setAmendCommit] = useState(false);
  const [pushImmediately, setPushImmediately] = useState(false);

  // 分支面板状态
  const [showBranches, setShowBranches] = useState(true);

  // 选中的提交
  const [selectedCommit, setSelectedCommit] = useState<CommitEntry | null>(
    null
  );
  const [commitFiles, setCommitFiles] = useState<
    { status: string; path: string }[]
  >([]);
  // 选中的提交内文件 & 文件 diff
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(
    null
  );
  const [commitFileDiff, setCommitFileDiff] = useState<string>("");

  const repoPath = currentPath || "";

  /** 刷新所有数据 */
  const refreshAll = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      const [statusData, summaryData, commitData, branchData] =
        await Promise.all([
          getStatus(repoPath),
          getRepoSummary(repoPath).catch(() => null),
          getRecentCommits(repoPath),
          listBranches(repoPath),
        ]);
      setFiles(statusData);
      setSummary(summaryData);
      setCommits(commitData);
      setBranches(branchData);
      if (summaryData) updateBranch(summaryData.current_branch);
    } catch (e) {
      console.error("刷新失败", e);
    } finally {
      setLoading(false);
    }
  }, [repoPath, updateBranch]);

  // 打开仓库时自动加载
  useEffect(() => {
    if (repoPath) refreshAll();
  }, [repoPath, refreshAll]);

  /** 暂存单个文件 */
  const handleStage = async (path: string) => {
    try {
      await stageFiles(repoPath, [path]);
      await refreshAll();
    } catch (e) {
      console.error("暂存失败", e);
    }
  };

  /** 暂存所有文件 */
  const handleStageAll = async () => {
    try {
      const allFiles = [...unstagedFiles, ...untrackedFiles].map((f) => f.path);
      if (allFiles.length > 0) {
        await stageFiles(repoPath, allFiles);
        await refreshAll();
      }
    } catch (e) {
      console.error("暂存所有失败", e);
    }
  };

  /** 取消暂存所有文件 */
  const handleUnstageAll = async () => {
    try {
      const allFiles = stagedFiles.map((f) => f.path);
      if (allFiles.length > 0) {
        await unstageFiles(repoPath, allFiles);
        await refreshAll();
      }
    } catch (e) {
      console.error("取消暂存所有失败", e);
    }
  };

  /** 查看差异 */
  const handleShowDiff = async (path: string) => {
    setSelectedFile(path);
    setSelectedCommit(null);
    try {
      const diff = await getFileDiff(repoPath, path);
      setSelectedDiff(diff);
    } catch {
      setSelectedDiff("无法加载差异");
    }
  };

  /** 提交 */
  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    try {
      await commitChanges(repoPath, commitMsg);
      setCommitMsg("");
      await refreshAll();
      setSelectedDiff("");
      setSelectedFile(null);
    } catch (e: any) {
      console.error(`提交失败: ${e}`);
    } finally {
      setCommitting(false);
    }
  };

  /** 切换分支 */
  const handleSwitchBranch = async (branch: string) => {
    if (branch === currentBranch) return;
    try {
      await checkoutBranch(repoPath, branch);
      await refreshAll();
    } catch (e: any) {
      console.error("切换分支失败:", e);
    }
  };

  /** Fetch */
  const handleFetch = async () => {
    try {
      const result = await fetchRemote(repoPath);
      console.log(result);
      await refreshAll();
    } catch (e: any) {
      console.error("Fetch 失败:", e);
    }
  };

  /** Pull */
  const handlePull = async () => {
    try {
      const result = await pullRemote(repoPath);
      console.log(result);
      await refreshAll();
    } catch (e: any) {
      console.error("Pull 失败:", e);
    }
  };

  /** Push */
  const handlePush = async () => {
    try {
      const result = await pushRemote(repoPath, undefined, currentBranch, true);
      console.log(result);
      await refreshAll();
    } catch (e: any) {
      console.error("Push 失败:", e);
    }
  };

  /** 加载提交详情 */
  const loadCommitDetail = async (commit: CommitEntry) => {
    setSelectedCommit(commit);
    setSelectedFile(null);
    setCommitFiles([]);
    setSelectedCommitFile(null);
    setCommitFileDiff("");

    try {
      const files = await getCommitFiles(repoPath, commit.id);
      setCommitFiles(files);
      // 默认加载第一个文件的 diff
      if (files.length > 0) {
        setSelectedCommitFile(files[0].path);
        const diff = await getCommitFileDiff(repoPath, commit.id, files[0].path);
        setCommitFileDiff(diff || "无差异");
      }
    } catch (e) {
      console.error("加载提交详情失败:", e);
    }
  };

  /** 选择提交内的某个文件查看变更 */
  const handleCommitFileSelect = async (filePath: string) => {
    if (!selectedCommit) return;
    setSelectedCommitFile(filePath);
    try {
      const diff = await getCommitFileDiff(repoPath, selectedCommit.id, filePath);
      setCommitFileDiff(diff || "无差异");
    } catch (e) {
      console.error("加载提交文件变更失败:", e);
      setCommitFileDiff("无法加载文件变更");
    }
  };

  /** 分类文件 */
  const stagedFiles = files.filter((f) => f.stage_status);
  const unstagedFiles = files.filter(
    (f) => f.worktree_status && !f.stage_status && !f.is_untracked
  );
  const untrackedFiles = files.filter((f) => f.is_untracked);

  return (
    <div className="flex-1 flex flex-col bg-muted/30 min-h-0">
      {/* ===== 顶部工具栏 ===== */}
      <header className="border-b border-border bg-card px-3 py-2 flex items-center gap-2 shrink-0">
        <button
          onClick={handleCommit}
          disabled={committing || stagedFiles.length === 0 || !commitMsg.trim()}
          className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 flex items-center gap-1"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20V10M18 14L12 10L6 14" />
            <path d="M21 22H3" />
          </svg>
          提交
        </button>
        <button
          onClick={handlePull}
          className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 14V6C19 4.89543 18.1046 4 17 4H9C7.89543 4 7 4.89543 7 6V14" />
            <path d="M12 18L19 11L12 4" />
            <path d="M19 11H5" />
          </svg>
          拉取
        </button>
        <button
          onClick={handlePush}
          className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 10V18C5 19.1046 5.89543 20 7 20H15C16.1046 20 17 19.1046 17 18V10" />
            <path d="M12 6L5 13L12 20" />
            <path d="M5 13H19" />
          </svg>
          推送
        </button>
        <button
          onClick={handleFetch}
          className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12H20" />
            <path d="M4 6H20" />
            <path d="M4 18H20" />
          </svg>
          获取
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button
          className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="18" r="3" />
            <path d="M8.59 16.5L13.42 12.5" />
            <path d="M15.41 7.5L10.58 11.5" />
          </svg>
          分支
        </button>
        <button
          className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8V5C18 4.44772 17.5523 4 17 4H3C2.44772 4 2 4.44772 2 5V19C2 19.5523 2.44772 20 3 20H17C17.5523 20 18 19.5523 18 19V16" />
            <path d="M22 6L18 10L14 6" />
            <path d="M18 10V4" />
          </svg>
          合并
        </button>
        <div className="flex-1" />
        <button
          onClick={refreshAll}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent disabled:opacity-40"
        >
          刷新
        </button>
      </header>

      {/* ===== 主内容区域 ===== */}
      <div className="flex-1 flex min-h-0">
        {/* ===== 左侧：导航栏 ===== */}
        <aside className="w-56 border-r border-border bg-card flex flex-col shrink-0">
          {/* WORKSPACE 区域 */}
          <div className="border-b border-border">
            <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="18" rx="2" />
                <path d="M8 7V17" />
                <path d="M12 7V17" />
                <path d="M16 7V17" />
              </svg>
              WORKSPACE
            </div>
            <div className="flex flex-col">
              <button
                onClick={() => {
                  setActiveNav("workspace");
                  setActiveWorkspaceTab("file-status");
                }}
                className={`px-3 py-1.5 text-xs text-left flex items-center gap-2 transition-colors ${
                  activeNav === "workspace" && activeWorkspaceTab === "file-status"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 9H15V15H9V9Z" />
                </svg>
                文件状态
              </button>
              <button
                onClick={() => {
                  setActiveNav("workspace");
                  setActiveWorkspaceTab("history");
                }}
                className={`px-3 py-1.5 text-xs text-left flex items-center gap-2 transition-colors ${
                  activeNav === "workspace" && activeWorkspaceTab === "history"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20C4 16.6863 7.58172 14 12 14C16.4183 14 20 16.6863 20 20" />
                </svg>
                History
              </button>
              <button
                onClick={() => {
                  setActiveNav("workspace");
                  setActiveWorkspaceTab("search");
                }}
                className={`px-3 py-1.5 text-xs text-left flex items-center gap-2 transition-colors ${
                  activeNav === "workspace" && activeWorkspaceTab === "search"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="6" />
                  <path d="M16 16L21 21" />
                </svg>
                Search
              </button>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="p-2 border-b border-border">
            <input
              type="text"
              placeholder="搜索"
              className="w-full px-2 py-1.5 text-xs rounded border border-input bg-background outline-none focus:border-primary"
            />
          </div>

          {/* 分支区域 */}
          <div className="border-b border-border">
            <div
              className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:bg-accent/30"
              onClick={() => setShowBranches(!showBranches)}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="18" r="3" />
                <path d="M8.59 16.5L13.42 12.5" />
                <path d="M15.41 7.5L10.58 11.5" />
              </svg>
              分支
              <span className="ml-auto">{showBranches ? "▼" : "▶"}</span>
            </div>
            {showBranches && (
              <div className="pb-1">
                {branches.map((b) => (
                  <div
                    key={b}
                    onClick={() => handleSwitchBranch(b)}
                    className={`px-3 py-1 text-xs cursor-pointer hover:bg-accent/50 flex items-center gap-2 ${
                      b === currentBranch ? "bg-accent font-medium" : ""
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    <span>{b}</span>
                    {b === currentBranch && (
                      <span className="ml-auto text-green-600 text-[10px]">●</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 标签区域 */}
          <div className="border-b border-border">
            <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.59 13.41L11.59 4.41C11.2174 4.03738 10.7086 3.82648 10.18 3.82H4C3.46957 3.82 2.96086 4.03061 2.58838 4.40309C2.21591 4.77556 2.00531 5.28427 2.00531 5.8147V12C2.00531 12.5286 2.21621 13.0374 2.58875 13.41L11.5888 22.41C11.9613 22.7825 12.47 22.9931 13 22.9931C13.53 22.9931 14.0387 22.7825 14.4113 22.41L20.5913 16.23C20.9637 15.8575 21.1742 15.3488 21.1742 14.8183C21.1742 14.2879 20.9637 13.7792 20.5913 13.41L20.59 13.41Z" />
                <path d="M7.5 10C8.88071 10 10 8.88071 10 7.5C10 6.11929 8.88071 5 7.5 5C6.11929 5 5 6.11929 5 7.5C5 8.88071 6.11929 10 7.5 10Z" />
              </svg>
              标签
            </div>
          </div>

          {/* 远程区域 */}
          <div className="border-b border-border">
            <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8V5C18 4.44772 17.5523 4 17 4H3C2.44772 4 2 4.44772 2 5V19C2 19.5523 2.44772 20 3 20H17C17.5523 20 18 19.5523 18 19V16" />
                <path d="M22 6L18 10L14 6" />
                <path d="M18 10V4" />
              </svg>
              远程
            </div>
          </div>

          {/* 贮藏区域 */}
          <div className="border-b border-border">
            <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 4H6C4.89543 4 4 4.89543 4 6V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L16 4Z" />
                <path d="M14 4V8H18" />
                <path d="M8 13H16" />
                <path d="M8 17H16" />
              </svg>
              贮藏
            </div>
          </div>

          {/* 底部间距 */}
          <div className="flex-1" />

          {/* 当前分支信息 */}
          <div className="border-t border-border px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="18" r="3" />
                  <path d="M8.59 16.5L13.42 12.5" />
                  <path d="M15.41 7.5L10.58 11.5" />
                </svg>
                <span className="text-xs font-medium">{currentBranch || "-"}</span>
              </div>
              {/* 远程状态 */}
              {summary && (summary.ahead > 0 || summary.behind > 0) && (
                <div className="flex items-center gap-1">
                  {summary.ahead > 0 && (
                    <span className="text-green-600 text-[10px]">↑{summary.ahead}</span>
                  )}
                  {summary.behind > 0 && (
                    <span className="text-orange-600 text-[10px]">↓{summary.behind}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ===== 右侧：子页路由 ===== */}
        {activeNav === "workspace" && activeWorkspaceTab === "file-status" && (
          <FileStatusPage
            stagedFiles={stagedFiles}
            unstagedFiles={unstagedFiles}
            untrackedFiles={untrackedFiles}
            selectedFile={selectedFile}
            selectedDiff={selectedDiff}
            currentBranch={currentBranch || ""}
            commitMsg={commitMsg}
            committing={committing}
            pushImmediately={pushImmediately}
            amendCommit={amendCommit}
            setCommitMsg={setCommitMsg}
            setPushImmediately={setPushImmediately}
            setAmendCommit={setAmendCommit}
            onShowDiff={handleShowDiff}
            onStage={handleStage}
            onStageAll={handleStageAll}
            onUnstageAll={handleUnstageAll}
            onCommit={handleCommit}
          />
        )}
        {activeNav === "workspace" && activeWorkspaceTab === "history" && (
          <HistoryPage
            commits={commits}
            selectedCommit={selectedCommit}
            currentBranch={currentBranch || ""}
            commitFiles={commitFiles}
            selectedCommitFile={selectedCommitFile}
            commitFileDiff={commitFileDiff}
            onSelectCommit={loadCommitDetail}
            onSelectCommitFile={handleCommitFileSelect}
          />
        )}
        {activeNav === "workspace" && activeWorkspaceTab === "search" && (
          <SearchPage />
        )}
      </div>
    </div>
  );
}