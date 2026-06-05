/**
 * History 子页
 *
 * 上 50%：提交历史列表（DAG 图 + 分支标签 + 提交说明 + 日期 + SHA）
 * 下 50%：
 *   左侧（50%）：
 *     上：选中提交的信息（作者、日期、SHA）
 *     下：此次提交的文件列表（可点击）
 *   右侧（50%）：选中文件的变更内容（默认打开第一个文件）
 */

import type { CommitEntry } from "@/services/git";
import CommitGraph from "./CommitGraph";
import DiffPanel from "./DiffPanel";

interface HistoryPageProps {
  /** 提交历史列表 */
  commits: CommitEntry[];
  /** 当前选中的提交 */
  selectedCommit: CommitEntry | null;
  /** 当前分支名 */
  currentBranch: string;
  /** 变更文件列表 */
  commitFiles: { status: string; path: string }[];
  /** 当前选中的提交内文件路径 */
  selectedCommitFile: string | null;
  /** 选中的提交文件的变更内容 */
  commitFileDiff: string;
  /** 选择提交查看详情 */
  onSelectCommit: (commit: CommitEntry) => void;
  /** 选择提交内的某个文件查看变更 */
  onSelectCommitFile: (filePath: string) => void;
}

export default function HistoryPage({
  commits,
  selectedCommit,
  currentBranch,
  commitFiles,
  selectedCommitFile,
  commitFileDiff,
  onSelectCommit,
  onSelectCommitFile,
}: HistoryPageProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ===== 上 50%：提交历史列表 ===== */}
      <div className="flex-1 min-h-0 border-b border-border overflow-y-auto">
        <CommitGraph
          commits={commits}
          selectedId={selectedCommit?.id ?? null}
          onSelect={onSelectCommit}
          currentBranch={currentBranch}
        />
      </div>

      {/* ===== 下 50%：提交详情 ===== */}
      <div className="flex-1 flex min-h-0">
        {selectedCommit ? (
          <>
            {/* 左侧：提交信息 + 文件列表 */}
            <div className="w-1/2 border-r border-border flex flex-col min-h-0">
              {/* 提交信息头部 */}
              <div className="px-3 py-2 border-b border-border shrink-0">
                <div className="text-xs font-medium truncate">
                  {selectedCommit.message}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
                  <span>{selectedCommit.author}</span>
                  <span>•</span>
                  <span>
                    {new Date(
                      selectedCommit.time * 1000
                    ).toLocaleString()}
                  </span>
                  <span>•</span>
                  <span className="font-mono">
                    {selectedCommit.id.slice(0, 7)}
                  </span>
                </div>
              </div>

              {/* 文件列表 */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                  变更文件（{commitFiles.length}）
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {commitFiles.map((f, i) => (
                    <div
                      key={i}
                      onClick={() => onSelectCommitFile(f.path)}
                      className={`px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer hover:bg-accent/30 ${
                        f.path === selectedCommitFile ? "bg-accent" : ""
                      }`}
                    >
                      <span
                        className={`font-mono shrink-0 ${
                          f.status === "A"
                            ? "text-green-600"
                            : f.status === "D"
                              ? "text-red-600"
                              : f.status === "M"
                                ? "text-orange-600"
                                : "text-muted-foreground"
                        }`}
                      >
                        {f.status}
                      </span>
                      <span className="truncate">{f.path}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 右侧：文件变更内容 */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border shrink-0">
                {selectedCommitFile
                  ? `${selectedCommitFile} 的变更`
                  : "文件变更"}
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                <DiffPanel diffText={commitFileDiff} fileName={selectedCommitFile ?? undefined} />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            选择提交查看详情
          </div>
        )}
      </div>
    </div>
  );
}