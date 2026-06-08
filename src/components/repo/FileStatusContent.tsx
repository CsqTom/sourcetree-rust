/**
 * 文件状态内容组件
 *
 * 显示暂存/未暂存文件列表，查看差异，提交变更
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import SimpleDiffPanel from '@/components/repo/SimpleDiffPanel'
import DiffPanel from '@/components/repo/DiffPanel'
import type { FileStatus } from '@/lib/tauri/types'

/** 根据状态字符返回对应的 SVG 图标 */
export function StatusIcon({ status, className }: { status: string; className?: string }) {
  const cls = className || "w-3.5 h-3.5"
  switch (status) {
    case "M": case "MODIFIED": case "modified":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
    case "A": case "ADDED": case "added":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 12h8M12 8v8" /></svg>
    case "D": case "DELETED": case "deleted":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /></svg>
    case "?": case "UNTRACKED": case "untracked":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
    default:
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
  }
}

export interface FileStatusContentProps {
  stagedFiles: FileStatus[]
  unstagedFiles: FileStatus[]
  untrackedFiles: FileStatus[]
  selectedFile: string | null
  selectedDiff: string
  commitMsg: string
  committing: boolean
  setCommitMsg: (msg: string) => void
  onShowDiff: (path: string, fromStaged?: boolean) => void
  onStage: (path: string) => void
  onStageAll: () => void
  onUnstage: (path: string) => void
  onUnstageAll: () => void
  onCommit: () => void
  onDiscardFile: (path: string) => void
  onDiscardHunk: (path: string, hunkIndex: number) => void
  onStageHunk: (path: string, hunkIndex: number) => void
  onStageLines: (path: string, selections: { hunkIndex: number; lineIndices: number[] }[]) => void
  onDiscardLines: (path: string, selections: { hunkIndex: number; lineIndices: number[] }[]) => void
  onUnstageLines: (path: string, selections: { hunkIndex: number; lineIndices: number[] }[]) => void
  onRefreshDiff?: () => void
}

