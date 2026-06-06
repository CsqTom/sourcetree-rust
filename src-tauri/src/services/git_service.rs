//! Git 核心服务
//!
//! 封装 gix 操作，提供业务逻辑接口
//! 读操作使用 gix API，写操作（暂存/取消暂存/提交/差异）使用 Git CLI 以确保兼容性

use anyhow::Result;
use gix::bstr::BString;

use crate::models::diff::{ChangeStatus, FileStatus};
use crate::models::repo::{CommitEntry, RefInfo, RepoSummary};

/// Git 核心服务
pub struct GitService;

impl GitService {
    // ===== 仓库操作 =====

    /// 打开仓库
    pub fn open(path: &str) -> Result<gix::Repository> {
        let repo = gix::open(path)?;
        log::info!("已打开仓库: {}", path);
        Ok(repo)
    }

    /// 获取仓库摘要信息
    pub fn summary(repo: &gix::Repository) -> Result<RepoSummary> {
        let current_branch = Self::current_branch(repo).unwrap_or_else(|_| "HEAD (detached)".into());
        let (staged, unstaged, untracked) = Self::count_status(repo)?;
        let remote_url = Self::remote_url(repo).ok().flatten();

        Ok(RepoSummary {
            path: repo.path().to_string_lossy().to_string(),
            current_branch,
            remote_url,
            unstaged_count: unstaged,
            staged_count: staged,
            untracked_count: untracked,
            ahead: 0,
            behind: 0,
        })
    }

    // ===== 分支操作 =====

    /// 获取当前分支名
    pub fn current_branch(repo: &gix::Repository) -> Result<String> {
        let head = repo.head()?;
        let name = match head.referent_name() {
            Some(name) => name.shorten().to_string(),
            None => "HEAD (detached)".to_string(),
        };
        Ok(name)
    }

    /// 列出所有分支名
    pub fn list_branches(repo: &gix::Repository) -> Result<Vec<String>> {
        let mut branches = Vec::new();
        let references = repo.references()?;
        let iter = references.all()?;
        for result in iter {
            let reference = result.map_err(|e| anyhow::anyhow!("{:?}", e))?;
            if let Some((category, short_name)) = reference.name().category_and_short_name() {
                if matches!(category, gix::reference::Category::LocalBranch) {
                    branches.push(short_name.to_string());
                }
            }
        }
        branches.sort();
        Ok(branches)
    }

    /// 获取远程仓库地址
    pub fn remote_url(repo: &gix::Repository) -> Result<Option<String>> {
        let remote = repo.find_default_remote(gix::remote::Direction::Fetch);
        match remote {
            Some(Ok(r)) => {
                let url: Option<String> = r
                    .url(gix::remote::Direction::Fetch)
                    .map(|u| u.to_bstring().to_string());
                Ok(url)
            }
            _ => Ok(None),
        }
    }

    // ===== 文件状态 =====

