/**
 * 文件状态子页
 *
 * 布局（左右分栏）：
 *   上部分：左侧（暂存文件 + 未暂存文件） | 右侧（暂存块 diff 内容），各自独立滚动
 *   下部分（max-h-[20%]）：提交信息区域
 */

import type { FileStatus } from "@/services/git";
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
  /** 查看文件差异 */
  onShowDiff: (path: string) => void;
  /** 暂存单个文件 */
  onStage: (path: string) => void;
  /** 暂存所有 */
  onStageAll: () => void;
  /** 取消暂存所有 */
  onUnstageAll: () => void;
  /** 提交 */
  onCommit: () => void;
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
  onUnstageAll,
  onCommit,
}: FileStatusPageProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ===== 上部分：左（暂存/未暂存）+ 右（暂存块 diff） ===== */}
      <div className="flex-1 flex min-h-0">
        {/* ===== 左侧列：暂存文件 + 未暂存文件 ===== */}
        <div className="w-80 border-r border-border flex flex-col min-h-0">
          {/* 暂存文件区域（内容高度决定，超出滚动） */}
          <div className="overflow-y-auto border-b border-border min-h-0">
            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/20 flex items-center justify-between sticky top-0 z-10">
              <span>已暂存文件（{stagedFiles.length}）</span>
              {stagedFiles.length > 0 && (
                <button
                  onClick={onUnstageAll}
                  className="text-[10px] text-primary hover:text-primary/80"
                >
                  取消选定暂存
                </button>
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
                  className={`flex items-center px-3 py-1.5 text-xs cursor-pointer hover:bg-accent/50 ${
                    selectedFile === f.path ? "bg-accent" : ""
                  }`}
                  onClick={() => onShowDiff(f.path)}
                >
                  <span className="w-4 text-green-600 shrink-0 flex items-center justify-center">
                    <StatusIcon status={f.stage_status || ""} />
                  </span>
                  <span className="flex-1 truncate ml-1">{f.path}</span>
                </div>
              ))
            )}
          </div>

          {/* 未暂存文件区域（弹性高度，超出滚动） */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/20 flex items-center justify-between sticky top-0 z-10">
              <span>未暂存文件（{unstagedFiles.length + untrackedFiles.length}）</span>
              {(unstagedFiles.length + untrackedFiles.length) > 0 && (
                <button
                  onClick={onStageAll}
                  className="text-[10px] text-primary hover:text-primary/80"
                >
                  暂存所有
                </button>
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
                  className={`flex items-center px-3 py-1.5 text-xs cursor-pointer hover:bg-accent/50 ${
                    selectedFile === f.path ? "bg-accent" : ""
                  }`}
                  onClick={() => onShowDiff(f.path)}
                >
                  <span className={`w-4 shrink-0 flex items-center justify-center ${f.is_untracked ? "text-purple-600" : "text-red-600"}`}>
                    <StatusIcon status={f.is_untracked ? "?" : (f.worktree_status || "")} />
                  </span>
                  <span className="flex-1 truncate ml-1">{f.path}</span>
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
                </div>
              ))
            )}
          </div>
        </div>

        {/* ===== 右侧列：暂存块 diff 内容 ===== */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedFile ? (
            <>
              <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
                <span className="text-xs font-medium truncate">{selectedFile}</span>
                <div className="flex items-center gap-1">
                  <button className="p-1 hover:bg-accent rounded">
                    <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.325 4.317C11.255 3.895 12.375 4.108 13 4.825L21 12L13 19.175C12.375 19.892 11.255 20.105 10.325 19.683C9.395 19.261 9 18.36 9 17.325V14H3V10H9V6.675C9 5.64 9.395 4.739 10.325 4.317Z" />
                    </svg>
                  </button>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded ml-1">
                    暂存区块
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {!selectedDiff ? (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                    加载中...
                  </div>
                ) : (
                  <DiffPanel diffText={selectedDiff} fileName={selectedFile} />
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

      {/* ===== 下部分：提交信息区域（最大 20% 高度） ===== */}
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