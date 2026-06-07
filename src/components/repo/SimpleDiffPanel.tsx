/**
 * 简易 Diff 显示组件（SourceTree 风格）
 *
 * 不使用第三方 diff 组件，直接解析 git diff 文本，
 * 以纯文本方式显示，带有 +/- 符号。
 *
 * 编辑模式功能：
 * - +/- 行支持多选（Ctrl/Shift + 点击）
 * - 选中后可通过按钮暂存或丢弃选中的行
 * - 未选中行时点击按钮操作整个 hunk
 */

import { useMemo, useState, useCallback } from "react";

interface DiffLine {
  type: "added" | "removed" | "context" | "nonewline";
  content: string;
  /** 该行在旧文件中的行号（仅 +/-/context 行有效） */
  oldLineNum?: number;
  /** 该行在新文件中的行号（仅 +/-/context 行有效） */
  newLineNum?: number;
}

interface DiffHunk {
  index: number;
  header: string;
  lines: DiffLine[];
}

interface SimpleDiffPanelProps {
  /** 原始 git diff 文本 */
  diffText: string;
  /** 文件路径 */
  fileName: string;
  /** 是否显示暂存/丢弃按钮（编辑模式） */
  showActions?: boolean;
  /** 是否为已暂存文件（true 时按钮显示"取消暂存"，false 时显示"暂存/丢弃"） */
  isStaged?: boolean;
  /** 暂存 hunk 回调 */
  onStageHunk?: (hunkIndex: number) => void;
  /** 丢弃 hunk 回调 */
  onDiscardHunk?: (hunkIndex: number) => void;
  /** 暂存选中行回调：参数为 (选中的行列表) — 每项为 {hunkIndex, lineIndices} */
  onStageLines?: (selections: { hunkIndex: number; lineIndices: number[] }[]) => void;
  /** 丢弃选中行回调 */
  onDiscardLines?: (selections: { hunkIndex: number; lineIndices: number[] }[]) => void;
  /** 取消暂存选中行回调（isStaged=true 时使用） */
  onUnstageLines?: (selections: { hunkIndex: number; lineIndices: number[] }[]) => void;
}

/** 解析 git diff 文本，追踪行号 */
function parseGitDiff(diffText: string): DiffHunk[] {
  const lines = diffText.split("\n");
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("@@")) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      currentHunk = {
        index: hunks.length,
        header: line,
        lines: [], // 不包含 header 行，使 lineIndex 与后端对齐
      };
    } else if (currentHunk) {
      let type: DiffLine["type"] = "context";
      let content = line;

      if (line.startsWith("\\")) {
        // "\ No newline at end of file" 标记
        type = "nonewline";
        content = line;
      } else if (line.startsWith("+")) {
        type = "added";
        content = line.slice(1);
      } else if (line.startsWith("-")) {
        type = "removed";
        content = line.slice(1);
      } else if (line.startsWith(" ")) {
        content = line.slice(1);
      } else if (line === "") {
        // 空行也是上下文
        content = "";
      }

      currentHunk.lines.push({ type, content });
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  // 计算行号
  for (const hunk of hunks) {
    // 解析 @@ -old_start,old_count +new_start,new_count @@
    const headerMatch = hunk.header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!headerMatch) continue;

    let oldNum: number | undefined = parseInt(headerMatch[1], 10);
    let newNum: number | undefined = parseInt(headerMatch[3], 10);

    for (const dl of hunk.lines) {
      if (dl.type === "nonewline") continue;

      if (dl.type === "context") {
        dl.oldLineNum = oldNum;
        dl.newLineNum = newNum;
        oldNum!++;
        newNum!++;
      } else if (dl.type === "removed") {
        dl.oldLineNum = oldNum;
        oldNum!++;
      } else if (dl.type === "added") {
        dl.newLineNum = newNum;
        newNum!++;
      }
    }
  }

  return hunks;
}

/** 生成选中行的选中键 */
function selectionKey(hunkIndex: number, lineIndex: number): string {
  return `${hunkIndex}:${lineIndex}`;
}

