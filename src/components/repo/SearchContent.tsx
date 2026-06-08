/**
 * 搜索内容组件
 *
 * 搜索提交历史（占位实现）
 */

import { useState } from 'react'

export function SearchContent() {
  const [searchQuery, setSearchQuery] = useState("")
  return (
    <div className="flex-1 flex flex-col p-3 min-h-0">
      <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索提交..." className="w-full px-2 py-1.5 text-xs rounded border border-input bg-background outline-none focus:border-primary" />
      {searchQuery.trim() ? (
        <div className="mt-4 text-xs text-muted-foreground text-center">搜索功能开发中...</div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">输入关键词搜索提交历史</div>
      )}
    </div>
  )
}
