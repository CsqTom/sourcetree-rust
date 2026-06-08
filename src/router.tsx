/**
 * TanStack Router 实例
 *
 * 集成 TanStack Query，配置路由上下文和默认选项
 */

import {
  createRouter as createTanStackRouter,
} from '@tanstack/react-router'
import { routerWithQueryClient } from '@tanstack/react-router-with-query'
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'

// 创建 QueryClient
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 桌面应用：数据不会频繁变化，使用较长的 staleTime
        staleTime: 30 * 1000,
        refetchOnWindowFocus: true,
      },
    },
  })
}

// 创建路由
export function createRouter() {
  const queryClient = makeQueryClient()
  const router = createTanStackRouter({
    routeTree,
    context: {
      queryClient,
    },
    defaultPreload: 'intent',
    scrollRestoration: true,
  })

  return routerWithQueryClient(router, queryClient)
}

// 类型声明
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
