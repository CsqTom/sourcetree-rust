//! 分支管理命令
//!
//! 提供分支创建、切换、删除等操作

use std::process::Command;

/// 创建新分支
#[tauri::command]
pub fn create_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["branch", &branch_name])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git branch 失败: {}", e))?;

    if output.status.success() {
        Ok(format!("分支 '{}' 创建成功", branch_name))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("创建分支失败: {}", stderr))
    }
}

/// 切换分支（checkout）
#[tauri::command]
pub fn checkout_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["checkout", &branch_name])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git checkout 失败: {}", e))?;

    if output.status.success() {
        Ok(format!("已切换到分支 '{}'", branch_name))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("切换分支失败: {}", stderr))
    }
}

/// 创建并切换到新分支
#[tauri::command]
pub fn checkout_new_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["checkout", "-b", &branch_name])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git checkout -b 失败: {}", e))?;

    if output.status.success() {
        Ok(format!("已创建并切换到分支 '{}'", branch_name))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("创建并切换分支失败: {}", stderr))
    }
}

/// 删除分支
#[tauri::command]
pub fn delete_branch(repo_path: String, branch_name: String, force: bool) -> Result<String, String> {
    let mut args = vec!["branch", "-d"];
    if force {
        args[1] = "-D";
    }
    args.push(&branch_name);

    let output = Command::new("git")
        .args(&args)
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git branch -d 失败: {}", e))?;

    if output.status.success() {
        Ok(format!("分支 '{}' 已删除", branch_name))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("删除分支失败: {}", stderr))
    }
}