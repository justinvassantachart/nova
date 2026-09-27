import { useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Code2, GitBranch, Play, RotateCcw, StepForward, Terminal, TestTube2 } from 'lucide-react'
import { useAuth } from '@/shared/context/auth-context'
import { LESSONS } from '@/lessons/content'
import { useLessonProgress } from '@/lessons/progress-store'
import './landing.css'

const SITE_SOURCE = 'https://github.com/justinvassantachart/nova'
const IDE_SOURCE = 'https://github.com/justinvassantachart/web-ide'
const LESSON_MINUTES = LESSONS.map((lesson) => lesson.minutes)
const CHAPTERS = [
    { title: 'Find your footing', subtitle: 'From Python to C++', start: 0, end: 4 },
    { title: 'Make memory visible', subtitle: 'Pointers, allocation & structs', start: 4, end: 7 },
    { title: 'Connect the pieces', subtitle: 'Build, test & debug linked lists', start: 7, end: 10 },
]

// An illustrative trace, independent of the compiler. The full exercise is lesson 8.
const TRACE = [
    { total: 0, node: 0, message: 'Start at the head. The total is 0.' },
    { total: 10, node: 1, message: 'Add 10, then follow next to the second node.' },
    { total: 30, node: 2, message: 'Add 20, then follow next to the last node.' },
    { total: 60, node: null, message: 'Add 30. current is now nullptr, so the loop ends.' },
]

function DebugPreview() {
    const [step, setStep] = useState(0)
    const state = TRACE[step]
    const finished = step === TRACE.length - 1

    return (
        <figure className="debug-preview" aria-label="Interactive example of traversing a linked list">
            <div className="preview-topbar">
                <span><span className="preview-dot" /> A little look inside</span>
                <span className="preview-language">C++</span>
            </div>
            <div className="preview-file"><Code2 size={14} aria-hidden="true" /> traversal.cpp <span>Illustrative trace</span></div>
            <pre className="preview-code" aria-label="C++ code: while current is not null, add its value to total and advance to the next node.">
                <code>
                    <span><i>1</i><b>int</b> total = <em>0</em>;</span>
                    <span className={finished ? 'code-active' : ''}><i>2</i><b>while</b> (current != <b>nullptr</b>) {'{'}</span>
                    <span className={!finished ? 'code-active' : ''}><i>3</i>{'    '}total += current-&gt;value;</span>
                    <span><i>4</i>{'    '}current = current-&gt;next;</span>
                    <span><i>5</i>{'}'}</span>
                </code>
            </pre>
            <div className="preview-memory">
                <div className="preview-label"><GitBranch size={13} aria-hidden="true" /> MEMORY <span>total <strong>{state.total}</strong></span></div>
                <div className="memory-nodes" aria-label={`current points to ${state.node === null ? 'nullptr' : `node ${state.node + 1}`}`}>
                    {[10, 20, 30].map((value, index) => (
                        <div className="memory-link" key={value}>
                            <div className={`memory-node ${state.node === index ? 'node-current' : ''}`}>
                                <span className="node-pointer">{state.node === index ? 'current' : '\u00a0'}</span>
                                <strong>{value}</strong><span>next</span>
                            </div>
                            <ArrowRight size={20} aria-hidden="true" />
                        </div>
                    ))}
                    <span className={`memory-null ${finished ? 'null-current' : ''}`}>nullptr</span>
                </div>
                <p className="trace-message" aria-live="polite" aria-atomic="true">{state.message}</p>
            </div>
            <div className="preview-controls">
                <span>{finished ? 'Traversal complete' : `Iteration ${step + 1} of 3`}</span>
                <div>
                    <button type="button" className="trace-reset" onClick={() => setStep(0)} aria-label="Reset traversal" disabled={step === 0}><RotateCcw size={15} /></button>
                    <button type="button" className="trace-step" onClick={() => setStep(step + 1)} disabled={finished}><StepForward size={15} aria-hidden="true" /> Next iteration</button>
                </div>
            </div>
            <figcaption><a className="preview-lesson" href="/learn/building-linked-lists">Try the real debugger in lesson 8 <ArrowUpRight size={14} aria-hidden="true" /></a></figcaption>
        </figure>
    )
}

