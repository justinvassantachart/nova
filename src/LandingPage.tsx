import { useAuth } from '@/shared/context/auth-context'

export default function LandingPage() {
    const { user, configured } = useAuth()

    return (
        <div className="h-full overflow-y-auto bg-background text-foreground">
            <header className="border-b border-border">
                <div className="mx-auto flex min-h-14 max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
                    <a href="/" className="text-sm font-semibold tracking-tight">
                        Web IDE
                    </a>
                    <nav className="ml-auto flex items-center gap-4 text-sm" aria-label="Main navigation">
                        <a href="/ide" className="text-muted-foreground hover:text-foreground">
                            Editor
                        </a>
                        <a href="/learn" className="text-muted-foreground hover:text-foreground">
                            Lessons
                        </a>
                        {configured && (
                            <a
                                href={user ? '/dashboard' : '/login'}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                {user ? 'Dashboard' : 'Sign in'}
                            </a>
                        )}
                    </nav>
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
                <section aria-labelledby="page-title">
                    <h1 id="page-title" className="text-3xl font-semibold tracking-tight">
                        Web IDE
                    </h1>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                        Write, run, test, and debug C++ programs in your browser.
                        No account is required for the editor or lessons.
                    </p>
                </section>

                <div className="mt-10 divide-y divide-border border-y border-border">
                    <a href="/ide" className="group block py-5">
                        <div className="flex items-baseline justify-between gap-4">
                            <h2 className="text-base font-semibold">Editor</h2>
                            <span className="text-sm text-muted-foreground group-hover:text-foreground">
                                Open
                            </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            Edit and run C++ files, use the debugger, inspect memory, and run tests.
                        </p>
                    </a>

                    <a href="/learn" className="group block py-5">
                        <div className="flex items-baseline justify-between gap-4">
                            <h2 className="text-base font-semibold">Lessons</h2>
                            <span className="text-sm text-muted-foreground group-hover:text-foreground">
                                View
                            </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            Ten lessons cover C++ syntax, debugging, memory, and linked lists.
                            Progress is stored in this browser.
                        </p>
                    </a>
                </div>

                {configured && (
                    <section className="mt-10 border-b border-border pb-8" aria-labelledby="classes-title">
                        <h2 id="classes-title" className="text-base font-semibold">Classes</h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            Sign in to create a class, join with an invite code, or work on an assignment.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                            {user ? (
                                <>
                                    <a href="/dashboard" className="underline decoration-border underline-offset-4 hover:decoration-foreground">
                                        Dashboard
                                    </a>
                                    <a href="/classes/new" className="text-muted-foreground hover:text-foreground">
                                        Create a class
                                    </a>
                                    <a href="/join" className="text-muted-foreground hover:text-foreground">
                                        Join a class
                                    </a>
                                </>
                            ) : (
                                <a href="/login" className="underline decoration-border underline-offset-4 hover:decoration-foreground">
                                    Sign in
                                </a>
                            )}
                        </div>
                    </section>
                )}
            </main>
        </div>
    )
}
