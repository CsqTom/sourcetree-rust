/**
 * 提交图 DAG 可视化组件
 *
 * 将提交列表渲染为带分支着色的 DAG 图（类似 git log --graph 的图形化版本）
 * 每个提交条目左侧显示小 SVG 图，包含：
 * - 分支连接线（竖线，不同分支不同颜色）
 * - 提交节点（彩色圆点）
 * - 合并/分叉连接线
 */

import { useMemo } from "react";
import type { CommitEntry } from "@/services/git";

// ===== 分支颜色调色板（10 色，循环使用） =====
const BRANCH_COLORS = [
  "#4CAF50", // 绿
  "#2196F3", // 蓝
  "#FF9800", // 橙
  "#9C27B0", // 紫
  "#F44336", // 红
  "#00BCD4", // 青
  "#FF5722", // 深橙
  "#3F51B5", // 靛蓝
  "#CDDC39", // 黄绿
  "#E91E63", // 粉
];

// ===== 每列的图数据 =====
interface RowGraph {
  /** 此提交节点所在的列索引 */
  col: number;
  /** 所有活跃列的索引和颜色 */
  columns: { idx: number; color: string }[];
  /** 连接：从此提交到特定父提交列的连线 */
  connections: { fromCol: number; toCol: number }[];
}

// ===== 列状态 =====
interface ColState {
  tip: string;
  color: string;
}

/**
 * 从提交列表构建 DAG 图结构
 *
 * 算法说明（与 git log --graph 类似）：
 * 1. 维护一组活跃的"列"（每个列代表一条正在进行的分支线）
 * 2. 遍历提交列表（从最新到最旧），每个提交占据一个列
 * 3. 第一个父提交继承该列，其他父提交创建新列
 * 4. 已处理的提交从活跃列中移除
 */
function buildGraph(commits: CommitEntry[]): RowGraph[] {
  const rows: RowGraph[] = [];
  const cols: ColState[] = [];
  let colorIdx = 0;

  /** 获取下一个分支颜色 */
  const nextColor = () => BRANCH_COLORS[colorIdx++ % BRANCH_COLORS.length];

  /** 提交 ID → 颜色缓存 */
  const colorCache = new Map<string, string>();

  for (const commit of commits) {
    // 阶段 1：找到此提交在列中的位置
    let colIdx = cols.findIndex((c) => c.tip === commit.id);

    if (colIdx === -1) {
      // 新提交：分配颜色，在父提交所在列之后插入
      const color = colorCache.get(commit.id) ?? nextColor();
      colorCache.set(commit.id, color);

      let insertAfter = -1;
      for (const pid of commit.parent_ids) {
        const pc = cols.findIndex((c) => c.tip === pid);
        if (pc >= 0 && pc > insertAfter) insertAfter = pc;
      }
      cols.splice(insertAfter + 1, 0, {
        tip: commit.id,
        color,
      });
      colIdx = insertAfter + 1;
    }

    const commitColor = cols[colIdx].color;

    // 阶段 2：收集此行所有活跃列
    const activeCols = cols.map((c, i) => ({ idx: i, color: c.color }));

    // 阶段 3：确定连线（到父提交的跨列连接）
    const connections: { fromCol: number; toCol: number }[] = [];
    for (const pid of commit.parent_ids) {
      const pc = cols.findIndex((c) => c.tip === pid);
      if (pc >= 0 && pc !== colIdx) {
        connections.push({ fromCol: colIdx, toCol: pc });
      }
    }

    rows.push({ col: colIdx, columns: activeCols, connections });

    // 阶段 4：更新列状态
    cols.splice(colIdx, 1); // 移除此提交

    // 已被其他列跟踪的父提交 ID 集合（避免重复插入）
    const trackedParents = new Set(cols.map((c) => c.tip));

    // 逆序处理父提交，确保第一个父提交占据刚释放的列位置
    const parents = [...commit.parent_ids];
    for (let i = parents.length - 1; i >= 0; i--) {
      const pid = parents[i];
      // ★ 关键修复：若父提交已被其他列跟踪，不再重复插入
      if (trackedParents.has(pid)) continue;

      if (i === 0) {
        // 第一个父提交继承此列位置和颜色（主线延续）
        const color = colorCache.get(pid) ?? commitColor;
        colorCache.set(pid, color);
        cols.splice(colIdx, 0, { tip: pid, color });
      } else {
        // 其他父提交追加为新列（分叉分支）
        const color = colorCache.get(pid) ?? nextColor();
        colorCache.set(pid, color);
        cols.push({ tip: pid, color });
      }
    }

    // 清理孤儿列（其 tip 不在后续提交中出现）
    const futureIds = new Set(
      commits.slice(rows.length).flatMap((c) => [c.id, ...c.parent_ids])
    );
    for (let i = cols.length - 1; i >= 0; i--) {
      if (!futureIds.has(cols[i].tip)) {
        cols.splice(i, 1);
      }
    }
  }

  return rows;
}

// ===== SVG 渲染常量 =====
const COL_W = 16; // 每列宽度
const PAD = 4; // 左 padding
const ROW_H = 28; // 行高（SVG 高度）
const MID_Y = ROW_H / 2;
const DOT_R = 4; // 圆点半径