export function FileStatusContent({
  stagedFiles, unstagedFiles, untrackedFiles,
  selectedFile, selectedDiff,
  commitMsg, committing, setCommitMsg,
  onShowDiff, onStage, onStageAll, onUnstage, onUnstageAll,
  onCommit, onDiscardFile, onDiscardHunk, onStageHunk,
  onStageLines, onDiscardLines, onUnstageLines,
  onRefreshDiff,
}: FileStatusContentProps) {
  const [diffMode, setDiffMode] = useState<"read" | "edit">("edit")
  const [lastClickFromStaged, setLastClickFromStaged] = useState(false)
  const [leftPaneWidth, setLeftPaneWidth] = useState(288) // 默认 72 * 4 = 288px
  const [commitAreaHeight, setCommitAreaHeight] = useState(120)
  const [stagedAreaHeight, setStagedAreaHeight] = useState(40) // 百分比
  const [isDraggingVertical, setIsDraggingVertical] = useState(false)
  const [isDraggingHorizontal, setIsDraggingHorizontal] = useState(false)
  const [isDraggingStaged, setIsDraggingStaged] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const rightPaneRef = useRef<HTMLDivElement>(null)
  const leftPaneRef = useRef<HTMLDivElement>(null)

  const handleShowDiff = useCallback((path: string, fromStaged?: boolean) => {
    setLastClickFromStaged(!!fromStaged)
    onShowDiff(path, fromStaged)
  }, [onShowDiff])

  const isStagedFile = lastClickFromStaged

  // 窗口获焦时自动刷新差异
  useEffect(() => {
    const handleFocus = () => {
      if (selectedFile && onRefreshDiff) onRefreshDiff()
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [selectedFile, onRefreshDiff])

  // 垂直拖动（左右分隔条）
  const handleVerticalDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingVertical(true)
  }

  useEffect(() => {
    const handleVerticalDrag = (e: MouseEvent) => {
      if (!isDraggingVertical || !containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newWidth = Math.max(200, Math.min(500, e.clientX - containerRect.left))
      setLeftPaneWidth(newWidth)
    }

    const handleVerticalDragEnd = () => {
      setIsDraggingVertical(false)
    }

    if (isDraggingVertical) {
      window.addEventListener("mousemove", handleVerticalDrag)
      window.addEventListener("mouseup", handleVerticalDragEnd)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    }

    return () => {
      window.removeEventListener("mousemove", handleVerticalDrag)
      window.removeEventListener("mouseup", handleVerticalDragEnd)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isDraggingVertical])

  // 水平拖动（上下分隔条）
  const handleHorizontalDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingHorizontal(true)
  }

  useEffect(() => {
    const handleHorizontalDrag = (e: MouseEvent) => {
      if (!isDraggingHorizontal || !rightPaneRef.current) return
      const containerRect = rightPaneRef.current.getBoundingClientRect()
      const newHeight = Math.max(80, Math.min(250, containerRect.bottom - e.clientY))
      setCommitAreaHeight(newHeight)
    }

    const handleHorizontalDragEnd = () => {
      setIsDraggingHorizontal(false)
    }

    if (isDraggingHorizontal) {
      window.addEventListener("mousemove", handleHorizontalDrag)
      window.addEventListener("mouseup", handleHorizontalDragEnd)
      document.body.style.cursor = "row-resize"
      document.body.style.userSelect = "none"
    }

    return () => {
      window.removeEventListener("mousemove", handleHorizontalDrag)
      window.removeEventListener("mouseup", handleHorizontalDragEnd)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isDraggingHorizontal])

  // 暂存文件区域拖动
  const handleStagedDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingStaged(true)
  }

  useEffect(() => {
    const handleStagedDrag = (e: MouseEvent) => {
      if (!isDraggingStaged || !leftPaneRef.current) return
      const containerRect = leftPaneRef.current.getBoundingClientRect()
      const containerHeight = containerRect.height
      const offsetY = e.clientY - containerRect.top
      const newHeightPercent = Math.max(20, Math.min(80, (offsetY / containerHeight) * 100))
      setStagedAreaHeight(newHeightPercent)
    }

    const handleStagedDragEnd = () => {
      setIsDraggingStaged(false)
    }

    if (isDraggingStaged) {
      window.addEventListener("mousemove", handleStagedDrag)
      window.addEventListener("mouseup", handleStagedDragEnd)
      document.body.style.cursor = "row-resize"
      document.body.style.userSelect = "none"
    }

    return () => {
      window.removeEventListener("mousemove", handleStagedDrag)
      window.removeEventListener("mouseup", handleStagedDragEnd)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isDraggingStaged])

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden" ref={containerRef}>
      {/* 左侧：暂存文件 + 未暂存文件 */}
      <div className="border-r border-border flex flex-col min-h-0 shrink-0" style={{ width: leftPaneWidth }} ref={leftPaneRef}>
        {/* 暂存文件区域 */}
        <div className="overflow-y-auto border-b border-border min-h-0" style={{ flexBasis: `${stagedAreaHeight}%` }}>
          <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-card flex items-center justify-between sticky top-0 z-10 border-b border-border">
            <span>已暂存文件（{stagedFiles.length}）</span>
            {stagedFiles.length > 0 && (
              <div className="flex items-center gap-1">
                {selectedFile && isStagedFile && stagedFiles.some(f => f.path === selectedFile) && (
                  <button onClick={() => onUnstage(selectedFile)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent text-foreground">
                    取消暂存所选
                  </button>
                )}
                <button onClick={onUnstageAll} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent text-foreground">
                  全部取消
                </button>
              </div>
            )}
          </div>
          {stagedFiles.length === 0 ? (
            <div className="px-3 py-3 text-[10px] text-muted-foreground text-center">没有暂存文件</div>
          ) : (
              stagedFiles.map((f) => (
                <div
                  key={f.path}
                  className={`group flex items-center px-3 py-1 text-xs cursor-pointer transition-colors ${selectedFile === f.path && isStagedFile ? "bg-primary/15 text-foreground font-medium" : "hover:bg-accent/50"}`}
                  onClick={() => handleShowDiff(f.path, true)}
                >
                  <span className="w-4 text-green-600 shrink-0 flex items-center justify-center">
                    <StatusIcon status={f.stage_status || ""} />
                  </span>
                  <span className="flex-1 truncate ml-1.5">{f.path}</span>
                  <button onClick={(e) => { e.stopPropagation(); onUnstage(f.path) }} className="ml-1 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent rounded px-0.5 transition-opacity" title="取消暂存">−</button>
                </div>
              ))
          )}
        </div>

        {/* 暂存文件区域可拖动分隔条 */}
        <div
          className="h-1 bg-border hover:bg-primary/30 cursor-row-resize transition-colors shrink-0"
          style={{ backgroundColor: isDraggingStaged ? 'hsl(var(--primary) / 0.5)' : undefined }}
          onMouseDown={handleStagedDragStart}
        />

        {/* 未暂存文件区域 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-card flex items-center justify-between sticky top-0 z-10 border-b border-border">
            <span>未暂存文件（{unstagedFiles.length + untrackedFiles.length}）</span>
            {(unstagedFiles.length + untrackedFiles.length) > 0 && (
              <div className="flex items-center gap-1">
                {selectedFile && !isStagedFile && (unstagedFiles.some(f => f.path === selectedFile) || untrackedFiles.some(f => f.path === selectedFile)) && (
                  <button onClick={() => onStage(selectedFile)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent text-foreground">暂存所选</button>
                )}
                <button onClick={onStageAll} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent text-foreground">全部暂存</button>
              </div>
            )}
          </div>
          {unstagedFiles.length === 0 && untrackedFiles.length === 0 ? (
            <div className="px-3 py-3 text-[10px] text-muted-foreground text-center">没有未暂存文件</div>
          ) : (
              [...unstagedFiles, ...untrackedFiles].map((f) => (
                <div
                  key={f.path}
                  className={`group flex items-center px-3 py-1 text-xs cursor-pointer transition-colors ${selectedFile === f.path && !isStagedFile ? "bg-primary/15 text-foreground font-medium" : "hover:bg-accent/50"}`}
                  onClick={() => handleShowDiff(f.path, false)}
                >
                  <span className={`w-4 shrink-0 flex items-center justify-center ${f.is_untracked ? "text-purple-600" : "text-orange-600"}`}>
                    <StatusIcon status={f.is_untracked ? "?" : (f.worktree_status || "")} />
                  </span>
                  <span className="flex-1 truncate ml-1.5">{f.path}</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onStage(f.path) }} className="text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent rounded px-0.5" title="暂存">+</button>
                    {!f.is_untracked && (
                      <button onClick={(e) => { e.stopPropagation(); if (confirm(`确定要丢弃文件 "${f.path}" 的所有更改吗？`)) onDiscardFile(f.path) }} className="text-[10px] text-red-500 hover:text-red-700 hover:bg-red-100/20 rounded px-0.5" title="丢弃更改">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6H21" /><path d="M8 6V4H16V6" /><path d="M10 11V16" /><path d="M14 11V16" /><path d="M19 6L18 20C18 20.5304 17.7893 21.0391 17.4142 21.4142C17.0391 21.7893 16.5304 22 16 22H8C7.46957 22 6.96086 21.7893 6.58579 21.4142C6.21071 21.0391 6 20.5304 6 20L5 6" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {/* 可拖动垂直分隔条 */}
      <div
        className="w-1 bg-border hover:bg-primary/30 cursor-col-resize transition-colors shrink-0"
        style={{ backgroundColor: isDraggingVertical ? 'hsl(var(--primary) / 0.5)' : undefined }}
        onMouseDown={handleVerticalDragStart}
      />

      {/* 右侧：diff 内容 + 提交区域 */}
      <div className="flex-1 flex flex-col min-h-0" ref={rightPaneRef}>
        {selectedFile ? (
          <>
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between shrink-0 bg-muted/10">
              <span className="text-xs font-medium truncate">{selectedFile}</span>
              <div className="flex items-center gap-1.5">
                {onRefreshDiff && (
                  <button onClick={onRefreshDiff} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent" title="刷新差异">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>
                  </button>
                )}
                {diffMode === "read" ? (
                  <button onClick={() => setDiffMode("edit")} className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent">编辑模式</button>
                ) : (
                  <button onClick={() => setDiffMode("read")} className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent">阅读模式</button>
                )}
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${diffMode === "edit" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>
                  {diffMode === "edit" ? "编辑" : "阅读"}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {diffMode === "read" ? (
                <DiffPanel diffText={selectedDiff} viewType="split" fileName={selectedFile || ""} />
              ) : (
                <SimpleDiffPanel
                  diffText={selectedDiff}
                  fileName={selectedFile || ""}
                  showActions={unstagedFiles.some(f => f.path === selectedFile) || isStagedFile}
                  isStaged={isStagedFile}
                  onStageHunk={(hunkIndex) => { if (selectedFile) onStageHunk(selectedFile, hunkIndex) }}
                  onDiscardHunk={(hunkIndex) => { if (selectedFile) onDiscardHunk(selectedFile, hunkIndex) }}
                  onStageLines={(selections) => { if (selectedFile) onStageLines(selectedFile, selections) }}
                  onDiscardLines={(selections) => { if (selectedFile) onDiscardLines(selectedFile, selections) }}
                  onUnstageLines={(selections) => { if (selectedFile) onUnstageLines(selectedFile, selections) }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">选择文件查看差异</div>
        )}

        {/* 可拖动水平分隔条 */}
        <div
          className="h-1 bg-border hover:bg-primary/30 cursor-row-resize transition-colors shrink-0"
          style={{ backgroundColor: isDraggingHorizontal ? 'hsl(var(--primary) / 0.5)' : undefined }}
          onMouseDown={handleHorizontalDragStart}
        />

        {/* 提交信息区域 */}
        <div className="border-t border-border shrink-0" style={{ height: commitAreaHeight }}>
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border bg-muted/10">
            csq &lt;704879647@qq.com&gt;
          </div>
          <div className="px-3 py-2 h-full flex flex-col">
            <textarea
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="输入提交信息..."
              className="flex-1 w-full px-2 py-1.5 text-xs rounded border border-input bg-background outline-none resize-none focus:border-primary"
            />
            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                  <input type="checkbox" className="rounded" /> 立即推送
                </label>
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                  <input type="checkbox" className="rounded" /> 修改最后一次提交
                </label>
              </div>
              <button
                onClick={onCommit}
                disabled={committing || stagedFiles.length === 0 || !commitMsg.trim()}
                className="px-4 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {committing ? "提交中..." : "提交"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
