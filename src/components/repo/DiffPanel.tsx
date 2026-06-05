/**
 * Diff 对比面板组件
 *
 * 基于 react-diff-view 封装，接收原始 git diff 文本，解析并渲染为 split/unified 视图。
 *
 * 用法：
 * ```tsx
 * <DiffPanel diffText={rawDiff} />
 * <DiffPanel diffText={rawDiff} viewType="unified" />
 * ```
 */

import { useMemo } from "react";
import { parseDiff, Diff, Hunk } from "react-diff-view";
import "react-diff-view/style/index.css";

interface DiffPanelProps {
  /** 原始 git diff 文本 */
  diffText: string;
  /** 视图模式：split（左右分栏）| unified（统一视图），默认 split */
  viewType?: "split" | "unified";
  /** 文件路径（可选，用于 fallback 显示） */
  fileName?: string;
}

export default function DiffPanel({
  diffText,
  viewType = "split",
}: DiffPanelProps) {
  const files = useMemo(() => {
    if (!diffText) return [];
    try {
      return parseDiff(diffText);
    } catch {
      return [];
    }
  }, [diffText]);

  // 空状态
  if (!diffText) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        无差异
      </div>
    );
  }

  // 解析失败 → 回退显示纯文本
  if (files.length === 0) {
    return (
      <pre className="p-3 text-xs font-mono whitespace-pre-wrap">
        {diffText}
      </pre>
    );
  }

  return (
    <div className="diff-panel h-full overflow-auto text-xs [&_.diff-line]:leading-4">
      {files.map((file) => {
        const key = `${file.oldRevision}-${file.newRevision}`;
        return (
          <Diff
            key={key}
            viewType={viewType}
            diffType={file.type}
            hunks={file.hunks}
          >
            {(hunks) =>
              hunks.map((hunk) => (
                <Hunk key={hunk.content} hunk={hunk} />
              ))
            }
          </Diff>
        );
      })}
    </div>
  );
}