import { useEffect, useRef, useState, useCallback } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toolbar } from '@/components/layout/Toolbar'
import { FileExplorer } from '@/components/explorer/FileExplorer'
import { Editor } from '@/components/editor/Editor'
import { RightPanel } from '@/components/layout/RightPanel'
import { initVFS } from '@/vfs/volume'
import { preloadCompiler } from '@/lib/compiler-cache'

// ── Drag handle with iframe overlay ────────────────────────────
// Creates a fullscreen transparent overlay during drag so that
// mouse events aren't swallowed by iframes (Monaco) or canvases.
function DragHandle({ onDrag }: { onDrag: (dx: number) => void }) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    let lastX = e.clientX

    // Overlay prevents iframes from eating mouse events
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize'
    document.body.appendChild(overlay)
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      onDrag(ev.clientX - lastX)
      lastX = ev.clientX
    }
    const onUp = () => {
      overlay.remove()
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [onDrag])

  return (
    <div
      className="w-[4px] shrink-0 cursor-col-resize bg-border hover:bg-primary/30 active:bg-primary/50 transition-colors"
      onMouseDown={handleMouseDown}
    />
  )
}

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [explorerW, setExplorerW] = useState(220)
  const [rightW, setRightW] = useState(400)

  useEffect(() => {
    initVFS()
    preloadCompiler()
  }, [])

  const clamp = useCallback((val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val)), [])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <Toolbar />

        <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
          {/* File Explorer */}
          <div style={{ width: explorerW }} className="shrink-0 overflow-hidden">
            <FileExplorer />
          </div>

          <DragHandle onDrag={(dx) => setExplorerW((w) => clamp(w + dx, 140, 400))} />

          {/* Editor — flex-1 takes remaining space */}
          <div className="flex-1 min-w-[200px] overflow-hidden">
            <Editor />
          </div>

          <DragHandle onDrag={(dx) => setRightW((w) => clamp(w - dx, 250, 600))} />

          {/* Right Panel */}
          <div style={{ width: rightW }} className="shrink-0 overflow-hidden">
            <RightPanel />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
