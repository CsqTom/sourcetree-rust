/**
 * History 子页
 *
 * 上（可拖拽）：提交历史列表（DAG 图 + 标签图标 + 提交说明 + 日期 + SHA）
 * 下（可拖拽）：
 *   左侧（可拖拽）：
 *     上：选中提交的详细信息
 *     下：此次提交的文件列表（可点击）
 *   右侧（可拖拽）：选中文件的变更内容（默认打开第一个文件）
 */

import { useRef, useEffect, useCallback, useState } from "react";
import type { CommitEntry } from "@/services/git";
import CommitGraph from "./CommitGraph";
import DiffPanel from "./DiffPanel";

interface HistoryPageProps {
  /** 提交历史列表 */
  commits: CommitEntry[];
  /** 当前选中的提交 */
  selectedCommit: CommitEntry | null;
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
  /** 加载更多历史（滚动到底部时触发） */
  onLoadMore: () => void;
  /** 是否正在加载更多 */
  loadingMore: boolean;
}

const SCROLL_THRESHOLD = 80;
const MIN_PCT = 15; // 面板最小占比（%）

/** 文件状态颜色映射 */
const STATUS_COLOR: Record<string, string> = {
  A: "text-green-600",
  M: "text-orange-600",
  D: "text-red-600",
  R: "text-purple-600",
  C: "text-blue-600",
};

