/**
 * 文件状态内容组件
 *
 * 显示冲突/暂存/未暂存文件列表，查看差异，提交变更
 * 支持冲突文件的三栏合并解决弹窗（参考 PyCharm 设计）
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import SimpleDiffPanel from '@/components/repo/SimpleDiffPanel'
import DiffPanel from '@/components/repo/DiffPanel'
import { tauriCommands } from '@/lib/tauri/commands'
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
    case "U": case "UNMERGED": case "unmerged":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12h12" /><path d="M12 6v12" /><circle cx="12" cy="12" r="10" stroke="currentColor" strokeDasharray="4 2" /></svg>
    default:
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
  }
}

export interface FileStatusContentProps {
  conflictFiles: FileStatus[]
  stagedFiles: FileStatus[]
  unstagedFiles: FileStatus[]
  untrackedFiles: FileStatus[]
  repoPath: string
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
  onRefreshStatus?: () => void
}

// ===== 冲突块解析 =====

/** 将文本按行拆分，空文本或纯空白返回空数组 */
function splitLines(text: string): string[] {
  if (!text) return []
  // 如果整个文本只包含空白字符，返回空数组（表示 theirs/ours 删除了文件）
  if (text.trim() === '') return []
  return text.split('\n')
}

/** 行渲染组件：带行号，逐行显示 */
function LineView({ lines, startLineNum, className }: {
  lines: string[]
  startLineNum: number
  className?: string
}) {
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className={`flex hover:bg-accent/20 ${className || ''}`}>
          <span className="w-8 shrink-0 text-right pr-2 text-muted-foreground/40 select-none text-[10px] leading-[1.6]">
            {startLineNum + i}
          </span>
          <span className="flex-1 whitespace-pre leading-[1.6]">{line || ' '}</span>
        </div>
      ))}
    </>
  )
}

/** 冲突块类型 */
interface ConflictBlock {
  /** 块索引 */
  index: number
  /** 冲突前的公共内容 */
  before: string
  /** 当前版本（ours）内容 */
  ours: string
  /** 传入版本（theirs）内容 */
  theirs: string
  /** 基础版本（base）内容，可能为空 */
  base: string
  /** 当前解决状态 */
  resolved: 'unresolved' | 'ours' | 'theirs' | 'both' | 'manual'
  /** 手动解决后的内容 */
  resolvedContent: string
}

/** 解析冲突标记，拆分为冲突块列表 */
function parseConflictBlocks(content: string): ConflictBlock[] {
  const lines = content.split('\n')
  const blocks: ConflictBlock[] = []
  let beforeLines: string[] = []
  let currentOurs: string[] = []
  let currentTheirs: string[] = []
  let currentBase: string[] = []
  let section: 'none' | 'ours' | 'base' | 'theirs' = 'none'
  let blockIndex = 0

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      // 保存冲突前的内容
      section = 'ours'
      currentOurs = []
      currentBase = []
      currentTheirs = []
    } else if (line.startsWith('|||||||')) {
      section = 'base'
    } else if (line.startsWith('=======')) {
      section = 'theirs'
    } else if (line.startsWith('>>>>>>>')) {
      // 结束当前冲突块
      blocks.push({
        index: blockIndex++,
        before: beforeLines.join('\n'),
        ours: currentOurs.join('\n'),
        theirs: currentTheirs.join('\n'),
        base: currentBase.join('\n'),
        resolved: 'unresolved',
        resolvedContent: '',
      })
      beforeLines = []
      section = 'none'
    } else {
      if (section === 'ours') {
        currentOurs.push(line)
      } else if (section === 'base') {
        currentBase.push(line)
      } else if (section === 'theirs') {
        currentTheirs.push(line)
      } else {
        beforeLines.push(line)
      }
    }
  }

  // 如果有剩余的非冲突内容，作为尾部块
  // 如果没有冲突块，整个内容作为 before
  if (blocks.length > 0 && beforeLines.length > 0) {
    blocks.push({
      index: blockIndex,
      before: beforeLines.join('\n'),
      ours: '',
      theirs: '',
      base: '',
      resolved: 'manual',
      resolvedContent: beforeLines.join('\n'),
    })
  } else if (blocks.length === 0 && beforeLines.length > 0) {
    // 没有冲突标记，整个文件无冲突
    blocks.push({
      index: 0,
      before: beforeLines.join('\n'),
      ours: '',
      theirs: '',
      base: '',
      resolved: 'manual',
      resolvedContent: beforeLines.join('\n'),
    })
  }

  return blocks
}

