//! 文件状态和差异命令

use crate::services::git_service::GitService;

/// 获取仓库文件状态列表
#[tauri::command]
pub fn get_status(repo_path: String) -> Result<Vec<crate::models::diff::FileStatus>, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    let files = GitService::status(&repo).map_err(|e| e.to_string())?;
    Ok(files)
}

/// 暂存文件
#[tauri::command]
pub fn stage_files(repo_path: String, paths: Vec<String>) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::stage_files(&repo, &paths).map_err(|e| e.to_string())?;
    Ok(format!("已暂存 {} 个文件", paths.len()))
}

/// 取消暂存
#[tauri::command]
pub fn unstage_files(repo_path: String, paths: Vec<String>) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::unstage_files(&repo, &paths).map_err(|e| e.to_string())?;
    Ok(format!("已取消暂存 {} 个文件", paths.len()))
}

/// 获取文件差异（纯文本格式）
#[tauri::command]
pub fn get_file_diff(repo_path: String, file_path: String) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    let diff = GitService::diff_file_text(&repo, &file_path).map_err(|e| e.to_string())?;
    Ok(diff)
}

/// 获取仓库摘要信息
#[tauri::command]
pub fn get_repo_summary(repo_path: String) -> Result<crate::models::repo::RepoSummary, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    let summary = GitService::summary(&repo).map_err(|e| e.to_string())?;
    Ok(summary)
}

/// 获取最近提交
#[tauri::command]
pub fn get_recent_commits(repo_path: String) -> Result<Vec<crate::models::repo::CommitEntry>, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    let commits = GitService::recent_commits(&repo, 50).map_err(|e| e.to_string())?;
    Ok(commits)
}

/// 提交变更
#[tauri::command]
pub fn commit_changes(repo_path: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("提交信息不能为空".to_string());
    }
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    let commit_id = GitService::commit(&repo, &message).map_err(|e| e.to_string())?;
    Ok(commit_id)
}

/// 获取分支列表
#[tauri::command]
pub fn list_branches(repo_path: String) -> Result<Vec<String>, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    let branches = GitService::list_branches(&repo).map_err(|e| e.to_string())?;
    Ok(branches)
}

/// 获取当前分支名
#[tauri::command]
pub fn get_current_branch(repo_path: String) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    let branch = GitService::current_branch(&repo).map_err(|e| e.to_string())?;
    Ok(branch)
}