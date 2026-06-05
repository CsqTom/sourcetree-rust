/**
 * Tauri IPC 调用层
 *
 * 封装前端与 Rust 后端的通信接口
 */

import { invoke } from "@tauri-apps/api/core";

/** 基础问候测试 */
export async function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}

/** 获取后端状态 */
export async function getBackendInfo(): Promise<{
  status: string;
  gix_available: boolean;
}> {
  return invoke("get_backend_info");
}

/** 打开仓库 */
export async function openRepo(path: string): Promise<string> {
  return invoke<string>("open_repo", { path });
}

/** 获取仓库信息 */
export async function getRepoInfo(): Promise<{
  is_open: boolean;
  current_path: string | null;
  theme: string;
}> {
  return invoke("get_repo_info");
}