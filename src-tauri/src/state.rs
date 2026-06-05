//! 应用状态管理

use std::sync::Mutex;

/// 应用全局状态
pub struct AppState(pub Mutex<InnerState>);

/// 内部状态数据
pub struct InnerState {
    /// 当前打开的仓库路径
    pub current_repo_path: Option<String>,
    /// 是否已打开仓库
    pub repo_open: bool,
    /// 当前主题
    pub theme: String,
}

impl AppState {
    pub fn new() -> Self {
        AppState(Mutex::new(InnerState {
            current_repo_path: None,
            repo_open: false,
            theme: "light".to_string(),
        }))
    }
}