/** 将冲突块列表合并为最终内容 */
function mergeBlocksToResult(blocks: ConflictBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    // 先添加冲突前的公共内容
    if (block.before) {
      parts.push(block.before)
    }
    // 根据解决状态添加内容
    switch (block.resolved) {
      case 'ours':
        if (block.ours) parts.push(block.ours)
        break
      case 'theirs':
        if (block.theirs) parts.push(block.theirs)
        break
      case 'both':
        if (block.ours) parts.push(block.ours)
        if (block.theirs) parts.push(block.theirs)
        break
      case 'manual':
        if (block.resolvedContent) parts.push(block.resolvedContent)
        break
      case 'unresolved':
        // 未解决的冲突，保留冲突标记
        parts.push(`<<<<<<< HEAD`)
        if (block.ours) parts.push(block.ours)
        parts.push('=======')
        if (block.theirs) parts.push(block.theirs)
        parts.push('>>>>>>> incoming')
        break
    }
  }
  return parts.join('\n')
}

/** 冲突解决弹窗（参考 PyCharm 三栏合并交互） */
function ConflictResolveDialog({
  filePath,
  repoPath,
  onClose,
  onResolved,
}: {
  filePath: string
  repoPath: string
  onClose: () => void
  onResolved: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [blocks, setBlocks] = useState<ConflictBlock[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeConflictIndex, setActiveConflictIndex] = useState(-1)

  // 中间栏可编辑的最终结果
  const [mergedResult, setMergedResult] = useState('')
  // 是否手动编辑过（手动编辑后不再自动同步块状态）
  const [manuallyEdited, setManuallyEdited] = useState(false)

  // 三栏滚动容器 ref
  const scrollRefOurs = useRef<HTMLDivElement>(null)
  const scrollRefMid = useRef<HTMLDivElement>(null)
  const scrollRefTheirs = useRef<HTMLDivElement>(null)
  // 同步滚动锁，防止循环触发
  const isSyncingScroll = useRef(false)

  // 三栏同步滚动处理
  const handleSyncScroll = useCallback((source: 'ours' | 'mid' | 'theirs') => {
    if (isSyncingScroll.current) return
    isSyncingScroll.current = true

    const sourceEl = source === 'ours' ? scrollRefOurs.current
      : source === 'mid' ? scrollRefMid.current
      : scrollRefTheirs.current
    if (!sourceEl) { isSyncingScroll.current = false; return }

    const targets = [scrollRefOurs.current, scrollRefMid.current, scrollRefTheirs.current].filter(Boolean) as HTMLDivElement[]
    for (const target of targets) {
      if (target === sourceEl) continue
      target.scrollTop = sourceEl.scrollTop
      target.scrollLeft = sourceEl.scrollLeft
    }

    // 用 requestAnimationFrame 确保滚动完成后再解锁
    requestAnimationFrame(() => { isSyncingScroll.current = false })
  }, [])

  // 滚动到指定冲突块（三栏同步）
  const scrollToConflict = useCallback((conflictIndex: number) => {
    // 使用 data-conflict-index 属性查找冲突块元素
    const selectors = [
      `[data-conflict-ours="${conflictIndex}"]`,
      `[data-conflict-mid="${conflictIndex}"]`,
      `[data-conflict-theirs="${conflictIndex}"]`,
    ]
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [])

  // 加载冲突内容
  useEffect(() => {
    const loadContent = async () => {
      try {
        setLoading(true)
        // 读取工作区文件内容（可能包含冲突标记）
        const workingContent = await tauriCommands.readWorkingFile(repoPath, filePath)
        const parsed = parseConflictBlocks(workingContent)

        // 检查是否有真正的冲突标记
        // 如果解析结果只有一个块且没有 ours/theirs 内容，说明工作区文件没有冲突标记
        // 这种情况发生在 theirs 删除文件时（UD 状态），Git 保留 ours 的完整内容
        const hasConflictMarkers = parsed.some(b => b.ours || b.theirs)

        if (!hasConflictMarkers) {
          // 无冲突标记：使用 getConflictContent 获取 ours/theirs 版本
          const content = await tauriCommands.getConflictContent(repoPath, filePath)
          // 创建一个冲突块：ours = 当前版本，theirs = 传入版本（可能为空）
          const specialBlock: ConflictBlock = {
            index: 0,
            before: '',
            ours: content.ours || workingContent, // ours 版本
            theirs: content.theirs || '', // theirs 版本（删除时为空）
            base: content.base || '',
            resolved: 'unresolved',
            resolvedContent: '',
          }
          setBlocks([specialBlock])
          setMergedResult(content.ours || workingContent)
        } else {
          // 有冲突标记：正常解析
          setBlocks(parsed)
          const initialResult = mergeBlocksToResult(parsed)
          setMergedResult(initialResult)
          // 聚焦第一个未解决冲突
          const firstUnresolved = parsed.find(b => b.resolved === 'unresolved')
          if (firstUnresolved) {
            setActiveConflictIndex(firstUnresolved.index)
          }
        }
      } catch (e: any) {
        setError('加载冲突内容失败: ' + (e?.message || e))
      } finally {
        setLoading(false)
      }
    }
    loadContent()
  }, [filePath, repoPath])

  // 未解决的冲突索引列表
  const unresolvedIndices = useMemo(
    () => blocks.filter(b => b.resolved === 'unresolved').map(b => b.index),
    [blocks]
  )

  // 未解决的冲突数
  const unresolvedCount = unresolvedIndices.length

  // 跳转到下一个冲突（基于当前聚焦位置）
  const goToNextConflict = useCallback(() => {
    if (unresolvedIndices.length === 0) return
    // 找到当前索引之后的下一个未解决冲突
    const nextIdx = unresolvedIndices.find(i => i > activeConflictIndex)
    const target = nextIdx !== undefined ? nextIdx : unresolvedIndices[0]
    setActiveConflictIndex(target)
    scrollToConflict(target)
  }, [unresolvedIndices, activeConflictIndex, scrollToConflict])

  // 跳转到上一个冲突（基于当前聚焦位置）
  const goToPrevConflict = useCallback(() => {
    if (unresolvedIndices.length === 0) return
    // 找到当前索引之前的上一个未解决冲突
    const prevIndices = unresolvedIndices.filter(i => i < activeConflictIndex)
    const target = prevIndices.length > 0 ? prevIndices[prevIndices.length - 1] : unresolvedIndices[unresolvedIndices.length - 1]
    setActiveConflictIndex(target)
    scrollToConflict(target)
  }, [unresolvedIndices, activeConflictIndex, scrollToConflict])

  // 解决单个冲突块
  const resolveBlock = useCallback((blockIndex: number, resolution: 'ours' | 'theirs' | 'both') => {
    setBlocks(prev => {
      const next = prev.map(b => {
        if (b.index !== blockIndex) return b
        const resolvedContent = resolution === 'ours'
          ? b.ours
          : resolution === 'theirs'
            ? b.theirs
            : (b.ours + (b.ours && b.theirs ? '\n' : '') + b.theirs)
        return { ...b, resolved: resolution, resolvedContent }
      })
      // 同步合并结果
      setMergedResult(mergeBlocksToResult(next))
      setManuallyEdited(false)
      // 自动跳到下一个未解决冲突
      const remaining = next.filter(b => b.resolved === 'unresolved')
      if (remaining.length > 0) {
        const after = remaining.find(b => b.index > blockIndex)
        const nextTarget = after ? after.index : remaining[0].index
        setActiveConflictIndex(nextTarget)
        // 延迟滚动，等 DOM 更新
        setTimeout(() => scrollToConflict(nextTarget), 50)
      }
      return next
    })
  }, [scrollToConflict])

  // 应用所有非冲突更改（自动接受所有非冲突部分）
  const applyAllNonConflicting = useCallback(() => {
    setBlocks(prev => {
      const next = prev.map(b => {
        if (b.resolved !== 'unresolved') return b
        // 如果只有一方有内容，自动选择
        if (!b.ours && b.theirs) return { ...b, resolved: 'theirs' as const, resolvedContent: b.theirs }
        if (b.ours && !b.theirs) return { ...b, resolved: 'ours' as const, resolvedContent: b.ours }
        return b
      })
      setMergedResult(mergeBlocksToResult(next))
      setManuallyEdited(false)
      return next
    })
  }, [])

  // 快速操作：全部使用 ours
  const handleUseOurs = async () => {
    try {
      setSaving(true)
      await tauriCommands.resolveConflictWithStrategy(repoPath, filePath, 'ours')
      onResolved()
      onClose()
    } catch (e: any) {
      setError('解决冲突失败: ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  // 快速操作：全部使用 theirs
  const handleUseTheirs = async () => {
    try {
      setSaving(true)
      await tauriCommands.resolveConflictWithStrategy(repoPath, filePath, 'theirs')
      onResolved()
      onClose()
    } catch (e: any) {
      setError('解决冲突失败: ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  // 保存合并结果
  const handleSave = async () => {
    try {
      setSaving(true)
      const contentToSave = manuallyEdited ? mergedResult : mergeBlocksToResult(blocks)
      await tauriCommands.resolveConflict(repoPath, filePath, contentToSave)
      onResolved()
      onClose()
    } catch (e: any) {
      setError('保存失败: ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  // 中间栏编辑回调
  const handleResultEdit = useCallback((value: string) => {
    setMergedResult(value)
    setManuallyEdited(true)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-2xl flex flex-col"
        style={{ width: '92vw', height: '85vh', maxWidth: 1600 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="px-4 py-2 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium">解决冲突</h3>
            <span className="text-[10px] text-muted-foreground truncate max-w-[400px]">{filePath}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* 冲突导航 - 始终显示 */}
            <div className="flex items-center gap-1 mr-2 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20">
              <button
                onClick={goToPrevConflict}
                className="text-red-600 hover:text-red-700 hover:bg-red-500/10 p-1 rounded"
                title="上一个冲突 (Alt+上)"
                disabled={unresolvedCount === 0}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span className="text-[11px] text-red-600 font-semibold min-w-[80px] text-center">
                {unresolvedCount > 0 ? `${unresolvedCount} 个冲突` : '全部已解决'}
              </span>
              <button
                onClick={goToNextConflict}
                className="text-red-600 hover:text-red-700 hover:bg-red-500/10 p-1 rounded"
                title="下一个冲突 (Alt+下)"
                disabled={unresolvedCount === 0}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>
            <button
              onClick={applyAllNonConflicting}
              disabled={saving || loading}
              className="px-2 py-1 text-[10px] rounded border border-border hover:bg-accent disabled:opacity-40"
              title="自动应用所有非冲突更改"
            >
              应用非冲突更改
            </button>
            <button
              onClick={handleUseOurs}
              disabled={saving}
              className="px-2 py-1 text-[10px] rounded border border-blue-500/30 text-blue-600 hover:bg-blue-500/10 disabled:opacity-40"
            >
              全部使用当前
            </button>
            <button
              onClick={handleUseTheirs}
              disabled={saving}
              className="px-2 py-1 text-[10px] rounded border border-green-500/30 text-green-600 hover:bg-green-500/10 disabled:opacity-40"
            >
              全部使用传入
            </button>
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs rounded border border-border hover:bg-accent"
            >
              取消
            </button>
          </div>
        </div>

        {/* 三栏内容 */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            加载冲突内容...
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-sm text-red-500">{error}</div>
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* 左栏：当前版本（Ours）- 逐行显示，带行号 */}
            <div className="flex-1 flex flex-col min-h-0 border-r border-border min-w-0">
              <div className="px-3 py-1.5 text-[10px] font-medium text-blue-600 bg-blue-500/5 border-b border-border shrink-0">
                当前版本（Ours）
              </div>
              <div ref={scrollRefOurs} onScroll={() => handleSyncScroll('ours')} className="flex-1 overflow-auto min-h-0">
                <div className="text-[11px] font-mono">
                  {(() => {
                    let lineNum = 1
                    return blocks.map((block) => {
                      if (block.resolved === 'manual' && !block.ours && !block.theirs) {
                        if (!block.before) return null
                        const lines = splitLines(block.before)
                        const startLine = lineNum
                        lineNum += lines.length
                        return <LineView key={`ours-${block.index}`} lines={lines} startLineNum={startLine} />
                      }
                      const result: React.ReactNode[] = []
                      // 块间公共内容
                      if (block.before) {
                        const lines = splitLines(block.before)
                        const startLine = lineNum
                        lineNum += lines.length
                        result.push(<LineView key={`ours-before-${block.index}`} lines={lines} startLineNum={startLine} className="text-muted-foreground" />)
                      }
                      // 冲突块
                      const oursLines = splitLines(block.ours)
                      const oursStart = lineNum
                      lineNum += oursLines.length || 1
                      const isSelected = block.resolved === 'unresolved' && activeConflictIndex === block.index
                      const isAccepted = block.resolved === 'ours' || block.resolved === 'both'
                      const isRejected = block.resolved !== 'unresolved' && !isAccepted
                      result.push(
                        <div
                          key={`ours-conflict-${block.index}`}
                          data-conflict-ours={block.index}
                          className={`my-0.5 border-l-[3px] cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-l-red-500 bg-red-500/15'
                              : block.resolved === 'unresolved'
                                ? 'border-l-red-400 bg-red-500/5 hover:bg-red-500/10'
                                : isAccepted
                                  ? 'border-l-blue-400 bg-blue-500/8'
                                  : 'border-l-muted bg-muted/10 opacity-40'
                          }`}
                          onClick={() => block.resolved === 'unresolved' && setActiveConflictIndex(block.index)}
                        >
                          {/* 冲突块标题栏 */}
                          <div className={`flex items-center justify-between px-2 py-0.5 text-[9px] ${
                            isSelected ? 'text-red-600 font-semibold' : 'text-red-500/70'
                          }`}>
                            <span>冲突 #{block.index + 1}{block.resolved !== 'unresolved' ? ` → ${block.resolved === 'ours' ? '已用当前' : block.resolved === 'both' ? '已用双方' : '已忽略'}` : ''}</span>
                            {isSelected && (
                              <button
                                onClick={(e) => { e.stopPropagation(); resolveBlock(block.index, 'ours') }}
                                className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600 hover:bg-blue-500/30 border border-blue-500/30 font-semibold"
                                title="接受当前版本到合并结果"
                              >
                                {'>>'} 接受
                              </button>
                            )}
                          </div>
                          {/* 冲突块内容 - 逐行显示 */}
                          {oursLines.length > 0 ? (
                            <LineView lines={oursLines} startLineNum={oursStart} className={isRejected ? 'line-through' : ''} />
                          ) : (
                            <div className="flex text-muted-foreground italic">
                              <span className="w-8 shrink-0 text-right pr-2 text-muted-foreground/40 select-none text-[10px] leading-[1.6]">{oursStart}</span>
                              <span className="flex-1 leading-[1.6]">（空）</span>
                            </div>
                          )}
                        </div>
                      )
                      return <div key={`ours-block-${block.index}`}>{result}</div>
                    })
                  })()}
                </div>
              </div>
            </div>

            {/* 中栏：合并结果 - 冲突操作区 + 可编辑文本区 */}
            <div className="flex-[1.5] flex flex-col min-h-0 border-r border-border min-w-0">
              <div className="px-3 py-1.5 text-[10px] font-medium text-amber-600 bg-amber-500/5 border-b border-border flex items-center justify-between shrink-0">
                <span>合并结果</span>
                <span className="text-muted-foreground font-normal">可编辑</span>
              </div>
              {/* 当前选中冲突块的操作按钮（浮动在编辑区上方） */}
              {activeConflictIndex >= 0 && blocks[activeConflictIndex]?.resolved === 'unresolved' && (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/5 border-b border-amber-500/20 shrink-0">
                  <span className="text-[10px] text-amber-600 font-medium">
                    冲突 #{activeConflictIndex + 1}：
                  </span>
                  <button onClick={() => resolveBlock(activeConflictIndex, 'ours')} className="px-2 py-0.5 text-[10px] rounded bg-blue-500/20 text-blue-600 hover:bg-blue-500/30 border border-blue-500/30 font-semibold" title="使用当前版本">用当前</button>
                  <button onClick={() => resolveBlock(activeConflictIndex, 'both')} className="px-2 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 border border-amber-500/30 font-semibold" title="使用双方内容">用双方</button>
                  <button onClick={() => resolveBlock(activeConflictIndex, 'theirs')} className="px-2 py-0.5 text-[10px] rounded bg-green-500/20 text-green-600 hover:bg-green-500/30 border border-green-500/30 font-semibold" title="使用传入版本">用传入</button>
                </div>
              )}
              {/* 可编辑文本区 - 带行号，同步滚动 */}
              <div ref={scrollRefMid} onScroll={() => handleSyncScroll('mid')} className="flex-1 min-h-0 overflow-auto relative">
                <div className="flex min-h-full">
                  {/* 行号列 */}
                  <div className="w-8 shrink-0 text-right pr-2 select-none text-[10px] font-mono leading-[1.6] text-muted-foreground/40 bg-background border-r border-border/50 sticky left-0 z-10">
                    {(() => {
                      const resultText = manuallyEdited ? mergedResult : mergeBlocksToResult(blocks)
                      const lines = resultText.split('\n')
                      return lines.map((_, i) => (
                        <div key={i} className="leading-[1.6]">{i + 1}</div>
                      ))
                    })()}
                  </div>
                  {/* 可编辑 textarea */}
                  <textarea
                    value={manuallyEdited ? mergedResult : mergeBlocksToResult(blocks)}
                    onChange={(e) => handleResultEdit(e.target.value)}
                    className="flex-1 p-0 pl-2 text-[11px] font-mono leading-[1.6] resize-none outline-none bg-background whitespace-pre border-none min-h-full"
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>

            {/* 右栏：传入版本（Theirs）- 逐行显示，带行号 */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <div className="px-3 py-1.5 text-[10px] font-medium text-green-600 bg-green-500/5 border-b border-border shrink-0">
                传入版本（Theirs）
              </div>
              <div ref={scrollRefTheirs} onScroll={() => handleSyncScroll('theirs')} className="flex-1 overflow-auto min-h-0">
                <div className="text-[11px] font-mono">
                  {(() => {
                    let lineNum = 1
                    return blocks.map((block) => {
                      if (block.resolved === 'manual' && !block.ours && !block.theirs) {
                        if (!block.before) return null
                        const lines = splitLines(block.before)
                        const startLine = lineNum
                        lineNum += lines.length
                        return <LineView key={`theirs-${block.index}`} lines={lines} startLineNum={startLine} />
                      }
                      const result: React.ReactNode[] = []
                      // 块间公共内容
                      if (block.before) {
                        const lines = splitLines(block.before)
                        const startLine = lineNum
                        lineNum += lines.length
                        result.push(<LineView key={`theirs-before-${block.index}`} lines={lines} startLineNum={startLine} className="text-muted-foreground" />)
                      }
                      // 冲突块
                      const theirsLines = splitLines(block.theirs)
                      const theirsStart = lineNum
                      lineNum += theirsLines.length || 1
                      const isSelected = block.resolved === 'unresolved' && activeConflictIndex === block.index
                      const isAccepted = block.resolved === 'theirs' || block.resolved === 'both'
                      const isRejected = block.resolved !== 'unresolved' && !isAccepted
                      result.push(
                        <div
                          key={`theirs-conflict-${block.index}`}
                          data-conflict-theirs={block.index}
                          className={`my-0.5 border-l-[3px] cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-l-red-500 bg-red-500/15'
                              : block.resolved === 'unresolved'
                                ? 'border-l-red-400 bg-red-500/5 hover:bg-red-500/10'
                                : isAccepted
                                  ? 'border-l-green-400 bg-green-500/8'
                                  : 'border-l-muted bg-muted/10 opacity-40'
                          }`}
                          onClick={() => block.resolved === 'unresolved' && setActiveConflictIndex(block.index)}
                        >
                          {/* 冲突块标题栏 */}
                          <div className={`flex items-center justify-between px-2 py-0.5 text-[9px] ${
                            isSelected ? 'text-red-600 font-semibold' : 'text-red-500/70'
                          }`}>
                            <span>冲突 #{block.index + 1}{block.resolved !== 'unresolved' ? ` → ${block.resolved === 'theirs' ? '已用传入' : block.resolved === 'both' ? '已用双方' : '已忽略'}` : ''}</span>
                            {isSelected && (
                              <button
                                onClick={(e) => { e.stopPropagation(); resolveBlock(block.index, 'theirs') }}
                                className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 hover:bg-green-500/30 border border-green-500/30 font-semibold"
                                title="接受传入版本到合并结果"
                              >
                                接受 {'<<'}
                              </button>
                            )}
                          </div>
                          {/* 冲突块内容 - 逐行显示 */}
                          {theirsLines.length > 0 ? (
                            <LineView lines={theirsLines} startLineNum={theirsStart} className={isRejected ? 'line-through' : ''} />
                          ) : (
                            <div className="flex text-muted-foreground italic">
                              <span className="w-8 shrink-0 text-right pr-2 text-muted-foreground/40 select-none text-[10px] leading-[1.6]">{theirsStart}</span>
                              <span className="flex-1 leading-[1.6]">（空）</span>
                            </div>
                          )}
                        </div>
                      )
                      return <div key={`theirs-block-${block.index}`}>{result}</div>
                    })
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 底部操作栏 */}
        <div className="px-4 py-2 border-t border-border flex items-center justify-between shrink-0">
          <div className="text-[10px] text-muted-foreground flex items-center gap-3">
            <span>提示：点击冲突块选中，然后在中间栏选择"用当前/用双方/用传入"</span>
            {manuallyEdited && (
              <span className="text-amber-600">（已手动编辑）</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || loading || (unresolvedCount > 0 && !manuallyEdited)}
              className="px-4 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              title={unresolvedCount > 0 && !manuallyEdited ? '请先解决所有冲突' : ''}
            >
              {saving ? '保存中...' : '保存并标记已解决'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function FileStatusContent({
  conflictFiles, stagedFiles, unstagedFiles, untrackedFiles,
  repoPath,
  selectedFile, selectedDiff,
  commitMsg, committing, setCommitMsg,
  onShowDiff, onStage, onStageAll, onUnstage, onUnstageAll,
  onCommit, onDiscardFile, onDiscardHunk, onStageHunk,
  onStageLines, onDiscardLines, onUnstageLines,
  onRefreshDiff, onRefreshStatus,
}: FileStatusContentProps) {
  const [diffMode, setDiffMode] = useState<"read" | "edit">("edit")
  const [lastClickFromStaged, setLastClickFromStaged] = useState(false)
  const [leftPaneWidth, setLeftPaneWidth] = useState(288) // 默认 72 * 4 = 288px
  const commitAreaHeight = 150 // 提交区域固定高度
  const [stagedAreaHeight, setStagedAreaHeight] = useState(40) // 百分比
  const [isDraggingVertical, setIsDraggingVertical] = useState(false)
  const [isDraggingStaged, setIsDraggingStaged] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const leftPaneRef = useRef<HTMLDivElement>(null)

  // 冲突解决弹窗状态
  const [conflictDialogFile, setConflictDialogFile] = useState<string | null>(null)

  // 文件右键菜单状态
  const [fileContextMenu, setFileContextMenu] = useState<{ x: number; y: number; path: string; type: 'staged' | 'unstaged' | 'untracked' } | null>(null)

  const handleShowDiff = useCallback((path: string, fromStaged?: boolean) => {
    setLastClickFromStaged(!!fromStaged)
    onShowDiff(path, fromStaged)
  }, [onShowDiff])

  const isStagedFile = lastClickFromStaged

  // 复制绝对路径
  const handleCopyAbsolutePath = useCallback((filePath: string) => {
    const absolutePath = `${repoPath}/${filePath}`.replace(/\\/g, '/')
    navigator.clipboard.writeText(absolutePath).then(() => {
      // 可选：显示提示
    }).catch(() => {
      alert('复制失败')
    })
    setFileContextMenu(null)
  }, [repoPath])

  // 删除文件（仅未暂存文件）
  const handleDeleteFile = useCallback(async (filePath: string) => {
    if (!confirm(`确定要删除文件 "${filePath}" 吗？此操作不可撤销。`)) return
    try {
      await tauriCommands.deleteWorkingFile(repoPath, filePath)
      if (onRefreshStatus) onRefreshStatus()
      if (onRefreshDiff) onRefreshDiff()
    } catch (e: any) {
      alert('删除文件失败: ' + (e?.message || e))
    }
    setFileContextMenu(null)
  }, [repoPath, onRefreshStatus, onRefreshDiff])

  // 窗口获焦时自动刷新差异
  useEffect(() => {
    const handleFocus = () => {
      if (selectedFile && onRefreshDiff) onRefreshDiff()
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [selectedFile, onRefreshDiff])

  // 点击空白处关闭右键菜单
  useEffect(() => {
    const handleClickOutside = () => setFileContextMenu(null)
    if (fileContextMenu) {
      window.addEventListener('click', handleClickOutside)
      return () => window.removeEventListener('click', handleClickOutside)
    }
  }, [fileContextMenu])

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

  // 冲突解决完成后的回调
  const handleConflictResolved = useCallback(() => {
    if (onRefreshDiff) onRefreshDiff()
    if (onRefreshStatus) onRefreshStatus()
  }, [onRefreshDiff, onRefreshStatus])

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden" ref={containerRef}>
      {/* 左侧：冲突文件 + 暂存文件 + 未暂存文件 + 提交区域 */}
      <div className="border-r border-border flex flex-col min-h-0 shrink-0" style={{ width: leftPaneWidth }} ref={leftPaneRef}>
        {/* 冲突文件区域 - 有冲突时显示在最顶部 */}
        {conflictFiles.length > 0 && (
          <>
            <div className="overflow-y-auto min-h-0 shrink-0" style={{ maxHeight: '30%' }}>
              <div className="px-3 py-1.5 text-[10px] font-medium bg-red-500/10 text-red-600 flex items-center justify-between sticky top-0 z-10 border-b border-red-500/20">
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
                  冲突文件（{conflictFiles.length}）
                </span>
              </div>
              {conflictFiles.map((f) => (
                <div
                  key={f.path}
                  className={`group flex items-center px-3 py-1 text-xs cursor-pointer transition-colors ${selectedFile === f.path ? "bg-red-500/10 text-foreground font-medium" : "hover:bg-red-500/5"}`}
                  onClick={() => handleShowDiff(f.path, false)}
                >
                  <span className="w-4 text-red-500 shrink-0 flex items-center justify-center">
                    <StatusIcon status="U" />
                  </span>
                  <span className="flex-1 truncate ml-1.5 text-red-700 dark:text-red-400">{f.path}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConflictDialogFile(f.path) }}
                    className="ml-1 text-[10px] px-1.5 py-0.5 rounded border border-red-500/30 text-red-600 hover:bg-red-500/10 transition-opacity"
                    title="解决冲突"
                  >
                    解决
                  </button>
                </div>
              ))}
            </div>
            <div className="h-1 bg-red-500/20 shrink-0" />
          </>
        )}

        {/* 暂存文件区域 */}
        <div className="overflow-y-auto min-h-0 shrink-0" style={{ height: `${stagedAreaHeight}%` }}>
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
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setFileContextMenu({ x: e.clientX, y: e.clientY, path: f.path, type: 'staged' })
                  }}
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
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setFileContextMenu({ x: e.clientX, y: e.clientY, path: f.path, type: f.is_untracked ? 'untracked' : 'unstaged' })
                  }}
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

        {/* 提交信息区域 - 固定在底部 */}
        <div className="border-t border-border shrink-0 bg-card flex flex-col" style={{ height: commitAreaHeight }}>
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border bg-muted/10 shrink-0">
            csq &lt;704879647@qq.com&gt;
          </div>
          <div className="px-3 py-2 flex-1 flex flex-col min-h-0">
            <textarea
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="输入提交信息..."
              className="flex-1 w-full px-2 py-1.5 text-xs rounded border border-input bg-background outline-none resize-none focus:border-primary min-h-0"
            />
            <div className="flex items-center justify-between mt-1.5 shrink-0">
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

      {/* 可拖动垂直分隔条 */}
      <div
        className="w-1 bg-border hover:bg-primary/30 cursor-col-resize transition-colors shrink-0"
        style={{ backgroundColor: isDraggingVertical ? 'hsl(var(--primary) / 0.5)' : undefined }}
        onMouseDown={handleVerticalDragStart}
      />

      {/* 右侧：diff 内容 */}
      <div className="flex-1 flex flex-col min-h-0">
        {selectedFile ? (
          <>
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between shrink-0 bg-muted/10">
              <span className="text-xs font-medium truncate flex items-center gap-1.5">
                {conflictFiles.some(f => f.path === selectedFile) && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 border border-red-500/20">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
                    冲突
                  </span>
                )}
                {selectedFile}
              </span>
              <div className="flex items-center gap-1.5">
                {/* 冲突文件显示"解决冲突"按钮 */}
                {conflictFiles.some(f => f.path === selectedFile) && (
                  <button
                    onClick={() => setConflictDialogFile(selectedFile)}
                    className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-600 border border-red-500/30 hover:bg-red-500/20"
                  >
                    解决冲突
                  </button>
                )}
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
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            {conflictFiles.length > 0 
              ? `${conflictFiles.length} 个文件存在冲突，请点击"解决"按钮处理`
              : "选择文件查看差异"}
          </div>
        )}
      </div>

      {/* 冲突解决弹窗 */}
      {conflictDialogFile && (
        <ConflictResolveDialog
          filePath={conflictDialogFile}
          repoPath={repoPath}
          onClose={() => setConflictDialogFile(null)}
          onResolved={handleConflictResolved}
        />
      )}

      {/* 文件右键菜单 */}
      {fileContextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-md shadow-lg py-1 min-w-[120px]"
          style={{ left: fileContextMenu.x, top: fileContextMenu.y }}
          onClick={() => setFileContextMenu(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent flex items-center gap-2"
            onClick={() => handleCopyAbsolutePath(fileContextMenu.path)}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            复制绝对路径
          </button>
          {fileContextMenu.type !== 'staged' && (
            <button
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent text-red-600 flex items-center gap-2"
              onClick={() => handleDeleteFile(fileContextMenu.path)}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6H21" /><path d="M8 6V4H16V6" /><path d="M10 11V16" /><path d="M14 11V16" /><path d="M19 6L18 20C18 20.5304 17.7893 21.0391 17.4142 21.4142C17.0391 21.7893 16.5304 22 16 22H8C7.46957 22 6.96086 21.7893 6.58579 21.4142C6.21071 21.0391 6 20.5304 6 20L5 6" /></svg>
              删除文件
            </button>
          )}
        </div>
      )}
    </div>
  )
}