export default function LandingPage() {
    const { user, configured } = useAuth()
    const byLesson = useLessonProgress((state) => state.byLesson)
    const completedCount = LESSONS.filter((lesson) => byLesson[lesson.id]?.completedAt).length
    const started = LESSONS.some((lesson) => (byLesson[lesson.id]?.completedSteps.length ?? 0) > 0)
    const resume = LESSONS.find((lesson) => !byLesson[lesson.id]?.completedAt) ?? LESSONS[0]
    const courseComplete = completedCount === LESSONS.length

    return (
        <div className="landing-page">
            <a className="landing-skip" href="#main">Skip to content</a>
            <header className="landing-header">
                <div className="landing-container landing-nav">
                    <a href="/" className="landing-brand" aria-label="Web IDE home"><span className="brand-symbol"><Code2 size={21} aria-hidden="true" /></span> web<span>ide</span><span className="brand-period">.</span></a>
                    <nav aria-label="Main navigation">
                        <a href="#lessons">Lessons</a>
                        <a href="#educators">For educators</a>
                        <a href={IDE_SOURCE} className="nav-source">Source <ArrowUpRight size={12} aria-hidden="true" /></a>
                        {configured && <a href={user ? '/dashboard' : '/login'}>{user ? 'Dashboard' : 'Sign in'}</a>}
                    </nav>
                    <a className="landing-button button-small button-outline nav-editor" href="/ide">Open editor <ArrowUpRight size={15} aria-hidden="true" /></a>
                </div>
            </header>

            <main id="main">
                <section className="landing-container landing-hero" aria-labelledby="page-title">
                    <div className="hero-copy">
                        <p className="landing-eyebrow"><span /> YOUR BROWSER. YOUR C++ LAB.</p>
                        <h1 id="page-title">Learn to debug.<br /><span>Understand<br className="hero-break" /> your code.</span></h1>
                        <p className="hero-description">Go from reading code to seeing how it works. Write, run, and debug C++ in your browser, with guided lessons that make every pointer and bug a little less mysterious.</p>
                        <div className="hero-actions">
                            <a className="landing-button button-primary" href={courseComplete ? '/learn' : `/learn/${resume.slug}`}>
                                {courseComplete ? 'Revisit the lessons' : started ? 'Continue learning' : 'Start learning'} <ArrowRight size={17} aria-hidden="true" />
                            </a>
                            <a className="landing-button button-outline" href="/ide"><Play size={15} aria-hidden="true" /> Explore the editor</a>
                        </div>
                        <p className="hero-note"><Check size={14} aria-hidden="true" /> No installation. No account needed.</p>
                    </div>
                    <DebugPreview />
                </section>

                <div className="landing-container course-facts" aria-label="Course overview">
                    <div><strong>{LESSONS.length}</strong><span>self-paced lessons</span></div>
                    <div><strong>{Math.min(...LESSON_MINUTES)}–{Math.max(...LESSON_MINUTES)} <small>min</small></strong><span>per lesson, at your pace</span></div>
                    <div><strong>100% <small>in-browser</small></strong><span>compilation & execution</span></div>
                    <a href="#lessons">Meet your next lesson <ArrowDown size={16} aria-hidden="true" /></a>
                </div>

                <section id="lessons" className="landing-container landing-lessons" aria-labelledby="lessons-title">
                    <div className="section-heading">
                        <div><p className="landing-eyebrow">THE LEARNING PATH</p><h2 id="lessons-title">Small lessons. Real understanding.</h2></div>
                        <p>Know a little Python? Start here.<br />Build up to C++ pointers, memory, and linked lists.</p>
                    </div>
                    <div className="course-toolbar">
                        <span><span className="course-status-dot" /> {completedCount > 0 ? `${completedCount} of ${LESSONS.length} lessons completed` : 'Start at the beginning, or jump into a topic.'}</span>
                        <a href="/learn">Your lesson dashboard <ArrowUpRight size={14} aria-hidden="true" /></a>
                    </div>
                    <div className="chapter-grid">
                        {CHAPTERS.map((chapter, chapterIndex) => (
                            <section className="course-chapter" key={chapter.title} aria-labelledby={`chapter-${chapterIndex}`}>
                                <div className="chapter-heading"><span>0{chapterIndex + 1}</span><div><p>{chapter.subtitle}</p><h3 id={`chapter-${chapterIndex}`}>{chapter.title}</h3></div></div>
                                <ol start={chapter.start + 1}>
                                    {LESSONS.slice(chapter.start, chapter.end).map((lesson, index) => {
                                        const done = Boolean(byLesson[lesson.id]?.completedAt)
                                        return (
                                            <li key={lesson.id}>
                                                <a href={`/learn/${lesson.slug}`} className="lesson-link">
                                                    <span className={`lesson-number ${done ? 'lesson-complete' : ''}`}>{done ? <Check size={14} aria-label="Completed" /> : String(chapter.start + index + 1).padStart(2, '0')}</span>
                                                    <div><h4>{lesson.title}</h4><p>{lesson.tagline}</p><span className="lesson-duration">{lesson.minutes} min {done && '· Completed'}</span></div>
                                                    <ArrowUpRight className="lesson-arrow" size={15} aria-hidden="true" />
                                                </a>
                                            </li>
                                        )
                                    })}
                                </ol>
                            </section>
                        ))}
                    </div>
                    <p className="course-footnote">Each lesson pairs short explanations with code, a debugging exercise, and completion checks. Your progress is saved in this browser.</p>
                </section>

                <section className="landing-tools" aria-labelledby="tools-title">
                    <div className="landing-container">
                        <div className="section-heading"><div><p className="landing-eyebrow">MORE THAN A RUN BUTTON</p><h2 id="tools-title">See the why behind the output.</h2></div><a className="text-link" href="/ide">Meet the workbench <ArrowRight size={17} aria-hidden="true" /></a></div>
                        <div className="tool-grid">
                            <article><StepForward size={24} aria-hidden="true" /><h3>Follow every step</h3><p>Set a breakpoint, inspect variables and stack frames, and step forward or back through recorded states.</p></article>
                            <article><GitBranch size={24} aria-hidden="true" /><h3>Put memory on the map</h3><p>Follow pointers through a visual memory graph. See how stack variables and heap objects connect as your program runs.</p></article>
                            <article><TestTube2 size={24} aria-hidden="true" /><h3>Turn a failing test into a clue</h3><p>Run unit tests alongside your code, investigate what went wrong, and check your fix in the same workspace.</p></article>
                        </div>
                        <div className="tools-detail"><Terminal size={17} aria-hidden="true" /><span>A full workspace with multiple files, terminal input and output, and optional C++ code intelligence.</span></div>
                    </div>
                </section>

                <section id="educators" className="landing-container landing-educators" aria-labelledby="educators-title">
                    <div className="educator-copy"><p className="landing-eyebrow">BUILT FOR LEARNING. OPEN TO BUILD ON.</p><h2 id="educators-title">Bring the debugger<br />into your classroom.</h2><p>Share a lesson link for a quick exercise, create a class with your own assignments, or embed the open-source workbench in your teaching tools.</p><div className="educator-actions"><a className="landing-button button-primary" href={`${SITE_SOURCE}/blob/main/docs/teaching-guide.md`}>Read the teaching guide <ArrowUpRight size={16} aria-hidden="true" /></a>{configured && <a className="text-link" href={user ? '/classes/new' : '/login'}>Create a class <ArrowRight size={16} aria-hidden="true" /></a>}</div></div>
                    <div className="resource-list">
                        <a href={`${SITE_SOURCE}#deployment-notes`}><span>01</span><div><h3>Host your own</h3><p>Deploy the site with your own classroom setup.</p></div><ArrowUpRight size={18} aria-hidden="true" /></a>
                        <a href={IDE_SOURCE}><span>02</span><div><h3>Embed Web IDE</h3><p>A React workbench with public runtime and host APIs.</p></div><ArrowUpRight size={18} aria-hidden="true" /></a>
                        <a href={SITE_SOURCE}><span>03</span><div><h3>Explore the source</h3><p>See how the lessons and teaching platform are built.</p></div><ArrowUpRight size={18} aria-hidden="true" /></a>
                    </div>
                </section>
            </main>

            <footer className="landing-footer"><div className="landing-container"><a href="/" className="footer-brand"><Code2 size={19} aria-hidden="true" /> Web IDE</a><p>Less setup. More understanding.</p><nav aria-label="Footer navigation"><a href="/learn">Lessons</a><a href="/ide">Editor</a><a href={IDE_SOURCE}>GitHub <ArrowUpRight size={12} aria-hidden="true" /></a></nav></div></footer>
        </div>
    )
}
