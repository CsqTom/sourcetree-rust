/**
 * 仓库布局路由
 *
 * 包含：工具栏 + 侧边栏 + 内容区域
 * 使用自定义 Hooks 管理数据获取和操作逻辑
 */

import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { tauriCommands } from '@/lib/tauri/commands'
import { useTabStore } from '@/stores'
import { useRepoData, useRepoMutations, useFileDiff, useAutoFetch } from '@/hooks/useRepo'
import { FileStatusContent } from '@/components/repo/FileStatusContent'
import { HistoryContent } from '@/components/repo/HistoryContent'
import { SearchContent } from '@/components/repo/SearchContent'
import type { CommitEntry } from '@/lib/tauri/types'

/** 左侧导航区域类型 */
type NavSection = 'workspace' | 'branches' | 'tags' | 'remotes' | 'stash'
/** WORKSPACE 子类型 */
type WorkspaceTab = 'file-status' | 'history' | 'search'

/** 仓库布局组件 */
function RepoLayout() {
  const { repoId } = Route.useParams()
  const repoPath = decodeURIComponent(repoId)
  const queryClient = useQueryClient()
  const { tabs } = useTabStore()

  // 从 Tab 状态获取当前分支
  const currentTab = tabs.find(t => t.id === repoId)
  const currentBranch = currentTab?.branch || ''

  // 导航状态
  const [activeNav, setActiveNav] = useState<NavSection>('workspace')
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('file-status')

  // 自定义 Hooks
  const {
    summary, commits, branches, branchTracking,
    stagedFiles, unstagedFiles, untrackedFiles, isLoading: filesLoading, error: repoError,
  } = useRepoData(repoPath)
  const mutations = useRepoMutations(repoPath)
  const { selectedFile, selectedDiff, showDiff, refreshDiff, clearSelection } = useFileDiff(repoPath)
  useAutoFetch(repoPath)

  // 提交状态
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)

  // 提交历史选择状态
  const [selectedCommit, setSelectedCommit] = useState<CommitEntry | null>(null)

  // 侧边栏展开状态
  const [showBranches, setShowBranches] = useState(true)

  // ===== 操作处理 =====

  /** 提交 */
  const handleCommit = async () => {
    if (!commitMsg.trim()) return
    setCommitting(true)
    try {
      await mutations.commit.mutateAsync(commitMsg)
      setCommitMsg('')
      clearSelection()
    } catch (e: any) {
      console.error(`提交失败: ${e}`)
    } finally {
      setCommitting(false)
    }
  }

  /** 切换分支 */
  const handleSwitchBranch = async (branch: string) => {
    if (branch === currentBranch) return
    try {
      await mutations.checkoutBranch.mutateAsync(branch)
    } catch (e: any) {
      console.error("切换分支失败:", e)
    }
  }

  /** Fetch */
  const handleFetch = async () => {
    try {
      const tracking = branchTracking.find(t => t.isCurrent)
      let remote: string | undefined
      if (tracking?.upstream) {
        remote = tracking.upstream.split("/")[0]
      }
      if (!remote) {
        const remotes = await tauriCommands.listRemotes(repoPath)
        remote = remotes.length > 0 ? remotes[0].name : undefined
      }
      const result = await mutations.fetchRemote.mutateAsync(remote)
      alert("获取更新成功\n" + result)
    } catch (e: any) {
      alert("获取更新失败: " + (e?.message || e))
    }
  }

  /** Pull */
  const handlePull = async () => {
    try {
      const tracking = branchTracking.find(t => t.isCurrent)
      let remote: string | undefined
      if (tracking?.upstream) {
        remote = tracking.upstream.split("/")[0]
      }
      if (!remote) {
        const remotes = await tauriCommands.listRemotes(repoPath)
        remote = remotes.length > 0 ? remotes[0].name : undefined
      }
      const result = await mutations.pullRemote.mutateAsync({ remote, branch: currentBranch })
      alert("拉取成功\n" + result)
    } catch (e: any) {
      alert("拉取失败: " + (e?.message || e))
    }
  }

  /** Push */
  const handlePush = async () => {
    try {
      const tracking = branchTracking.find(t => t.isCurrent)
      let remote: string | undefined
      if (tracking?.upstream) {
        remote = tracking.upstream.split("/")[0]
      }
      if (!remote) {
        const remotes = await tauriCommands.listRemotes(repoPath)
        if (remotes.length === 0) {
          alert("推送失败：当前仓库没有配置远程仓库。\n请先通过 git remote add 添加远程仓库。")
          return
        }
        remote = remotes[0].name
      }
      const result = await mutations.pushRemote.mutateAsync({ remote, branch: currentBranch, setUpstream: !tracking?.upstream })
      alert("推送成功\n" + result)
    } catch (e: any) {
      alert("推送失败: " + (e?.message || e))
    }
  }

  /** 加载提交详情 */
  const loadCommitDetail = (commit: CommitEntry) => {
    setSelectedCommit(commit)
    clearSelection()
  }

  /** 标签创建成功后刷新 */
  const handleTagCreated = useCallback(() => {
    if (!repoPath) return
    queryClient.invalidateQueries({ queryKey: ['repo', repoPath, 'commits'] })
  }, [repoPath, queryClient])

  return (
    <div className="flex-1 flex flex-col bg-muted/30 min-h-0 overflow-hidden">
      {/* ===== 顶部工具栏 ===== */}
      <header className="border-b border-border bg-card px-3 py-2 flex items-center gap-2 shrink-0">
        <button
          onClick={handleCommit}
          disabled={committing || stagedFiles.length === 0 || !commitMsg.trim()}
          className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 flex items-center gap-1"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 14L12 10L6 14" /><path d="M21 22H3" /></svg>
          提交
        </button>
        <button onClick={handlePull} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14V6C19 4.89543 18.1046 4 17 4H9C7.89543 4 7 4.89543 7 6V14" /><path d="M12 18L19 11L12 4" /><path d="M19 11H5" /></svg>
          拉取
          {summary && summary.behind > 0 && (
            <span className="ml-0.5 text-orange-600 text-[10px] font-medium">↓{summary.behind}</span>
          )}
        </button>
        <button onClick={handlePush} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 10V18C5 19.1046 5.89543 20 7 20H15C16.1046 20 17 19.1046 17 18V10" /><path d="M12 6L5 13L12 20" /><path d="M5 13H19" /></svg>
          推送
          {summary && summary.ahead > 0 && (
            <span className="ml-0.5 text-green-600 text-[10px] font-medium">↑{summary.ahead}</span>
          )}
        </button>
        <button onClick={handleFetch} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12H20" /><path d="M4 6H20" /><path d="M4 18H20" /></svg>
          获取
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.59 16.5L13.42 12.5" /><path d="M15.41 7.5L10.58 11.5" /></svg>
          分支
        </button>
        <button className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8V5C18 4.44772 17.5523 4 17 4H3C2.44772 4 2 4.44772 2 5V19C2 19.5523 2.44772 20 3 20H17C17.5523 20 18 19.5523 18 19V16" /><path d="M22 6L18 10L14 6" /><path d="M18 10V4" /></svg>
          合并
        </button>
        <div className="flex-1" />
        {/* 加载指示器 */}
        {filesLoading && (
          <span className="text-[10px] text-muted-foreground animate-pulse">加载中...</span>
        )}
        <button
          onClick={() => refreshDiff()}
          disabled={filesLoading}
          className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent disabled:opacity-40"
        >
          刷新
        </button>
      </header>

      {/* ===== 错误提示 ===== */}
      {repoError && (
        <div className="mx-3 mt-2 p-2 rounded bg-destructive/10 border border-destructive/30 text-xs text-destructive">
          加载仓库数据失败: {(repoError as Error).message}
        </div>
      )}

      {/* ===== 主内容区域 ===== */}
      <div className="flex-1 flex min-h-0">
        {/* ===== 左侧：导航栏 ===== */}
        <aside className="w-56 border-r border-border bg-card flex flex-col shrink-0">
          {/* WORKSPACE */}
          <div className="border-b border-border">
            <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              WORKSPACE
            </div>
            <button
              onClick={() => { setActiveNav('workspace'); setActiveWorkspaceTab('file-status') }}
              className={`w-full text-left px-4 py-1.5 text-xs flex items-center gap-2 ${activeNav === 'workspace' && activeWorkspaceTab === 'file-status' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              文件状态
              {summary && (summary.unstaged_count + summary.staged_count + summary.untracked_count) > 0 && (
                <span className="ml-auto text-[10px] text-muted-foreground">{summary.unstaged_count + summary.staged_count + summary.untracked_count}</span>
              )}
            </button>
            <button
              onClick={() => { setActiveNav('workspace'); setActiveWorkspaceTab('history') }}
              className={`w-full text-left px-4 py-1.5 text-xs flex items-center gap-2 ${activeNav === 'workspace' && activeWorkspaceTab === 'history' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              历史
            </button>
            <button
              onClick={() => { setActiveNav('workspace'); setActiveWorkspaceTab('search') }}
              className={`w-full text-left px-4 py-1.5 text-xs flex items-center gap-2 ${activeNav === 'workspace' && activeWorkspaceTab === 'search' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              搜索
            </button>
          </div>

          {/* BRANCHES */}
          <div className="border-b border-border">
            <button
              onClick={() => setShowBranches(!showBranches)}
              className="w-full px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between hover:bg-accent/30"
            >
              BRANCHES
              <svg className={`w-3 h-3 transition-transform ${showBranches ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            {showBranches && (
              <div className="max-h-40 overflow-y-auto">
                {branches.map((branch) => {
                  const tracking = branchTracking.find(t => t.branch === branch)
                  const isCurrent = tracking?.isCurrent || branch === currentBranch
                  return (
                    <button
                      key={branch}
                      onClick={() => !isCurrent && handleSwitchBranch(branch)}
                      className={`w-full text-left px-4 py-1 text-xs flex items-center gap-2 ${isCurrent ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
                    >
                      <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
                      <span className="truncate">{branch}</span>
                      {tracking && (tracking.ahead > 0 || tracking.behind > 0) && (
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          {tracking.ahead > 0 && `↑${tracking.ahead}`}
                          {tracking.behind > 0 && `↓${tracking.behind}`}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* TAGS / REMOTES / STASH 占位 */}
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider border-b border-border">
            TAGS
          </div>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider border-b border-border">
            REMOTES
          </div>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
            STASH
          </div>
        </aside>

        {/* ===== 右侧：内容区域 ===== */}
        <div className="flex-1 flex flex-col min-h-0">
          {activeNav === 'workspace' && activeWorkspaceTab === 'file-status' && (
            <FileStatusContent
              stagedFiles={stagedFiles}
              unstagedFiles={unstagedFiles}
              untrackedFiles={untrackedFiles}
              selectedFile={selectedFile}
              selectedDiff={selectedDiff}
              commitMsg={commitMsg}
              committing={committing}
              setCommitMsg={setCommitMsg}
              onShowDiff={showDiff}
              onStage={(path) => mutations.stageFiles.mutate([path])}
              onStageAll={() => mutations.stageFiles.mutate([...unstagedFiles, ...untrackedFiles].map(f => f.path))}
              onUnstage={(path) => mutations.unstageFiles.mutate([path])}
              onUnstageAll={() => mutations.unstageFiles.mutate(stagedFiles.map(f => f.path))}
              onCommit={handleCommit}
              onDiscardFile={(path) => mutations.discardFile.mutate(path)}
              onDiscardHunk={(path, hunkIndex) => mutations.discardHunk.mutate({ filePath: path, hunkIndex })}
              onStageHunk={(path, hunkIndex) => mutations.stageHunk.mutate({ filePath: path, hunkIndex })}
              onStageLines={(path, selections) => mutations.stageLines.mutate({ filePath: path, selections })}
              onDiscardLines={(path, selections) => mutations.discardLines.mutate({ filePath: path, selections })}
              onUnstageLines={(path, selections) => mutations.unstageLines.mutate({ filePath: path, selections })}
              onRefreshDiff={refreshDiff}
            />
          )}
          {activeNav === 'workspace' && activeWorkspaceTab === 'history' && (
            <HistoryContent
              repoPath={repoPath}
              commits={commits}
              selectedCommit={selectedCommit}
              onSelectCommit={loadCommitDetail}
              summary={summary}
              onTagCreated={handleTagCreated}
            />
          )}
          {activeNav === 'workspace' && activeWorkspaceTab === 'search' && (
            <SearchContent />
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/repo/$repoId')({
  component: RepoLayout,
})
