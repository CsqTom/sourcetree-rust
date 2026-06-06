/**
 * 提交图 DAG 可视化组件
 *
 * 参考 pvigier 的 Commit Graph Drawing Algorithms 实现
 * (https://pvigier.github.io/2019/05/06/commit-graph-drawing-algorithms.html)
 *
 * 核心思路：
 * 1. 预计算 children 关系（从 parents 反推）
 * 2. 区分 branchChildren（child.parents[0] === commit）和 mergeChildren
 * 3. 从最新→最旧遍历，维护活跃分支列表 B，确定每个提交的列号 j
 * 4. 计算每个提交到父提交的连线（向下）和子提交到此提交的连线（向上）
 *
 * 渲染策略（每行 SVG 独立，高度 ROW_H）：
 * - 竖线：活跃分支列从 y=0 到 y=ROW_H
 * - 子连线（向上）：从子提交到此提交的跨列连线
 *   - 同列：竖线已覆盖
 *   - 跨列：从 (fromCx, 0) 贝塞尔曲线到 (toCx, MID_Y)
 * - 父连线（向下）：从此提交到父提交的跨列连线
 *   - 同列：竖线已覆盖
 *   - 跨列：从 (fromCx, MID_Y) 贝塞尔曲线到 (toCx, ROW_H)
 * - 提交节点：在 (col, MID_Y) 处画圆
 * 绘制位置        分支线（type=branch）   合并线（type=merge）
 * 父行 （子连线） ✅ 子列→垂直→弯到父节点  ❌ 不画 
 * 子行 （父连线）  ❌ 不画                ✅ 从子节点→弯到父列底部
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

// ===== 提交的子提交信息 =====
interface CommitChildren {
  /** branchChildren：此提交是 child 的第一父提交（延续分支） */
  branch: string[];
  /** mergeChildren：此提交是 child 的非第一父提交（合并入分支） */
  merge: string[];
}

// ===== 图连线 =====
interface GraphEdge {
  /** 起点列号 */
  fromCol: number;
  /** 终点列号 */
  toCol: number;
  /** 连线类型：branch=延续分支, merge=合并 */
  type: "branch" | "merge";
  /** 连线颜色 */
  color: string;
}

// ===== 合并线隔行延续 =====
interface MergePassThrough {
  /** 需要延续竖线的列号（即合并线终点的列） */
  col: number;
  /** 颜色 */
  color: string;
}

// ===== 每行的图渲染数据 =====
interface RowGraph {
  /** 此提交所在的列号 */
  col: number;
  /** 活跃分支列表（null 表示该列空闲） */
  branches: (string | null)[];
  /** 子连线：从子提交到此提交的跨列连线（从顶部到 MID_Y） */
  childEdges: GraphEdge[];
  /** 父连线：从此提交到父提交的跨列连线（从 MID_Y 到底部） */
  parentEdges: GraphEdge[];
  /** 合并线隔行延续：中间行的竖线，承载合并线跨越多行 */
  mergePassThroughs: MergePassThrough[];
}

/**
 * 预计算每个提交的 children 关系
 */
function computeChildren(
  commits: CommitEntry[]
): Map<string, CommitChildren> {
  const result = new Map<string, CommitChildren>();

  for (const c of commits) {
    result.set(c.id, { branch: [], merge: [] });
  }

  for (const c of commits) {
    for (let i = 0; i < c.parent_ids.length; i++) {
      const pid = c.parent_ids[i];
      const parent = result.get(pid);
      if (!parent) continue;
      if (i === 0) {
        parent.branch.push(c.id);
      } else {
        parent.merge.push(c.id);
      }
    }
  }

  return result;
}

/**
 * 构建 DAG 图结构
 *
 * 参考 pvigier 的 curved_branches 算法，从最新→最旧遍历提交，
 * 保证子提交（更新的）先分配列号，父提交替换子提交位置，实现同一分支连续。
 *
 * 遍历方向说明：
 * - 从最新→最旧（commits 原始顺序），因为每个提交需要查找其 children 的列号，
 *   而 children 是更新的提交，在数组中排在前面，已经处理过。
 * - 若从最旧→最新遍历，子提交尚未分配列号，父提交找不到替换目标，会创建新列。
 */
