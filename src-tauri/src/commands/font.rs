//! 系统字体命令
//!
//! 提供获取系统已安装字体列表的功能

use font_kit::source::SystemSource;

/// 获取系统已安装的等宽字体列表
///
/// 返回适合代码编辑的等宽字体名称列表
#[tauri::command]
pub fn get_monospace_fonts() -> Vec<String> {
    let source = SystemSource::new();
    let all_fonts = source.all_fonts().unwrap_or_default();

    let mut monospace_fonts: Vec<String> = all_fonts
        .into_iter()
        .filter_map(|handle| {
            // 加载字体
            let font = handle.load().ok()?;
            // 检查是否为等宽字体
            if font.is_monospace() {
                Some(font.family_name())
            } else {
                None
            }
        })
        .collect();

    // 去重并排序
    monospace_fonts.sort();
    monospace_fonts.dedup();

    monospace_fonts
}