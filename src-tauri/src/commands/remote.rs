//! 远程操作命令
//!
//! 提供 fetch、pull、push 等远程同步操作

use crate::services::git_service::create_git_command;

/// Fetch 远程更新
#[tauri::command]
pub fn fetch_remote(repo_path: String, remote: Option<String>) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());

    let child = create_git_command()
        .args(["fetch", &remote_name])
        .current_dir(&repo_path)
        .stdin(std::process::Stdio::inherit())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("执行 git fetch 失败: {}", e))?;

    let output = child.wait_with_output()
        .map_err(|e| format!("等待 git fetch 完成失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        Ok(if stdout.is_empty() {
            format!("从 {} 获取更新成功", remote_name)
        } else {
            format!("{}\n{}", stdout, stderr)
        })
    } else {
        Err(format!("fetch 失败: {}", stderr))
    }
}

/// Pull 拉取并合并
#[tauri::command]
pub fn pull_remote(
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
    credentials: Option<serde_json::Value>,
) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    let branch_name = branch.unwrap_or_default();

    let args = if branch_name.is_empty() {
        vec!["pull", &remote_name]
    } else {
        vec!["pull", &remote_name, &branch_name]
    };

    let mut cmd = create_git_command();
    cmd.args(&args)
        .current_dir(&repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // 如果提供了凭据，设置环境变量
    if let Some(creds) = &credentials {
        if let (Some(username), Some(password)) = (
            creds.get("username").and_then(|v| v.as_str()),
            creds.get("password").and_then(|v| v.as_str()),
        ) {
            cmd.env("GIT_USERNAME", username);
            cmd.env("GIT_PASSWORD", password);
            // 使用内联 credential helper
            cmd.env(
                "GIT_CONFIG_COUNT",
                "1",
            );
            cmd.env(
                "GIT_CONFIG_KEY_0",
                "credential.helper",
            );
            cmd.env(
                "GIT_CONFIG_VALUE_0",
                "!f() { echo \"username=${GIT_USERNAME}\"; echo \"password=${GIT_PASSWORD}\"; }; f",
            );
        }
    } else {
        cmd.stdin(std::process::Stdio::inherit());
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("执行 git pull 失败: {}", e))?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("等待 git pull 完成失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        Ok(if stdout.is_empty() && stderr.is_empty() {
            "拉取成功，已是最新".to_string()
        } else {
            format!("{}\n{}", stdout, stderr)
        })
    } else {
        Err(format!("pull 失败: {}", stderr))
    }
}

/// Push 推送到远程
#[tauri::command]
pub fn push_remote(
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
    set_upstream: bool,
    credentials: Option<serde_json::Value>,
) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    let branch_name = branch.unwrap_or_default();

    let mut args = vec!["push"];
    if set_upstream {
        args.push("-u");
    }
    args.push(&remote_name);
    if !branch_name.is_empty() {
        args.push(&branch_name);
    }

    let mut cmd = create_git_command();
    cmd.args(&args)
        .current_dir(&repo_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // 如果提供了凭据，设置环境变量
    if let Some(creds) = &credentials {
        if let (Some(username), Some(password)) = (
            creds.get("username").and_then(|v| v.as_str()),
            creds.get("password").and_then(|v| v.as_str()),
        ) {
            cmd.env("GIT_USERNAME", username);
            cmd.env("GIT_PASSWORD", password);
            // 使用内联 credential helper
            cmd.env(
                "GIT_CONFIG_COUNT",
                "1",
            );
            cmd.env(
                "GIT_CONFIG_KEY_0",
                "credential.helper",
            );
            cmd.env(
                "GIT_CONFIG_VALUE_0",
                "!f() { echo \"username=${GIT_USERNAME}\"; echo \"password=${GIT_PASSWORD}\"; }; f",
            );
        }
    } else {
        cmd.stdin(std::process::Stdio::inherit());
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("执行 git push 失败: {}", e))?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("等待 git push 完成失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        Ok(if stdout.is_empty() && stderr.is_empty() {
            format!("推送到 {} 成功", remote_name)
        } else {
            format!("{}\n{}", stdout, stderr)
        })
    } else {
        Err(format!("push 失败: {}", stderr))
    }
}

/// 克隆仓库
#[tauri::command]
pub fn clone_repo(url: String, target_dir: String) -> Result<String, String> {
    let output = create_git_command()
        .args(["clone", &url, &target_dir])
        .output()
        .map_err(|e| format!("执行 git clone 失败: {}", e))?;

    if output.status.success() {
        Ok(format!("克隆成功: {}", target_dir))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("克隆失败: {}", stderr))
    }
}

/// 初始化新仓库
#[tauri::command]
pub fn init_repo(path: String, bare: bool) -> Result<String, String> {
    let mut args = vec!["init"];
    if bare {
        args.push("--bare");
    }

    let output = create_git_command()
        .args(&args)
        .current_dir(&path)
        .output()
        .map_err(|e| format!("执行 git init 失败: {}", e))?;

    if output.status.success() {
        Ok(format!("仓库初始化成功: {}", path))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("初始化失败: {}", stderr))
    }
}

/// 获取远程仓库列表
#[tauri::command]
pub fn list_remotes(repo_path: String) -> Result<Vec<serde_json::Value>, String> {
    let output = create_git_command()
        .args(["remote", "-v"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git remote -v 失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("获取远程列表失败: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut remotes: Vec<serde_json::Value> = Vec::new();
    let mut current_name: Option<String> = None;
    let mut fetch_url: Option<String> = None;
    let mut push_url: Option<String> = None;

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let name = parts[0];
            let url = parts[1];

            if current_name.as_deref() != Some(name) {
                // 保存上一个 remote
                if let Some(n) = current_name.take() {
                    remotes.push(serde_json::json!({
                        "name": n,
                        "fetch_url": fetch_url,
                        "push_url": push_url,
                    }));
                }
                current_name = Some(name.to_string());
                fetch_url = None;
                push_url = None;
            }

            if parts.len() >= 3 && parts[2] == "(fetch)" {
                fetch_url = Some(url.to_string());
            } else if parts.len() >= 3 && parts[2] == "(push)" {
                push_url = Some(url.to_string());
            }
        }
    }

    // 保存最后一个 remote
    if let Some(n) = current_name {
        remotes.push(serde_json::json!({
            "name": n,
            "fetch_url": fetch_url,
            "push_url": push_url,
        }));
    }

    Ok(remotes)
}

/// 添加远程仓库
#[tauri::command]
pub fn add_remote(repo_path: String, name: String, url: String) -> Result<String, String> {
    let output = create_git_command()
        .args(["remote", "add", &name, &url])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git remote add 失败: {}", e))?;

    if output.status.success() {
        Ok(format!("远程仓库 '{}' 添加成功", name))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("添加远程仓库失败: {}", stderr))
    }
}

/// 删除远程仓库
#[tauri::command]
pub fn remove_remote(repo_path: String, name: String) -> Result<String, String> {
    let output = create_git_command()
        .args(["remote", "remove", &name])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git remote remove 失败: {}", e))?;

    if output.status.success() {
        Ok(format!("远程仓库 '{}' 已删除", name))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("删除远程仓库失败: {}", stderr))
    }
}

/// 修改远程仓库 URL
#[tauri::command]
pub fn set_remote_url(repo_path: String, name: String, url: String) -> Result<String, String> {
    let output = create_git_command()
        .args(["remote", "set-url", &name, &url])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git remote set-url 失败: {}", e))?;

    if output.status.success() {
        Ok(format!("远程仓库 '{}' URL 已更新", name))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("修改远程仓库 URL 失败: {}", stderr))
    }
}