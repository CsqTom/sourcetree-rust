/**
 * 文件状态子页
 *
 * 布局（左右分栏）：
 *   上部分：左侧（暂存文件 + 未暂存文件） | 右侧（diff 内容），各自独立滚动
 *   下部分（max-h-[20%]）：提交信息区域
 *
 * 两种查看模式：
 *  - 阅读模式：使用 DiffPanel（分栏对比视图，与 History 页一致）
 *  - 编辑模式：使用 SimpleDiffPanel（SourceTree 风格，带 +/- 符号和暂存/丢弃区块按钮）
 */

import { useState, useCallback, useEffect } from "react";
import type { FileStatus } from "@/services/git";
import SimpleDiffPanel from "./SimpleDiffPanel";
import DiffPanel from "./DiffPanel";

/** 根据状态字符返回对应的 SVG 图标 */
function StatusIcon({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const cls = className || "w-3.5 h-3.5";
  switch (status) {
    case "M":
    case "MODIFIED":
    case "modified":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      );
    case "A":
    case "ADDED":
    case "added":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12h8M12 8v8" />
        </svg>
      );
    case "D":
    case "DELETED":
    case "deleted":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12h8" />
        </svg>
      );
    case "R":
    case "RENAMED":
    case "renamed":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8L22 12L18 16" />
          <path d="M2 12H22" />
          <path d="M6 8L2 12L6 16" />
        </svg>
      );
    case "C":
    case "COPIED":
    case "copied":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "U":
    case "UNMERGED":
    case "unmerged":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      );
    case "?":
    case "UNTRACKED":
    case "untracked":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      );
  }
}

interface FileStatusPageProps {
  /** 已暂存文件 */
  stagedFiles: FileStatus[];
  /** 未暂存文件（不含未追踪） */
  unstagedFiles: FileStatus[];
  /** 未追踪文件 */
  untrackedFiles: FileStatus[];
  /** 当前选中的文件路径 */
  selectedFile: string | null;
  /** 选中文件的差异内容 */
  selectedDiff: string;
  /** 当前分支名 */
  currentBranch: string;
  /** 提交信息 */
  commitMsg: string;
  /** 提交中标志 */
  committing: boolean;
  /** 立即推送标志 */
  pushImmediately: boolean;
  /** 修改最后一次提交标志 */
  amendCommit: boolean;
  /** 设置提交信息 */
  setCommitMsg: (msg: string) => void;
  /** 设置立即推送 */
  setPushImmediately: (v: boolean) => void;
  /** 设置修改最后一次提交 */
  setAmendCommit: (v: boolean) => void;
  /** 查看文件差异（fromStaged: 点击来自已暂存列表则为 true） */
  onShowDiff: (path: string, fromStaged?: boolean) => void;
  /** 暂存单个文件 */
  onStage: (path: string) => void;
  /** 暂存所有 */
  onStageAll: () => void;
  /** 取消暂存单个文件 */
  onUnstage: (path: string) => void;
  /** 取消暂存所有 */
  onUnstageAll: () => void;
  /** 提交 */
  onCommit: () => void;
  /** 丢弃文件更改 */
  onDiscardFile: (path: string) => void;
  /** 丢弃 hunk 更改 */
  onDiscardHunk: (path: string, hunkIndex: number) => void;
  /** 暂存 hunk 更改 */
  onStageHunk: (path: string, hunkIndex: number) => void;
  /** 暂存选中行 */
  onStageLines: (path: string, selections: { hunkIndex: number; lineIndices: number[] }[]) => void;
  /** 丢弃选中行 */
  onDiscardLines: (path: string, selections: { hunkIndex: number; lineIndices: number[] }[]) => void;
  /** 取消暂存选中行 */
  onUnstageLines?: (path: string, selections: { hunkIndex: number; lineIndices: number[] }[]) => void;
  /** 刷新当前选中文件的差异 */
  onRefreshDiff?: () => void;
  /** 编辑模式：读取文件内容 */
  onReadFileContent: (path: string) => Promise<string>;
  /** 编辑模式：保存文件内容 */
  onSaveFileContent: (path: string, content: string) => Promise<void>;
}