interface CommitGraphProps {
  commits: CommitEntry[];
  selectedId: string | null;
  onSelect: (commit: CommitEntry) => void;
  currentBranch: string;
}

export default function CommitGraph({
  commits,
  selectedId,
  onSelect,
  currentBranch,
}: CommitGraphProps) {
  const graph = useMemo(() => buildGraph(commits), [commits]);
  // 全局最大列数，保持所有行 SVG 宽度一致
  const maxCols = useMemo(
    () => Math.max(1, ...graph.map((r) => Math.max(r.col + 1, r.columns.length))),
    [graph]
  );
  const svgW = maxCols * COL_W + PAD * 2;

  return (
    <div className="overflow-y-auto min-h-0">
      {graph.length === 0 ? (
        <div className="px-3 py-8 text-xs text-muted-foreground text-center">
          暂无提交历史
        </div>
      ) : (
        commits.map((commit, idx) => {
          const row = graph[idx];
          const isSelected = commit.id === selectedId;
          return (
            <div
              key={commit.id}
              onClick={() => onSelect(commit)}
              className={`flex cursor-pointer hover:bg-accent/30 border-b border-border ${
                isSelected ? "bg-accent" : ""
              }`}
            >
              {/* 左侧 SVG 图 */}
              <svg
                width={svgW}
                height={ROW_H}
                viewBox={`0 0 ${svgW} ${ROW_H}`}
                className="shrink-0"
              >
                {/* 1. 竖线遍历所有活跃列 */}
                {row.columns.map((col) => {
                  const cx = PAD + col.idx * COL_W + COL_W / 2;
                  return (
                    <line
                      key={`v-${col.idx}`}
                      x1={cx}
                      y1={0}
                      x2={cx}
                      y2={ROW_H}
                      stroke={col.color}
                      strokeWidth={2}
                      opacity={col.idx === row.col ? 0.8 : 0.4}
                    />
                  );
                })}

                {/* 2. 连线：从此提交到父提交（跨列的情况） */}
                {row.connections.map((conn, ci) => {
                  const fromCx = PAD + conn.fromCol * COL_W + COL_W / 2;
                  const toCx = PAD + conn.toCol * COL_W + COL_W / 2;
                  const color =
                    row.columns.find((c) => c.idx === conn.toCol)?.color ??
                    BRANCH_COLORS[conn.toCol % BRANCH_COLORS.length];
                  return (
                    <g key={`conn-${ci}`}>
                      {/* 水平线 */}
                      <line
                        x1={fromCx}
                        y1={MID_Y}
                        x2={toCx}
                        y2={MID_Y}
                        stroke={color}
                        strokeWidth={2}
                      />
                      {/* 从水平线端点向下 */}
                      <line
                        x1={toCx}
                        y1={MID_Y}
                        x2={toCx}
                        y2={ROW_H}
                        stroke={color}
                        strokeWidth={2}
                      />
                    </g>
                  );
                })}

                {/* 3. 提交节点（圆点） */}
                {(() => {
                  const cx = PAD + row.col * COL_W + COL_W / 2;
                  const color =
                    row.columns.find((c) => c.idx === row.col)?.color ??
                    BRANCH_COLORS[row.col % BRANCH_COLORS.length];

                  const isMerge = row.connections.length > 0;
                  return isMerge ? (
                    // 合并提交用稍大的圆
                    <>
                      <circle
                        cx={cx}
                        cy={MID_Y}
                        r={DOT_R + 1}
                        fill={color}
                        stroke="white"
                        strokeWidth={2}
                      />
                      <circle
                        cx={cx}
                        cy={MID_Y}
                        r={DOT_R - 1}
                        fill="white"
                        opacity={0.3}
                      />
                    </>
                  ) : (
                    <circle
                      cx={cx}
                      cy={MID_Y}
                      r={DOT_R}
                      fill={color}
                      stroke={isSelected ? "#3B82F6" : "white"}
                      strokeWidth={2}
                    />
                  );
                })()}
              </svg>

              {/* 右侧提交信息 — 一行布局：tags 提交说明 日期 SHA */}
              <div className="flex-1 px-2 py-2 min-w-0 flex items-center gap-2 text-xs">
                {/* tags */}
                {commit.ref_names.length > 0 && (
                  <span className="flex gap-0.5 shrink-0">
                    {commit.ref_names.map((ref) => (
                      <span
                        key={ref}
                        className={`px-1 py-0.5 text-[9px] rounded ${
                          ref.startsWith("tag:")
                            ? "bg-yellow-500/20 text-yellow-700"
                            : ref === currentBranch
                              ? "bg-green-500/20 text-green-700"
                              : "bg-blue-500/20 text-blue-700"
                        }`}
                      >
                        {ref.replace(/^tag:\s*/, "")}
                      </span>
                    ))}
                  </span>
                )}
                {/* 提交说明（60% 空间） */}
                <span className="truncate font-medium flex-1 min-w-0">
                  {commit.message}
                </span>
                {/* 日期 */}
                <span className="text-muted-foreground shrink-0">
                  {new Date(commit.time * 1000).toLocaleString()}
                </span>
                {/* SHA */}
                <span className="font-mono text-muted-foreground shrink-0">
                  {commit.id.slice(0, 7)}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}