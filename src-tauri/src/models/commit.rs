//! 提交相关数据模型

use serde::{Deserialize, Serialize};

/// 提交摘要信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitSummary {
    /// 提交 SHA
    pub id: String,
    /// 提交信息标题（第一行）
    pub message: String,
    /// 作者名
    pub author: String,
    /// 作者邮箱
    pub author_email: String,
    /// 提交时间（Unix 时间戳）
    pub time: i64,
}

/// 分支信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    /// 分支名
    pub name: String,
    /// 是否为当前分支
    pub is_current: bool,
    /// 是否为远程分支
    pub is_remote: bool,
    /// 远程名（远程分支时）
    pub remote_name: Option<String>,
}