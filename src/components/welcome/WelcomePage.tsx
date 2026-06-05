/**
 * 欢迎页面 - 仓库书签管理
 *
 * 显示已保存的书签列表，提供添加/删除/打开仓库功能
 * 支持原生文件夹选择对话框
 */

import { useState, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openRepo, getCurrentBranch } from "@/services/git";
import { useTabStore, useBookmarkStore } from "@/stores";
import type { Bookmark } from "@/stores";

export default function WelcomePage() {
  const { bookmarks, addBookmark, removeBookmark } = useBookmarkStore();
  const { openTab } = useTabStore();
  const [showInput, setShowInput] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  /** 打开仓库并通过 TabStore 切换 */
  const handleOpenRepo = async (path: string) => {
    setErrMsg("");
    try {
      await openRepo(path);
      const branch = await getCurrentBranch(path);
      openTab(path, branch);
    } catch (e: any) {
      setErrMsg(`打开失败: ${e}`);
    }
  };

  /** 使用原生文件对话框选择仓库目录 */
  const handleBrowse = async () => {
    setErrMsg("");
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择仓库目录",
      });
      if (selected) {
        // 同时添加到书签
        const name = selected.split(/[/\\]/).filter(Boolean).pop() || selected;
        addBookmark(name, selected);
        await handleOpenRepo(selected);
      }
    } catch (e: any) {
      setErrMsg(`选择目录失败: ${e}`);
    }
  };

  /** 添加书签 */
  const handleAddBookmark = () => {
    const path = newPath.trim();
    if (!path) return;
    const name = path.split(/[/\\]/).filter(Boolean).pop() || path;
    addBookmark(name, path);
    setShowInput(false);
    setNewPath("");
  };

  /** 删除书签 */
  const handleRemoveBookmark = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    removeBookmark(path);
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-muted/30 p-8">
      <div className="w-full max-w-lg">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">SourceTree Rust</h1>
          <p className="text-sm text-muted-foreground mt-1">
            选择、浏览或添加一个仓库开始使用
          </p>
        </div>

        {/* 快速操作 */}
        <div className="mb-6 flex gap-3">
          <button
            onClick={handleBrowse}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary transition-colors text-sm font-medium text-primary"
          >
            {/* 文件夹图标 */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            浏览并选择仓库目录
          </button>
        </div>

        {/* 书签列表 */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium">仓库书签</span>
            <button
              onClick={() => setShowInput(true)}
              className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
            >
              + 添加
            </button>
          </div>

          {/* 添加输入框 */}
          {showInput && (
            <div className="px-4 py-3 border-b border-border bg-muted/20">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddBookmark()}
                  placeholder="输入仓库路径..."
                  className="flex-1 px-2 py-1.5 text-sm rounded border border-input bg-background outline-none focus:border-primary"
                  autoFocus
                />
                <button
                  onClick={handleAddBookmark}
                  className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  确定
                </button>
                <button
                  onClick={() => {
                    setShowInput(false);
                    setNewPath("");
                  }}
                  className="px-3 py-1.5 text-xs rounded border border-input hover:bg-accent"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 书签列表 */}
          <div className="divide-y divide-border">
            {bookmarks.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                暂无书签，点击上方"添加"按钮或使用"浏览"按钮添加仓库
              </div>
            ) : (
              bookmarks.map((b: Bookmark) => (
                <div
                  key={b.path}
                  onClick={() => handleOpenRepo(b.path)}
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {b.path}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleRemoveBookmark(e, b.path)}
                    className="ml-2 px-2 py-1 text-xs rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    删除
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 错误提示 */}
        {errMsg && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            {errMsg}
          </div>
        )}

        {/* 快速打开 */}
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <label className="text-sm font-medium block mb-2">快速打开仓库</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="输入完整路径直接打开..."
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) {
                    try {
                      await openRepo(val);
                      const branch = await getCurrentBranch(val);
                      openTab(val, branch);
                    } catch (err: any) {
                      setErrMsg(`打开失败: ${err}`);
                    }
                  }
                }
              }}
              className="flex-1 px-3 py-2 text-sm rounded border border-input bg-background outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
}