    /// 获取工作区文件状态列表
    pub fn status(repo: &gix::Repository) -> Result<Vec<FileStatus>> {
        let mut files: Vec<FileStatus> = Vec::new();

        // 使用 gix 0.70 的 status API
        let platform = repo.status(gix::progress::Discard)?;
        let iter = platform.into_iter(Vec::<BString>::new())?;

        for item in iter {
            let item = item?; // 解包 Result<Item, Error>
            match item {
                gix::status::Item::IndexWorktree(iw_item) => match iw_item {
                    // 已跟踪文件的修改
                    gix::status::index_worktree::Item::Modification {
                        rela_path,
                        status,
                        ..
                    } => {
                        let path =
                            String::from_utf8_lossy(&rela_path).to_string();
                        let change_status = match &status {
                            gix_status::index_as_worktree::EntryStatus::Change(change) => {
                                match change {
                                    gix_status::index_as_worktree::Change::Removed => {
                                        ChangeStatus::Deleted
                                    }
                                    gix_status::index_as_worktree::Change::Modification { .. } => {
                                        ChangeStatus::Modified
                                    }
                                    gix_status::index_as_worktree::Change::Type { .. } => {
                                        ChangeStatus::Modified
                                    }
                                    _ => ChangeStatus::Modified,
                                }
                            }
                            _ => continue, // 无变更则跳过
                        };
                        files.push(FileStatus {
                            path,
                            worktree_status: Some(change_status),
                            stage_status: None,
                            is_untracked: false,
                            is_ignored: false,
                        });
                    }
                    // 未跟踪文件
                    gix::status::index_worktree::Item::DirectoryContents { entry, .. } => {
                        let path = String::from_utf8_lossy(&entry.rela_path).to_string();
                        files.push(FileStatus {
                            path,
                            worktree_status: None,
                            stage_status: None,
                            is_untracked: true,
                            is_ignored: false,
                        });
                    }
                    // 重命名/复制
                    gix::status::index_worktree::Item::Rewrite {
                        dirwalk_entry,
                        copy,
                        ..
                    } => {
                        let path = String::from_utf8_lossy(&dirwalk_entry.rela_path).to_string();
                        let status = if copy {
                            ChangeStatus::Copied
                        } else {
                            ChangeStatus::Renamed
                        };
                        files.push(FileStatus {
                            path,
                            worktree_status: Some(status),
                            stage_status: None,
                            is_untracked: false,
                            is_ignored: false,
                        });
                    }
                },
                // 暂存区变更（Tree vs Index）
                gix::status::Item::TreeIndex(change) => {
                    // 从 ChangeRef 中提取路径信息
                    // Addition/Deletion/Modification 使用 location，Rewrite 使用 location（源路径）
                    let path: String = match &change {
                        gix::diff::index::ChangeRef::Addition { location, .. } => {
                            String::from_utf8_lossy(location.as_ref()).to_string()
                        }
                        gix::diff::index::ChangeRef::Deletion { location, .. } => {
                            String::from_utf8_lossy(location.as_ref()).to_string()
                        }
                        gix::diff::index::ChangeRef::Modification { location, .. } => {
                            String::from_utf8_lossy(location.as_ref()).to_string()
                        }
                        gix::diff::index::ChangeRef::Rewrite { location, .. } => {
                            String::from_utf8_lossy(location.as_ref()).to_string()
                        }
                    };

                    let status = match &change {
                        gix::diff::index::ChangeRef::Addition { .. } => ChangeStatus::Added,
                        gix::diff::index::ChangeRef::Deletion { .. } => ChangeStatus::Deleted,
                        gix::diff::index::ChangeRef::Modification { .. } => ChangeStatus::Modified,
                        gix::diff::index::ChangeRef::Rewrite { .. } => ChangeStatus::Modified,
                    };
                    files.push(FileStatus {
                        path,
                        worktree_status: None,
                        stage_status: Some(status),
                        is_untracked: false,
                        is_ignored: false,
                    });
                }
            }
        }

        Ok(files)
    }

    /// 统计各状态文件数
    fn count_status(repo: &gix::Repository) -> Result<(u32, u32, u32)> {
        let files = Self::status(repo)?;
        let staged = files.iter().filter(|f| f.stage_status.is_some()).count() as u32;
        let unstaged = files.iter().filter(|f| f.worktree_status.is_some()).count() as u32;
        let untracked = files.iter().filter(|f| f.is_untracked).count() as u32;
        Ok((staged, unstaged, untracked))
    }

    /// 获取仓库工作目录路径
    fn work_dir(repo: &gix::Repository) -> Result<std::path::PathBuf> {
        let workdir = repo.work_dir()
            .ok_or_else(|| anyhow::anyhow!("仓库没有工作目录（裸仓库）"))?;
        Ok(workdir.to_path_buf())
    }

    // ===== 差异操作 =====

