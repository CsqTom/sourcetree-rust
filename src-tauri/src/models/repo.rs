//! 仓库相关数据模型

use serde::{Deserialize, Serialize};

/// 仓库摘要信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoSummary {
    /// 仓库路径
    pub path: String,
    /// 当前分支名
    pub current_branch: String,
    /// 远程仓库地址
    pub remote_url: Option<String>,
    /// 未暂存文件数
    pub unstaged_count: u32,
    /// 已暂存文件数
    pub staged_count: u32,
    /// 未跟踪文件数
    pub untracked_count: u32,
    /// 领先提交数（与远程比较）
    pub ahead: i32,
    /// 落后提交数
    pub behind: i32,
}

/// 引用信息（分支或标签）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefInfo {
    /// 引用名（如 "main"、"v1.0"）
    pub name: String,
    /// 引用类型：head（分支）、tag（轻量标签）、annotated_tag（附注标签）
    pub kind: String,
}

/// 提交历史条目（列表用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitEntry {
    /// 提交 SHA（完整）
    pub id: String,
    /// 提交信息（完整）
    pub message: String,
    /// 作者名
    pub author: String,
    /// 作者邮箱
    pub author_email: String,
    /// 提交时间（Unix 时间戳）
    pub time: i64,
    /// 提交者名
    pub committer: String,
    /// 提交者邮箱
    pub committer_email: String,
    /// 父提交 ID 列表（完整，用于构建 DAG 图）
    pub parent_ids: Vec<String>,
    /// 关联引用列表
    pub refs: Vec<RefInfo>,
}

/// 分支追踪信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchTrackingInfo {
    /// 分支名
    pub branch: String,
    /// 是否为当前分支
    pub is_current: bool,
    /// 远程追踪分支（如 "origin/main"）
    pub upstream: Option<String>,
    /// 领先远程的提交数
    pub ahead: i32,
    /// 落后远程的提交数
    pub behind: i32,
}

/// 书签条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookmarkEntry {
    /// 显示名称
    pub name: String,
    /// 仓库路径
    pub path: String,
    /// 最近打开时间（Unix 时间戳）
    pub last_opened: i64,
}