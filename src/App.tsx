import { useEffect, useState } from "react";
import { greet, getBackendInfo } from "@/services/git";
import { useThemeStore } from "@/stores";

function App() {
  const { theme, toggleTheme } = useThemeStore();
  const [backendMsg, setBackendMsg] = useState("正在连接后端…");
  const [backendInfo, setBackendInfo] = useState<string | null>(null);

  // 初始化：测试 IPC 通信
  useEffect(() => {
    greet("SourceTree")
      .then((msg) => {
        setBackendMsg(msg);
      })
      .catch(() => {
        setBackendMsg("后端未连接（开发前端时正常）");
      });

    getBackendInfo()
      .then((info) => setBackendInfo(info.status))
      .catch(() => {});
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* 顶部标题栏 */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground">
            SourceTree Rust
          </h1>
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-primary/10 text-primary">
            v0.1.0
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* IPC 通信状态 */}
          <span className="text-xs text-muted-foreground">{backendMsg}</span>
          {backendInfo && (
            <span className="text-[10px] text-muted-foreground/60">
              {backendInfo}
            </span>
          )}
          <button
            onClick={toggleTheme}
            className="px-3 py-1 text-sm rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {theme === "light" ? "🌙 暗色" : "☀️ 亮色"}
          </button>
        </div>
      </header>

      {/* 主体区域 - 三栏布局占位 */}
      <main className="flex-1 flex p-4 gap-4 bg-muted/30">
        {/* 侧边栏 */}
        <aside className="w-56 rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            仓库书签
          </p>
          <div className="text-xs text-muted-foreground">
            暂无打开的仓库
          </div>
        </aside>

        {/* 文件列表 */}
        <section className="flex-1 rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            文件状态
          </p>
          <div className="text-xs text-muted-foreground">
            打开仓库后显示文件状态
          </div>
        </section>

        {/* 差异面板 */}
        <section className="flex-1 rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            差异查看
          </p>
          <div className="text-xs text-muted-foreground">
            选择文件后显示差异内容
          </div>
        </section>
      </main>

      {/* 底部状态栏 */}
      <footer className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-card text-xs text-muted-foreground">
        <span>就绪</span>
        <span>未打开仓库</span>
      </footer>
    </div>
  );
}

export default App;