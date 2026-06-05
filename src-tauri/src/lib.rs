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
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::repo::greet,
            commands::repo::get_backend_info,
            commands::repo::open_repo,
            commands::repo::get_repo_info,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}