export default function FileStatusPage({
  stagedFiles,
  unstagedFiles,
  untrackedFiles,
  selectedFile,
  selectedDiff,
  currentBranch,
  commitMsg,
  committing,
  pushImmediately,
  amendCommit,
  setCommitMsg,
  setPushImmediately,
  setAmendCommit,
  onShowDiff,
  onStage,
  onStageAll,
  onUnstage,
  onUnstageAll,
  onCommit,
  onDiscardFile,
  onDiscardHunk,
  onStageHunk,
  onStageLines,
  onDiscardLines,
  onUnstageLines,
  onRefreshDiff,
  onReadFileContent: _onReadFileContent,
  onSaveFileContent: _onSaveFileContent,
}: FileStatusPageProps) {
  // 阅读/编辑模式
  const [diffMode, setDiffMode] = useState<"read" | "edit">("edit");
  // 追踪最后一次点击来自哪个列表（已暂存/未暂存）
  const [lastClickFromStaged, setLastClickFromStaged] = useState(false);

  // 切换到编辑模式（SourceTree 风格，支持暂存/丢弃区块）
  const switchToEditMode = useCallback(() => {
    setDiffMode("edit");
  }, []);

  // 切换到阅读模式（分栏 diff 视图）
  const switchToReadMode = useCallback(() => {
    setDiffMode("read");
  }, []);

  // 当切换选中文件时，重置到编辑模式，并记录点击来源
  const handleShowDiff = useCallback((path: string, fromStaged?: boolean) => {
    setDiffMode("edit");
    setLastClickFromStaged(!!fromStaged);
    onShowDiff(path, fromStaged);
  }, [onShowDiff]);

  // 判断当前显示的差异文件是否来自已暂存列表
  const isStagedFile = lastClickFromStaged;

  // 窗口获得焦点时自动刷新选中文件的差异
  useEffect(() => {
    const handleFocus = () => {
      if (selectedFile && onRefreshDiff) {
        onRefreshDiff();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [selectedFile, onRefreshDiff]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ===== 上部分：左（暂存/未暂存）+ 右（diff / 编辑） ===== */}
      <div className="flex-1 flex min-h-0">
        {/* ===== 左侧列：暂存文件 + 未暂存文件 ===== */}
        <div className="w-80 border-r border-border flex flex-col min-h-0">
          {/* 暂存文件区域 */}
          <div className="overflow-y-auto border-b border-border min-h-0">
            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/20 flex items-center justify-between sticky top-0 z-10">
              <span>已暂存文件（{stagedFiles.length}）</span>
              {stagedFiles.length > 0 && (
                <div className="flex items-center gap-1">
                  {selectedFile && isStagedFile && stagedFiles.some(f => f.path === selectedFile) && (
                    <button
                      onClick={() => onUnstage(selectedFile)}
                      className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent text-foreground"
                    >
                      取消选定暂存
                    </button>
                  )}
                  <button
                    onClick={onUnstageAll}
                    className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent text-foreground"
                  >
                    取消所有暂存
                  </button>
                </div>
              )}
            </div>
            {stagedFiles.length === 0 ? (
              <div className="px-3 py-2 text-[10px] text-muted-foreground">
                没有待提交的暂存文件
              </div>
            ) : (
              stagedFiles.map((f) => (
                <div
                  key={f.path}
                  className={`group flex items-center px-3 py-1.5 text-xs cursor-pointer hover:bg-accent/50 ${
                    selectedFile === f.path && isStagedFile ? "bg-blue-600 text-white rounded-sm" : ""
                  }`}
                  onClick={() => handleShowDiff(f.path, true)}
                >
                  <span className="w-4 text-green-600 shrink-0 flex items-center justify-center">
                    <StatusIcon status={f.stage_status || ""} />
                  </span>
                  <span className="flex-1 truncate ml-1">{f.path}</span>
                  {/* 取消暂存按钮 */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnstage(f.path);
                      }}
                      className="ml-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent rounded px-0.5"
                      title="取消暂存"
                    >
                      −
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 未暂存文件区域 */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/20 flex items-center justify-between sticky top-0 z-10">
              <span>未暂存文件（{unstagedFiles.length + untrackedFiles.length}）</span>
              {(unstagedFiles.length + untrackedFiles.length) > 0 && (
                <div className="flex items-center gap-1">
                  {selectedFile && !isStagedFile && (unstagedFiles.some(f => f.path === selectedFile) || untrackedFiles.some(f => f.path === selectedFile)) && (
                    <button
                      onClick={() => onStage(selectedFile)}
                      className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent text-foreground"
                    >
                      暂存所选
                    </button>
                  )}
                  <button
                    onClick={onStageAll}
                    className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent text-foreground"
                  >
                    暂存所有
                  </button>
                </div>
              )}
            </div>
            {unstagedFiles.length === 0 && untrackedFiles.length === 0 ? (
              <div className="px-3 py-2 text-[10px] text-muted-foreground">
                没有未暂存文件
              </div>
            ) : (
              [...unstagedFiles, ...untrackedFiles].map((f) => (
                <div
                  key={f.path}
                  className={`group flex items-center px-3 py-1.5 text-xs cursor-pointer hover:bg-accent/50 ${
                    selectedFile === f.path && !isStagedFile ? "bg-blue-600 text-white rounded-sm" : ""
                  }`}
                  onClick={() => handleShowDiff(f.path, false)}
                >
                  <span className={`w-4 shrink-0 flex items-center justify-center ${f.is_untracked ? "text-purple-600" : "text-red-600"}`}>
                    <StatusIcon status={f.is_untracked ? "?" : (f.worktree_status || "")} />
                  </span>
                  <span className="flex-1 truncate ml-1">{f.path}</span>

                  {/* 操作按钮组 */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* 暂存按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStage(f.path);
                      }}
                      className="ml-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent rounded px-0.5"
                      title="暂存"
                    >
                      +
                    </button>
                    {/* 丢弃按钮（仅未暂存文件，非未追踪） */}
                    {!f.is_untracked && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`确定要丢弃文件 "${f.path}" 的所有更改吗？`)) {
                            onDiscardFile(f.path);
                          }
                        }}
                        className="text-[10px] text-red-500 hover:text-red-700 hover:bg-red-100/20 rounded px-0.5"
                        title="丢弃更改"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6H21" />
                          <path d="M8 6V4H16V6" />
                          <path d="M10 11V16" />
                          <path d="M14 11V16" />
                          <path d="M19 6L18 20C18 20.5304 17.7893 21.0391 17.4142 21.4142C17.0391 21.7893 16.5304 22 16 22H8C7.46957 22 6.96086 21.7893 6.58579 21.4142C6.21071 21.0391 6 20.5304 6 20L5 6" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ===== 右侧列：diff 内容 / 编辑模式 ===== */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedFile ? (
            <>
              <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
                <span className="text-xs font-medium truncate">{selectedFile}</span>
                <div className="flex items-center gap-1">
                  {/* 刷新按钮 */}
                  {onRefreshDiff && (
                    <button
                      onClick={onRefreshDiff}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent"
                      title="刷新当前文件的差异"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                      </svg>
                    </button>
                  )}
                  {/* 编辑/阅读模式切换 */}
                  {diffMode === "read" ? (
                    <button
                      onClick={switchToEditMode}
                      className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent"
                      title="切换到编辑模式（SourceTree 风格，支持暂存/丢弃区块）"
                    >
                      编辑模式
                    </button>
                  ) : (
                    <button
                      onClick={switchToReadMode}
                      className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent"
                    >
                      返回阅读
                    </button>
                  )}

                  {/* 模式指示器 */}
                  <span className={`text-[10px] px-2 py-0.5 rounded ml-1 ${diffMode === "edit" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                    {diffMode === "edit" ? "编辑" : "阅读"}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {!selectedDiff && diffMode === "read" ? (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                    加载中...
                  </div>
                ) : diffMode === "read" ? (
                  /* 阅读模式：分栏 diff 视图（与 History 页一致） */
                  <DiffPanel
                    diffText={selectedDiff}
                    viewType="split"
                    fileName={selectedFile || ""}
                  />
                ) : (
                  /* 编辑模式：SourceTree 风格差异视图（带 +/- 和暂存/丢弃区块操作） */
                  <SimpleDiffPanel
                    diffText={selectedDiff}
                    fileName={selectedFile || ""}
                    showActions={unstagedFiles.some(f => f.path === selectedFile) || isStagedFile}
                    isStaged={isStagedFile}
                    onStageHunk={(hunkIndex) => {
                      if (selectedFile) {
                        onStageHunk(selectedFile, hunkIndex);
                      }
                    }}
                    onDiscardHunk={(hunkIndex) => {
                      if (selectedFile) {
                        onDiscardHunk(selectedFile, hunkIndex);
                      }
                    }}
                    onStageLines={(selections) => {
                      if (selectedFile) {
                        onStageLines(selectedFile, selections);
                      }
                    }}
                    onDiscardLines={(selections) => {
                      if (selectedFile) {
                        onDiscardLines(selectedFile, selections);
                      }
                    }}
                    onUnstageLines={(selections) => {
                      if (selectedFile) {
                        onUnstageLines?.(selectedFile, selections);
                      }
                    }}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              选择文件查看差异
            </div>
          )}
        </div>
      </div>

      {/* ===== 下部分：提交信息区域 ===== */}
      <div className="max-h-[20%] min-h-[120px] border-t border-border p-3 shrink-0">
        <div className="text-xs text-muted-foreground mb-2">
          csq &lt;704879647@qq.com&gt;
        </div>
        <textarea
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder="输入提交信息..."
          rows={2}
          className="w-full px-3 py-2 text-sm rounded border border-input bg-background outline-none resize-none focus:border-primary"
        />
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={pushImmediately}
                onChange={(e) => setPushImmediately(e.target.checked)}
                className="rounded border-border"
              />
              立即推送变更到 sourcetree-rust/{currentBranch}
            </label>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={amendCommit}
                onChange={(e) => setAmendCommit(e.target.checked)}
                className="rounded border-border"
              />
              修改最后一次提交
            </label>
          </div>
          <button
            onClick={onCommit}
            disabled={committing || stagedFiles.length === 0 || !commitMsg.trim()}
            className="px-4 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {committing ? "提交中..." : "提交"}
          </button>
        </div>
      </div>
    </div>
  );
}