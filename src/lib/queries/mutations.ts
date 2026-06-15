/**
 * 文件操作 mutation 定义
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tauriCommands } from '@/lib/tauri/commands'
import { repoKeys } from './repo'

/** 暂存文件 */
export function useStageFiles(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paths: string[]) => tauriCommands.stageFiles(repoPath, paths),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.summary(repoPath) })
    },
  })
}

/** 取消暂存文件 */
export function useUnstageFiles(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paths: string[]) => tauriCommands.unstageFiles(repoPath, paths),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.summary(repoPath) })
    },
  })
}

/** 提交变更 */
export function useCommitChanges(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (message: string) => tauriCommands.commitChanges(repoPath, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.summary(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.commits(repoPath) })
    },
  })
}

/** 丢弃文件更改 */
export function useDiscardFile(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filePath: string) => tauriCommands.discardFile(repoPath, filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.summary(repoPath) })
    },
  })
}

/** 丢弃 hunk */
export function useDiscardHunk(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filePath, hunkIndex }: { filePath: string; hunkIndex: number }) =>
      tauriCommands.discardHunk(repoPath, filePath, hunkIndex),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.diff(repoPath, variables.filePath) })
    },
  })
}

/** 暂存 hunk */
export function useStageHunk(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filePath, hunkIndex }: { filePath: string; hunkIndex: number }) =>
      tauriCommands.stageHunk(repoPath, filePath, hunkIndex),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.diff(repoPath, variables.filePath) })
    },
  })
}

/** 暂存选中行 */
export function useStageLines(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filePath, selections }: { filePath: string; selections: { hunkIndex: number; lineIndices: number[] }[] }) =>
      tauriCommands.stageLines(repoPath, filePath, selections),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.diff(repoPath, variables.filePath) })
    },
  })
}

/** 丢弃选中行 */
export function useDiscardLines(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filePath, selections }: { filePath: string; selections: { hunkIndex: number; lineIndices: number[] }[] }) =>
      tauriCommands.discardLinesByIndices(repoPath, filePath, selections),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.diff(repoPath, variables.filePath) })
    },
  })
}

/** 取消暂存选中行 */
export function useUnstageLines(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filePath, selections }: { filePath: string; selections: { hunkIndex: number; lineIndices: number[] }[] }) =>
      tauriCommands.unstageLines(repoPath, filePath, selections),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.stagedDiff(repoPath, variables.filePath) })
    },
  })
}

/** 切换分支 */
export function useCheckoutBranch(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (branchName: string) => tauriCommands.checkoutBranch(repoPath, branchName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.detail(repoPath) })
    },
  })
}

/** 合并分支到当前分支 */
export function useMergeBranch(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (branchName: string) => tauriCommands.mergeBranch(repoPath, branchName),
    onSuccess: () => {
      // 合并后刷新状态、提交历史、摘要
      queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.commits(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.summary(repoPath) })
    },
  })
}

/** Fetch 远程 */
export function useFetchRemote(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (remote?: string) => tauriCommands.fetchRemote(repoPath, remote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.tracking(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.summary(repoPath) })
    },
  })
}

/** Pull 远程 */
export function usePullRemote(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ remote, branch, credentials }: { remote?: string; branch?: string; credentials?: { username: string; password: string } }) =>
      tauriCommands.pullRemote(repoPath, remote, branch, credentials),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.detail(repoPath) })
    },
  })
}

/** Push 远程 */
export function usePushRemote(repoPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ remote, branch, setUpstream, credentials }: { remote?: string; branch?: string; setUpstream?: boolean; credentials?: { username: string; password: string } }) =>
      tauriCommands.pushRemote(repoPath, remote, branch, setUpstream, credentials),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.tracking(repoPath) })
      queryClient.invalidateQueries({ queryKey: repoKeys.summary(repoPath) })
    },
  })
}
