/**
 * 提交历史内容组件
 *
 * 显示提交列表、提交详情、文件变更差异
 * 支持右键创建标签、面板拖拽调整大小
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import CommitGraph from '@/components/repo/CommitGraph'
import DiffPanel from '@/components/repo/DiffPanel'
import { tauriCommands } from '@/lib/tauri/commands'
import type { CommitEntry } from '@/lib/tauri/types'

export interface HistoryContentProps {
  repoPath: string
  commits: CommitEntry[]
  selectedCommit: CommitEntry | null
  onSelectCommit: (commit: CommitEntry) => void
  summary: any
  onTagCreated?: () => void
}

export function HistoryContent({ repoPath, commits, selectedCommit, onSelectCommit, summary, onTagCreated }: HistoryContentProps) {
  const [commitFiles, setCommitFiles] = useState<{ status: string; path: string }[]>([])
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(null)
  const [commitFileDiff, setCommitFileDiff] = useState("")
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; commit: CommitEntry } | null>(null)
  const [tagDialog, setTagDialog] = useState<{ type: "lightweight" | "annotated"; commit: CommitEntry } | null>(null)
  const [tagName, setTagName] = useState("")
  const [tagMessage, setTagMessage] = useState("")
  const [creatingTag, setCreatingTag] = useState(false)

  // 分页
  const [commitOffset, setCommitOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const PAGE_SIZE = 50
  const scrollRef = useRef<HTMLDivElement>(null)

  // 内部维护完整的提交列表（支持滚动加载）
  const [allCommits, setAllCommits] = useState<CommitEntry[]>(commits)

  // 同步外部 commits 到内部状态
  useEffect(() => {
    setAllCommits(commits)
    setCommitOffset(0)
  }, [commits])

  // 面板拖拽
  const containerRef = useRef<HTMLDivElement>(null)
  const [topRatio, setTopRatio] = useState(0.5)
  const [leftRatio, setLeftRatio] = useState(0.3) // 默认 3:7
  const dragRef = useRef<{ type: "horizontal" | "vertical"; start: number; startVal: number } | null>(null)

  // 加载提交详情
  const handleSelectCommit = async (commit: CommitEntry) => {
    onSelectCommit(commit)
    try {
      const files = await tauriCommands.getCommitFiles(repoPath, commit.id)
      setCommitFiles(files)
      if (files.length > 0) {
        setSelectedCommitFile(files[0].path)
        const diff = await tauriCommands.getCommitFileDiff(repoPath, commit.id, files[0].path)
        setCommitFileDiff(diff || "无差异")
      }
    } catch (e) {
      console.error("加载提交详情失败:", e)
    }
  }

  // 选择提交内文件
  const handleCommitFileSelect = async (filePath: string) => {
    if (!selectedCommit) return
    setSelectedCommitFile(filePath)
    try {
      const diff = await tauriCommands.getCommitFileDiff(repoPath, selectedCommit.id, filePath)
      setCommitFileDiff(diff || "无差异")
    } catch (e) {
      setCommitFileDiff("无法加载文件变更")
    }
  }

  // 加载更多提交
  const loadMoreCommits = useCallback(async () => {
    if (!repoPath || loadingMore) return
    setLoadingMore(true)
    const newOffset = commitOffset + PAGE_SIZE
    try {
      const olderCommits = await tauriCommands.getOlderCommits(repoPath, PAGE_SIZE, newOffset)
      if (olderCommits.length > 0) {
        setCommitOffset(newOffset)
        // 将新数据追加到 allCommits
        setAllCommits(prev => [...prev, ...olderCommits])
      }
    } catch (e) {
      console.error("加载更多提交失败:", e)
    } finally {
      setLoadingMore(false)
    }
  }, [repoPath, loadingMore, commitOffset])

  // 滚动加载
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleScroll = () => {
      if (loadingMore) return
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollTop + clientHeight >= scrollHeight - 80) loadMoreCommits()
    }
    el.addEventListener("scroll", handleScroll, { passive: true })
    return () => el.removeEventListener("scroll", handleScroll)
  }, [loadingMore, loadMoreCommits])

  // 面板拖拽事件
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      if (drag.type === "horizontal") {
        const delta = e.clientY - drag.start
        const newVal = drag.startVal + delta / rect.height
        setTopRatio(Math.max(0.15, Math.min(0.85, newVal)))
      } else {
        const delta = e.clientX - drag.start
        const newVal = drag.startVal + delta / rect.width
        setLeftRatio(Math.max(0.15, Math.min(0.85, newVal)))
      }
    }
    const handleMouseUp = () => { dragRef.current = null }
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp) }
  }, [])

  // 右键菜单关闭
  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".context-menu")) setContextMenu(null)
    }
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0)
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler) }
  }, [contextMenu])

  // 创建标签
  const handleCreateTag = useCallback(async () => {
    if (!tagDialog || !tagName.trim()) return
    setCreatingTag(true)
    try {
      if (tagDialog.type === "lightweight") {
        await tauriCommands.createLightweightTag(repoPath, tagName.trim(), tagDialog.commit.id)
      } else {
        await tauriCommands.createAnnotatedTag(repoPath, tagName.trim(), tagMessage.trim() || tagName.trim(), tagDialog.commit.id)
      }
      setTagDialog(null)
      onTagCreated?.()
    } catch (e) {
      alert("创建标签失败: " + e)
    } finally {
      setCreatingTag(false)
    }
  }, [tagDialog, tagName, tagMessage, repoPath, onTagCreated])

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000)
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.toLocaleTimeString()}`
  }

  const STATUS_COLOR: Record<string, string> = { A: "text-green-600", M: "text-orange-600", D: "text-red-600", R: "text-purple-600", C: "text-blue-600" }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0 select-none overflow-hidden">
      {/* 上：提交历史列表 */}
      <div ref={scrollRef} className="min-h-0 border-b border-border overflow-y-auto select-text" style={{ flexBasis: `${topRatio * 100}%` }}>
        <CommitGraph
          commits={allCommits}
          selectedId={selectedCommit?.id ?? null}
          aheadCount={summary?.ahead ?? 0}
          onSelect={handleSelectCommit}
          onContextMenu={(commit, e) => setContextMenu({ x: e.clientX, y: e.clientY, commit })}
        />
        {loadingMore && <div className="px-3 py-2 text-xs text-muted-foreground text-center">加载更早的提交...</div>}
      </div>

      {/* 水平分隔条 */}
      <div className="h-[5px] shrink-0 cursor-row-resize bg-border/30 hover:bg-blue-400/40 transition-colors relative z-10" onMouseDown={(e) => { e.preventDefault(); dragRef.current = { type: "horizontal", start: e.clientY, startVal: topRatio } }} />

      {/* 下：提交详情 */}
      <div className="flex min-h-0 overflow-hidden" style={{ flexBasis: `${(1 - topRatio) * 100}%` }}>
        {selectedCommit ? (
          <>
            <div className="min-w-0 border-r border-border flex flex-col" style={{ flexBasis: `${leftRatio * 100}%` }}>
              <div className="px-3 py-2 border-b border-border shrink-0 space-y-1 bg-muted/10">
                <div className="text-[11px]"><span className="text-muted-foreground">提交：</span><span className="font-mono text-[10px] break-all">{selectedCommit.id}</span><span className="font-mono text-muted-foreground ml-1">[{selectedCommit.id.slice(0, 7)}]</span></div>
                {selectedCommit.parent_ids.length > 0 && <div className="text-[11px]"><span className="text-muted-foreground">父级：</span><span className="font-mono text-[10px] break-all">{selectedCommit.parent_ids.join(" ")}</span></div>}
                <div className="text-[11px]"><span className="text-muted-foreground">作者：</span>{selectedCommit.author} &lt;{selectedCommit.author_email}&gt;</div>
                <div className="text-[11px]"><span className="text-muted-foreground">日期：</span>{formatDate(selectedCommit.time)}</div>
                <div className="text-[11px] leading-relaxed pt-1 border-t border-border/50 whitespace-pre-wrap">{selectedCommit.message}</div>
              </div>
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 bg-muted/10">文件变更（{commitFiles.length}）</div>
                <div className="flex-1 overflow-y-auto min-h-0 select-text">
                  {commitFiles.map((f, i) => (
                    <div key={i} onClick={() => handleCommitFileSelect(f.path)} className={`px-3 py-1 text-xs flex items-center gap-2 cursor-pointer transition-colors hover:bg-accent/50 ${f.path === selectedCommitFile ? "bg-primary/15 font-medium" : ""}`}>
                      <span className={`font-mono shrink-0 ${STATUS_COLOR[f.status] ?? "text-muted-foreground"}`}>{f.status}</span>
                      <span className="truncate">{f.path}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="w-[5px] shrink-0 cursor-col-resize bg-border/30 hover:bg-blue-400/40 transition-colors relative z-10" onMouseDown={(e) => { e.preventDefault(); dragRef.current = { type: "vertical", start: e.clientX, startVal: leftRatio } }} />
            <div className="flex flex-col min-w-0" style={{ flexBasis: `${(1 - leftRatio) * 100}%` }}>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border shrink-0 bg-muted/10">{selectedCommitFile ? `${selectedCommitFile} 的变更` : "文件变更"}</div>
              <div className="flex-1 overflow-auto min-h-0 select-text">
                <DiffPanel diffText={commitFileDiff} fileName={selectedCommitFile ?? undefined} />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground select-text">选择提交查看详情</div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div className="context-menu fixed z-50 bg-card border border-border rounded-md shadow-lg py-1 min-w-[160px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border truncate max-w-[200px]">{contextMenu.commit.id.slice(0, 7)} - {contextMenu.commit.message?.slice(0, 30)}</div>
          <button onClick={() => { setTagDialog({ type: "lightweight", commit: contextMenu.commit }); setTagName(""); setContextMenu(null) }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" /><path d="M7 7h.01" /></svg>
            创建轻量标签
          </button>
          <button onClick={() => { setTagDialog({ type: "annotated", commit: contextMenu.commit }); setTagName(""); setTagMessage(""); setContextMenu(null) }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
            创建附注标签
          </button>
        </div>
      )}

      {/* 标签创建对话框 */}
      {tagDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setTagDialog(null)}>
          <div className="bg-card border border-border rounded-lg shadow-xl p-4 w-[400px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium mb-3">{tagDialog.type === "lightweight" ? "创建轻量标签" : "创建附注标签"}</h3>
            <div className="mb-3 text-[10px] text-muted-foreground">目标提交：{tagDialog.commit.id.slice(0, 7)} - {tagDialog.commit.message?.slice(0, 50)}</div>
            <div className="mb-3">
              <label className="text-[10px] text-muted-foreground block mb-1">标签名称</label>
              <input type="text" value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="输入标签名称（如 v1.0.0）" className="w-full px-2.5 py-1.5 text-xs rounded border border-input bg-background outline-none focus:border-primary" autoFocus />
            </div>
            {tagDialog.type === "annotated" && (
              <div className="mb-3">
                <label className="text-[10px] text-muted-foreground block mb-1">标签消息（可选）</label>
                <textarea value={tagMessage} onChange={(e) => setTagMessage(e.target.value)} placeholder="输入标签描述信息..." rows={3} className="w-full px-2.5 py-1.5 text-xs rounded border border-input bg-background outline-none focus:border-primary resize-none" />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setTagDialog(null)} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent">取消</button>
              <button onClick={handleCreateTag} disabled={creatingTag || !tagName.trim()} className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">{creatingTag ? "创建中..." : "创建"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
