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
            commands::status::get_older_commits,
            // 分支
            commands::status::list_branches,
            commands::status::get_current_branch,
            commands::status::get_repo_summary,
            commands::status::get_commit_files,
            commands::status::get_commit_diff,
            commands::status::get_commit_file_diff,
            // 分支管理
            commands::branch::create_branch,
            commands::branch::checkout_branch,
            commands::branch::checkout_new_branch,
            commands::branch::delete_branch,
            // 远程操作
            commands::remote::fetch_remote,
            commands::remote::pull_remote,
            commands::remote::push_remote,
            commands::remote::clone_repo,
            commands::remote::init_repo,
            commands::remote::list_remotes,
            commands::remote::add_remote,
            commands::remote::remove_remote,
            commands::remote::set_remote_url,
            // 丢弃更改
            commands::discard::stage_hunk,
            commands::discard::discard_file,
            commands::discard::discard_hunk,
            commands::discard::discard_lines,
            commands::discard::read_working_file,
            commands::discard::write_working_file,
            commands::discard::stage_lines,
            commands::discard::discard_lines_by_indices,
            commands::discard::get_staged_diff,
            commands::discard::unstage_lines,
            // 标签管理
            commands::tag::create_lightweight_tag,
            commands::tag::create_annotated_tag,
            commands::tag::delete_tag,
            commands::tag::push_tag,
            commands::tag::delete_remote_tag,
            commands::tag::list_tags,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}