function buildGraph(commits: CommitEntry[]): RowGraph[] {
  if (commits.length === 0) return [];

  const childrenMap = computeChildren(commits);

  // 提交 ID → 列号映射
  const colMap = new Map<string, number>();

  // 颜色分配
  let colorIdx = 0;
  const nextColor = () => BRANCH_COLORS[colorIdx++ % BRANCH_COLORS.length];
  const colorMap = new Map<string, string>();

  // 活跃分支列表 B：B[j] = commitId | null
  const B: (string | null)[] = [];

  // 结果：按原始提交顺序（最新→最旧）存储
  const rowsMap = new Map<string, RowGraph>();

  // ===== 第一遍：分配列号（最新→最旧） =====
  for (const commit of commits) {
    const ch = childrenMap.get(commit.id)!;

    // 选择一个 branchChild 来替换（优先选最左边的）
    let replaceChild: string | null = null;
    let replaceIdx = -1;

    for (const childId of ch.branch) {
      const childCol = colMap.get(childId);
      if (childCol !== undefined) {
        if (replaceIdx === -1 || childCol < replaceIdx) {
          replaceChild = childId;
          replaceIdx = childCol;
        }
      }
    }

    if (replaceChild !== null) {
      // 延续分支：替换子提交在该列的位置
      B[replaceIdx] = commit.id;
      colMap.set(commit.id, replaceIdx);
      const childColor = colorMap.get(replaceChild);
      colorMap.set(commit.id, childColor ?? nextColor());
    } else {
      // 新分支：找空位或追加
      const nilIdx = B.indexOf(null);
      if (nilIdx !== -1) {
        B[nilIdx] = commit.id;
        colMap.set(commit.id, nilIdx);
      } else {
        B.push(commit.id);
        colMap.set(commit.id, B.length - 1);
      }
      colorMap.set(commit.id, nextColor());
    }

    // 移除未选中的 branchChildren（其分支在此结束）
    for (const childId of ch.branch) {
      if (childId === replaceChild) continue;
      const childCol = colMap.get(childId);
      if (childCol !== undefined && B[childCol] === childId) {
        B[childCol] = null;
      }
    }

    rowsMap.set(commit.id, {
      col: colMap.get(commit.id)!,
      branches: [...B],
      childEdges: [],
      parentEdges: [],
      mergePassThroughs: [],
    });
  }

  // ===== 第二遍：计算每个提交的子提交到此提交的跨列连线（向上） =====
  for (const commit of commits) {
    const commitCol = colMap.get(commit.id)!;
    const childEdges: GraphEdge[] = [];
    const ch = childrenMap.get(commit.id)!;

    // 处理所有分支子提交
    for (const childId of ch.branch) {
      const childCol = colMap.get(childId);
      if (childCol !== undefined && childCol !== commitCol) {
        childEdges.push({
          fromCol: childCol,
          toCol: commitCol,
          type: "branch",
          color: BRANCH_COLORS[childCol % BRANCH_COLORS.length],
        });
      }
    }

    // 处理所有合并子提交
    for (const childId of ch.merge) {
      const childCol = colMap.get(childId);
      if (childCol !== undefined && childCol !== commitCol) {
        childEdges.push({
          fromCol: childCol,
          toCol: commitCol,
          type: "merge",
          color: BRANCH_COLORS[childCol % BRANCH_COLORS.length],
        });
      }
    }

    rowsMap.get(commit.id)!.childEdges = childEdges;
  }

  // ===== 第三遍：计算每个提交到父提交的跨列连线（向下）以及合并线隔行延续 =====
  // 先构建提交 ID → 索引映射，用于查找隔行范围
  const commitIndexMap = new Map<string, number>();
  commits.forEach((c, i) => commitIndexMap.set(c.id, i));

  for (const commit of commits) {
    const commitCol = colMap.get(commit.id)!;
    const parentEdges: GraphEdge[] = [];
    const curRow = rowsMap.get(commit.id)!;

    for (let i = 0; i < commit.parent_ids.length; i++) {
      const parentId = commit.parent_ids[i];
      const parentCol = colMap.get(parentId);
      if (parentCol !== undefined && parentCol !== commitCol) {
        const edgeType = i === 0 ? "branch" : "merge";
        parentEdges.push({
          fromCol: commitCol,
          toCol: parentCol,
          type: edgeType,
          color: BRANCH_COLORS[parentCol % BRANCH_COLORS.length],
        });

        // 合并线需在隔行补竖线延续
        if (edgeType === "merge") {
          const pIdx = commitIndexMap.get(parentId);
          const cIdx = commitIndexMap.get(commit.id);
          if (pIdx !== undefined && cIdx !== undefined && pIdx > cIdx + 1) {
            for (let r = cIdx + 1; r < pIdx; r++) {
              const row = rowsMap.get(commits[r].id);
              if (row) {
                // 避免重复添加同列延续
                if (!row.mergePassThroughs.some((m) => m.col === parentCol)) {
                  row.mergePassThroughs.push({
                    col: parentCol,
                    color: BRANCH_COLORS[parentCol % BRANCH_COLORS.length],
                  });
                }
              }
            }
          }
        }
      }
    }

    curRow.parentEdges = parentEdges;
  }

  // 按原始提交顺序（最新→最旧）输出
  return commits.map((c) => {
    const row = rowsMap.get(c.id);
    if (!row) {
      return { col: 0, branches: [c.id], childEdges: [], parentEdges: [], mergePassThroughs: [] };
    }
    return row;
  });
}

