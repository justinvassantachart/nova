// The guided-lesson side panel: renders the active step's instructions,
// evaluates its completion check live against the IDE's state, and gates
// step navigation on (sticky) completion. Pure host-side UI — it never
// reaches into IDE components, only the public instance facade and lesson runtime.

import { useEffect, useRef } from 'react'
import type { WebIDEInstanceHandle } from 'web-ide'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Lesson } from './types'
import { workspacePath } from './types'
import { LESSONS, nextLesson } from './content'
import { useLessonProgress } from './progress-store'
import { useStepCheck } from './use-step-check'
import { MarkdownLite } from './markdown'
import type { LessonRuntime } from './runtime'

export function LessonPanel({ lesson, runtime, report, getIDEInstance }: {
    lesson: Lesson
    runtime: LessonRuntime
    // Telemetry channel (see LessonRunner): lesson-level events join the
    // same recorded trace as the IDE's debugger/editor events.
    report: (type: string, payload: Record<string, unknown>) => void
    getIDEInstance: () => WebIDEInstanceHandle | null
}) {
    const navigate = useNavigate()
    const progress = useLessonProgress((s) => s.byLesson[lesson.id]) ?? {
        currentStep: 0, completedSteps: [], resetNonce: 0,
    }
    const { setCurrentStep, markStepComplete, markLessonComplete, resetLesson } = useLessonProgress()

    const stepIndex = Math.min(progress.currentStep, lesson.steps.length - 1)
    const step = lesson.steps[stepIndex]
    const isLast = stepIndex === lesson.steps.length - 1
    const lessonNumber = LESSONS.findIndex((l) => l.id === lesson.id) + 1
    const following = nextLesson(lesson)

    const result = useStepCheck(step.check, lesson, runtime, getIDEInstance)
    const stickyDone = progress.completedSteps.includes(step.id)
    const passed = stickyDone || result.passed
    const isManual = step.check.kind === 'manual'

    // Sticky completion: record the first moment a check passes so transient
    // debugger states (a pause, a mid-loop value) can't "un-complete" a step.
    useEffect(() => {
        if (result.passed && !stickyDone && !isManual) {
            markStepComplete(lesson.id, step.id)
            report('lesson_step_complete', { stepId: step.id, checkKind: step.check.kind })
        }
    }, [result.passed, stickyDone, isManual, lesson.id, step, markStepComplete, report])

    const completedCount = lesson.steps.filter((s) => progress.completedSteps.includes(s.id)).length

    // Scroll back to the instructions when the step changes.
    const bodyRef = useRef<HTMLDivElement>(null)
    useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }) }, [stepIndex])

    const goTo = (i: number) => {
        report('lesson_step_navigate', { toStep: lesson.steps[i]?.id, toIndex: i })
        setCurrentStep(lesson.id, i)
    }
    const advance = () => {
        // Manual steps complete on Next; checked steps are already complete.
        if (!stickyDone) markStepComplete(lesson.id, step.id)
        if (isLast) {
            markLessonComplete(lesson.id)
            report('lesson_complete', { lessonId: lesson.id })
            navigate(following ? `/learn/${following.slug}` : '/learn')
        } else {
            goTo(stepIndex + 1)
        }
    }

    const handleReset = () => {
        if (!window.confirm('Reset this lesson? Your code edits and step progress will be cleared.')) return
        report('lesson_reset', { lessonId: lesson.id })
        // Fresh OPFS namespace (via resetNonce in the host's assignmentId),
        // fresh debugger state, fresh runtime counters.
        getIDEInstance()?.reset({
            breakpointFiles: Object.keys(lesson.files).map(workspacePath),
        })
        runtime.reset()
        resetLesson(lesson.id)
    }

    // The furthest step the learner may jump to: one past the last completed.
    const maxReachable = lesson.steps.findIndex((s) => !progress.completedSteps.includes(s.id))
    const reachableLimit = maxReachable === -1 ? lesson.steps.length - 1 : maxReachable

    return (
        <div className="flex flex-col h-full bg-background border-r border-border">
            {/* Header */}
            <div className="px-4 pt-3 pb-2 border-b border-border bg-[var(--color-chrome)]">
                <div className="flex items-center justify-between">
                    <Link
                        to="/learn"
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                        <Codicon name="arrow-left" size={11} />
                        All lessons
                    </Link>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-xs" onClick={handleReset} aria-label="Reset lesson">
                                <Codicon name="discard" size={12} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Reset code & progress</TooltipContent>
                    </Tooltip>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Lesson {lessonNumber} of {LESSONS.length}
                </div>
                <h1 className="text-sm font-semibold text-foreground leading-snug">{lesson.title}</h1>

                {/* Step strip */}
                <div className="flex flex-wrap gap-1 mt-2.5 mb-1">
                    {lesson.steps.map((s, i) => {
                        const done = progress.completedSteps.includes(s.id)
                        const current = i === stepIndex
                        const reachable = i <= reachableLimit
                        return (
                            <button
                                key={s.id}
                                onClick={() => reachable && goTo(i)}
                                disabled={!reachable}
                                title={s.title}
                                // Completed steps render only a check glyph, so
                                // give the button a real accessible name (title
                                // alone is unreliable on buttons for AT).
                                aria-label={`Step ${i + 1}: ${s.title}${done ? ' (done)' : ''}`}
                                aria-current={current ? 'step' : undefined}
                                className={[
                                    'w-5 h-5 rounded-full text-[10px] font-medium flex items-center justify-center transition-colors',
                                    current ? 'ring-2 ring-primary/80 ring-offset-2 ring-offset-[var(--color-chrome)]' : '',
                                    done
                                        ? 'bg-primary text-primary-foreground'
                                        : reachable
                                            ? 'bg-background border border-border text-foreground hover:border-primary'
                                            : 'bg-background border border-border/60 text-muted-foreground/40 cursor-default',
                                ].join(' ')}
                            >
                                {done ? <Codicon name="check" size={10} /> : i + 1}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Step body */}
            <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Step {stepIndex + 1} of {lesson.steps.length}
                </div>
                <h2 className="text-[15px] font-semibold text-foreground mt-0.5 mb-1">{step.title}</h2>
                <MarkdownLite text={step.body} />

                {/* Live task checklist (checked steps only) */}
                {!isManual && (
                    <div className="mt-3 rounded-md border border-border overflow-hidden">
                        <div className="px-3 py-1.5 bg-[var(--color-chrome)] text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                            Your task
                        </div>
                        <ul className="px-3 py-2 space-y-1.5">
                            {result.parts.map((part, i) => {
                                const partDone = stickyDone || part.passed
                                return (
                                    <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug">
                                        <Codicon
                                            name={partDone ? 'pass-filled' : 'circle-large-outline'}
                                            size={14}
                                            className={partDone ? 'text-emerald-500 mt-px' : 'text-muted-foreground mt-px'}
                                        />
                                        <span className={partDone ? 'text-muted-foreground line-through decoration-border' : 'text-foreground'}>
                                            <MarkdownInline text={part.label} />
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                )}

                {/* Hint */}
                {step.hint && !passed && (
                    <details
                        className="mt-3 group"
                        onToggle={(e) => {
                            if ((e.target as HTMLDetailsElement).open) {
                                report('lesson_hint_open', { stepId: step.id })
                            }
                        }}
                    >
                        <summary className="cursor-pointer select-none text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 list-none">
                            <Codicon name="lightbulb" size={13} className="text-amber-500" />
                            <span className="underline decoration-dotted underline-offset-2">Show hint</span>
                        </summary>
                        <div className="mt-1.5 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-[12.5px] leading-relaxed text-foreground/90">
                            {step.hint}
                        </div>
                    </details>
                )}

                {/* Success banner */}
                {passed && !isManual && (
                    <div className="mt-3 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2">
                        <Codicon name="pass-filled" size={14} className="text-emerald-500 mt-0.5" />
                        <div className="text-[12.5px] leading-snug text-foreground/90">
                            {step.successNote ?? 'Step complete.'}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer nav */}
            <div className="px-4 py-2.5 border-t border-border bg-[var(--color-chrome)] flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={stepIndex === 0}
                    onClick={() => goTo(stepIndex - 1)}
                    className="gap-1"
                >
                    <Codicon name="chevron-left" size={12} /> Back
                </Button>
                <div className="flex-1 text-center text-[10px] text-muted-foreground">
                    {completedCount}/{lesson.steps.length} done
                </div>
                <Button
                    size="xs"
                    disabled={!passed}
                    onClick={advance}
                    className="gap-1"
                >
                    {isLast
                        ? following ? `Next lesson` : 'Finish'
                        : 'Next'}
                    <Codicon name="chevron-right" size={12} />
                </Button>
            </div>
        </div>
    )
}

// Inline-only markdown for checklist labels (backtick code spans).
function MarkdownInline({ text }: { text: string }) {
    const parts = text.split(/(`[^`]+`)/g)
    return (
        <>
            {parts.map((p, i) =>
                p.startsWith('`') && p.endsWith('`')
                    ? (
                        <code key={i} className="px-1 rounded bg-[var(--color-chrome)] border border-border font-mono text-[0.85em]">
                            {p.slice(1, -1)}
                        </code>
                    )
                    : <span key={i}>{p}</span>,
            )}
        </>
    )
}
