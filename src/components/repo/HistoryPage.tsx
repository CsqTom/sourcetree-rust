/**
 * History 子页
 *
 * 上（可拖拽）：提交历史列表（DAG 图 + 标签图标 + 提交说明 + 日期 + SHA）
 * 下（可拖拽）：
 *   左侧（可拖拽）：
 *     上：选中提交的详细信息
 *     下：此次提交的文件列表（可点击）
 *   右侧（可拖拽）：选中文件的变更内容（默认打开第一个文件）
 *
 * 右键菜单功能：
 * - 在提交上右键可创建轻量标签或附注标签
 */

import { useRef, useEffect, useCallback, useState } from "react";
import type { CommitEntry } from "@/services/git";
import { createLightweightTag, createAnnotatedTag } from "@/services/git";
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
  /** 仓库路径（用于标签操作） */
  repoPath: string;
  /** 未推送的提交数 */
  ahead: number;
  /** 选择提交查看详情 */
  onSelectCommit: (commit: CommitEntry) => void;
  /** 选择提交内的某个文件查看变更 */
  onSelectCommitFile: (filePath: string) => void;
  /** 加载更多历史（滚动到底部时触发） */
  onLoadMore: () => void;
  /** 是否正在加载更多 */
  loadingMore: boolean;
  /** 标签创建成功后的回调（用于刷新数据） */
  onTagCreated?: () => void;
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
  repoPath,
  ahead,
  onSelectCommit,
  onSelectCommitFile,
  onLoadMore,
  loadingMore,
  onTagCreated,
}: HistoryPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // ===== 可拖动分隔条状态 =====
  const containerRef = useRef<HTMLDivElement>(null);
  const [topRatio, setTopRatio] = useState(0.5);
  const [leftRatio, setLeftRatio] = useState(0.5);

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

  // ===== 右键上下文菜单状态 =====
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    commit: CommitEntry;
  } | null>(null);

  // ===== 标签创建对话框状态 =====
  const [tagDialog, setTagDialog] = useState<{
    type: "lightweight" | "annotated";
    commit: CommitEntry;
  } | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagMessage, setTagMessage] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);

  // 关闭上下文菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 点击页面其他位置关闭上下文菜单
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      // 检查点击是否在上下文菜单内部
      const target = e.target as HTMLElement;
      if (!target.closest(".context-menu")) {
        closeContextMenu();
      }
    };
    // 延迟添加以避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [contextMenu, closeContextMenu]);

  // 右键菜单：打开轻量标签创建对话框
  const handleCreateLightweightTag = useCallback(() => {
    if (!contextMenu) return;
    setTagDialog({ type: "lightweight", commit: contextMenu.commit });
    setTagName("");
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  // 右键菜单：打开附注标签创建对话框
  const handleCreateAnnotatedTag = useCallback(() => {
    if (!contextMenu) return;
    setTagDialog({ type: "annotated", commit: contextMenu.commit });
    setTagName("");
    setTagMessage("");
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  // 执行标签创建
  const handleCreateTag = useCallback(async () => {
    if (!tagDialog || !tagName.trim()) return;
    setCreatingTag(true);
    try {
      if (tagDialog.type === "lightweight") {
        await createLightweightTag(repoPath, tagName.trim(), tagDialog.commit.id);
      } else {
        await createAnnotatedTag(repoPath, tagName.trim(), tagMessage.trim() || tagName.trim(), tagDialog.commit.id);
      }
      setTagDialog(null);
      onTagCreated?.();
    } catch (e) {
      console.error("创建标签失败:", e);
      alert("创建标签失败: " + e);
    } finally {
      setCreatingTag(false);
    }
  }, [tagDialog, tagName, tagMessage, repoPath, onTagCreated]);

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
          aheadCount={ahead}
          onSelect={onSelectCommit}
          onContextMenu={(commit, e) => {
            setContextMenu({ x: e.clientX, y: e.clientY, commit });
          }}
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

      {/* ===== 右键上下文菜单 ===== */}
      {contextMenu && (
        <div
          className="context-menu fixed z-50 bg-card border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border truncate max-w-[200px]">
            {contextMenu.commit.id.slice(0, 7)} - {contextMenu.commit.message?.slice(0, 30)}
          </div>
          <button
            onClick={handleCreateLightweightTag}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
              <path d="M7 7h.01" />
            </svg>
            创建轻量标签
          </button>
          <button
            onClick={handleCreateAnnotatedTag}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            创建附注标签
          </button>
        </div>
      )}

      {/* ===== 标签创建对话框（遮罩层） ===== */}
      {tagDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setTagDialog(null)}
        >
          <div
            className="bg-card border border-border rounded-lg shadow-xl p-4 w-[400px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium mb-3">
              {tagDialog.type === "lightweight" ? "创建轻量标签" : "创建附注标签"}
            </h3>

            {/* 目标提交信息 */}
            <div className="mb-3 text-[10px] text-muted-foreground">
              目标提交：{tagDialog.commit.id.slice(0, 7)} - {tagDialog.commit.message?.slice(0, 50)}
            </div>

            {/* 标签名称 */}
            <div className="mb-3">
              <label className="text-[10px] text-muted-foreground block mb-1">标签名称</label>
              <input
                type="text"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="输入标签名称（如 v1.0.0）"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-input bg-background outline-none focus:border-primary"
                autoFocus
              />
            </div>

            {/* 附注标签消息 */}
            {tagDialog.type === "annotated" && (
              <div className="mb-3">
                <label className="text-[10px] text-muted-foreground block mb-1">标签消息（可选）</label>
                <textarea
                  value={tagMessage}
                  onChange={(e) => setTagMessage(e.target.value)}
                  placeholder="输入标签描述信息..."
                  rows={3}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-input bg-background outline-none focus:border-primary resize-none"
                />
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTagDialog(null)}
                className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={handleCreateTag}
                disabled={creatingTag || !tagName.trim()}
                className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {creatingTag ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}