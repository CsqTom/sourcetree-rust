/**
 * 仓库主页 - 三栏布局
 *
 * 左侧：侧边栏（仓库信息、最近提交）
 * 中间：文件列表（未暂存/已暂存/未跟踪）
 * 右侧：差异面板（差异查看 + 提交区域）
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
} from "@/services/git";
import { useRepoStore, useSelectionStore, useTabStore } from "@/stores";
import type { FileStatus, RepoSummary, CommitEntry } from "@/services/git";

export default function RepositoryPage() {
  const { currentPath, currentBranch, updateBranch } =
    useRepoStore();
  const { selectedFile, selectedDiff, setSelectedFile, setSelectedDiff } =
    useSelectionStore();
  const { closeTab } = useTabStore();

  const [files, setFiles] = useState<FileStatus[]>([]);
  const [_summary, setSummary] = useState<RepoSummary | null>(null);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  const [showSidebarCommits, setShowSidebarCommits] = useState(true);

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

  /** 暂存文件 */
  const handleStage = async (path: string) => {
    try {
      await stageFiles(repoPath, [path]);
      await refreshAll();
    } catch (e) {
      console.error("暂存失败", e);
    }
  };

  /** 取消暂存 */
  const handleUnstage = async (path: string) => {
    try {
      await unstageFiles(repoPath, [path]);
      await refreshAll();
    } catch (e) {
      console.error("取消暂存失败", e);
    }
  };

  /** 查看差异 */
  const handleShowDiff = async (path: string) => {
    setSelectedFile(path);
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

  /** 分类文件 */
  const stagedFiles = files.filter((f) => f.stage_status);
  const unstagedFiles = files.filter(
    (f) => f.worktree_status && !f.stage_status && !f.is_untracked
  );
  const untrackedFiles = files.filter((f) => f.is_untracked);

  return (
    <div className="flex-1 flex bg-muted/30">
      {/* ===== 左侧：侧边栏 ===== */}
      <aside className="w-56 border-r border-border bg-card flex flex-col">
        {/* 仓库信息 */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
              onClick={() => setShowBranches(!showBranches)}
            >
              分支: {currentBranch || "-"}
            </span>
            <button
              onClick={() => closeTab(repoPath)}
              className="text-xs text-muted-foreground hover:text-destructive"
              title="关闭仓库"
            >
              关闭
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {repoPath}
          </div>
        </div>

        {/* 分支列表 */}
        {showBranches && (
          <div className="border-b border-border max-h-40 overflow-y-auto">
            <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground">
              分支列表
            </div>
            {branches.map((b) => (
              <div
                key={b}
                className={`px-3 py-1 text-xs cursor-pointer hover:bg-accent/50 ${
                  b === currentBranch ? "bg-accent font-medium" : ""
                }`}
              >
                {b}
              </div>
            ))}
          </div>
        )}

        {/* 最近提交 */}
        <div className="flex-1 overflow-y-auto">
          <div
            className="px-3 py-2 text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground flex items-center justify-between"
            onClick={() => setShowSidebarCommits(!showSidebarCommits)}
          >
            <span>最近提交</span>
            <span className="text-xs">{showSidebarCommits ? "▼" : "▶"}</span>
          </div>
          {showSidebarCommits && (
            <div className="space-y-0">
              {commits.slice(0, 10).map((c) => (
                <div
                  key={c.id}
                  className="px-3 py-1.5 hover:bg-accent/30 cursor-pointer"
                >
                  <div className="text-xs truncate">{c.message}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {c.id} · {c.author}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 刷新按钮 */}
        <div className="p-2 border-t border-border">
          <button
            onClick={refreshAll}
            disabled={loading}
            className="w-full py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {loading ? "刷新中..." : "刷新"}
          </button>
        </div>
      </aside>

      {/* ===== 中间：文件列表 ===== */}
      <section className="w-72 border-r border-border bg-card overflow-y-auto">
        {/* 已暂存 */}
        <div className="border-b border-border">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/20">
            已暂存 ({stagedFiles.length})
          </div>
          {stagedFiles.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground/60 text-center">
              无暂存文件
            </div>
          ) : (
            stagedFiles.map((f) => (
              <div
                key={f.path}
                className={`flex items-center px-3 py-1.5 text-xs cursor-pointer hover:bg-accent/50 ${
                  selectedFile === f.path ? "bg-accent" : ""
                }`}
                onClick={() => handleShowDiff(f.path)}
              >
                <span className="w-5 text-green-600 font-mono">
                  {f.stage_status}
                </span>
                <span className="flex-1 truncate">{f.path}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnstage(f.path);
                  }}
                  className="ml-1 text-[10px] text-muted-foreground hover:text-foreground"
                  title="取消暂存"
                >
                  ⊖
                </button>
              </div>
            ))
          )}
        </div>

        {/* 未暂存 */}
        <div className="border-b border-border">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/20">
            未暂存 ({unstagedFiles.length})
          </div>
          {unstagedFiles.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground/60 text-center">
              无变更
            </div>
          ) : (
            unstagedFiles.map((f) => (
              <div
                key={f.path}
                className={`flex items-center px-3 py-1.5 text-xs cursor-pointer hover:bg-accent/50 ${
                  selectedFile === f.path ? "bg-accent" : ""
                }`}
                onClick={() => handleShowDiff(f.path)}
              >
                <span className="w-5 text-red-600 font-mono">
                  {f.worktree_status}
                </span>
                <span className="flex-1 truncate">{f.path}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStage(f.path);
                  }}
                  className="ml-1 text-[10px] text-muted-foreground hover:text-foreground"
                  title="暂存"
                >
                  ⊕
                </button>
              </div>
            ))
          )}
        </div>

        {/* 未跟踪 */}
        <div>
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/20">
            未跟踪 ({untrackedFiles.length})
          </div>
          {untrackedFiles.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground/60 text-center">
              无未跟踪文件
            </div>
          ) : (
            untrackedFiles.map((f) => (
              <div
                key={f.path}
                className={`flex items-center px-3 py-1.5 text-xs cursor-pointer hover:bg-accent/50 ${
                  selectedFile === f.path ? "bg-accent" : ""
                }`}
                onClick={() => handleShowDiff(f.path)}
              >
                <span className="w-5 text-purple-600 font-mono">?</span>
                <span className="flex-1 truncate">{f.path}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStage(f.path);
                  }}
                  className="ml-1 text-[10px] text-muted-foreground hover:text-foreground"
                  title="添加"
                >
                  ⊕
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ===== 右侧：差异面板 + 提交区域 ===== */}
      <section className="flex-1 flex flex-col bg-card">
        {selectedFile ? (
          <>
            {/* 差异内容 */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                {selectedFile}
              </div>
              <pre className="text-xs font-mono leading-5 whitespace-pre-wrap">
                {selectedDiff || "加载中..."}
              </pre>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            选择一个文件查看差异
          </div>
        )}

        {/* 提交区域 */}
        <div className="border-t border-border p-3">
          <textarea
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="输入提交信息..."
            rows={2}
            className="w-full px-3 py-2 text-sm rounded border border-input bg-background outline-none resize-none focus:border-primary"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-muted-foreground">
              {stagedFiles.length} 个文件已暂存
            </span>
            <button
              onClick={handleCommit}
              disabled={
                committing || stagedFiles.length === 0 || !commitMsg.trim()
              }
              className="px-4 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {committing ? "提交中..." : "提交"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}