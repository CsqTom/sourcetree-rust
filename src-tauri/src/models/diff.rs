//! 差异相关数据模型

use serde::{Deserialize, Serialize};

/// 文件变更状态分类
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

/// 差异行类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DiffLineType {
    /// 上下文（未变更）
    Context,
    /// 新增行
    Addition,
    /// 删除行
    Deletion,
}

/// 差异行
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    /// 行类型
    pub line_type: DiffLineType,
    /// 旧文件行号（上下文/删除行有值）
    pub old_lineno: Option<u32>,
    /// 新文件行号（上下文/新增行有值）
    pub new_lineno: Option<u32>,
    /// 行内容
    pub content: String,
}

/// Hunk 头信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HunkHeader {
    /// 旧文件起始行
    pub old_start: u32,
    /// 旧文件行数
    pub old_lines: u32,
    /// 新文件起始行
    pub new_start: u32,
    /// 新文件行数
    pub new_lines: u32,
    /// Hunk 标题（如 @@ -1,3 +1,4 @@ ...）
    pub section: String,
}

/// Hunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hunk {
    pub header: HunkHeader,
    pub lines: Vec<DiffLine>,
}

/// 文件差异内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    /// 旧文件路径
    pub old_path: String,
    /// 新文件路径
    pub new_path: String,
    /// 变更状态
    pub status: ChangeStatus,
    /// Hunk 列表
    pub hunks: Vec<Hunk>,
    /// 新增行数
    pub additions: u32,
    /// 删除行数
    pub deletions: u32,
}