export default function SimpleDiffPanel({
  diffText,
  showActions = false,
  isStaged = false,
  onStageHunk,
  onDiscardHunk,
  onStageLines,
  onDiscardLines,
  onUnstageLines,
}: SimpleDiffPanelProps) {
  const hunks = useMemo(() => parseGitDiff(diffText), [diffText]);

  // 选中的行集合 Set<"hunkIndex:lineIndex">
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());

  // 清除选中
  const clearSelection = useCallback(() => setSelectedLines(new Set()), []);

  // 点击行切换选中（仅 +/- 行可选中）
  const handleLineClick = useCallback(
    (hunkIndex: number, lineIndex: number, type: string, e: React.MouseEvent) => {
      if (type !== "added" && type !== "removed") return;

      const key = selectionKey(hunkIndex, lineIndex);

      setSelectedLines((prev) => {
        const next = new Set(prev);
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          // Ctrl/Shift + 点击：切换当前选中，保留其他
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
        } else {
          // 普通点击：单选
          if (next.size === 1 && next.has(key)) {
            next.delete(key);
          } else {
            next.clear();
            next.add(key);
          }
        }
        return next;
      });
    },
    []
  );

  // 收集所有选中行的结构（按 hunk 分组）
  const buildSelections = useCallback((): { hunkIndex: number; lineIndices: number[] }[] => {
    if (selectedLines.size === 0) return [];

    const map = new Map<number, number[]>();
    for (const key of selectedLines) {
      const [hStr, lStr] = key.split(":");
      const h = parseInt(hStr, 10);
      const l = parseInt(lStr, 10);
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(l);
    }

    return Array.from(map.entries())
      .map(([hunkIndex, lineIndices]) => ({
        hunkIndex,
        lineIndices: lineIndices.sort((a, b) => a - b),
      }))
      .sort((a, b) => a.hunkIndex - b.hunkIndex);
  }, [selectedLines]);

  // 选中行数量
  const totalSelected = selectedLines.size;
  const hasSelection = totalSelected > 0;

  // 暂存选中行
  const handleStageSelected = useCallback(() => {
    if (!hasSelection) return;
    const selections = buildSelections();
    onStageLines?.(selections);
    clearSelection();
  }, [hasSelection, buildSelections, onStageLines, clearSelection]);

  // 丢弃选中行
  const handleDiscardSelected = useCallback(() => {
    if (!hasSelection) return;
    const selections = buildSelections();
    onDiscardLines?.(selections);
    clearSelection();
  }, [hasSelection, buildSelections, onDiscardLines, clearSelection]);

  // 取消暂存选中行（isStaged=true 时使用）
  const handleUnstageSelected = useCallback(() => {
    if (!hasSelection) return;
    const selections = buildSelections();
    onUnstageLines?.(selections);
    clearSelection();
  }, [hasSelection, buildSelections, onUnstageLines, clearSelection]);

  // 取消暂存整个 hunk：收集所有 +/- 行在 hunk 中的索引，并调用 onUnstageLines
  const handleUnstageHunk = useCallback((hunkIndex: number) => {
    const hunk = hunks[hunkIndex];
    if (!hunk) return;
    // 收集所有 +/- 行的索引（在 hunk.lines 中的位置）
    const lineIndices: number[] = [];
    hunk.lines.forEach((line, idx) => {
      if (line.type === "added" || line.type === "removed") {
        lineIndices.push(idx);
      }
    });
    if (lineIndices.length === 0) return;
    onUnstageLines?.([{ hunkIndex, lineIndices }]);
  }, [hunks, onUnstageLines]);

  if (!diffText) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        无差异
      </div>
    );
  }

  if (hunks.length === 0) {
    return (
      <pre className="p-3 text-xs font-mono whitespace-pre-wrap">
        {diffText}
      </pre>
    );
  }

  return (
    <div className="simple-diff-panel h-full overflow-auto" onClick={hasSelection ? undefined : undefined}>
      {hunks.map((hunk) => {
        // 当前 hunk 的选中行数
        const hunkSelectedCount = hunk.lines.reduce(
          (acc, _, li) => acc + (selectedLines.has(selectionKey(hunk.index, li)) ? 1 : 0),
          0
        );

        // 当前 hunk 选中行对应的操作总行数（含中间的上下文行）
        const hunkAffectedCount = (() => {
          if (hunkSelectedCount === 0) return 0;
          const selectedIndices = hunk.lines
            .map((_, li) => li)
            .filter((li) => selectedLines.has(selectionKey(hunk.index, li)));
          const first = selectedIndices[0];
          const last = selectedIndices[selectedIndices.length - 1];
          // 从 first 到 last 之间的所有行（含上下文行），排除 nonewline 行
          return hunk.lines.slice(first, last + 1).filter((l) => l.type !== "nonewline").length;
        })();

        return (
          <div key={hunk.index} className="border-b border-border last:border-b-0">
            {/* Hunk 头部 */}
            <div className="sticky top-0 bg-muted/30 px-3 py-1.5 flex items-center justify-between z-10">
              <span className="text-[10px] text-muted-foreground font-mono">
                {hunk.header}
              </span>

              {/* 操作按钮 */}
              {showActions && (
                <div className="flex items-center gap-1">
                  {isStaged ? (
                    /* ===== 已暂存文件模式：仅显示"取消暂存"按钮 ===== */
                    <>
                      {hasSelection && hunkSelectedCount > 0 ? (
                        <button
                          onClick={() => handleUnstageSelected()}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-600 hover:bg-amber-50"
                          title={`取消暂存选中的${hunkSelectedCount}行，共影响${hunkAffectedCount}行`}
                        >
                          取消暂存选中行 ({hunkSelectedCount}/{hunkAffectedCount})
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUnstageHunk(hunk.index)}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-600 hover:bg-amber-50"
                          title="取消暂存此区块"
                        >
                          取消暂存区块
                        </button>
                      )}
                    </>
                  ) : (
                    /* ===== 未暂存文件模式：暂存/丢弃按钮 ===== */
                    <>
                      {hasSelection && hunkSelectedCount > 0 ? (
                        <>
                          <button
                            onClick={() => handleStageSelected()}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-green-300 text-green-600 hover:bg-green-50"
                            title={`暂存选中的${hunkSelectedCount}行，共影响${hunkAffectedCount}行`}
                          >
                            暂存选中行 ({hunkSelectedCount}/{hunkAffectedCount})
                          </button>
                          <button
                            onClick={() => handleDiscardSelected()}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-red-300 text-red-600 hover:bg-red-50"
                            title={`丢弃选中的${hunkSelectedCount}行，共影响${hunkAffectedCount}行`}
                          >
                            丢弃选中行 ({hunkSelectedCount}/{hunkAffectedCount})
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => onStageHunk?.(hunk.index)}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-green-300 text-green-600 hover:bg-green-50"
                            title="暂存此区块"
                          >
                            暂存区块
                          </button>
                          <button
                            onClick={() => onDiscardHunk?.(hunk.index)}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-red-300 text-red-600 hover:bg-red-50"
                            title="丢弃此区块"
                          >
                            丢弃区块
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Hunk 内容 */}
            <div className="bg-background">
              {/* Hunk 头部行（单独渲染，不参与行索引） */}
              <div className="flex items-center font-mono text-xs leading-5 bg-muted/20 text-muted-foreground">
                <span className="w-10 shrink-0 text-right pr-2 select-none"></span>
                <span className="w-10 shrink-0 text-right pr-2 select-none"></span>
                <span className="w-5 shrink-0 select-none"></span>
                <span className="flex-1 whitespace-pre overflow-hidden text-ellipsis px-2">{hunk.header}</span>
              </div>

              {hunk.lines.map((line, lineIndex) => {
                const isSelected = selectedLines.has(selectionKey(hunk.index, lineIndex));
                const isSelectable = line.type === "added" || line.type === "removed";

                // 行号显示
                const oldNum = line.oldLineNum;
                const newNum = line.newLineNum;

                // "\ No newline at end of file" 行特殊处理
                const isNoNewline = line.type === "nonewline";

                return (
                  <div
                    key={lineIndex}
                    onClick={(e) => handleLineClick(hunk.index, lineIndex, line.type, e)}
                    className={`flex items-center font-mono text-xs leading-5 ${
                      isNoNewline
                        ? "bg-muted/10 text-muted-foreground/60 italic"
                        : line.type === "added"
                        ? isSelected
                          ? "bg-green-200/70"
                          : "bg-green-50/60"
                        : line.type === "removed"
                        ? isSelected
                          ? "bg-red-200/70"
                          : "bg-red-50/60"
                        : "bg-background"
                    } ${isSelectable ? "cursor-pointer" : ""}`}
                  >
                    {/* 旧文件行号 */}
                    <span className="w-10 shrink-0 text-right pr-2 text-muted-foreground/50 select-none">
                      {isNoNewline ? "" : oldNum ?? ""}
                    </span>
                    {/* 新文件行号 */}
                    <span className="w-10 shrink-0 text-right pr-2 text-muted-foreground/50 select-none">
                      {isNoNewline ? "" : newNum ?? ""}
                    </span>
                    {/* +/- 符号 */}
                    <span
                      className={`w-5 flex items-center justify-center shrink-0 select-none ${
                        line.type === "added"
                          ? "text-green-600"
                          : line.type === "removed"
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {isNoNewline ? "" : line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                    </span>
                    {/* 内容 */}
                    <span
                      className={`flex-1 whitespace-pre overflow-hidden text-ellipsis px-1 ${
                        line.type === "added"
                          ? "text-green-800"
                          : line.type === "removed"
                          ? "text-red-800"
                          : "text-foreground"
                      }`}
                    >
                      {line.content}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}