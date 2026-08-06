// /learn/:slug — the guided-lesson page. The lesson panel sits beside the
// full IDE; the IDE is embedded exactly the way any third-party host would
// embed it: via <IDEHostProvider> and the public IDEHost contract. No IDE
// internals are modified for lessons to work — that's the point.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import type { WebIDEInstanceHandle } from 'web-ide'
import App from '@/App'
import { IDEHostProvider } from '@/ide-host-context'
import type { IDEHost } from '@/ide-host'
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuth } from '@/shared/context/auth-context'
import { useFirestoreEventSink } from '@/shared/analytics/useFirestoreEventSink'
import type { Lesson } from './types'
import { workspacePath } from './types'
import { lessonBySlug } from './content'
import { LessonPanel } from './LessonPanel'
import { LessonRuntime } from './runtime'
import { useLessonProgress } from './progress-store'

export default function LessonRunner() {
    const { slug } = useParams()
    const lesson = lessonBySlug(slug)
    if (!lesson) return <Navigate to="/learn" replace />
    // Key by lesson so switching lessons rebuilds the runtime + IDE host.
    return <Runner key={lesson.id} lesson={lesson} />
}

function Runner({ lesson }: { lesson: Lesson }) {
    const { user } = useAuth()
    const runtime = useMemo(() => new LessonRuntime(), [])
    const ideRef = useRef<WebIDEInstanceHandle>(null)
    const getIDEInstance = useCallback(() => ideRef.current, [])

    // Bumped by "reset lesson": a new nonce yields a fresh OPFS namespace,
    // so the workspace re-seeds from the lesson's starter files without
    // racing any in-flight persistence of the old edits.
    const resetNonce = useLessonProgress(
        (s) => s.byLesson[lesson.id]?.resetNonce ?? 0,
    )

    // Anonymous visitors learn without any account; if someone IS signed in,
    // lesson telemetry flows into the same Firestore event stream as
    // assignment work (the sink no-ops when uid is undefined).
    const sink = useFirestoreEventSink({
        uid: user?.uid,
        assignmentId: `lesson:${lesson.id}`,
    })

    // Single recording channel for the research trace: IDE events and
    // lesson-level events (step transitions, hints, resets) interleave in
    // the same Firestore stream under one sessionId. Every event carries
    // the step the learner was on, so a trace reads as "on step 'fix',
    // the student set a breakpoint, stepped twice, edited, re-ran".
    const report = useMemo(() => {
        return (type: string, payload: Record<string, unknown>) => {
            const p = useLessonProgress.getState().byLesson[lesson.id]
            const stepIndex = Math.min(p?.currentStep ?? 0, lesson.steps.length - 1)
            sink(type, { ...payload, lessonStep: lesson.steps[stepIndex]?.id ?? null })
        }
    }, [lesson, sink])

    const host = useMemo<IDEHost>(() => {
        const initialFiles = Object.fromEntries(
            Object.entries(lesson.files).map(([path, content]) => [workspacePath(path), content]),
        )
        return {
            workspace: {
                id: `lesson:${lesson.id}:r${resetNonce}`,
                initialFiles,
            },
            // Lessons run a stripped-down IDE: no activity bar / file
            // explorer (workspaces are 1–2 files, switched via editor tabs)
            // and no IDE wordmark (the lesson panel is the page identity).
            // Run/Debug/Tests, the debug panels and the status bar stay.
            chrome: { sidebar: false, brand: false },
            events: {
                includeRuntime: true,
                emit: (type, payload) => {
                    runtime.record(type, payload)
                    report(type, payload)
                },
            },
        }
    }, [lesson, resetNonce, runtime, report])

    // With the explorer hidden, every lesson file must be reachable through
    // the editor tabs — open them all once the VFS has seeded (the files
    // store updates at the end of every initVFS, for both the fresh-seed and
    // OPFS-rehydration paths). Primary file opens last so it's focused.
    useEffect(() => {
        const instance = ideRef.current
        if (!instance) return
        const paths = Object.keys(lesson.files).map(workspacePath)
        const primary = workspacePath(lesson.primaryFile)
        const openAll = (): boolean => {
            return instance.ensureFilesOpen(paths, primary)
        }
        if (openAll()) return
        const unsub = instance.subscribe(() => {
            if (openAll()) unsub()
        })
        return unsub
    }, [lesson, resetNonce])

    // Keep every lesson file reachable for the whole session: with the
    // explorer hidden, a closed tab would otherwise be gone until reload.
    // Closing a lesson tab quietly restores it (without stealing focus);
    // if the learner closes the LAST tab, the primary file takes focus so
    // the editor is never empty.
    useEffect(() => {
        const instance = ideRef.current
        if (!instance) return
        const paths = Object.keys(lesson.files).map(workspacePath)
        const primary = workspacePath(lesson.primaryFile)
        const ensureOpen = () => {
            instance.ensureFilesOpen(paths, primary)
        }
        return instance.subscribe(ensureOpen)
    }, [lesson])

    return (
        <div className="h-screen w-screen overflow-hidden">
            <ResizablePanelGroup orientation="horizontal" className="h-full">
                <ResizablePanel id="lesson" defaultSize="28" minSize="18" maxSize="42">
                    {/* The panel lives outside <App/>, so it needs its own
                        Radix tooltip provider. */}
                    <TooltipProvider delayDuration={300}>
                        <LessonPanel
                            lesson={lesson}
                            runtime={runtime}
                            report={report}
                            getIDEInstance={getIDEInstance}
                        />
                    </TooltipProvider>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="ide" defaultSize="74" minSize="40">
                    <IDEHostProvider host={host}>
                        <App ref={ideRef} />
                    </IDEHostProvider>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    )
}
