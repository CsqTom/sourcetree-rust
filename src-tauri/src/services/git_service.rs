//! Git 核心服务
//!
//! 封装 gix 操作，提供业务逻辑接口
//! 读操作使用 gix API，写操作（暂存/取消暂存/提交/差异）使用 Git CLI 以确保兼容性

use anyhow::Result;
use gix::bstr::BString;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::process::Command;

use crate::models::diff::{ChangeStatus, FileStatus};
use crate::models::repo::{BranchTrackingInfo, CommitEntry, RefInfo, RepoSummary};

/// 创建 git 命令，自动添加 Windows 隐藏窗口标志
///
/// 在 Windows 上，使用 CREATE_NO_WINDOW 标志防止控制台窗口闪烁
/// 在其他平台上，直接创建命令
pub fn create_git_command() -> Command {
    let mut cmd = Command::new("git");
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW = 0x08000000
        // 防止在 Windows 上创建控制台窗口
        cmd.creation_flags(0x08000000);
    }
    
    cmd
}

/// 行选中数据结构（匹配前端 LineSelection）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineSelection {
    pub hunk_index: usize,
    pub line_indices: Vec<usize>,
}

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

        // 计算 ahead/behind
        let workdir = Self::work_dir(repo).ok();
        let (ahead, behind) = if let Some(wd) = &workdir {
            Self::count_ahead_behind(wd, &current_branch).unwrap_or((0, 0))
        } else {
            (0, 0)
        };

        Ok(RepoSummary {
            path: repo.path().to_string_lossy().to_string(),
            current_branch,
            remote_url,
            unstaged_count: unstaged,
            staged_count: staged,
            untracked_count: untracked,
            ahead,
            behind,
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

    /// 列出所有远程分支名
    pub fn list_remote_branches(repo: &gix::Repository) -> Result<Vec<String>> {
        let mut branches = Vec::new();
        let references = repo.references()?;
        let iter = references.all()?;
        for result in iter {
            let reference = result.map_err(|e| anyhow::anyhow!("{:?}", e))?;
            if let Some((category, short_name)) = reference.name().category_and_short_name() {
                if matches!(category, gix::reference::Category::RemoteBranch) {
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

    /// 计算指定分支的 ahead/behind 计数
    fn count_ahead_behind(workdir: &std::path::Path, branch: &str) -> Result<(i32, i32)> {
        // 使用 git rev-list 计算 ahead/behind
        // ahead: 本地有但远程没有的提交数
        // behind: 远程有但本地没有的提交数
        let upstream = format!("{}@{{u}}", branch);
        // 范围语法 upstream..HEAD 必须作为单个参数
        let ahead_range = format!("{}..HEAD", upstream);
        let behind_range = format!("HEAD..{}", upstream);

        let ahead_output = create_git_command()
            .args(["rev-list", "--count", &ahead_range])
            .current_dir(workdir)
            .output();

        let behind_output = create_git_command()
            .args(["rev-list", "--count", &behind_range])
            .current_dir(workdir)
            .output();

        let ahead = match ahead_output {
            Ok(out) if out.status.success() => {
                String::from_utf8_lossy(&out.stdout).trim().parse::<i32>().unwrap_or(0)
            }
            _ => 0,
        };

        let behind = match behind_output {
            Ok(out) if out.status.success() => {
                String::from_utf8_lossy(&out.stdout).trim().parse::<i32>().unwrap_or(0)
            }
            _ => 0,
        };

        Ok((ahead, behind))
    }

    /// 获取所有分支的追踪信息（ahead/behind）
    pub fn branch_tracking_info(repo: &gix::Repository) -> Result<Vec<BranchTrackingInfo>> {
        let workdir = Self::work_dir(repo)?;
        let current_branch = Self::current_branch(repo).unwrap_or_default();
        let branches = Self::list_branches(repo)?;

        let mut result = Vec::new();

        for branch in &branches {
            // 获取上游追踪分支
            let upstream = Self::get_upstream(&workdir, branch);

            let (ahead, behind) = if upstream.is_some() {
                Self::count_ahead_behind_for(&workdir, branch).unwrap_or((0, 0))
            } else {
                (0, 0)
            };

            result.push(BranchTrackingInfo {
                branch: branch.clone(),
                is_current: branch == &current_branch,
                upstream,
                ahead,
                behind,
            });
        }

        Ok(result)
    }

    /// 获取分支的上游追踪分支
    fn get_upstream(workdir: &std::path::Path, branch: &str) -> Option<String> {
        let output = create_git_command()
            .args(["config", &format!("branch.{}.remote", branch)])
            .current_dir(workdir)
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let remote = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if remote.is_empty() {
            return None;
        }

        // 获取 merge 配置
        let merge_output = create_git_command()
            .args(["config", &format!("branch.{}.merge", branch)])
            .current_dir(workdir)
            .output()
            .ok()?;

        if !merge_output.status.success() {
            return None;
        }

        let merge = String::from_utf8_lossy(&merge_output.stdout).trim().to_string();
        if merge.is_empty() {
            return None;
        }

        // 从 refs/heads/xxx 提取分支名
        let short = merge.strip_prefix("refs/heads/").unwrap_or(&merge);
        Some(format!("{}/{}", remote, short))
    }

    /// 计算指定分支的 ahead/behind（用于非当前分支）
    fn count_ahead_behind_for(workdir: &std::path::Path, branch: &str) -> Result<(i32, i32)> {
        let upstream = format!("{}@{{u}}", branch);
        // 范围语法必须作为单个参数
        let ahead_range = format!("{}..{}", upstream, branch);
        let behind_range = format!("{}..{}", branch, upstream);

        let ahead_output = create_git_command()
            .args(["rev-list", "--count", &ahead_range])
            .current_dir(workdir)
            .output();

        let behind_output = create_git_command()
            .args(["rev-list", "--count", &behind_range])
            .current_dir(workdir)
            .output();

        let ahead = match ahead_output {
            Ok(out) if out.status.success() => {
                String::from_utf8_lossy(&out.stdout).trim().parse::<i32>().unwrap_or(0)
            }
            _ => 0,
        };

        let behind = match behind_output {
            Ok(out) if out.status.success() => {
                String::from_utf8_lossy(&out.stdout).trim().parse::<i32>().unwrap_or(0)
            }
            _ => 0,
        };

        Ok((ahead, behind))
    }

    // ===== 文件状态 =====

    /// 获取工作区文件状态列表
    pub fn status(repo: &gix::Repository) -> Result<Vec<FileStatus>> {
        let mut files: Vec<FileStatus> = Vec::new();

        // 先通过 git CLI 获取冲突文件列表（gix 的 status API 不直接暴露冲突标记）
        let conflict_paths = Self::get_conflict_paths(repo);

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
                        let is_conflict = conflict_paths.contains(&path);
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
                            worktree_status: Some(if is_conflict { ChangeStatus::Unmerged } else { change_status }),
                            stage_status: None,
                            is_untracked: false,
                            is_ignored: false,
                            is_conflict,
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
                            is_conflict: false,
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
                            is_conflict: false,
                        });
                    }
                },
                // 暂存区变更（Tree vs Index）
                gix::status::Item::TreeIndex(change) => {
                    // 从 ChangeRef 中提取路径信息
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

                    let is_conflict = conflict_paths.contains(&path);
                    let status = match &change {
                        gix::diff::index::ChangeRef::Addition { .. } => ChangeStatus::Added,
                        gix::diff::index::ChangeRef::Deletion { .. } => ChangeStatus::Deleted,
                        gix::diff::index::ChangeRef::Modification { .. } => ChangeStatus::Modified,
                        gix::diff::index::ChangeRef::Rewrite { .. } => ChangeStatus::Modified,
                    };
                    files.push(FileStatus {
                        path,
                        worktree_status: None,
                        stage_status: Some(if is_conflict { ChangeStatus::Unmerged } else { status }),
                        is_untracked: false,
                        is_ignored: false,
                        is_conflict,
                    });
                }
            }
        }

        // 添加仅存在于冲突列表中但未被 gix status 捕获的文件
        let existing_paths: std::collections::HashSet<String> = files.iter().map(|f| f.path.clone()).collect();
        for conflict_path in &conflict_paths {
            if !existing_paths.contains(conflict_path) {
                files.push(FileStatus {
                    path: conflict_path.clone(),
                    worktree_status: Some(ChangeStatus::Unmerged),
                    stage_status: Some(ChangeStatus::Unmerged),
                    is_untracked: false,
                    is_ignored: false,
                    is_conflict: true,
                });
            }
        }

        Ok(files)
    }

    /// 通过 git CLI 获取冲突文件路径列表
    fn get_conflict_paths(repo: &gix::Repository) -> std::collections::HashSet<String> {
        let mut paths = std::collections::HashSet::new();
        let workdir = match Self::work_dir(repo) {
            Ok(w) => w,
            Err(_) => return paths,
        };

        let output = match create_git_command()
            .arg("-C")
            .arg(&workdir)
            .args(["diff", "--name-only", "--diff-filter=U"])
            .output()
        {
            Ok(o) => o,
            Err(_) => return paths,
        };

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let path = line.trim().to_string();
                if !path.is_empty() {
                    paths.insert(path);
                }
            }
        }

        paths
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

    /// 获取仓库工作目录路径（根据 repo_path 字符串打开仓库）
    pub fn get_work_dir(repo_path: &str) -> Result<std::path::PathBuf> {
        let repo = gix::open(repo_path)?;
        Self::work_dir(&repo)
    }

    // ===== 差异操作 =====

    /// 获取文件差异文本（使用 git diff CLI）
    pub fn diff_file_text(repo: &gix::Repository, path: &str) -> Result<String> {
        let workdir = Self::work_dir(repo)?;
        let output = create_git_command()
            .arg("-C")
            .arg(&workdir)
            .args(["diff", "--", path])
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git diff 失败: {}", e))?;

        let text = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(text)
    }

    /// 获取已暂存文件的差异（HEAD vs 暂存区）
    ///
    /// 等价于: git diff --cached -- <path>
    pub fn diff_cached_text(repo: &gix::Repository, path: &str) -> Result<String> {
        let workdir = Self::work_dir(repo)?;
        let output = create_git_command()
            .arg("-C")
            .arg(&workdir)
            .args(["diff", "--cached", "--", path])
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git diff --cached 失败: {}", e))?;

        let text = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(text)
    }

    // ===== 暂存操作 =====

    /// 暂存文件（使用 git add CLI）
    pub fn stage_files(repo: &gix::Repository, paths: &[String]) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let mut cmd = create_git_command();
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
        let mut cmd = create_git_command();
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
        let output = create_git_command()
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
        let log_output = create_git_command()
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

        let mut map: HashMap<String, Vec<RefInfo>> = HashMap::new();

        // 先处理分支（refs/heads/）
        let output_heads = create_git_command()
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
        let output_tags = create_git_command()
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

    // ===== 丢弃更改 =====

    /// 丢弃文件的所有更改（git checkout -- <file>）
    pub fn discard_file(repo: &gix::Repository, path: &str) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let output = create_git_command()
            .arg("-C")
            .arg(&workdir)
            .args(["checkout", "--", path])
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git checkout 丢弃失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("丢弃文件失败: {}", stderr);
        }
        log::info!("已丢弃文件更改: {}", path);
        Ok(())
    }

    /// 暂存指定 hunk 的更改（使用 git apply --cached 正向应用 hunk）
    pub fn stage_hunk(repo: &gix::Repository, path: &str, hunk_index: usize) -> Result<()> {
        let workdir = Self::work_dir(repo)?;

        // 获取完整 diff
        let diff_text = Self::diff_file_text(repo, path)?;
        if diff_text.is_empty() {
            anyhow::bail!("没有可暂存的更改");
        }

        // 提取完整的 diff 头部和目标 hunk
        let mut full_patch = String::new();
        let mut current_hunk = -1;
        let mut header_done = false;

        for line in diff_text.lines() {
            if !header_done {
                full_patch.push_str(line);
                full_patch.push('\n');
                if line.starts_with("@@") {
                    header_done = true;
                    current_hunk += 1;
                    if current_hunk == hunk_index as isize {
                        // 继续收集这个 hunk 的内容
                    } else {
                        // 不是目标 hunk，移除刚添加的 @@ 行并停止
                        full_patch = full_patch.trim_end().to_string();
                        if let Some(pos) = full_patch.rfind('\n') {
                            full_patch = full_patch[..pos].to_string();
                        }
                        break;
                    }
                }
            } else {
                if line.starts_with("@@") {
                    current_hunk += 1;
                    if current_hunk > hunk_index as isize {
                        break;
                    }
                }
                if line.starts_with("diff --git") {
                    break;
                }
                full_patch.push_str(line);
                full_patch.push('\n');
            }
        }

        // 使用 git apply --cached 应用到暂存区
        let mut child = create_git_command()
            .arg("-C")
            .arg(&workdir)
            .args(["apply", "--cached"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| anyhow::anyhow!("执行 git apply --cached 失败: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(full_patch.as_bytes())?;
            stdin.flush()?;
        }

        let output = child.wait_with_output()
            .map_err(|e| anyhow::anyhow!("等待 git apply 完成失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("暂存 hunk 失败: {}", stderr);
        }

        log::info!("已暂存 hunk #{} 在文件: {}", hunk_index, path);
        Ok(())
    }

    /// 丢弃指定 hunk 的更改（使用 git apply -R 反向应用 hunk）
    pub fn discard_hunk(repo: &gix::Repository, path: &str, hunk_index: usize) -> Result<()> {
        let workdir = Self::work_dir(repo)?;

        // 获取完整 diff
        let diff_text = Self::diff_file_text(repo, path)?;
        if diff_text.is_empty() {
            anyhow::bail!("没有可丢弃的更改");
        }

        // 需要从文件 diff 中提取包含文件头的完整上下文
        // 提取 diff --git 头部 + 该 hunk
        let mut full_patch = String::new();
        let mut header_done = false;
        for line in diff_text.lines() {
            if line.starts_with("diff --git") && !header_done {
                full_patch.push_str(line);
                full_patch.push('\n');
                header_done = true;
            } else if header_done {
                if line.starts_with("diff --git") {
                    break; // 下一个文件，停止
                }
                if line.starts_with("@@") {
                    // 当前或之后的 hunk
                    if line.starts_with("@@") && full_patch.lines().filter(|l| l.starts_with("@@")).count() > hunk_index {
                        break; // 已超出目标 hunk
                    }
                }
                full_patch.push_str(line);
                full_patch.push('\n');
            }
        }

        // 使用 git apply -R 反向应用
        let mut child = create_git_command()
            .arg("-C")
            .arg(&workdir)
            .args(["apply", "-R"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| anyhow::anyhow!("执行 git apply 失败: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(full_patch.as_bytes())?;
            stdin.flush()?;
        }

        let output = child.wait_with_output()
            .map_err(|e| anyhow::anyhow!("等待 git apply 完成失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("丢弃 hunk 失败: {}", stderr);
        }

        log::info!("已丢弃 hunk #{} 在文件: {}", hunk_index, path);
        Ok(())
    }

    /// 丢弃指定行的更改（使用 git apply -R 反向应用选中行的补丁）
    pub fn discard_lines(repo: &gix::Repository, path: &str, start_line: u32, end_line: u32) -> Result<()> {
        let workdir = Self::work_dir(repo)?;

        // 获取完整 diff
        let diff_text = Self::diff_file_text(repo, path)?;
        if diff_text.is_empty() {
            anyhow::bail!("没有可丢弃的更改");
        }

        // 构造仅包含指定行的补丁
        // 解析 diff 找到新旧文件名
        let mut patch = String::new();
        let mut in_header = true;
        let mut capture = false;

        for line in diff_text.lines() {
            if in_header {
                patch.push_str(line);
                patch.push('\n');
                if line.starts_with("---") || line.starts_with("+++") {
                    continue;
                }
                // 文件头结束于第一个 @@
                if line.starts_with("@@") {
                    in_header = false;
                    // 解析 @@ -a,b +c,d @@
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        if let Some(old_range) = parts.get(1) {
                            if let Some(range_str) = old_range.strip_prefix('-') {
                                if let Some(old_start_str) = range_str.split(',').next() {
                                    if let Ok(old_start) = old_start_str.parse::<u32>() {
                                        capture = old_start >= start_line && old_start <= end_line;
                                        // 始终输出 hunk 头
                                        patch.push_str(line);
                                        patch.push('\n');
                                        continue;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if !in_header {
                if line.starts_with("@@") || line.starts_with("diff --git") {
                    break; // 只处理第一个 hunk
                }

                if capture {
                    patch.push_str(line);
                    patch.push('\n');
                }
            }
        }

        if patch.is_empty() {
            anyhow::bail!("无法构造行级补丁，请检查行号范围");
        }

        // 应用反向补丁
        let mut child = create_git_command()
            .arg("-C")
            .arg(&workdir)
            .args(["apply", "-R"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| anyhow::anyhow!("执行 git apply 失败: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(patch.as_bytes())?;
            stdin.flush()?;
        }

        let output = child.wait_with_output()
            .map_err(|e| anyhow::anyhow!("等待 git apply 完成失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("丢弃行更改失败: {}", stderr);
        }

        log::info!("已丢弃文件 {} 的行 {}-{}", path, start_line, end_line);
        Ok(())
    }

    // ===== 标签操作 =====

    /// 创建轻量标签
    pub fn create_lightweight_tag(repo: &gix::Repository, name: &str, commit_id: Option<&str>) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let mut cmd = create_git_command();
        cmd.arg("-C").arg(&workdir);
        cmd.arg("tag");
        cmd.arg(name);
        if let Some(commit) = commit_id {
            cmd.arg(commit);
        }
        let output = cmd.output()
            .map_err(|e| anyhow::anyhow!("执行 git tag 失败: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("创建标签失败: {}", stderr);
        }
        log::info!("已创建轻量标签: {}", name);
        Ok(())
    }

    /// 创建附注标签
    pub fn create_annotated_tag(repo: &gix::Repository, name: &str, message: &str, commit_id: Option<&str>) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let mut cmd = create_git_command();
        cmd.arg("-C").arg(&workdir);
        cmd.args(["-c", "user.name=sourcetree-rust"]);
        cmd.args(["-c", "user.email=sourcetree-rust@local"]);
        cmd.args(["tag", "-a", name, "-m", message]);
        if let Some(commit) = commit_id {
            cmd.arg(commit);
        }
        let output = cmd.output()
            .map_err(|e| anyhow::anyhow!("执行 git tag -a 失败: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("创建附注标签失败: {}", stderr);
        }
        log::info!("已创建附注标签: {}", name);
        Ok(())
    }

    /// 删除本地标签
    pub fn delete_tag(repo: &gix::Repository, name: &str) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let output = create_git_command()
            .arg("-C")
            .arg(&workdir)
            .args(["tag", "-d", name])
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git tag -d 失败: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("删除标签失败: {}", stderr);
        }
        log::info!("已删除标签: {}", name);
        Ok(())
    }

    /// 推送标签到远程
    pub fn push_tag(repo: &gix::Repository, name: &str, remote: Option<&str>) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let remote_name = remote.unwrap_or("origin");
        let output = create_git_command()
            .arg("-C")
            .arg(&workdir)
            .args(["push", remote_name, name])
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git push tag 失败: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("推送标签失败: {}", stderr);
        }
        log::info!("已推送标签 {} 到 {}", name, remote_name);
        Ok(())
    }

    /// 删除远程标签
    pub fn delete_remote_tag(repo: &gix::Repository, name: &str, remote: Option<&str>) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let remote_name = remote.unwrap_or("origin");
        let output = create_git_command()
            .arg("-C")
            .arg(&workdir)
            .args(["push", remote_name, "--delete", name])
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git push --delete tag 失败: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("删除远程标签失败: {}", stderr);
        }
        log::info!("已删除远程标签 {} 从 {}", name, remote_name);
        Ok(())
    }

    /// 列出所有标签
    pub fn list_tags(repo: &gix::Repository) -> Result<Vec<String>> {
        let workdir = Self::work_dir(repo)?;
        let output = create_git_command()
            .arg("-C")
            .arg(&workdir)
            .args(["tag", "-l", "--sort=-creatordate"])
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git tag -l 失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("列出标签失败: {}", stderr);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.lines().map(|s| s.to_string()).collect())
    }

    // ===== 行级暂存/丢弃操作 =====

    /// 暂存选中的行（通过 hunk 内行索引）
    ///
    /// `selections` 格式: [(hunk_index, [line_index_within_hunk]), ...]
    /// 从 diff 中提取选中的 +/- 行及其间上下文，构造合法补丁应用到暂存区
    pub fn stage_lines_by_indices(
        repo: &gix::Repository,
        path: &str,
        selections: &[LineSelection],
    ) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let diff_text = Self::diff_file_text(repo, path)?;
        if diff_text.is_empty() {
            anyhow::bail!("没有可暂存的更改");
        }

        let patch = Self::build_partial_patch(&diff_text, selections)?;
        if patch.is_empty() {
            anyhow::bail!("没有选中的行");
        }

        Self::apply_patch_to_index(&workdir, &patch, false)?;
        log::info!("已暂存文件 {} 的 {} 个选中行组", path, selections.len());
        Ok(())
    }

    /// 丢弃选中的行（通过 hunk 内行索引）
    ///
    /// 构建部分补丁并反向应用到工作目录（git apply -R，不带 --cached），
    /// 将选中的更改从工作目录中移除
    pub fn discard_lines_by_indices(
        repo: &gix::Repository,
        path: &str,
        selections: &[LineSelection],
    ) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let diff_text = Self::diff_file_text(repo, path)?;
        if diff_text.is_empty() {
            anyhow::bail!("没有可丢弃的更改");
        }

        let patch = Self::build_partial_patch(&diff_text, selections)?;
        if patch.is_empty() {
            anyhow::bail!("没有选中的行");
        }

        // 丢弃操作：反向应用到工作目录（不修改暂存区）
        Self::apply_patch_to_workdir(&workdir, &patch, true)?;
        log::info!("已丢弃文件 {} 的 {} 个选中行组", path, selections.len());
        Ok(())
    }

    /// 取消暂存选中的行（从暂存区移除，回到未暂存状态）
    ///
    /// 使用 git diff --cached 获取已暂存的差异，
    /// 构建部分补丁并反向应用到暂存区（git apply -R --cached）
    pub fn unstage_lines_by_indices(
        repo: &gix::Repository,
        path: &str,
        selections: &[LineSelection],
    ) -> Result<()> {
        let workdir = Self::work_dir(repo)?;
        let diff_text = Self::diff_cached_text(repo, path)?;
        if diff_text.is_empty() {
            anyhow::bail!("已暂存文件没有可取消的更改");
        }

        let patch = Self::build_partial_patch(&diff_text, selections)?;
        if patch.is_empty() {
            anyhow::bail!("没有选中的行");
        }

        Self::apply_patch_to_index(&workdir, &patch, true)?;
        log::info!("已取消暂存文件 {} 的 {} 个选中行组", path, selections.len());
        Ok(())
    }

    /// 构建仅包含选中行的部分补丁
    ///
    /// 解析完整 diff，提取指定 hunk 中选中的行，构造合法 git 补丁
    fn build_partial_patch(diff_text: &str, selections: &[LineSelection]) -> Result<String> {
        // 按行分割并保留原始格式
        let all_lines: Vec<&str> = diff_text.lines().collect();
        let mut headers = Vec::new();
        // hunk 内的行类型：
        //   ' ' = 上下文行, '+' = 新增行, '-' = 删除行, '\\' = "\ No newline at end of file"
        let mut hunks_raw: Vec<(String, Vec<(char, &str)>)> = Vec::new();

        // 解析 diff
        let mut in_hunk = false;
        let mut current_hunk_header = String::new();
        let mut current_hunk_lines: Vec<(char, &str)> = Vec::new();

        for line in &all_lines {
            if line.starts_with("@@") && !in_hunk {
                in_hunk = true;
                current_hunk_header = line.to_string();
                current_hunk_lines.clear();
            } else if line.starts_with("@@") && in_hunk {
                hunks_raw.push((current_hunk_header.clone(), current_hunk_lines.clone()));
                current_hunk_header = line.to_string();
                current_hunk_lines.clear();
            } else if line.starts_with("diff --git") && !in_hunk {
                headers.push(line.to_string());
            } else if in_hunk {
                // hunk 内的行：记录前缀和原始内容
                if line.starts_with('\\') {
                    // "\ No newline at end of file" 标记，用 '\\' 前缀标识
                    current_hunk_lines.push(('\\', line));
                } else if line.is_empty() {
                    // 空行在 diff 中是上下文行，必须以空格开头
                    current_hunk_lines.push((' ', " "));
                } else if line.starts_with('+') {
                    current_hunk_lines.push(('+', line));
                } else if line.starts_with('-') {
                    current_hunk_lines.push(('-', line));
                } else if line.starts_with(' ') {
                    current_hunk_lines.push((' ', line));
                } else {
                    current_hunk_lines.push((' ', line));
                }
            } else {
                headers.push(line.to_string());
            }
        }
        if in_hunk {
            hunks_raw.push((current_hunk_header, current_hunk_lines));
        }

        // 构建选中行的补丁
        let mut patch = String::new();

        // 输出 diff 头部
        for h in &headers {
            if h.starts_with("diff --git") || h.starts_with("index ") || h.starts_with("---") || h.starts_with("+++") {
                patch.push_str(h);
                patch.push('\n');
            }
        }

        // 检查是否有 diff --git 头，如果没有就手动构造
        if !headers.iter().any(|h| h.starts_with("diff --git")) {
            patch.insert_str(0, "diff --git a/file b/file\n--- a/file\n+++ b/file\n");
        }

        // 处理每个有选中的 hunk
        let sel_map: std::collections::HashMap<usize, &[usize]> = selections.iter()
            .map(|s| (s.hunk_index, s.line_indices.as_slice()))
            .collect();

        for (hunk_idx, (hdr, lines)) in hunks_raw.iter().enumerate() {
            if let Some(selected_indices) = sel_map.get(&hunk_idx) {
                if selected_indices.is_empty() {
                    continue;
                }

                // 只处理 +/- 行的选中
                let relevant_indices: Vec<usize> = selected_indices.iter()
                    .filter(|&&li| li < lines.len() && lines[li].0 != '\\')
                    .copied()
                    .collect();

                if relevant_indices.is_empty() {
                    continue;
                }

                let first_idx = *relevant_indices.first().unwrap();
                let last_idx = *relevant_indices.last().unwrap();

                // 扩展范围以包含上下文行（确保 git apply 能正确定位）
                let mut actual_first = first_idx;
                let mut actual_last = last_idx;

                // 向前扩展：包含所有连续的上下文行（' '）
                if first_idx > 0 {
                    for i in (0..first_idx).rev() {
                        if lines[i].0 == ' ' {
                            actual_first = i;
                        } else {
                            break;
                        }
                    }
                }

                // 向后扩展：包含所有连续的上下文行（' '），以及紧跟的 "\ No newline" 标记
                if last_idx + 1 < lines.len() {
                    for i in (last_idx + 1)..lines.len() {
                        if lines[i].0 == ' ' {
                            actual_last = i;
                        } else if lines[i].0 == '\\' {
                            // "\ No newline at end of file" 需要跟随其前面的行一起输出
                            actual_last = i;
                            break;
                        } else {
                            break;
                        }
                    }
                }

                // 如果选中的最后一行是 + 行，检查后面是否有 "\ No newline" 标记
                if actual_last + 1 < lines.len() && lines[actual_last + 1].0 == '\\' {
                    actual_last = actual_last + 1;
                }

                // 提取范围内所有行（含上下文）
                let sub_lines: Vec<(char, &str)> = lines[actual_first..=actual_last].to_vec();

                // 计算 @@ 头中的 old/new line number
                let header_parsed = parse_hunk_header(hdr);
                let (raw_old_start, raw_new_start) = match header_parsed {
                    Some((os, _, ns, _)) => (os, ns),
                    None => (1, 1),
                };

                // 计算到 actual_first 为止的行号偏移
                let mut old_line = raw_old_start;
                let mut new_line = raw_new_start;
                for (i, (prefix, _)) in lines.iter().enumerate() {
                    if i == actual_first {
                        break;
                    }
                    // '\\' 行不计入行号偏移
                    match prefix {
                        ' ' | '-' => old_line += 1,
                        _ => {}
                    }
                    match prefix {
                        ' ' | '+' => new_line += 1,
                        _ => {}
                    }
                }

                // 计算 sub_hunk 中的行数（"\ No newline" 行不计入）
                let mut old_cnt = 0u32;
                let mut new_cnt = 0u32;
                for (prefix, _) in &sub_lines {
                    if *prefix == '\\' {
                        continue; // "\ No newline" 不计入行数
                    }
                    match prefix {
                        ' ' | '-' => old_cnt += 1,
                        _ => {}
                    }
                    match prefix {
                        ' ' | '+' => new_cnt += 1,
                        _ => {}
                    }
                }

                // 输出 @@ 头
                patch.push_str(&format!("@@ -{},{} +{},{} @@\n", old_line, old_cnt, new_line, new_cnt));

                // 输出行内容（确保前缀正确：上下文行必须以空格开头）
                for (prefix, content) in &sub_lines {
                    if *prefix == '\\' {
                        // "\ No newline at end of file" 保持原样
                        patch.push_str(content);
                    } else if *prefix == ' ' {
                        // 上下文行：确保以空格开头
                        if content.starts_with(' ') {
                            patch.push_str(content);
                        } else {
                            patch.push(' ');
                            patch.push_str(content);
                        }
                    } else {
                        // +/- 行：content 已包含前缀，直接输出
                        patch.push_str(content);
                    }
                    patch.push('\n');
                }
            }
        }

        Ok(patch)
    }

    /// 将补丁应用到暂存区（或反向应用到工作区）
    fn apply_patch_to_index(workdir: &std::path::Path, patch: &str, reverse: bool) -> Result<()> {
        Self::apply_patch(workdir, patch, reverse, true)
    }

    /// 将补丁应用到工作目录（不修改暂存区）
    fn apply_patch_to_workdir(workdir: &std::path::Path, patch: &str, reverse: bool) -> Result<()> {
        Self::apply_patch(workdir, patch, reverse, false)
    }

    /// 通用补丁应用
    fn apply_patch(workdir: &std::path::Path, patch: &str, reverse: bool, cached: bool) -> Result<()> {
        // 调试：输出补丁内容
        log::debug!("应用补丁 (reverse={}, cached={}):\n{}", reverse, cached, patch);

        let mut cmd = create_git_command();
        cmd.arg("-C").arg(workdir);
        cmd.arg("apply");

        if reverse {
            cmd.arg("-R");
        }
        cmd.arg("--unidiff-zero");
        if cached {
            cmd.arg("--cached");
        }

        let mut child = cmd
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| anyhow::anyhow!("执行 git apply 失败: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(patch.as_bytes())?;
            stdin.flush()?;
        }

        let output = child.wait_with_output()
            .map_err(|e| anyhow::anyhow!("等待 git apply 完成失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // 将补丁内容包含在错误信息中，便于调试
            let patch_preview: String = patch.lines().take(30).enumerate()
                .map(|(i, l)| format!("{:>4}: {}", i + 1, l))
                .collect::<Vec<_>>()
                .join("\n");
            anyhow::bail!("git apply 失败: {}\n--- 补丁内容 ---\n{}", stderr, patch_preview);
        }

        Ok(())
    }
}

/// 解析 hunk header: @@ -old_start,old_count +new_start,new_count @@
fn parse_hunk_header(header: &str) -> Option<(u32, u32, u32, u32)> {
    // 格式: @@ -old_start,old_count +new_start,new_count @@
    // 去掉 @@ 前缀
    let s = header.trim_start_matches('@').trim_start_matches('@').trim();
    // 找到第二个 @@
    let parts: Vec<&str> = s.split("@@").collect();
    if parts.is_empty() {
        return None;
    }
    let range_part = parts[0].trim();
    // range_part 格式: -old_start,old_count +new_start,new_count
    let ranges: Vec<&str> = range_part.split_whitespace().collect();
    if ranges.len() < 2 {
        return None;
    }
    // 解析 -old_start,old_count
    let old_part = ranges[0].strip_prefix('-')?;
    let old_parts: Vec<&str> = old_part.split(',').collect();
    let old_start: u32 = old_parts[0].parse().ok()?;
    let old_count: u32 = old_parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);

    // 解析 +new_start,new_count
    let new_part = ranges[1].strip_prefix('+')?;
    let new_parts: Vec<&str> = new_part.split(',').collect();
    let new_start: u32 = new_parts[0].parse().ok()?;
    let new_count: u32 = new_parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);

    Some((old_start, old_count, new_start, new_count))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_available() {
        assert!(GitService::is_available());
    }
}