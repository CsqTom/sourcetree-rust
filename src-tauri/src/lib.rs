//! SourceTree Rust - Tauri 2 应用入口
//!
//! 初始化应用，注册所有 Tauri 命令

mod commands;
mod error;
mod models;
mod services;
mod state;

use state::AppState;

/// 应用初始化与运行
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // 基础
            commands::repo::greet,
            commands::repo::get_backend_info,
            // 仓库管理
            commands::repo::open_repo,
            commands::repo::get_repo_info,
            commands::repo::validate_repo_path,
            // 文件状态
            commands::status::get_status,
            commands::status::get_file_diff,
            commands::status::stage_files,
            commands::status::unstage_files,
            // 提交
            commands::status::commit_changes,
            commands::status::get_recent_commits,
            // 分支
            commands::status::list_branches,
            commands::status::get_current_branch,
            // 仓库摘要
            commands::status::get_repo_summary,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}