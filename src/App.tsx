import { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toolbar } from '@/components/layout/Toolbar'
import { FileExplorer } from '@/components/explorer/FileExplorer'
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

export default function App() {
    const host = useIDEHost()

    // Bootstrap VFS with a per-host project ID so OPFS namespaces are isolated
    // across assignments. Re-runs when the host's assignment/submission changes.
    // teacher-review is ephemeral: we always re-seed from the latest Firestore
    // snapshot and skip OPFS so a prior visit's cached files don't shadow a
    // student's newer edits.
    useEffect(() => {
        const ephemeral = host?.mode === 'teacher-review'
        const projectId = host?.submissionId
            ? `submission:${host.submissionId}`
            : host?.assignmentId
            ? `assignment:${host.assignmentId}`
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

    // Teacher-review is a read-only flow: a teacher inspects a student's
    // submission. There's no edit intent, so we skip the 120 MB clangd
    // download entirely. Other modes default to the user's saved preference
    // (resolved inside ClangdProvider).
    const clangdEnabled = host?.mode !== 'teacher-review' ? undefined : false

    return (
        <EngineProvider>
            <ClangdProvider enabled={clangdEnabled}>
                <TooltipProvider delayDuration={300}>
                    <div className="flex flex-col h-full w-full overflow-hidden">
                        <Toolbar />
                        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
                            <ResizablePanel defaultSize="15" minSize="10" maxSize="40">
                                <FileExplorer />
                            </ResizablePanel>

                            <ResizableHandle withHandle />

                            <ResizablePanel defaultSize="55" minSize="25">
                                <Editor />
                            </ResizablePanel>

                            <ResizableHandle withHandle />

                            <ResizablePanel defaultSize="30" minSize="15">
                                <RightPanel />
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </div>
                </TooltipProvider>
            </ClangdProvider>
        </EngineProvider>
    )
}