    /// 获取文件差异列表（基于状态信息生成）
    pub fn diff_workdir(repo: &gix::Repository) -> Result<Vec<crate::models::diff::FileDiff>> {
        let files = Self::status(repo)?;
        let diffs = files
            .into_iter()
            .filter(|f| f.worktree_status.is_some() || f.stage_status.is_some())
            .map(|f| {
                let status = f.stage_status.or(f.worktree_status).unwrap_or(ChangeStatus::Modified);
                crate::models::diff::FileDiff {
                    old_path: f.path.clone(),
                    new_path: f.path.clone(),
                    status,
                    hunks: Vec::new(),
                    additions: 0,
                    deletions: 0,
                }
            })
            .collect();
        Ok(diffs)
    }

    /// 获取文件差异文本（使用 git diff CLI）
    pub fn diff_file_text(repo: &gix::Repository, path: &str) -> Result<String> {
        let workdir = Self::work_dir(repo)?;
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(&workdir)
            .args(["diff", "--", path])
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git diff 失败: {}", e))?;

        let text = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(text)
    }

    // ===== 暂存操作 =====

    /// 暂存文件（使用 git add CLI）
    pub fn stage_files(repo: &gix::Repository, paths: &[String]) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let mut cmd = std::process::Command::new("git");
        cmd.arg("-C").arg(&workdir);
        cmd.arg("add");
        for p in paths {
            cmd.arg(p);
        }
        let output = cmd.output()
            .map_err(|e| anyhow::anyhow!("执行 git add 失败: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("git add 失败: {}", stderr);
        }
        log::info!("已暂存 {} 个文件", paths.len());
        Ok(())
    }

    /// 取消暂存文件（使用 git reset HEAD -- CLI）
    pub fn unstage_files(repo: &gix::Repository, paths: &[String]) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let mut cmd = std::process::Command::new("git");
        cmd.arg("-C").arg(&workdir);
        cmd.args(["reset", "HEAD", "--"]);
        for p in paths {
            cmd.arg(p);
        }
        let output = cmd.output()
            .map_err(|e| anyhow::anyhow!("执行 git reset 失败: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("git reset 失败: {}", stderr);
        }
        log::info!("已取消暂存 {} 个文件", paths.len());
        Ok(())
    }

    // ===== 提交操作 =====

    /// 提交变更（使用 git commit CLI）
    pub fn commit(repo: &gix::Repository, message: &str) -> Result<String> {
        let workdir = Self::work_dir(repo)?;
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(&workdir)
            .args(["commit", "-m", message])
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git commit 失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("提交失败: {}", stderr);
        }

        // 获取最新提交 ID
        let log_output = std::process::Command::new("git")
            .arg("-C")
            .arg(&workdir)
            .args(["log", "-1", "--format=%H"])
            .output()
            .map_err(|e| anyhow::anyhow!("获取提交 ID 失败: {}", e))?;

