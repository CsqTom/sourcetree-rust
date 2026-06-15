/**
 * 仓库相关自定义 Hooks
 *
 * 将路由组件中的数据获取、状态管理、操作逻辑提取为可复用的 Hooks
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { tauriCommands } from '@/lib/tauri/commands'
import {
  repoQueries,
  useStageFiles, useUnstageFiles, useCommitChanges,
  useDiscardFile, useDiscardHunk, useStageHunk,
  useStageLines, useDiscardLines, useUnstageLines,
  useCheckoutBranch, useMergeBranch, useFetchRemote, usePullRemote, usePushRemote,
} from '@/lib/queries'
import type { FileStatus } from '@/lib/tauri/types'

/**
 * 聚合仓库所有 Query 数据获取 + 文件分类
 *
 * 返回：files, summary, commits, branches, branchTracking, stagedFiles, unstagedFiles, untrackedFiles, isLoading
 */
export function useRepoData(repoPath: string) {
  const { data: files = [], isLoading, error } = useQuery(repoQueries.status(repoPath))
  const { data: summary } = useQuery(repoQueries.summary(repoPath))
  const { data: commits = [] } = useQuery(repoQueries.commits(repoPath))
  const { data: branches = [] } = useQuery(repoQueries.branches(repoPath))
  const { data: branchTracking = [] } = useQuery(repoQueries.tracking(repoPath))

  // 分类文件
  const conflictFiles = files.filter((f: FileStatus) => f.is_conflict)
  const stagedFiles = files.filter((f: FileStatus) => f.stage_status && !f.is_conflict)
  const unstagedFiles = files.filter((f: FileStatus) => f.worktree_status && !f.stage_status && !f.is_untracked && !f.is_conflict)
  const untrackedFiles = files.filter((f: FileStatus) => f.is_untracked)

  return {
    files, summary, commits, branches, branchTracking,
    conflictFiles, stagedFiles, unstagedFiles, untrackedFiles,
    isLoading, error,
  }
}

/**
 * 聚合仓库所有 mutation 实例
 */
export function useRepoMutations(repoPath: string) {
  return {
    stageFiles: useStageFiles(repoPath),
    unstageFiles: useUnstageFiles(repoPath),
    commit: useCommitChanges(repoPath),
    discardFile: useDiscardFile(repoPath),
    discardHunk: useDiscardHunk(repoPath),
    stageHunk: useStageHunk(repoPath),
    stageLines: useStageLines(repoPath),
    discardLines: useDiscardLines(repoPath),
    unstageLines: useUnstageLines(repoPath),
    checkoutBranch: useCheckoutBranch(repoPath),
    mergeBranch: useMergeBranch(repoPath),
    fetchRemote: useFetchRemote(repoPath),
    pullRemote: usePullRemote(repoPath),
    pushRemote: usePushRemote(repoPath),
  }
}

/**
 * 文件差异查看/刷新逻辑
 *
 * 管理选中文件、差异内容、来源标记
 */
export function useFileDiff(repoPath: string) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedDiff, setSelectedDiff] = useState('')
  const lastClickFromStagedRef = useRef(false)
  const queryClient = useQueryClient()

  /** 查看差异 */
  const showDiff = useCallback(async (path: string, fromStaged?: boolean) => {
    setSelectedFile(path)
    lastClickFromStagedRef.current = !!fromStaged
    try {
      if (fromStaged) {
        const diff = await tauriCommands.getStagedDiff(repoPath, path)
        setSelectedDiff(diff)
      } else {
        const diff = await tauriCommands.getFileDiff(repoPath, path)
        setSelectedDiff(diff)
      }
    } catch {
      setSelectedDiff("无法加载差异")
    }
  }, [repoPath])

  /** 刷新当前差异 */
  const refreshDiff = useCallback(async () => {
    if (!selectedFile) return
    try {
      await queryClient.invalidateQueries({ queryKey: ['repo', repoPath] })
      if (lastClickFromStagedRef.current) {
        const diff = await tauriCommands.getStagedDiff(repoPath, selectedFile)
        setSelectedDiff(diff)
      } else {
        const diff = await tauriCommands.getFileDiff(repoPath, selectedFile)
        setSelectedDiff(diff)
      }
    } catch (e) {
      console.error("刷新差异失败:", e)
    }
  }, [selectedFile, repoPath, queryClient])

  /** 清除选中 */
  const clearSelection = useCallback(() => {
    setSelectedFile(null)
    setSelectedDiff('')
  }, [])

  return {
    selectedFile, selectedDiff,
    isFromStaged: lastClickFromStagedRef,
    showDiff, refreshDiff, clearSelection,
  }
}

/**
 * 自动 fetch 远程仓库
 *
 * 每小时自动 fetch 一次，挂载时立即执行
 */
export function useAutoFetch(repoPath: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!repoPath) return
    const INTERVAL = 60 * 60 * 1000
    const doFetch = async () => {
      try {
        await tauriCommands.fetchRemote(repoPath)
        queryClient.invalidateQueries({ queryKey: ['repo', repoPath] })
      } catch (e) {
        console.debug("自动 fetch 失败:", e)
      }
    }
    doFetch()
    const timer = setInterval(doFetch, INTERVAL)
    return () => clearInterval(timer)
  }, [repoPath, queryClient])
}
