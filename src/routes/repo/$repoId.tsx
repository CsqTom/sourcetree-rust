/**
 * 仓库布局路由
 *
 * 包含：工具栏 + 侧边栏 + 内容区域
 * 使用自定义 Hooks 管理数据获取和操作逻辑
 */

import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, useEffect } from 'react'
import { GitCommit, Download, Upload, RefreshCw, GitBranch, GitMerge, Loader2, FileText, Clock, Search, ChevronRight, GitPullRequest, Circle, Terminal } from 'lucide-react'
import { tauriCommands } from '@/lib/tauri/commands'
import { useRepoData, useRepoMutations, useFileDiff, useAutoFetch } from '@/hooks/useRepo'
import { FileStatusContent } from '@/components/repo/FileStatusContent'
import { HistoryContent } from '@/components/repo/HistoryContent'
import { SearchContent } from '@/components/repo/SearchContent'
import { TerminalPanel } from '@/components/repo/TerminalPanel'
import { useTabStore } from '@/stores'
import type { CommitEntry } from '@/lib/tauri/types'

/** 左侧导航区域类型 */
type NavSection = 'workspace' | 'branches' | 'tags' | 'remotes' | 'stash'
/** WORKSPACE 子类型 */
type WorkspaceTab = 'file-status' | 'history' | 'search' | 'terminal'