        let commit_id = String::from_utf8_lossy(&log_output.stdout).trim().to_string();
        log::info!("提交成功: {} - {}", commit_id, message.lines().next().unwrap_or(""));
        Ok(commit_id)
    }

    // ===== 提交历史 =====

    /// 获取最近的提交列表
    pub fn recent_commits(repo: &gix::Repository, max_count: usize) -> Result<Vec<CommitEntry>> {
        Self::older_commits(repo, max_count, 0)
    }

    /// 获取更早的提交（跳过 offset 个最新提交）
    pub fn older_commits(
        repo: &gix::Repository,
        max_count: usize,
        offset: usize,
    ) -> Result<Vec<CommitEntry>> {
        let mut commits = Vec::new();

        let head_id = repo.head_id()?;
        let walk = repo.rev_walk(vec![head_id]);
        let iter = walk.all()?.skip(offset).take(max_count);

        // 构建提交 → 引用名映射（标签、分支）
        let workdir = Self::work_dir(repo)?;
        let ref_map = Self::build_ref_map(workdir.to_str().unwrap_or(""))?;

        for result in iter {
            let info = result?;
            let commit = info.object()?;

            let id = info.id.to_string();
            let message = commit
                .message()
                .map(|m| m.title.to_string())
                .unwrap_or_default();
            let author = commit
                .author()
                .map(|a| a.name.to_string())
                .unwrap_or_default();
            let author_email = commit
                .author()
                .map(|a| a.email.to_string())
                .unwrap_or_default();
            let time = commit.author().map(|a| a.time.seconds).unwrap_or(0);
            let committer = commit
                .committer()
                .map(|c| c.name.to_string())
                .unwrap_or_default();
            let committer_email = commit
                .committer()
                .map(|c| c.email.to_string())
                .unwrap_or_default();

            let parent_ids: Vec<String> = commit
                .parent_ids()
                .map(|pid| pid.to_string())
                .collect();

            let refs = ref_map.get(&id).cloned().unwrap_or_default();

            commits.push(CommitEntry {
                id,
                message: message.trim().to_string(),
                author,
                author_email,
                time: time as i64,
                committer,
                committer_email,
                parent_ids,
                refs,
            });
        }

        Ok(commits)
    }

    /// 构建提交 SHA → 引用列表的映射（标签 + 分支）
    fn build_ref_map(workdir: &str) -> Result<std::collections::HashMap<String, Vec<RefInfo>>> {
        use std::collections::HashMap;
        use std::process::Command;

        let mut map: HashMap<String, Vec<RefInfo>> = HashMap::new();

        // 先处理分支（refs/heads/）
        let output_heads = Command::new("git")
            .arg("-C")
            .arg(workdir)
            .args([
                "for-each-ref",
                "--format=%(refname:short)%00%(objectname)",
                "refs/heads/",
            ])
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git for-each-ref heads 失败: {}", e))?;

        if output_heads.status.success() {
            let stdout = String::from_utf8_lossy(&output_heads.stdout);
            for line in stdout.lines() {
                let line = line.trim();
                if line.is_empty() { continue; }
                let parts: Vec<&str> = line.split('\0').collect();
                if parts.len() < 2 { continue; }
                let name = parts[0].trim().to_string();
                let commit_id = parts[1].trim();
                if name.is_empty() || commit_id.is_empty() { continue; }
                map.entry(commit_id.to_string())
                    .or_default()
                    .push(RefInfo { name, kind: "head".to_string() });
            }
        }

        // 再处理标签（refs/tags/），区分轻量标签和附注标签
        let output_tags = Command::new("git")
            .arg("-C")
            .arg(workdir)
            .args([
                "for-each-ref",
                "--format=%(refname:short)%00%(objectname)%00%(*objectname)",
                "refs/tags/",
            ])
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git for-each-ref tags 失败: {}", e))?;

        if output_tags.status.success() {
            let stdout = String::from_utf8_lossy(&output_tags.stdout);
            for line in stdout.lines() {
                let line = line.trim();
                if line.is_empty() { continue; }
                let parts: Vec<&str> = line.split('\0').collect();
                if parts.len() < 2 { continue; }
                let name = parts[0].trim().to_string();
                if name.is_empty() { continue; }
                // 第三列为空 → 轻量标签，非空 → 附注标签（去皮后的提交 SHA）
                let commit_id = if parts.len() >= 3 && !parts[2].is_empty() {
                    parts[2].trim()
                } else {
                    parts[1].trim()
                };
                let kind = if parts.len() >= 3 && !parts[2].is_empty() {
                    "annotated_tag"
                } else {
                    "tag"
                };
                map.entry(commit_id.to_string())
                    .or_default()
                    .push(RefInfo { name, kind: kind.to_string() });
            }
        }

        Ok(map)
    }

    /// 检查 gix 是否可用
    pub fn is_available() -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_available() {
        assert!(GitService::is_available());
    }
}