/**
 * 欢迎页路由
 *
 * 简洁的欢迎页面，提供浏览并选择仓库目录功能
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { tauriCommands } from '@/lib/tauri/commands'
import { useTabStore, useBookmarkStore } from '@/stores'

/** 欢迎页组件 */
function WelcomePage() {
  const { addBookmark } = useBookmarkStore()
  const { openTab } = useTabStore()
  const navigate = useNavigate()
  const [errMsg, setErrMsg] = useState("")

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
        // 验证并打开仓库
        await tauriCommands.openRepo(selected)
        const branch = await tauriCommands.getCurrentBranch(selected)
        
        // 添加到书签
        const name = selected.split(/[/\\]/).filter(Boolean).pop() || selected
        addBookmark(name, selected)
        
        // 打开 Tab
        openTab(selected, branch)
        
        // 导航到仓库页
        navigate({ to: '/repo/$repoId', params: { repoId: selected } as any })
      }
    } catch (e: any) {
      setErrMsg(`打开失败: ${e}`)
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

        {/* 浏览按钮 */}
        <button
          onClick={handleBrowse}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary transition-colors text-sm font-medium text-primary"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          浏览并选择仓库目录
        </button>

        {/* 错误提示 */}
        {errMsg && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            {errMsg}
          </div>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/welcome')({
  component: WelcomePage,
})
