// /learn — lesson index. No account is required; progress lives in
// localStorage. Cross-section links are hard navigations so each document
// loads with the security headers its route needs.

import { Link } from 'react-router-dom'
import { useAuth } from '@/shared/context/auth-context'
import { LESSONS } from './content'
import { useLessonProgress } from './progress-store'

export default function LessonsHome() {
    const { user, configured } = useAuth()
    const byLesson = useLessonProgress((s) => s.byLesson)

    const completedCount = LESSONS.filter((lesson) => byLesson[lesson.id]?.completedAt).length
    const anyProgress = LESSONS.some(
        (lesson) => (byLesson[lesson.id]?.completedSteps.length ?? 0) > 0,
    )
    const resume = LESSONS.find((lesson) => !byLesson[lesson.id]?.completedAt) ?? LESSONS[0]

    return (
        <div className="h-full overflow-y-auto bg-background text-foreground">
            <header className="border-b border-border">
                <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-4 px-6 py-3">
                    <a href="/" className="text-sm font-semibold tracking-tight">
                        Lessons
                    </a>
                    <nav className="ml-auto flex items-center gap-4 text-sm" aria-label="Lesson navigation">
                        <a href="/ide" className="text-muted-foreground hover:text-foreground">
                            Editor
                        </a>
                        {configured && (
                            user
                                ? <a href="/dashboard" className="text-muted-foreground hover:text-foreground">Dashboard</a>
                                : <a href="/login" className="text-muted-foreground hover:text-foreground">Sign in</a>
                        )}
                    </nav>
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-6 py-10 sm:py-12">
                <section aria-labelledby="lessons-title">
                    <h1 id="lessons-title" className="text-2xl font-semibold tracking-tight">
                        C++ lessons for Python students
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                        Ten lessons cover C++ syntax, types, functions, vectors, pointers,
                        memory, structs, and linked lists. Each lesson includes a short
                        exercise using the editor, debugger, or tests.
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        No account is required. Progress is stored in this browser.
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-4">
                        <Link
                            to={`/learn/${resume.slug}`}
                            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
                        >
                            {anyProgress ? 'Continue' : 'Start with lesson 1'}
                        </Link>
                        {completedCount > 0 && (
                            <span className="text-sm text-muted-foreground">
                                {completedCount} of {LESSONS.length} completed
                            </span>
                        )}
                    </div>
                </section>

                <section className="mt-10" aria-labelledby="lesson-list-title">
                    <h2 id="lesson-list-title" className="text-sm font-semibold">
                        Lesson list
                    </h2>
                    <ol className="mt-3 divide-y divide-border border-y border-border">
                        {LESSONS.map((lesson, index) => {
                            const progress = byLesson[lesson.id]
                            const done = Boolean(progress?.completedAt)
                            const doneCount = progress?.completedSteps.length ?? 0
                            const started = !done && doneCount > 0

                            return (
                                <li key={lesson.id}>
                                    <Link
                                        to={`/learn/${lesson.slug}`}
                                        className="group block py-5"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="text-xs text-muted-foreground">
                                                Lesson {index + 1} · {lesson.minutes} min
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {done
                                                    ? 'Completed'
                                                    : started
                                                        ? `${doneCount}/${lesson.steps.length} steps`
                                                        : 'Not started'}
                                            </div>
                                        </div>
                                        <h3 className="mt-1 text-base font-semibold group-hover:underline">
                                            {lesson.title}
                                        </h3>
                                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                            {lesson.tagline}
                                        </p>
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            Topics: {lesson.tags.join(', ')}
                                        </p>
                                    </Link>
                                </li>
                            )
                        })}
                    </ol>
                </section>
            </main>
        </div>
    )
}
