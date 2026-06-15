//! Tauri 命令模块
//!
//! 所有 IPC 接口在此注册，按功能域拆分到子模块

pub mod repo;
pub mod status;
pub mod branch;
pub mod remote;
pub mod discard;
pub mod tag;
pub mod font;