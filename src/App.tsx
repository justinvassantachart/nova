import { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toolbar } from '@/components/layout/Toolbar'
import { ActivityBar } from '@/components/sidebar/ActivityBar'
import { SidebarPanel } from '@/components/sidebar/SidebarPanel'
import { useSidebarStore } from '@/components/sidebar/sidebar-store'
import { Editor } from '@/components/editor/Editor'
import { RightPanel } from '@/components/layout/RightPanel'
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable'
import { initVFS, subscribeWorkspaceChange, getAllFiles } from '@/vfs/volume'
import { EngineProvider } from '@/engine/EngineContext'
import { ClangdProvider } from '@/clangd'
import { useIDEHost } from '@/ide-host-context'
import '@/components/sidebar/sidebar.css'

export default function App() {
    const host = useIDEHost()
    const sidebarCollapsed = useSidebarStore((s) => s.collapsed)

    // Safety: if we landed here via client-side navigation from a non-isolated
    // route (like /), SharedArrayBuffer will be missing. Force a reload to
    // pick up the COOP/COEP headers from the server.
    useEffect(() => {
        if (!window.crossOriginIsolated) {
            window.location.reload()
        }
    }, [])

    // Bootstrap VFS with a per-host project ID so OPFS namespaces are isolated
    // across assignments. Re-runs when the host's assignment/submission changes.
    // teacher-review is ephemeral: we always re-seed from the latest Firestore
    // snapshot and skip OPFS so a prior visit's cached files don't shadow a
    // student's newer edits.
    //
    // The project ID composes assignmentId AND submissionId because submissionId
    // is the student's uid — identical across every assignment that student opens.
    // Keying OPFS on submissionId alone makes one assignment's cached code shadow
    // the starter files of the next.
    useEffect(() => {
        const ephemeral = host?.mode === 'teacher-review'
        const projectId = host?.assignmentId
            ? host.submissionId
                ? `submission:${host.assignmentId}:${host.submissionId}`
                : `assignment:${host.assignmentId}`
            : 'default-project'
        initVFS({ projectId, initialFiles: host?.initialFiles, ephemeral })
    }, [host?.mode, host?.assignmentId, host?.submissionId, host?.initialFiles])

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

    // Read-only review mode skips clangd entirely; everything else defers
    // to the user preference inside ClangdProvider.
    const clangdEnabled = host?.mode !== 'teacher-review' ? undefined : false

    return (
        <EngineProvider>
            <ClangdProvider enabled={clangdEnabled}>
                <TooltipProvider delayDuration={300}>
                    <div className="flex flex-col h-full w-full overflow-hidden">
                        <Toolbar />
                        <div className="flex-1 min-h-0 flex">
                            <ActivityBar />
                            {/* Key changes with collapse state so react-resizable-panels
                                re-initializes default sizes when the sidebar disappears. */}
                            <ResizablePanelGroup
                                key={sidebarCollapsed ? 'no-sidebar' : 'with-sidebar'}
                                orientation="horizontal"
                                className="flex-1 min-h-0"
                            >
                                {!sidebarCollapsed && (
                                    <>
                                        {/* sizes are strings so react-resizable-panels
                                            treats them as % — a bare number is read
                                            as a pixel value, which produced a 40px-wide
                                            sidebar that couldn't be dragged wider. */}
                                        <ResizablePanel
                                            id="sidebar"
                                            defaultSize="18"
                                            minSize="10"
                                            maxSize="40"
                                        >
                                            <SidebarPanel />
                                        </ResizablePanel>
                                        <ResizableHandle withHandle />
                                    </>
                                )}

                                <ResizablePanel id="editor" defaultSize="55" minSize="25">
                                    <Editor />
                                </ResizablePanel>

                                <ResizableHandle withHandle />

                                <ResizablePanel id="right" defaultSize="27" minSize="15">
                                    <RightPanel />
                                </ResizablePanel>
                            </ResizablePanelGroup>
                        </div>
                    </div>
                </TooltipProvider>
            </ClangdProvider>
        </EngineProvider>
    )
}
