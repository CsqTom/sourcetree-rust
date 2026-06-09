//! 差异相关数据模型

use serde::{Deserialize, Serialize};

/// 文件变更状态分类
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum ChangeStatus {
    /// 新增
    Added,
    /// 修改
    Modified,
    /// 删除
    Deleted,
    /// 重命名
    Renamed,
    /// 复制
    Copied,
    /// 未修改
    Unmodified,
}

impl std::fmt::Display for ChangeStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChangeStatus::Added => write!(f, "A"),
            ChangeStatus::Modified => write!(f, "M"),
            ChangeStatus::Deleted => write!(f, "D"),
            ChangeStatus::Renamed => write!(f, "R"),
            ChangeStatus::Copied => write!(f, "C"),
            ChangeStatus::Unmodified => write!(f, "."),
        }
    }
}

/// 文件状态条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStatus {
    /// 文件路径（相对于仓库根目录）
    pub path: String,
    /// 工作区状态（Modified/Deleted/Added 等）
    pub worktree_status: Option<ChangeStatus>,
    /// 暂存区状态
    pub stage_status: Option<ChangeStatus>,
    /// 是否为未跟踪文件
    pub is_untracked: bool,
    /// 是否为忽略文件
    pub is_ignored: bool,
}