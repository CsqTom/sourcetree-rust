//! 统一错误处理

use thiserror::Error;

/// 应用自定义错误类型
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Git 操作失败: {0}")]
    Git(#[from] gix::open::Error),

    #[error("仓库未打开")]
    RepoNotOpen,

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("序列化错误: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("{0}")]
    Other(String),
}

impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}