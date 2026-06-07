//! 丢弃更改和暂存 hunk 命令
//!
//! 提供文件级/Hunk级/行级丢弃更改的 IPC 接口
//! 以及文件读取/写入操作（用于编辑模式）
//! 以及暂存 hunk 的功能

use crate::services::git_service::{GitService, LineSelection};

/// 暂存指定 hunk 的更改
#[tauri::command]
pub fn stage_hunk(repo_path: String, file_path: String, hunk_index: usize) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::stage_hunk(&repo, &file_path, hunk_index).map_err(|e| e.to_string())?;
    Ok(format!("已暂存文件 '{}' 的 hunk #{}", file_path, hunk_index))
}

/// 丢弃文件的所有更改（git checkout -- <file>）
#[tauri::command]
pub fn discard_file(repo_path: String, file_path: String) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::discard_file(&repo, &file_path).map_err(|e| e.to_string())?;
    Ok(format!("已丢弃文件 '{}' 的更改", file_path))
}

/// 丢弃指定 hunk 的更改
#[tauri::command]
pub fn discard_hunk(repo_path: String, file_path: String, hunk_index: usize) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::discard_hunk(&repo, &file_path, hunk_index).map_err(|e| e.to_string())?;
    Ok(format!("已丢弃文件 '{}' 的 hunk #{}", file_path, hunk_index))
}

/// 丢弃指定行的更改
#[tauri::command]
pub fn discard_lines(repo_path: String, file_path: String, start_line: u32, end_line: u32) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::discard_lines(&repo, &file_path, start_line, end_line).map_err(|e| e.to_string())?;
    Ok(format!("已丢弃文件 '{}' 的行 {}-{}", file_path, start_line, end_line))
}

/// 读取工作区文件内容（用于编辑模式）
#[tauri::command]
pub fn read_working_file(repo_path: String, file_path: String) -> Result<String, String> {
    let work_dir = GitService::get_work_dir(&repo_path).map_err(|e| e.to_string())?;
    let full_path = work_dir.join(&file_path);

    if !full_path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }
    if !full_path.is_file() {
        return Err(format!("路径不是文件: {}", file_path));
    }

    // 尝试以 UTF-8 读取文本文件
    match std::fs::read_to_string(&full_path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("读取文件失败: {}", e)),
    }
}

/// 写入工作区文件内容（用于编辑模式保存）
#[tauri::command]
pub fn write_working_file(repo_path: String, file_path: String, content: String) -> Result<String, String> {
    let work_dir = GitService::get_work_dir(&repo_path).map_err(|e| e.to_string())?;
    let full_path = work_dir.join(&file_path);

    // 确保父目录存在
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }

    std::fs::write(&full_path, &content)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    Ok(format!("文件 '{}' 保存成功", file_path))
}

/// 暂存选中的行（通过 hunk 内行索引）
#[tauri::command]
pub fn stage_lines(
    repo_path: String,
    file_path: String,
    selections: Vec<LineSelection>,
) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::stage_lines_by_indices(&repo, &file_path, &selections).map_err(|e| e.to_string())?;
    Ok(format!("已暂存文件 '{}' 的 {} 个选中行组", file_path, selections.len()))
}

/// 丢弃选中的行（通过 hunk 内行索引）
#[tauri::command]
pub fn discard_lines_by_indices(
    repo_path: String,
    file_path: String,
    selections: Vec<LineSelection>,
) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::discard_lines_by_indices(&repo, &file_path, &selections).map_err(|e| e.to_string())?;
    Ok(format!("已丢弃文件 '{}' 的 {} 个选中行组", file_path, selections.len()))
}

/// 获取已暂存文件的差异（HEAD vs 暂存区）
#[tauri::command]
pub fn get_staged_diff(repo_path: String, file_path: String) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::diff_cached_text(&repo, &file_path).map_err(|e| e.to_string())
}

/// 取消暂存选中的行（从暂存区移除，回到未暂存状态）
#[tauri::command]
pub fn unstage_lines(
    repo_path: String,
    file_path: String,
    selections: Vec<LineSelection>,
) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::unstage_lines_by_indices(&repo, &file_path, &selections).map_err(|e| e.to_string())?;
    Ok(format!("已取消暂存文件 '{}' 的 {} 个选中行组", file_path, selections.len()))
}