import { useAuth } from '@/shared/context/auth-context'

const capabilities = [
    {
        title: 'Build and run',
        description: 'Compile C++ to WebAssembly and run it without installing a local toolchain.',
    },
    {
        title: 'Debug step by step',
        description: 'Set breakpoints, move through each line, and inspect variables as the program runs.',
    },
    {
        title: 'Understand what changed',
        description: 'See stack and heap state, follow pointers, and run focused tests in the same workspace.',
    },
]

export default function LandingPage() {
    const { user, configured } = useAuth()

    return (
        <div className="h-full overflow-y-auto bg-background text-foreground">
            <header className="border-b border-border bg-background">
                <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
                    <a href="/" className="text-sm font-semibold tracking-tight">
                        Web IDE
                    </a>
                    <nav className="ml-auto flex items-center gap-4 text-sm" aria-label="Main navigation">
                        <a href="/ide" className="text-muted-foreground transition-colors hover:text-foreground">
                            Editor
                        </a>
                        <a href="/learn" className="text-muted-foreground transition-colors hover:text-foreground">
                            Lessons
                        </a>
                        {configured && (
                            <a
                                href={user ? '/dashboard' : '/login'}
                                className="text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {user ? 'Dashboard' : 'Sign in'}
                            </a>
                        )}
                    </nav>
                </div>
            </header>

            <main>
                <section className="mx-auto max-w-5xl px-6 pb-16 pt-20 sm:pb-20 sm:pt-28">
                    <div className="max-w-3xl">
                        <p className="mb-4 text-sm font-medium text-primary">C++ in the browser</p>
                        <h1 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-6xl">
                            Write, run, and debug C++ without leaving your browser.
                        </h1>
                        <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                            Web IDE is a focused coding workspace with compilation, breakpoints,
                            memory inspection, and tests. There is nothing to install, and the
                            standalone editor does not require an account.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center gap-4">
                            <a
                                href="/ide"
                                className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                                Open Web IDE
                            </a>
                            <a
                                href="/learn"
                                className="text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                            >
                                Try the guided lessons
                            </a>
                        </div>
                    </div>
                </section>

                <section className="border-y border-border bg-[var(--color-chrome)]">
                    <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12 sm:grid-cols-3 sm:py-14">
                        {capabilities.map((capability) => (
                            <div key={capability.title}>
                                <h2 className="text-sm font-semibold">{capability.title}</h2>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                    {capability.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mx-auto max-w-5xl px-6 py-14 sm:py-16">
                    <div className="max-w-2xl">
                        <h2 className="text-2xl font-semibold tracking-tight">Learn with the same tools</h2>
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            Ten guided lessons introduce C++ through short programs, tests, and
                            debugger exercises. Lesson progress stays in this browser, and no
                            account is required.
                        </p>
                        <a
                            href="/learn"
                            className="mt-5 inline-flex text-sm font-medium text-primary hover:underline"
                        >
                            View all lessons
                        </a>
                    </div>
                </section>

                {configured && (
                    <section className="border-t border-border">
                        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
                            <div className="max-w-xl">
                                <h2 className="text-base font-semibold">Using Web IDE with a class?</h2>
                                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                    Teachers can share assignments, and students can submit work with
                                    a class invite code.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium">
                                {user ? (
                                    <>
                                        <a href="/dashboard" className="text-primary hover:underline">Open dashboard</a>
                                        <a href="/classes/new" className="text-muted-foreground hover:text-foreground">Create a class</a>
                                        <a href="/join" className="text-muted-foreground hover:text-foreground">Join a class</a>
                                    </>
                                ) : (
                                    <a href="/login" className="text-primary hover:underline">Sign in for classes</a>
                                )}
                            </div>
                        </div>
                    </section>
                )}
            </main>

            <footer className="border-t border-border">
                <div className="mx-auto flex max-w-5xl flex-col gap-1 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium text-foreground">Web IDE</span>
                    <span>A browser-based C++ workspace for learning and teaching.</span>
                </div>
            </footer>
        </div>
    )
}