export default function HistoryPage({
  commits,
  selectedCommit,
  commitFiles,
  selectedCommitFile,
  commitFileDiff,
  onSelectCommit,
  onSelectCommitFile,
  onLoadMore,
  loadingMore,
}: HistoryPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // ===== 可拖动分隔条状态 =====
  const containerRef = useRef<HTMLDivElement>(null);
  const [topRatio, setTopRatio] = useState(0.5); // 上/下 比例
  const [leftRatio, setLeftRatio] = useState(0.5); // 左/右 比例

  const dragRef = useRef<{
    type: "horizontal" | "vertical";
    start: number;
    startVal: number;
  } | null>(null);

  // 鼠标按下：开始拖动
  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent, type: "horizontal" | "vertical") => {
      e.preventDefault();
      dragRef.current = {
        type,
        start: type === "horizontal" ? e.clientY : e.clientX,
        startVal: type === "horizontal" ? topRatio : leftRatio,
      };
    },
    [topRatio, leftRatio]
  );

  // 鼠标移动：更新比例
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      if (drag.type === "horizontal") {
        const delta = e.clientY - drag.start;
        const newVal = drag.startVal + delta / rect.height;
        setTopRatio(Math.max(MIN_PCT / 100, Math.min(1 - MIN_PCT / 100, newVal)));
      } else {
        const delta = e.clientX - drag.start;
        const newVal = drag.startVal + delta / rect.width;
        setLeftRatio(Math.max(MIN_PCT / 100, Math.min(1 - MIN_PCT / 100, newVal)));
      }
    };

    const handleMouseUp = () => {
      dragRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // ===== 滚动到底部加载更多 =====
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD) {
      onLoadMore();
    }
  }, [loadingMore, onLoadMore]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // ===== 格式化日期（中文） =====
  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.toLocaleTimeString()}`;
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col min-h-0 select-none"
    >
      {/* ===== 上：提交历史列表 ===== */}
      <div
        ref={scrollRef}
        className="min-h-0 border-b border-border overflow-y-auto select-text"
        style={{ flexBasis: `${topRatio * 100}%` }}
      >
        <CommitGraph
          commits={commits}
          selectedId={selectedCommit?.id ?? null}
          onSelect={onSelectCommit}
        />
        {loadingMore && (
          <div className="px-3 py-2 text-xs text-muted-foreground text-center">
            加载更早的提交...
          </div>
        )}
      </div>

      {/* 水平分隔条 */}
      <div
        className="h-[5px] shrink-0 cursor-row-resize bg-border/30 hover:bg-blue-400/40 transition-colors relative z-10"
        onMouseDown={(e) => onDividerMouseDown(e, "horizontal")}
      />

      {/* ===== 下：提交详情 ===== */}
      <div
        className="flex min-h-0"
        style={{ flexBasis: `${(1 - topRatio) * 100}%` }}
      >
        {selectedCommit ? (
          <>
            {/* 左侧：提交信息 + 文件列表 */}
            <div
              className="min-w-0 border-r border-border flex flex-col"
              style={{ flexBasis: `${leftRatio * 100}%` }}
            >
              {/* ---- 提交信息 ---- */}
              <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-1.5">
                {/* 提交 SHA */}
                <div className="text-[11px] leading-relaxed">
                  <span className="text-muted-foreground">提交：</span>
                  <span className="font-mono text-[10px] break-all">{selectedCommit.id}</span>
                  <span className="font-mono text-muted-foreground ml-1">
                    [{selectedCommit.id.slice(0, 7)}]
                  </span>
                </div>

                {/* 父级 */}
                {selectedCommit.parent_ids.length > 0 && (
                  <div className="text-[11px]">
                    <span className="text-muted-foreground">父级：</span>
                    <span className="font-mono text-[10px] break-all">
                      {selectedCommit.parent_ids.join(" ")}
                    </span>
                  </div>
                )}

                {/* 作者 */}
                <div className="text-[11px]">
                  <span className="text-muted-foreground">作者：</span>
                  <span>
                    {selectedCommit.author}{" "}
                    &lt;{selectedCommit.author_email}&gt;
                  </span>
                </div>

                {/* 日期 */}
                <div className="text-[11px]">
                  <span className="text-muted-foreground">日期：</span>
                  <span>{formatDate(selectedCommit.time)}</span>
                </div>

                {/* 提交者 */}
                {selectedCommit.committer && (
                  <div className="text-[11px]">
                    <span className="text-muted-foreground">提交者：</span>
                    <span>{selectedCommit.committer}</span>
                  </div>
                )}

                {/* 提交消息（完整） */}
                <div className="text-[11px] leading-relaxed pt-1 border-t border-border/50 whitespace-pre-wrap">
                  {selectedCommit.message}
                </div>
              </div>

              {/* ---- 文件列表 ---- */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                  文件变更（{commitFiles.length}）
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 select-text">
                  {commitFiles.map((f, i) => (
                    <div
                      key={i}
                      onClick={() => onSelectCommitFile(f.path)}
                      className={`px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer hover:bg-blue-500/20 ${
                        f.path === selectedCommitFile
                          ? "row-selected"
                          : ""
                      }`}
                    >
                      <span
                        className={`font-mono shrink-0 ${
                          STATUS_COLOR[f.status] ?? "text-muted-foreground"
                        }`}
                      >
                        {f.status}
                      </span>
                      <span className={`truncate ${f.path === selectedCommitFile ? "text-white" : ""}`}>
                        {f.path}
                      </span>
                    </div>
                  ))}
                  <style>{`
                    .row-selected { background-color: #2563eb !important; }
                  `}</style>
                </div>
              </div>
            </div>

            {/* 垂直分隔条 */}
            <div
              className="w-[5px] shrink-0 cursor-col-resize bg-border/30 hover:bg-blue-400/40 transition-colors relative z-10"
              onMouseDown={(e) => onDividerMouseDown(e, "vertical")}
            />

            {/* 右侧：文件变更内容 */}
            <div
              className="flex flex-col min-w-0"
              style={{ flexBasis: `${(1 - leftRatio) * 100}%` }}
            >
              <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border shrink-0">
                {selectedCommitFile
                  ? `${selectedCommitFile} 的变更`
                  : "文件变更"}
              </div>
              <div className="flex-1 overflow-auto min-h-0 select-text">
                <DiffPanel diffText={commitFileDiff} fileName={selectedCommitFile ?? undefined} />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground select-text">
            选择提交查看详情
          </div>
        )}
      </div>
    </div>
  );
}