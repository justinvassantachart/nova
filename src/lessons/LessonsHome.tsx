// /learn — landing page for the guided lesson series. No account required;
// progress lives in localStorage. Cross-section links (sign-in, IDE) are
// hard <a> navigations so each document loads with the headers its route
// needs (the login route must NOT be cross-origin isolated; everything
// else must be).

import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Codicon } from '@/components/ui/codicon'
import { useAuth } from '@/shared/context/auth-context'
import { LESSONS } from './content'
import { useLessonProgress } from './progress-store'

export default function LessonsHome() {
    const { user, configured } = useAuth()
    const byLesson = useLessonProgress((s) => s.byLesson)

    const completedCount = LESSONS.filter((l) => byLesson[l.id]?.completedAt).length
    const anyProgress = LESSONS.some((l) => (byLesson[l.id]?.completedSteps.length ?? 0) > 0)
    const resume = LESSONS.find((l) => !byLesson[l.id]?.completedAt) ?? LESSONS[0]

    return (
        <div className="min-h-screen bg-background text-foreground overflow-y-auto">
            {/* Top bar */}
            <header className="border-b border-border bg-[var(--color-chrome)]">
                <div className="max-w-5xl mx-auto px-6 h-12 flex items-center gap-3">
                    <span className="font-bold text-sm tracking-[0.18em] select-none">
                        NOVA<span className="text-primary">·</span>LEARN
                    </span>
                    <div className="ml-auto flex items-center gap-4 text-xs">
                        <a href="/ide" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <Codicon name="code" size={13} /> Standalone IDE
                        </a>
                        {configured && (
                            user
                                ? <a href="/dashboard" className="text-muted-foreground hover:text-foreground">Dashboard</a>
                                : <a href="/login" className="text-muted-foreground hover:text-foreground">Sign in</a>
                        )}
                    </div>
                </div>
            </header>

            {/* Hero */}
            <div className="max-w-5xl mx-auto px-6 pt-12 pb-8">
                <h1 className="text-3xl font-bold tracking-tight">Learn to debug — for real</h1>
                <p className="mt-3 text-[15px] text-muted-foreground max-w-2xl leading-relaxed">
                    Six hands-on lessons inside a real C++ debugger that runs entirely in your
                    browser. Set breakpoints, step through live programs, watch the heap draw
                    itself — and practice the skill this decade demands:{' '}
                    <span className="text-foreground font-medium">debugging code an AI wrote for you</span>.
                </p>
                <p className="mt-2 text-[13px] text-muted-foreground">
                    No install, no account. Each step checks itself off as you do the real thing.
                </p>
                <div className="mt-5 flex items-center gap-4">
                    <Link
                        to={`/learn/${resume.slug}`}
                        className="inline-flex items-center gap-2 px-4 h-9 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
                    >
                        {anyProgress ? 'Continue learning' : 'Start lesson 1'}
                        <Codicon name="arrow-right" size={13} />
                    </Link>
                    {completedCount > 0 && (
                        <span className="text-[12px] text-muted-foreground">
                            {completedCount} of {LESSONS.length} lessons completed
                        </span>
                    )}
                </div>
            </div>

            {/* Lesson cards */}
            <div className="max-w-5xl mx-auto px-6 pb-10 grid gap-4 sm:grid-cols-2">
                {LESSONS.map((lesson, i) => {
                    const p = byLesson[lesson.id]
                    const done = !!p?.completedAt
                    const started = !done && (p?.completedSteps.length ?? 0) > 0
                    const stepCount = lesson.steps.length
                    const doneCount = p?.completedSteps.length ?? 0
                    return (
                        <Link
                            key={lesson.id}
                            to={`/learn/${lesson.slug}`}
                            className="group rounded-lg border border-border bg-[var(--color-chrome)] p-5 hover:border-primary transition-colors flex flex-col"
                        >
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="font-mono">Lesson {i + 1}</span>
                                <span>·</span>
                                <span>{lesson.minutes} min</span>
                                {done && (
                                    <span className="ml-auto flex items-center gap-1 text-emerald-500 font-medium">
                                        <Codicon name="pass-filled" size={12} /> Completed
                                    </span>
                                )}
                                {started && (
                                    <span className="ml-auto text-primary font-medium">
                                        {doneCount}/{stepCount} steps
                                    </span>
                                )}
                            </div>
                            <h2 className="mt-1.5 text-[16px] font-semibold group-hover:text-primary transition-colors">
                                {lesson.title}
                            </h2>
                            <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed flex-1">
                                {lesson.tagline}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {lesson.tags.map((t) => (
                                    <Badge
                                        key={t}
                                        variant={t === 'AI-generated code' ? 'default' : 'secondary'}
                                        className="text-[10px]"
                                    >
                                        {t}
                                    </Badge>
                                ))}
                            </div>
                            <div className="mt-4 text-[12px] font-medium text-primary flex items-center gap-1">
                                {done ? 'Review lesson' : started ? 'Continue' : 'Start lesson'}
                                <Codicon name="arrow-right" size={12} className="transition-transform group-hover:translate-x-0.5" />
                            </div>
                        </Link>
                    )
                })}
            </div>

            {/* Footer */}
            <footer className="border-t border-border">
                <div className="max-w-5xl mx-auto px-6 py-6 text-[12px] text-muted-foreground leading-relaxed">
                    <p>
                        Built on the open-source Nova IDE — a reusable React component with a
                        WebAssembly C++ toolchain and DAP debugger. The lesson engine drives the
                        IDE purely through its public host API, so you can embed the same guided
                        experience (or your own lessons) in any platform.
                    </p>
                </div>
            </footer>
        </div>
    )
}
