/**
 * 终端面板组件
 *
 * 使用 xterm.js 实现完整的终端模拟器，支持：
 * - 2万行历史记录
 * - 搜索功能
 * - ANSI 颜色处理
 * - PTY 交互
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { spawn } from 'tauri-pty'
import { Search, ChevronDown, ChevronUp, X } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  workspacePath: string // 工作目录
}

export function TerminalPanel({ workspacePath }: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)

  const [showSearch, setShowSearch] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState({ current: 0, total: 0 })

  // 初始化终端
  useEffect(() => {
    if (!terminalRef.current) return

    // 创建终端实例
    const term = new Terminal({
      scrollback: 90000, // 9万行历史
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

    // 启动 PTY
    const startPty = async () => {
      try {
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

        // 双向数据流
        pty.onData((data: Uint8Array) => {
          // 将 Uint8Array 转换为字符串
          const decoder = new TextDecoder()
          term.write(decoder.decode(data))
        })

        term.onData((data: string) => {
          pty.write(data)
        })

        // 窗口大小调整
        const handleResize = () => {
          fitAddon.fit()
          pty.resize(term.cols, term.rows)
        }

        window.addEventListener('resize', handleResize)

        // 清理
        return () => {
          window.removeEventListener('resize', handleResize)
          pty.kill()
        }
      } catch (err) {
        console.error('PTY 启动失败:', err)
        term.writeln('\x1b[31m错误: 无法启动终端\x1b[0m')
        term.writeln(`\x1b[33m${err}\x1b[0m`)
        term.writeln('\x1b[36m提示: 请确保 tauri-plugin-pty 已正确安装\x1b[0m')
      }
    }

    startPty()

    termRef.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // 监听搜索结果变化
    searchAddon.onDidChangeResults((data) => {
      if (data) {
        setSearchResults({
          current: data.resultIndex !== undefined ? data.resultIndex + 1 : 0,
          total: data.resultCount,
        })
      } else {
        setSearchResults({ current: 0, total: 0 })
      }
    })

    // 清理
    return () => {
      term.dispose()
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

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#3c3c3c] bg-[#252526]">
        <div className="flex items-center gap-2 text-xs text-[#cccccc]">
          <span className="font-medium">终端</span>
          <span className="text-[#858585]">- {workspacePath}</span>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="p-1 rounded hover:bg-[#3c3c3c] text-[#cccccc]"
          title="搜索 (Ctrl+F)"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* 搜索栏 */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#3c3c3c] bg-[#252526]">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="搜索终端输出..."
            className="flex-1 px-2 py-1 text-xs rounded border border-[#3c3c3c] bg-[#3c3c3c] text-[#cccccc] outline-none focus:border-[#007acc]"
            autoFocus
          />
          {/* 搜索结果数量 */}
          {searchResults.total > 0 && (
            <span className="text-xs text-[#cccccc] min-w-[50px] text-center">
              {searchResults.current}/{searchResults.total}
            </span>
          )}
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
      )}

      {/* 终端容器 */}
      <div ref={terminalRef} className="flex-1 min-h-0" />
    </div>
  )
}
