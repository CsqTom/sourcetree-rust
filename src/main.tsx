/**
 * 应用入口
 *
 * 使用 TanStack Router 管理路由，TanStack Query 管理数据
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { createRouter } from './router'
import './styles.css'

// 创建路由实例
const router = createRouter()

// 挂载应用
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
