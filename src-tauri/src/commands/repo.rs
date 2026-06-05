//! 仓库管理命令
//!
//! 提供仓库打开、状态查询等 IPC 接口

use tauri::State;
use crate::state::AppState;

/// 基础测试命令：验证前后端通信
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("你好，{}！SourceTree Rust 后端已就绪。", name)
}

/// 获取 Tauri 后端状态
#[tauri::command]
pub fn get_backend_info() -> serde_json::Value {
    serde_json::json!({
        "status": "ready",
        "gix_available": true,
    })
}

/// 打开本地仓库
#[tauri::command]
pub fn open_repo(path: String, state: State<AppState>) -> Result<String, String> {
    let repo = gix::open(&path).map_err(|e| format!("打开仓库失败: {}", e))?;
    let repo_path = repo.path().to_string_lossy().to_string();

    // 更新应用状态
    let mut app_state = state.inner().0.lock().map_err(|e| e.to_string())?;
    app_state.current_repo_path = Some(path.clone());
    app_state.repo_open = true;

    log::info!("已打开仓库: {}", path);
    Ok(repo_path)
}

/// 获取当前状态摘要
#[tauri::command]
pub fn get_repo_info(state: State<AppState>) -> Result<serde_json::Value, String> {
    let app_state = state.inner().0.lock().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "is_open": app_state.repo_open,
        "current_path": app_state.current_repo_path,
        "theme": app_state.theme,
    }))
}