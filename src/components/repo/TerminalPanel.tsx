/**
 * 终端面板组件
 *
 * 使用 xterm.js 实现完整的终端模拟器，支持：
 * - 2万行历史记录
 * - 搜索功能
 * - ANSI 颜色处理
 * - PTY 交互
 * - 终端持久化（组件不会被卸载）
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { spawn } from 'tauri-pty'
import { Search, ChevronDown, ChevronUp, X, Trash2 } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  workspacePath: string // 工作目录
}

export function TerminalPanel({ workspacePath }: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const ptyRef = useRef<any>(null)
  
  const [showSearch, setShowSearch] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState({ current: 0, total: 0 })

  // 初始化终端（只执行一次）
  useEffect(() => {
    // 如果已经初始化，跳过
    if (termRef.current) return
    
    console.log('[Terminal] 开始初始化终端...')
    
    // 等待 DOM 准备好
    const timer = setTimeout(() => {
      if (!terminalRef.current) {
        console.error('[Terminal] terminalRef.current 为空')
        return
      }

      try {
        // 创建终端实例
        const term = new Terminal({
          scrollback: 20000, // 2万行历史
          fontSize: 13,
          fontFamily: 'JetBrains Mono, Consolas, "Courier New", monospace',
          cursorBlink: true,
          cursorStyle: 'block',
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
            cursorAccent: '#1e1e1e',
            selectionBackground: '#264f78',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#e5e5e5',
          },
          allowProposedApi: true,
        })

        console.log('[Terminal] Terminal 实例创建成功')

        // 加载插件
        const fitAddon = new FitAddon()
        const searchAddon = new SearchAddon()
        const webLinksAddon = new WebLinksAddon()

        term.loadAddon(fitAddon)
        term.loadAddon(searchAddon)
        term.loadAddon(webLinksAddon)

        // 打开终端
        term.open(terminalRef.current)
        fitAddon.fit()

        console.log('[Terminal] 终端已打开，cols:', term.cols, 'rows:', term.rows)

        // 保存引用
        termRef.current = term
        fitAddonRef.current = fitAddon
        searchAddonRef.current = searchAddon

        // 启动 PTY
        const startPty = async () => {
          try {
            console.log('[Terminal] 启动 PTY...')

            // Windows 使用 PowerShell
            const shell = 'powershell.exe'
            const args: string[] = []

            const pty = await spawn(shell, args, {
              cols: term.cols,
              rows: term.rows,
              cwd: workspacePath,
              env: {
                // 继承环境变量
                TERM: 'xterm-256color',
              },
            })

            console.log('[Terminal] PTY 启动成功')

            // 保存 PTY 引用
            ptyRef.current = pty

            // 双向数据流
            pty.onData((data: Uint8Array) => {
              // 将 Uint8Array 转换为字符串
              const decoder = new TextDecoder()
              term.write(decoder.decode(data))
            })

            term.onData((data: string) => {
              pty.write(data)
            })

            // 监听搜索结果变化
            searchAddon.onDidChangeResults((data: any) => {
              if (data) {
                setSearchResults({
                  current: data.resultIndex !== undefined ? data.resultIndex + 1 : 0,
                  total: data.resultCount,
                })
              } else {
                setSearchResults({ current: 0, total: 0 })
              }
            })

            console.log('[Terminal] 终端初始化完成')
          } catch (err) {
            console.error('[Terminal] PTY 启动失败:', err)
            term.writeln('\x1b[31m错误: 无法启动终端\x1b[0m')
            term.writeln(`\x1b[33m${err}\x1b[0m`)
            term.writeln('\x1b[36m提示: 请确保 tauri-plugin-pty 已正确安装\x1b[0m')
          }
        }

        startPty()
      } catch (err) {
        console.error('[Terminal] 终端创建失败:', err)
      }
    }, 100) // 延迟 100ms 确保 DOM 准备好

    // 容器大小调整（使用 ResizeObserver 监听容器大小变化）
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && ptyRef.current && termRef.current) {
        try {
          fitAddonRef.current.fit()
          ptyRef.current.resize(termRef.current.cols, termRef.current.rows)
        } catch (err) {
          console.error('[Terminal] 调整终端大小失败:', err)
        }
      }
    })

    // 监听终端容器大小变化
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    // 清理：只在组件真正卸载时执行（关闭仓库）
    return () => {
      clearTimeout(timer)
      resizeObserver.disconnect()
      
      // 销毁终端
      if (termRef.current) {
        try {
          termRef.current.dispose()
          console.log('[Terminal] 终端已销毁')
        } catch (err) {
          console.error('[Terminal] 销毁终端失败:', err)
        }
      }
      
      // 终止 PTY
      if (ptyRef.current && ptyRef.current.kill) {
        try {
          ptyRef.current.kill()
          console.log('[Terminal] PTY 已终止')
        } catch (err) {
          console.error('[Terminal] 终止 PTY 失败:', err)
        }
      }
      
      termRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
      ptyRef.current = null
    }
  }, [workspacePath])

  // 搜索功能
  const handleSearch = useCallback((direction: 'next' | 'prev') => {
    if (!searchAddonRef.current || !searchText) return

    const searchAddon = searchAddonRef.current

    if (direction === 'next') {
      searchAddon.findNext(searchText, {
        regex: false,
        wholeWord: false,
        caseSensitive: false,
        decorations: {
          matchBackground: '#FFD700',
          activeMatchBackground: '#FF6B6B',
          matchOverviewRuler: '#FFD700',
          activeMatchColorOverviewRuler: '#FF6B6B',
        },
      })
    } else {
      searchAddon.findPrevious(searchText, {
        regex: false,
        wholeWord: false,
        caseSensitive: false,
        decorations: {
          matchBackground: '#FFD700',
          activeMatchBackground: '#FF6B6B',
          matchOverviewRuler: '#FFD700',
          activeMatchColorOverviewRuler: '#FF6B6B',
        },
      })
    }
  }, [searchText])

  // 当搜索文本变化时自动搜索
  useEffect(() => {
    if (!searchAddonRef.current || !searchText || !showSearch) return

    const searchAddon = searchAddonRef.current
    searchAddon.findNext(searchText, {
      regex: false,
      wholeWord: false,
      caseSensitive: false,
      decorations: {
        matchBackground: '#FFD700',
        activeMatchBackground: '#FF6B6B',
        matchOverviewRuler: '#FFD700',
        activeMatchColorOverviewRuler: '#FF6B6B',
      },
    })
  }, [searchText, showSearch])

  // 键盘快捷键：Ctrl+F 打开搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 搜索框键盘事件
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch(e.shiftKey ? 'prev' : 'next')
    } else if (e.key === 'Escape') {
      setShowSearch(false)
    }
  }

  // 清理终端
  const handleClearTerminal = () => {
    if (!termRef.current) return
    
    // 清空终端内容
    termRef.current.clear()
  }

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* 工具栏 - 响应式布局 */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#3c3c3c] bg-[#252526] min-w-0">
        <div className="flex items-center gap-2 text-xs text-[#cccccc] min-w-0 flex-1">
          <span className="font-medium shrink-0">终端</span>
          <span className="text-[#858585] truncate hidden sm:inline">- {workspacePath}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-1 rounded hover:bg-[#3c3c3c] text-[#cccccc]"
            title="搜索 (Ctrl+F)"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={handleClearTerminal}
            className="p-1 rounded hover:bg-[#3c3c3c] text-[#cccccc]"
            title="清空终端"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 搜索栏 - 响应式布局 */}
      {showSearch && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[#3c3c3c] bg-[#252526] min-w-0">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="搜索终端输出..."
            className="flex-1 px-2 py-1 text-xs rounded border border-[#3c3c3c] bg-[#3c3c3c] text-[#cccccc] outline-none focus:border-[#007acc] min-w-0"
            autoFocus
          />
          {/* 搜索结果数量 - 小窗口下隐藏 */}
          {searchResults.total > 0 && (
            <span className="text-xs text-[#cccccc] min-w-[50px] text-center hidden sm:inline">
              {searchResults.current}/{searchResults.total}
            </span>
          )}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => handleSearch('prev')}
              disabled={searchResults.total === 0}
              className="p-1 rounded hover:bg-[#3c3c3c] text-[#cccccc] disabled:opacity-40"
              title="上一个"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleSearch('next')}
              disabled={searchResults.total === 0}
              className="p-1 rounded hover:bg-[#3c3c3c] text-[#cccccc] disabled:opacity-40"
              title="下一个"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setShowSearch(false)
                setSearchText('')
                setSearchResults({ current: 0, total: 0 })
              }}
              className="p-1 rounded hover:bg-[#3c3c3c] text-[#cccccc]"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 终端容器 */}
      <div ref={terminalRef} className="flex-1 min-h-0" />
    </div>
  )
}