// ===== SVG 渲染常量 =====
const COL_W = 14;
const PAD = 6;
const ROW_H = 24;
const MID_Y = ROW_H / 2;
const DOT_R = 4;

interface CommitGraphProps {
  commits: CommitEntry[];
  selectedId: string | null;
  onSelect: (commit: CommitEntry) => void;
}

export default function CommitGraph({
  commits,
  selectedId,
  onSelect,
}: CommitGraphProps) {
  // 1. 按时间逆序排列（从新到旧）
  const sortedCommits = useMemo(
    () => [...commits].sort((a, b) => b.time - a.time),
    [commits]
  );
  const graph = useMemo(() => buildGraph(sortedCommits), [sortedCommits]);
  const maxCols = useMemo(
    () => Math.max(1, ...graph.map((r) => Math.max(r.col + 1, r.branches.length))),
    [graph]
  );
  const svgW = maxCols * COL_W + PAD * 2;

  /** 列号 → X 坐标 */
  const colX = (col: number) => PAD + col * COL_W + COL_W / 2;

  return (
    <div className="overflow-y-auto min-h-0">
      {/* 选中行样式：蓝色背景 + 白色文字 */}
      <style>{`
        .row-selected { background-color: #2563eb !important; }
        .row-selected .cmt-text,
        .row-selected .cmt-meta { color: white !important; }
      `}</style>
      {graph.length === 0 ? (
        <div className="px-3 py-8 text-sm text-muted-foreground text-center">
          暂无提交历史
        </div>
      ) : (
        <>
          {/* 列表标题行 */}
          <div className="sticky top-0 z-10 flex border-b border-border bg-muted/80 backdrop-blur text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <div style={{ width: svgW }} className="shrink-0" />
            <div className="flex-1 flex items-center gap-2 px-2 py-1.5 min-w-0">
              <span className="flex-1 min-w-0">提交说明</span>
              <span className="shrink-0 w-[8rem]">作者</span>
              <span className="shrink-0 w-[10rem]">日期</span>
              <span className="shrink-0 w-[4.5rem]">版本</span>
            </div>
          </div>

          {sortedCommits.map((commit, idx) => {
          const row = graph[idx];
          const isSelected = commit.id === selectedId;

          return (
            <div
              key={commit.id}
              onClick={() => onSelect(commit)}
              className={`relative flex items-center cursor-pointer hover:bg-blue-500/20 ${
                isSelected ? "row-selected" : ""
              }`}
            >
              <svg
                width={svgW}
                height={ROW_H}
                viewBox={`0 0 ${svgW} ${ROW_H}`}
                className="shrink-0"
              >
                {/* 1. 竖线：活跃分支列（贯穿整行 y=0 → ROW_H） */}
                {row.branches.map((bid, j) => {
                  if (bid === null) return null;
                  const cx = colX(j);
                  const isThisCommit = bid === commit.id;
                  return (
                    <line
                      key={`v-${j}`}
                      x1={cx}
                      y1={0}
                      x2={cx}
                      y2={ROW_H}
                      stroke={BRANCH_COLORS[j % BRANCH_COLORS.length]}
                      strokeWidth={2.5}
                      opacity={isThisCommit ? 1.0 : 0.75}
                    />
                  );
                })}

                {/* 1b. 合并线隔行延续竖线：合并线需跨越的行，在终点列补竖线 */}
                {row.mergePassThroughs.map((mt) => {
                  // 避免与活跃分支竖线重复
                  if (mt.col < row.branches.length && row.branches[mt.col] !== null) {
                    return null;
                  }
                  const cx = colX(mt.col);
                  return (
                    <line
                      key={`mt-${mt.col}`}
                      x1={cx}
                      y1={0}
                      x2={cx}
                      y2={ROW_H}
                      stroke={mt.color}
                      strokeWidth={2.5}
                      opacity={0.75}
                    />
                  );
                })}

                {/* 2. 子连线（向上）：从子提交到此提交的跨列连线
                    仅分支延续（type=branch）在父行绘制
                    合并线（type=merge）在子行绘制，不在父行重复画 */}
                {row.childEdges
                  .filter((e) => e.type === "branch")
                  .map((edge, ei) => {
                  if (edge.fromCol === edge.toCol) return null;

                  const fromCx = colX(edge.fromCol);
                  const toCx = colX(edge.toCol);

                  // 先垂直走 35% 高度，再平滑弯曲到目标列
                  const vertPct = 0.35;
                  const vertEnd = MID_Y * vertPct;
                  const curveStart = vertEnd + 1;
                  const cp1y = curveStart + (MID_Y - curveStart) * 0.4;
                  const cp2y = curveStart + (MID_Y - curveStart) * 0.6;

                  return (
                    <path
                      key={`ce-${ei}`}
                      d={`M ${fromCx} 0 L ${fromCx} ${vertEnd} C ${fromCx} ${cp1y}, ${toCx} ${cp2y}, ${toCx} ${MID_Y}`}
                      stroke={edge.color}
                      strokeWidth={2}
                      fill="none"
                    />
                  );
                })}

                {/* 3. 父连线（向下）：仅合并时在子提交行绘制
                    分支延续（type=branch）由竖线覆盖，不在子行画 */}
                {row.parentEdges
                  .filter((e) => e.type === "merge")
                  .map((edge, ei) => {
                    if (edge.fromCol === edge.toCol) return null;

                    const fromCx = colX(edge.fromCol);
                    const toCx = colX(edge.toCol);

                    // 从 (fromCx, MID_Y) 贝塞尔曲线到 (toCx, ROW_H)
                    const cp1y = MID_Y + (ROW_H - MID_Y) * 0.55;
                    const cp2y = MID_Y + (ROW_H - MID_Y) * 0.45;

                    return (
                      <path
                        key={`pe-${ei}`}
                        d={`M ${fromCx} ${MID_Y} C ${fromCx} ${cp1y}, ${toCx} ${cp2y}, ${toCx} ${ROW_H}`}
                        stroke={edge.color}
                        strokeWidth={2}
                        fill="none"
                      />
                    );
                  })}

                {/* 4. 提交节点（圆点） */}
                {(() => {
                  const cx = colX(row.col);
                  const color = BRANCH_COLORS[row.col % BRANCH_COLORS.length];
                  const hasMerge = [...row.childEdges, ...row.parentEdges].some(
                    (e) => e.type === "merge"
                  );

                  return hasMerge ? (
                    <>
                      <circle
                        cx={cx}
                        cy={MID_Y}
                        r={DOT_R + 1}
                        fill={isSelected ? "#2563eb" : color}
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
                      fill={isSelected ? "#2563eb" : color}
                      stroke="white"
                      strokeWidth={2}
                    />
                  );
                })()}
              </svg>

              {/* 右侧提交信息 */}
              <div className="flex-1 px-2 min-w-0 flex items-center gap-1 text-xs leading-none">
                {commit.refs.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {commit.refs.map((ref) => {
                      const isAnnotatedTag = ref.kind === "annotated_tag";
                      const isTag = ref.kind === "tag";
                      const isHead = ref.kind === "head";
                      return (
                        <div
                          key={ref.name}
                          className="inline-flex items-center gap-0.5 rounded-sm bg-white dark:bg-gray-100 px-1 py-0.5 text-[10px] text-black font-mono leading-none shadow-sm border-[1px] border-gray-300 dark:border-gray-400"
                          title={`${isHead ? "分支" : isAnnotatedTag ? "附注标签" : "标签"}: ${ref.name}`}
                        >
                          {/* 分支图标 */}
                          {isHead && (
                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-orange-100 dark:bg-orange-200">
                              <svg className="shrink-0 w-2.5 h-2.5 text-orange-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="6" y1="3" x2="6" y2="15" />
                                <circle cx="18" cy="6" r="3" />
                                <circle cx="6" cy="18" r="3" />
                                <path d="M18 9a9 9 0 0 1-9 9" />
                              </svg>
                            </span>
                          )}
                          {/* 轻量标签图标 */}
                          {isTag && (
                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-blue-100 dark:bg-blue-200">
                              <svg className="shrink-0 w-2.5 h-2.5 text-blue-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                                <path d="M7 7h.01" />
                              </svg>
                            </span>
                          )}
                          {/* 附注标签图标 */}
                          {isAnnotatedTag && (
                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-purple-100 dark:bg-purple-200">
                              <svg className="shrink-0 w-2.5 h-2.5 text-purple-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                                <path d="M12 9v4" />
                                <path d="M12 17h.01" />
                              </svg>
                            </span>
                          )}
                          <span className="max-w-[6rem] truncate">{ref.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <span className="truncate flex-1 min-w-0 cmt-text">
                  {commit.message}
                </span>
                <span className="shrink-0 w-[8rem] truncate cmt-meta">
                  {commit.author}
                </span>
                <span className="shrink-0 w-[10rem] cmt-meta">
                  {new Date(commit.time * 1000).toLocaleString()}
                </span>
                <span className="font-mono cmt-meta shrink-0 w-[4.5rem]">
                  {commit.id.slice(0, 7)}
                </span>
              </div>
            </div>
          );
        })}
        </>
      )}
    </div>
  );
}
