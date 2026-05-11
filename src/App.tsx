import { useEffect, useRef, useState, useCallback } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toolbar } from '@/components/layout/Toolbar'
import { FileExplorer } from '@/components/explorer/FileExplorer'
import { Editor } from '@/components/editor/Editor'
import { RightPanel } from '@/components/layout/RightPanel'
import { initVFS, subscribeWorkspaceChange, getAllFiles } from '@/vfs/volume'
import { EngineProvider } from '@/engine/EngineContext'
import { useIDEHost } from '@/ide-host-context'

// ── Drag handle with iframe overlay ────────────────────────────
function DragHandle({ onDrag }: { onDrag: (dx: number) => void }) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    let lastX = e.clientX

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
  const host = useIDEHost()

  // Bootstrap VFS with a per-host project ID so OPFS namespaces are isolated
  // across assignments. Re-runs when the host's assignment/submission changes.
  useEffect(() => {
    const projectId = host?.submissionId
      ? `submission:${host.submissionId}`
      : host?.assignmentId
      ? `assignment:${host.assignmentId}`
      : 'default-project'
    initVFS({ projectId, initialFiles: host?.initialFiles })
  }, [host?.assignmentId, host?.submissionId, host?.initialFiles])

  // Forward debounced workspace snapshots to the host (e.g. Firestore submission auto-save).
  useEffect(() => {
    if (!host?.onWorkspaceChange) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => host.onWorkspaceChange!(getAllFiles())
    const unsub = subscribeWorkspaceChange(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, 2000)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsub()
    }
  }, [host])

  const clamp = useCallback((val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val)), [])

  return (
    <EngineProvider>
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col h-full w-full overflow-hidden">
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
    </EngineProvider>
  )
}
