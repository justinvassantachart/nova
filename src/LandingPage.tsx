import { useSyncExternalStore } from 'react'
import './landing.css'

const repository = 'https://github.com/justinvassantachart/web-ide'
const desktopQuery = '(min-width: 701px)'
const isDesktop = () => window.matchMedia(desktopQuery).matches
const subscribeViewport = (onChange: () => void) => {
    const query = window.matchMedia(desktopQuery)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
}

export default function LandingPage() {
    const desktop = useSyncExternalStore(subscribeViewport, isDesktop)
    return (
        <div className="landing-page">
            <a className="landing-skip" href="#main">Skip to content</a>
            <header className="landing-header landing-container">
                <a className="landing-wordmark" href="/" aria-label="web-ide home">web-ide<span aria-hidden="true">_</span></a>
                <nav aria-label="Main navigation">
                    <a href="/learn">Lessons</a>
                    <a href="#teaching">For educators</a>
                    <a href={repository}>GitHub <span aria-hidden="true">↗</span></a>
                </nav>
            </header>

            <main id="main" className="landing-container">
                <section className="landing-hero" aria-labelledby="page-title">
                    <p className="landing-eyebrow">C++ · In your browser · No installation</p>
                    <h1 id="page-title">See what your code is doing.</h1>
                    <p className="landing-intro">A full C++ workspace, with a clear view of memory.<br />Write, run, test, and follow every pointer.</p>
                    <div className="landing-actions">
                        <a className="landing-primary" href="/ide?example=linked-list">Open the IDE <span aria-hidden="true">↗</span></a>
                        <a className="landing-secondary" href="/learn">Explore ten lessons <span aria-hidden="true">→</span></a>
                    </div>
                </section>

                <section className="landing-workbench" aria-label="Try the C++ IDE">
                    <div className="landing-workbench-heading">
                        <a href="/ide?example=linked-list">Open full screen <span aria-hidden="true">↗</span></a>
                        {desktop && <p className="landing-debug-prompt">Click <strong>Debug</strong> to begin.</p>}
                    </div>
                    {desktop ? <div className="landing-workspace">
                        <iframe src="/showcase" title="Live, editable C++ linked-list workspace" allow="cross-origin-isolated" />
                    </div> : <div className="landing-mobile-preview">
                        <a href="/ide?example=linked-list"><img src="/debugger-demo.png" width="1440" height="820" loading="lazy" alt="The C++ debugger paused on a linked list, with source code and a graph of pointers to three heap nodes." /></a>
                    </div>}
                    <p className="landing-workbench-caption">{desktop
                        ? 'Use Step Over to build the list and follow its pointers. Fit brings every node into view.'
                        : 'The linked-list debugger in action. Open the IDE to edit and run this example.'}</p>
                </section>

                <section className="landing-features" aria-label="Inside the IDE">
                    <div>
                        <span className="landing-feature-index">01 / EXECUTION</span>
                        <h2>Follow every step.</h2>
                        <p>Set breakpoints and inspect variables and the call stack. Step through your code, then revisit recorded states to see where things changed.</p>
                    </div>
                    <div>
                        <span className="landing-feature-index">02 / MEMORY</span>
                        <h2>See the connections.</h2>
                        <p>Explore stack frames and heap objects in a memory graph. Follow pointer arrows, rearrange nodes, and zoom into a data structure.</p>
                    </div>
                    <div>
                        <span className="landing-feature-index">03 / REAL PROGRAMS</span>
                        <h2>Test your understanding.</h2>
                        <p>Work across source files and headers, use terminal input and output, and run unit tests. Optional clangd adds code intelligence.</p>
                    </div>
                </section>

                <section className="landing-section landing-teaching" id="teaching" aria-labelledby="teaching-title">
                    <div>
                        <p className="landing-eyebrow">Make it part of your course</p>
                        <h2 id="teaching-title">A workspace for learning<br />how programs work.</h2>
                    </div>
                    <div className="landing-teaching-body">
                        <p>Start with ten self-paced lessons, from Python to C++ and linked lists. Each one pairs a small program with a reason to reach for the debugger.</p>
                        <p>Create a class and bring your own assignments, or import the IDE component into your own course site or LMS.</p>
                        <div className="landing-resource-links">
                            <a href={`${repository}/blob/main/docs/teaching.md`}>Instructor guide <span aria-hidden="true">↗</span></a>
                            <a href={`${repository}/blob/main/docs/self-hosting.md`}>Self-hosting <span aria-hidden="true">↗</span></a>
                            <a href={`${repository}/blob/main/docs/import-ide-component.md`}>Import IDE component <span aria-hidden="true">↗</span></a>
                        </div>
                    </div>
                </section>

                <section className="landing-details" aria-label="Practical details">
                    <details>
                        <summary>What runs locally?</summary>
                        <p>The C++ compiler, your program, and the debugger run in your browser using WebAssembly. The first run downloads the toolchain. No account is needed for the IDE or lessons. Anonymous lesson work is saved on this device; signed-in classroom features save assignments, submissions, and session events to a server.</p>
                    </details>
                    <details>
                        <summary>What does stepping backward do?</summary>
                        <p>It displays earlier snapshots of the variables and memory graph captured while debugging. This history is capped; viewing a previous state does not rewind program execution or terminal input and output.</p>
                    </details>
                </section>
            </main>

            <footer className="landing-footer landing-container">
                <a className="landing-wordmark" href="/">web-ide<span aria-hidden="true">_</span></a>
                <span>Write. Run. Understand.</span>
                <a href={repository}>Source code <span aria-hidden="true">↗</span></a>
            </footer>
        </div>
    )
}
