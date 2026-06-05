//! Git 核心服务
//!
//! 封装 gix 操作，提供业务逻辑接口

use anyhow::Result;

/// Git 核心服务
pub struct GitService;

impl GitService {
    /// 打开仓库
    pub fn open(path: &str) -> Result<gix::Repository> {
        let repo = gix::open(path)?;
        log::info!("已打开仓库: {}", path);
        Ok(repo)
    }

    /// 获取当前分支名
    pub fn current_branch(repo: &gix::Repository) -> Result<String> {
        let head = repo.head()?;
        let name = match head.referent_name() {
            Some(name) => name.shorten().to_string(),
            None => "HEAD (detached)".to_string(),
        };
        Ok(name)
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