/** 仓库布局组件 */
function RepoLayout() {
  const { repoId } = Route.useParams()
  const repoPath = decodeURIComponent(repoId)
  const queryClient = useQueryClient()

  // Tab 状态
  const { tabs } = useTabStore()

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

  // 从 branchTracking 获取当前分支
  const currentBranch = branchTracking.find(t => t.isCurrent)?.branch || ''

  // 提交状态
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)

  // 提交历史选择状态
  const [selectedCommit, setSelectedCommit] = useState<CommitEntry | null>(null)

  // 侧边栏展开状态
  const [showBranches, setShowBranches] = useState(true)
  const [showRemotes, setShowRemotes] = useState(true)

  // 右键菜单状态
  const [branchContextMenu, setBranchContextMenu] = useState<{ x: number; y: number; branch: string; isRemote: boolean } | null>(null)

  // 凭据对话框状态
  const [credentialDialog, setCredentialDialog] = useState<{
    type: 'pull' | 'push'
    remote: string
    branch: string
    remoteUrl?: string
  } | null>(null)
  const [credentialUsername, setCredentialUsername] = useState('')
  const [credentialPassword, setCredentialPassword] = useState('')
  const [credentialSaving, setCredentialSaving] = useState(false)

  // 远程分支列表
  const [remoteBranches, setRemoteBranches] = useState<string[]>([])

  // 加载远程分支
  useEffect(() => {
    if (!repoPath || !showRemotes) return
    tauriCommands.listRemoteBranches(repoPath)
      .then(setRemoteBranches)
      .catch(e => console.error("加载远程分支失败:", e))
  }, [repoPath, showRemotes])

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
      const errorMsg = e?.message || e || '未知错误'
      alert(`切换分支失败: ${errorMsg}\n可能存在未提交的更改或冲突，请先处理后再试。`)
    }
  }

  /** 检出远程分支 */
  const handleCheckoutRemoteBranch = async (remoteBranch: string) => {
    // 从远程分支名（如 origin/main）提取分支名（main）
    const branchName = remoteBranch.includes('/') ? remoteBranch.split('/').slice(1).join('/') : remoteBranch
    try {
      await mutations.checkoutBranch.mutateAsync(branchName)
    } catch (e: any) {
      const errorMsg = e?.message || e || '未知错误'
      alert(`检出分支失败: ${errorMsg}\n可能存在冲突，请先解决冲突后再试。`)
    }
  }

  /** 右键菜单关闭 */
  useEffect(() => {
    if (!branchContextMenu) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".branch-context-menu")) {
        setBranchContextMenu(null)
      }
    }
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0)
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler) }
  }, [branchContextMenu])

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
  const handlePull = async (credentials?: { username: string; password: string }) => {
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
      if (!remote) {
        alert("拉取失败：当前仓库没有配置远程仓库。\n请先通过 git remote add 添加远程仓库。")
        return
      }
      
      const result = await mutations.pullRemote.mutateAsync({ 
        remote, 
        branch: currentBranch,
        credentials
      })
      alert("拉取成功\n" + result)
    } catch (e: any) {
      const errorMsg = e?.message || e || ''
      
      // 检测认证失败
      if (errorMsg.includes('could not read Username') || 
          errorMsg.includes('Authentication failed') ||
          errorMsg.includes('401') ||
          errorMsg.includes('fatal: could not read')) {
        
        // 获取远程 URL
        const tracking = branchTracking.find(t => t.isCurrent)
        let remoteName = tracking?.upstream?.split("/")[0]
        if (!remoteName) {
          const remotes = await tauriCommands.listRemotes(repoPath)
          remoteName = remotes.length > 0 ? remotes[0].name : undefined
        }
        
        if (remoteName) {
          const remotes = await tauriCommands.listRemotes(repoPath)
          const remote = remotes.find(r => r.name === remoteName)
          
          setCredentialDialog({
            type: 'pull',
            remote: remoteName,
            branch: currentBranch,
            remoteUrl: remote?.fetch_url || remote?.push_url || undefined
          })
          setCredentialUsername('')
          setCredentialPassword('')
          return
        }
      }
      
      alert("拉取失败: " + errorMsg)
    }
  }

  /** Push */
  const handlePush = async (credentials?: { username: string; password: string }) => {
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
      
      const result = await mutations.pushRemote.mutateAsync({ 
        remote, 
        branch: currentBranch, 
        setUpstream: !tracking?.upstream,
        credentials
      })
      alert("推送成功\n" + result)
    } catch (e: any) {
      const errorMsg = e?.message || e || ''
      
      // 检测认证失败
      if (errorMsg.includes('could not read Username') || 
          errorMsg.includes('Authentication failed') ||
          errorMsg.includes('401') ||
          errorMsg.includes('fatal: could not read')) {
        
        // 获取远程 URL
        const tracking = branchTracking.find(t => t.isCurrent)
        let remoteName = tracking?.upstream?.split("/")[0]
        if (!remoteName) {
          const remotes = await tauriCommands.listRemotes(repoPath)
          remoteName = remotes.length > 0 ? remotes[0].name : undefined
        }
        
        if (remoteName) {
          const remotes = await tauriCommands.listRemotes(repoPath)
          const remote = remotes.find(r => r.name === remoteName)
          
          setCredentialDialog({
            type: 'push',
            remote: remoteName,
            branch: currentBranch,
            remoteUrl: remote?.fetch_url || remote?.push_url || undefined
          })
          setCredentialUsername('')
          setCredentialPassword('')
          return
        }
      }
      
      alert("推送失败: " + errorMsg)
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
          <GitCommit className="w-4 h-4" />
          提交
        </button>
        <button
          onClick={() => handlePull()}
          disabled={mutations.pullRemote.isPending}
          className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1 disabled:opacity-40"
        >
          {mutations.pullRemote.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          拉取
          {summary && summary.behind > 0 && (
            <span className="ml-0.5 text-orange-600 text-[10px] font-medium">↓{summary.behind}</span>
          )}
        </button>
        <button
          onClick={() => handlePush()}
          disabled={mutations.pushRemote.isPending}
          className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1 disabled:opacity-40"
        >
          {mutations.pushRemote.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          推送
          {summary && summary.ahead > 0 && (
            <span className="ml-0.5 text-green-600 text-[10px] font-medium">↑{summary.ahead}</span>
          )}
        </button>
        <button onClick={handleFetch} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1">
          <RefreshCw className="w-4 h-4" />
          获取
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1">
          <GitBranch className="w-4 h-4" />
          分支
        </button>
        <button className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent flex items-center gap-1">
          <GitMerge className="w-4 h-4" />
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
          className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent disabled:opacity-40 flex items-center gap-1"
        >
          <RefreshCw className={`w-4 h-4 ${filesLoading ? 'animate-spin' : ''}`} />
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
              <FileText className="w-3.5 h-3.5" />
              文件状态
              {summary && (summary.unstaged_count + summary.staged_count + summary.untracked_count) > 0 && (
                <span className="ml-auto text-[10px] text-muted-foreground">{summary.unstaged_count + summary.staged_count + summary.untracked_count}</span>
              )}
            </button>
            <button
              onClick={() => { setActiveNav('workspace'); setActiveWorkspaceTab('history') }}
              className={`w-full text-left px-4 py-1.5 text-xs flex items-center gap-2 ${activeNav === 'workspace' && activeWorkspaceTab === 'history' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              <Clock className="w-3.5 h-3.5" />
              历史
            </button>
            <button
              onClick={() => { setActiveNav('workspace'); setActiveWorkspaceTab('search') }}
              className={`w-full text-left px-4 py-1.5 text-xs flex items-center gap-2 ${activeNav === 'workspace' && activeWorkspaceTab === 'search' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              <Search className="w-3.5 h-3.5" />
              搜索
            </button>
            <button
              onClick={() => { setActiveNav('workspace'); setActiveWorkspaceTab('terminal') }}
              className={`w-full text-left px-4 py-1.5 text-xs flex items-center gap-2 ${activeNav === 'workspace' && activeWorkspaceTab === 'terminal' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              <Terminal className="w-3.5 h-3.5" />
              终端
            </button>
          </div>

          {/* BRANCHES */}
          <div className="border-b border-border">
            <button
              onClick={() => setShowBranches(!showBranches)}
              className="w-full px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between hover:bg-accent/30"
            >
              BRANCHES
              <ChevronRight className={`w-3 h-3 transition-transform ${showBranches ? 'rotate-90' : ''}`} />
            </button>
            {showBranches && (
              <div className="max-h-40 overflow-y-auto">
                {branches.map((branch) => {
                  const tracking = branchTracking.find(t => t.branch === branch)
                  // 只使用 branchTracking 的 isCurrent 判断，避免重复标记
                  const isCurrent = tracking?.isCurrent ?? (branch === currentBranch)
                  return (
                    <div
                      key={branch}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setBranchContextMenu({ x: e.clientX, y: e.clientY, branch, isRemote: false })
                      }}
                      className={`w-full text-left px-4 py-1 text-xs flex items-center gap-2 ${isCurrent ? 'bg-accent text-foreground font-bold cursor-default' : 'text-muted-foreground hover:bg-accent/50 cursor-default'}`}
                    >
                      <GitPullRequest className="w-3 h-3 shrink-0" />
                      <span className="truncate">{branch}</span>
                      {tracking && (tracking.ahead > 0 || tracking.behind > 0) && (
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          {tracking.ahead > 0 && `↑${tracking.ahead}`}
                          {tracking.behind > 0 && `↓${tracking.behind}`}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* TAGS */}
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider border-b border-border">
            TAGS
          </div>

          {/* REMOTES */}
          <div className="border-b border-border">
            <button
              onClick={() => setShowRemotes(!showRemotes)}
              className="w-full px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between hover:bg-accent/30"
            >
              REMOTES
              <ChevronRight className={`w-3 h-3 transition-transform ${showRemotes ? 'rotate-90' : ''}`} />
            </button>
            {showRemotes && (
              <div className="max-h-40 overflow-y-auto">
                {remoteBranches.length === 0 ? (
                  <div className="px-4 py-1 text-xs text-muted-foreground">无远程分支</div>
                ) : (
                  remoteBranches.map((branch) => (
                    <div
                      key={branch}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setBranchContextMenu({ x: e.clientX, y: e.clientY, branch, isRemote: true })
                      }}
                      className="w-full text-left px-4 py-1 text-xs flex items-center gap-2 cursor-pointer text-muted-foreground hover:bg-accent/50"
                    >
                      <Circle className="w-3 h-3 shrink-0" />
                      <span className="truncate">{branch}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* STASH */}
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
            STASH
          </div>
        </aside>

        {/* ===== 右侧：内容区域 ===== */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* 文件状态 */}
          <div 
            className="flex-1 flex flex-col min-h-0"
            style={{ display: activeNav === 'workspace' && activeWorkspaceTab === 'file-status' ? 'flex' : 'none' }}
          >
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
          </div>
          
          {/* 历史 */}
          <div 
            className="flex-1 flex flex-col min-h-0"
            style={{ display: activeNav === 'workspace' && activeWorkspaceTab === 'history' ? 'flex' : 'none' }}
          >
            <HistoryContent
              repoPath={repoPath}
              commits={commits}
              selectedCommit={selectedCommit}
              onSelectCommit={loadCommitDetail}
              summary={summary}
              onTagCreated={handleTagCreated}
            />
          </div>
          
          {/* 搜索 */}
          <div 
            className="flex-1 flex flex-col min-h-0"
            style={{ display: activeNav === 'workspace' && activeWorkspaceTab === 'search' ? 'flex' : 'none' }}
          >
            <SearchContent />
          </div>
          
          {/* 终端 - 为每个仓库创建独立实例，使用 Tab 状态管理 */}
          {tabs.map((tab) => (
            <div 
              key={tab.path}
              className="flex-1 flex flex-col min-h-0"
              style={{ 
                display: activeNav === 'workspace' && activeWorkspaceTab === 'terminal' && tab.path === repoPath ? 'flex' : 'none' 
              }}
            >
              <TerminalPanel workspacePath={tab.path} />
            </div>
          ))}
        </div>
      </div>

      {/* 分支右键菜单 */}
      {branchContextMenu && (
        <div
          className="branch-context-menu fixed z-50 bg-card border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{ left: branchContextMenu.x, top: branchContextMenu.y }}
        >
          <button
            disabled={branchContextMenu.branch === currentBranch}
            onClick={() => {
              if (branchContextMenu.isRemote) {
                handleCheckoutRemoteBranch(branchContextMenu.branch)
              } else {
                handleSwitchBranch(branchContextMenu.branch)
              }
              setBranchContextMenu(null)
            }}
            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${branchContextMenu.branch === currentBranch ? 'text-muted-foreground cursor-not-allowed' : 'hover:bg-accent'}`}
          >
            <GitPullRequest className="w-3.5 h-3.5" />
            检出 {branchContextMenu.branch}
          </button>
        </div>
      )}

      {/* 凭据输入对话框 */}
      {credentialDialog && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" 
          onClick={() => setCredentialDialog(null)}
        >
          <div 
            className="bg-card border border-border rounded-lg shadow-xl p-4 w-[400px]" 
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium mb-3">
              {credentialDialog.type === 'pull' ? '拉取需要认证' : '推送需要认证'}
            </h3>
            <div className="mb-3 text-[10px] text-muted-foreground space-y-1">
              <div>远程仓库：{credentialDialog.remote}</div>
              {credentialDialog.remoteUrl && (
                <div className="truncate">URL：{credentialDialog.remoteUrl}</div>
              )}
              <div>分支：{credentialDialog.branch}</div>
            </div>
            <div className="mb-3">
              <label className="text-[10px] text-muted-foreground block mb-1">用户名</label>
              <input 
                type="text" 
                value={credentialUsername} 
                onChange={(e) => setCredentialUsername(e.target.value)} 
                placeholder="输入用户名" 
                className="w-full px-2.5 py-1.5 text-xs rounded border border-input bg-background outline-none focus:border-primary" 
                autoFocus 
              />
            </div>
            <div className="mb-3">
              <label className="text-[10px] text-muted-foreground block mb-1">密码 / Personal Access Token</label>
              <input 
                type="password" 
                value={credentialPassword} 
                onChange={(e) => setCredentialPassword(e.target.value)} 
                placeholder="输入密码或 Personal Access Token" 
                className="w-full px-2.5 py-1.5 text-xs rounded border border-input bg-background outline-none focus:border-primary" 
              />
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setCredentialDialog(null)} 
                className="px-3 py-1.5 text-xs rounded border border-border hover:bg-accent"
              >
                取消
              </button>
              <button 
                onClick={async () => {
                  if (!credentialUsername.trim() || !credentialPassword.trim()) {
                    alert('请输入用户名和密码')
                    return
                  }
                  setCredentialSaving(true)
                  try {
                    const credentials = {
                      username: credentialUsername.trim(),
                      password: credentialPassword.trim()
                    }
                    if (credentialDialog.type === 'pull') {
                      await handlePull(credentials)
                    } else {
                      await handlePush(credentials)
                    }
                    setCredentialDialog(null)
                  } catch (e: any) {
                    alert('认证失败: ' + (e?.message || e))
                  } finally {
                    setCredentialSaving(false)
                  }
                }} 
                disabled={credentialSaving || !credentialUsername.trim() || !credentialPassword.trim()} 
                className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {credentialSaving ? '认证中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/repo/$repoId')({
  component: RepoLayout,
})
