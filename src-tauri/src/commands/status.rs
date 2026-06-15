//! 文件状态和差异命令

use crate::services::git_service::{create_git_command, GitService};

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

/// 获取更早的提交（分页加载）
#[tauri::command]
pub fn get_older_commits(
    repo_path: String,
    max_count: usize,
    offset: usize,
) -> Result<Vec<crate::models::repo::CommitEntry>, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    let commits = GitService::older_commits(&repo, max_count, offset).map_err(|e| e.to_string())?;
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

/// 获取远程分支列表
#[tauri::command]
pub fn list_remote_branches(repo_path: String) -> Result<Vec<String>, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    let branches = GitService::list_remote_branches(&repo).map_err(|e| e.to_string())?;
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
    let output = create_git_command()
        .args(["diff-tree", "--no-commit-id", "--name-status", "-r", "--root", &commit_id])
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
    let output = create_git_command()
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
    let output = create_git_command()
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

/// 获取冲突文件的三个版本内容
///
/// 返回 JSON：{ ours: string, theirs: string, base: string }
/// ours: 当前分支版本（MERGE_HEAD 的对方版本用 git show :2:file）
/// theirs: 传入分支版本（用 git show :3:file）
/// base: 共同祖先版本（用 git merge-base + git show）
#[tauri::command]
pub fn get_conflict_content(repo_path: String, file_path: String) -> Result<serde_json::Value, String> {
    // 获取 ours 版本（阶段2 = 我们的版本）
    let ours_output = create_git_command()
        .args(["show", &format!(":2:{}", file_path)])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("获取 ours 版本失败: {}", e))?;
    // 如果 ours 中文件被删除，git show :2: 会失败，此时 ours 为空
    let ours = if ours_output.status.success() {
        String::from_utf8_lossy(&ours_output.stdout).to_string()
    } else {
        String::new()
    };

    // 获取 theirs 版本（阶段3 = 他们的版本）
    let theirs_output = create_git_command()
        .args(["show", &format!(":3:{}", file_path)])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("获取 theirs 版本失败: {}", e))?;
    // 如果 theirs 中文件被删除，git show :3: 会失败，此时 theirs 为空
    let theirs = if theirs_output.status.success() {
        String::from_utf8_lossy(&theirs_output.stdout).to_string()
    } else {
        String::new()
    };

    // 获取 base 版本（共同祖先）
    let base = get_merge_base_content(&repo_path, &file_path).unwrap_or_default();

    Ok(serde_json::json!({
        "ours": ours,
        "theirs": theirs,
        "base": base,
    }))
}

/// 获取合并基线版本的文件内容
fn get_merge_base_content(repo_path: &str, file_path: &str) -> Result<String, String> {
    // 获取 merge-base 提交
    let mb_output = create_git_command()
        .args(["merge-base", "HEAD", "MERGE_HEAD"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("获取 merge-base 失败: {}", e))?;

    if !mb_output.status.success() {
        return Ok(String::new());
    }

    let merge_base = String::from_utf8_lossy(&mb_output.stdout).trim().to_string();

    // 从 merge-base 提交获取文件内容
    let show_output = create_git_command()
        .args(["show", &format!("{}:{}", merge_base, file_path)])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("获取 base 文件内容失败: {}", e))?;

    if !show_output.status.success() {
        return Ok(String::new());
    }

    Ok(String::from_utf8_lossy(&show_output.stdout).to_string())
}

/// 解决冲突：将解决后的文件内容写入工作区并标记为已解决
#[tauri::command]
pub fn resolve_conflict(repo_path: String, file_path: String, content: String) -> Result<String, String> {
    // 写入解决后的内容到工作区文件
    let full_path = std::path::Path::new(&repo_path).join(&file_path);
    std::fs::write(&full_path, &content)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    // 将文件标记为已解决（git add）
    let output = create_git_command()
        .args(["add", "--", &file_path])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git add 失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("标记冲突已解决失败: {}", stderr));
    }

    Ok(format!("冲突已解决: {}", file_path))
}

/// 使用指定策略解决冲突（ours/theirs）
/// 当 theirs/ours 删除文件时，对应 stage 不存在，需要特殊处理
#[tauri::command]
pub fn resolve_conflict_with_strategy(
    repo_path: String,
    file_path: String,
    strategy: String,
) -> Result<String, String> {
    let stage_num = match strategy.as_str() {
        "ours" => "2",
        "theirs" => "3",
        _ => return Err(format!("不支持的策略: {}", strategy)),
    };

    // 从暂存区获取指定版本的内容
    let show_output = create_git_command()
        .args(["show", &format!(":{}:{}", stage_num, file_path)])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("获取 {} 版本失败: {}", strategy, e))?;

    let full_path = std::path::Path::new(&repo_path).join(&file_path);

    // 检查是否因为该版本删除了文件而失败
    if !show_output.status.success() {
        let stderr = String::from_utf8_lossy(&show_output.stderr);
        // 如果 stderr 包含 "not at stage"，说明该版本删除了文件
        if stderr.contains("not at stage") {
            // theirs/ours 删除了文件，需要删除工作区文件
            if full_path.exists() {
                std::fs::remove_file(&full_path)
                    .map_err(|e| format!("删除文件失败: {}", e))?;
            }
        } else {
            return Err(format!("获取 {} 版本内容失败: {}", strategy, stderr));
        }
    } else {
        // 该版本存在，写入工作区
        std::fs::write(&full_path, &show_output.stdout)
            .map_err(|e| format!("写入文件失败: {}", e))?;
    }

    // 标记为已解决
    let add_output = create_git_command()
        .args(["add", "--", &file_path])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git add 失败: {}", e))?;

    if !add_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_output.stderr);
        return Err(format!("标记冲突已解决失败: {}", stderr));
    }

    Ok(format!("使用 {} 版本解决冲突: {}", strategy, file_path))
}

/// 合并指定分支到当前分支
/// 执行 git merge <branch>，返回合并结果
#[tauri::command]
pub fn merge_branch(repo_path: String, branch: String) -> Result<serde_json::Value, String> {
    // 执行 git merge
    let output = create_git_command()
        .args(["merge", &branch])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git merge 失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // 检查是否有冲突
    let has_conflicts = !output.status.success() || stdout.contains("CONFLICT") || stderr.contains("CONFLICT");

    Ok(serde_json::json!({
        "success": output.status.success(),
        "hasConflicts": has_conflicts,
        "stdout": stdout,
        "stderr": stderr,
        "message": if has_conflicts {
            format!("合并 {} 时发生冲突，请手动解决冲突后再提交", branch)
        } else {
            format!("已成功合并分支 {} 到当前分支", branch)
        }
    }))
}

/// 删除工作区文件
#[tauri::command]
pub fn delete_working_file(repo_path: String, file_path: String) -> Result<String, String> {
    let full_path = std::path::Path::new(&repo_path).join(&file_path);

    if !full_path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    // 删除文件
    if full_path.is_dir() {
        std::fs::remove_dir_all(&full_path)
            .map_err(|e| format!("删除目录失败: {}", e))?;
    } else {
        std::fs::remove_file(&full_path)
            .map_err(|e| format!("删除文件失败: {}", e))?;
    }

    Ok(format!("已删除: {}", file_path))
}