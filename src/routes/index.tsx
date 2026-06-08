/**
 * 首页路由
 *
 * 根据是否有打开的 Tab 重定向到对应页面
 */

import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTabStore } from '@/stores'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const { tabs, activeTabId } = useTabStore.getState()
    if (tabs.length > 0 && activeTabId) {
      // 有打开的仓库，重定向到仓库页
      throw redirect({ to: '/repo/$repoId', params: { repoId: activeTabId } as any })
    }
    // 没有打开的仓库，重定向到欢迎页
    throw redirect({ to: '/welcome' as any })
  },
})
