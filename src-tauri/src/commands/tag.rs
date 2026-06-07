//! 标签管理命令
//!
//! 提供标签创建、删除、推送、列表等 IPC 接口

use crate::services::git_service::GitService;

/// 创建轻量标签
#[tauri::command]
pub fn create_lightweight_tag(repo_path: String, name: String, commit_id: Option<String>) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::create_lightweight_tag(&repo, &name, commit_id.as_deref()).map_err(|e| e.to_string())?;
    Ok(format!("轻量标签 '{}' 创建成功", name))
}

/// 创建附注标签
#[tauri::command]
pub fn create_annotated_tag(repo_path: String, name: String, message: String, commit_id: Option<String>) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::create_annotated_tag(&repo, &name, &message, commit_id.as_deref()).map_err(|e| e.to_string())?;
    Ok(format!("附注标签 '{}' 创建成功", name))
}

/// 删除本地标签
#[tauri::command]
pub fn delete_tag(repo_path: String, name: String) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::delete_tag(&repo, &name).map_err(|e| e.to_string())?;
    Ok(format!("本地标签 '{}' 已删除", name))
}

/// 推送标签到远程
#[tauri::command]
pub fn push_tag(repo_path: String, name: String, remote: Option<String>) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::push_tag(&repo, &name, remote.as_deref()).map_err(|e| e.to_string())?;
    Ok(format!("标签 '{}' 推送成功", name))
}

/// 删除远程标签
#[tauri::command]
pub fn delete_remote_tag(repo_path: String, name: String, remote: Option<String>) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::delete_remote_tag(&repo, &name, remote.as_deref()).map_err(|e| e.to_string())?;
    Ok(format!("远程标签 '{}' 已删除", name))
}

/// 列出所有标签
#[tauri::command]
pub fn list_tags(repo_path: String) -> Result<Vec<String>, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    let tags = GitService::list_tags(&repo).map_err(|e| e.to_string())?;
    Ok(tags)
}