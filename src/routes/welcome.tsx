/**
 * 欢迎页路由
 *
 * 仓库书签管理，提供添加/删除/打开仓库功能
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { tauriCommands } from '@/lib/tauri/commands'
import { useTabStore, useBookmarkStore } from '@/stores'
import type { Bookmark } from '@/stores'

/** 欢迎页组件 */
function WelcomePage() {
  const { bookmarks, addBookmark, removeBookmark } = useBookmarkStore()
  const { openTab } = useTabStore()
  const navigate = useNavigate()
  const [showInput, setShowInput] = useState(false)
  const [newPath, setNewPath] = useState("")
  const [errMsg, setErrMsg] = useState("")
  const [showCloneDialog, setShowCloneDialog] = useState(false)
  const [cloneUrl, setCloneUrl] = useState("")
  const [cloneDir, setCloneDir] = useState("")
  const [showInitDialog, setShowInitDialog] = useState(false)
  const [initPath, setInitPath] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  /** 打开仓库并导航到仓库页 */
  const handleOpenRepo = async (path: string) => {
    setErrMsg("")
    try {
      await tauriCommands.openRepo(path)
      const branch = await tauriCommands.getCurrentBranch(path)
      openTab(path, branch)
      // 导航到仓库页
      navigate({ to: '/repo/$repoId', params: { repoId: path } as any })
    } catch (e: any) {
      setErrMsg(`打开失败: ${e}`)
    }
  }

  /** 使用原生文件对话框选择仓库目录 */
  const handleBrowse = async () => {
    setErrMsg("")
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择仓库目录",
      })
      if (selected) {
        const name = selected.split(/[/\\]/).filter(Boolean).pop() || selected
        addBookmark(name, selected)
        await handleOpenRepo(selected)
      }
    } catch (e: any) {
      setErrMsg(`选择目录失败: ${e}`)
    }
  }

  /** 添加书签 */
  const handleAddBookmark = () => {
    const path = newPath.trim()
    if (!path) return
    const name = path.split(/[/\\]/).filter(Boolean).pop() || path
    addBookmark(name, path)
    setShowInput(false)
    setNewPath("")
  }

  /** 删除书签 */
  const handleRemoveBookmark = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    removeBookmark(path)
  }

  /** 克隆仓库 */
  const handleClone = async () => {
    if (!cloneUrl.trim() || !cloneDir.trim()) {
      setErrMsg("请输入仓库 URL 和目标目录")
      return
    }
    setErrMsg("")
    try {
      await tauriCommands.cloneRepo(cloneUrl.trim(), cloneDir.trim())
      const name = cloneDir.split(/[/\\]/).filter(Boolean).pop() || cloneDir
      addBookmark(name, cloneDir)
      await handleOpenRepo(cloneDir)
      setShowCloneDialog(false)
      setCloneUrl("")
      setCloneDir("")
    } catch (e: any) {
      setErrMsg(`克隆失败: ${e}`)
    }
  }

  /** 选择克隆目标目录 */
  const handleSelectCloneDir = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "选择克隆目标目录" })
      if (selected) setCloneDir(selected)
    } catch (e: any) {
      setErrMsg(`选择目录失败: ${e}`)
    }
  }

  /** 初始化仓库 */
  const handleInit = async () => {
    if (!initPath.trim()) {
      setErrMsg("请输入目录路径")
      return
    }
    setErrMsg("")
    try {
      await tauriCommands.initRepo(initPath.trim(), false)
      const name = initPath.split(/[/\\]/).filter(Boolean).pop() || initPath
      addBookmark(name, initPath)
      await handleOpenRepo(initPath)
      setShowInitDialog(false)
      setInitPath("")
    } catch (e: any) {
      setErrMsg(`初始化失败: ${e}`)
    }
  }

  /** 选择初始化目录 */
  const handleSelectInitDir = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "选择要初始化的目录" })
      if (selected) setInitPath(selected)
    } catch (e: any) {
      setErrMsg(`选择目录失败: ${e}`)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-muted/30 p-8 overflow-y-auto">
      <div className="w-full max-w-lg my-auto">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">SourceTree Rust</h1>
          <p className="text-sm text-muted-foreground mt-1">
            选择、浏览或添加一个仓库开始使用
          </p>
        </div>

        {/* 快速操作 */}
        <div className="mb-6 flex gap-3">
          <button
            onClick={handleBrowse}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary transition-colors text-sm font-medium text-primary"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            浏览并选择仓库目录
          </button>
        </div>

        {/* 克隆和初始化按钮 */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setShowCloneDialog(true)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded border border-border hover:bg-accent text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            克隆仓库
          </button>
          <button
            onClick={() => setShowInitDialog(true)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded border border-border hover:bg-accent text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            初始化仓库
          </button>
        </div>

        {/* 克隆对话框 */}
        {showCloneDialog && (
          <div className="mb-6 p-4 rounded-lg border border-border bg-card">
            <div className="text-sm font-medium mb-3">克隆远程仓库</div>
            <div className="space-y-2">
              <input
                type="text"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="仓库 URL (如 https://github.com/user/repo.git)"
                className="w-full px-3 py-2 text-sm rounded border border-input bg-background outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cloneDir}
                  onChange={(e) => setCloneDir(e.target.value)}
                  placeholder="目标目录"
                  className="flex-1 px-3 py-2 text-sm rounded border border-input bg-background outline-none focus:border-primary"
                />
                <button onClick={handleSelectCloneDir} className="px-3 py-2 text-xs rounded border border-input hover:bg-accent">
                  浏览
                </button>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => { setShowCloneDialog(false); setCloneUrl(""); setCloneDir("") }}
                  className="px-3 py-1.5 text-xs rounded border border-input hover:bg-accent"
                >
                  取消
                </button>
                <button onClick={handleClone} className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90">
                  克隆
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 初始化对话框 */}
        {showInitDialog && (
          <div className="mb-6 p-4 rounded-lg border border-border bg-card">
            <div className="text-sm font-medium mb-3">初始化新仓库</div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={initPath}
                  onChange={(e) => setInitPath(e.target.value)}
                  placeholder="目录路径"
                  className="flex-1 px-3 py-2 text-sm rounded border border-input bg-background outline-none focus:border-primary"
                />
                <button onClick={handleSelectInitDir} className="px-3 py-2 text-xs rounded border border-input hover:bg-accent">
                  浏览
                </button>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => { setShowInitDialog(false); setInitPath("") }}
                  className="px-3 py-1.5 text-xs rounded border border-input hover:bg-accent"
                >
                  取消
                </button>
                <button onClick={handleInit} className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90">
                  初始化
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 书签列表 */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium">仓库书签</span>
            <button
              onClick={() => setShowInput(true)}
              className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
            >
              + 添加
            </button>
          </div>

          {showInput && (
            <div className="px-4 py-3 border-b border-border bg-muted/20">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddBookmark()}
                  placeholder="输入仓库路径..."
                  className="flex-1 px-2 py-1.5 text-sm rounded border border-input bg-background outline-none focus:border-primary"
                  autoFocus
                />
                <button onClick={handleAddBookmark} className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90">
                  确定
                </button>
                <button
                  onClick={() => { setShowInput(false); setNewPath("") }}
                  className="px-3 py-1.5 text-xs rounded border border-input hover:bg-accent"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-border">
            {bookmarks.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                暂无书签，点击上方"添加"按钮或使用"浏览"按钮添加仓库
              </div>
            ) : (
              bookmarks.map((b: Bookmark) => (
                <div
                  key={b.path}
                  onClick={() => handleOpenRepo(b.path)}
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{b.path}</div>
                  </div>
                  <button
                    onClick={(e) => handleRemoveBookmark(e, b.path)}
                    className="ml-2 px-2 py-1 text-xs rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    删除
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 错误提示 */}
        {errMsg && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            {errMsg}
          </div>
        )}

        {/* 快速打开 */}
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <label className="text-sm font-medium block mb-2">快速打开仓库</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="输入完整路径直接打开..."
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value.trim()
                  if (val) {
                    try {
                      await tauriCommands.openRepo(val)
                      const branch = await tauriCommands.getCurrentBranch(val)
                      openTab(val, branch)
                      navigate({ to: '/repo/$repoId', params: { repoId: val } })
                    } catch (err: any) {
                      setErrMsg(`打开失败: ${err}`)
                    }
                  }
                }
              }}
              className="flex-1 px-3 py-2 text-sm rounded border border-input bg-background outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/welcome')({
  component: WelcomePage,
})
