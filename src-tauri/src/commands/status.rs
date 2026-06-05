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

/// 获取单次提交的变更文件列表
#[tauri::command]
pub fn get_commit_files(repo_path: String, commit_id: String) -> Result<Vec<serde_json::Value>, String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(["diff-tree", "--no-commit-id", "--name-status", "-r", &commit_id])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git diff-tree 失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("获取提交文件失败: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let files: Vec<serde_json::Value> = stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                Some(serde_json::json!({
                    "status": parts[0],
                    "path": parts[1],
                }))
            } else {
                None
            }
        })
        .collect();

    Ok(files)
}

/// 获取单次提交的差异（对比该提交与其父提交）
#[tauri::command]
pub fn get_commit_diff(repo_path: String, commit_id: String) -> Result<String, String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(["show", "--format=", &commit_id])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git show 失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("获取提交差异失败: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.to_string())
}

/// 获取某次提交中单个文件的变更内容
#[tauri::command]
pub fn get_commit_file_diff(repo_path: String, commit_id: String, file_path: String) -> Result<String, String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(["show", "--format=", &commit_id, "--", &file_path])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git show -- <file> 失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("获取提交文件变更失败: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.to_string())
}