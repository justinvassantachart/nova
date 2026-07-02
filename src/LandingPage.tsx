import { Link } from 'react-router-dom'
import { Codicon } from '@/components/ui/codicon'
import { useAuth } from '@/shared/context/auth-context'

// ---------------------------------------------------------------------------
// IDE panel mockups — faithful recreations of the actual panel UI
// ---------------------------------------------------------------------------

function GraphMockup() {
    return (
        <div
            className="relative overflow-hidden rounded-lg border border-border bg-background"
            style={{ height: 260 }}
        >
            {/* dot grid */}
            <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="1" fill="currentColor" className="text-muted-foreground" />
                </pattern>
                <rect width="100%" height="100%" fill="url(#dots)" />
            </svg>

            {/* Arrow SVG */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="oklch(0.75 0.12 230)" />
                    </marker>
                    <marker id="arrowhead2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="oklch(0.75 0.12 230)" />
                    </marker>
                </defs>
                {/* head → Node1 */}
                <line x1="182" y1="95" x2="258" y2="83" stroke="oklch(0.75 0.12 230)" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
                {/* Node1.next → Node2 */}
                <line x1="370" y1="90" x2="430" y2="155" stroke="oklch(0.75 0.12 230)" strokeWidth="1.5" markerEnd="url(#arrowhead2)" />
            </svg>

            {/* Stack frame: main */}
            <div className="absolute rounded-md border border-primary shadow-2xl bg-card overflow-hidden" style={{ left: 24, top: 50, width: 180 }}>
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary rounded-t-md" />
                <div className="px-3 py-1.5 bg-[var(--color-chrome)] border-b border-border flex justify-between items-center">
                    <span className="text-foreground font-bold text-[10px] font-mono uppercase tracking-wider">main</span>
                    <span className="bg-primary text-primary-foreground text-[8px] px-1.5 rounded-sm font-bold tracking-wider">PAUSED</span>
                </div>
                <div className="flex border-t border-border/60">
                    <div className="w-[45%] py-1 px-2 border-r border-border/60 font-mono text-[10px] text-muted-foreground">head</div>
                    <div className="w-[55%] py-1 px-2 font-mono text-[10px] text-[var(--color-accent-pointer)] flex items-center justify-between">
                        0x1a2b3c4d
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 ml-1" />
                    </div>
                </div>
                <div className="flex border-t border-border/60">
                    <div className="w-[45%] py-1 px-2 border-r border-border/60 font-mono text-[10px] text-muted-foreground">n</div>
                    <div className="w-[55%] py-1 px-2 font-mono text-[10px] text-[var(--color-accent-number)]">3</div>
                </div>
                <div className="flex border-t border-border/60">
                    <div className="w-[45%] py-1 px-2 border-r border-border/60 font-mono text-[10px] text-muted-foreground">curr</div>
                    <div className="w-[55%] py-1 px-2 font-mono text-[10px] text-[var(--color-accent-pointer)] flex items-center justify-between">
                        0x1a2b3c4d
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 ml-1" />
                    </div>
                </div>
            </div>

            {/* Heap node 1 */}
            <div className="absolute rounded-md border border-primary/40 shadow-2xl bg-card overflow-hidden" style={{ left: 262, top: 44, width: 150 }}>
                <div className="px-3 py-1.5 bg-[var(--color-chrome)] border-b border-primary/30 flex justify-between items-center">
                    <span className="text-primary font-mono text-[9px] uppercase tracking-wider">0x1a2b3c4d</span>
                    <span className="text-[8px] text-muted-foreground font-mono">Node</span>
                </div>
                <div className="flex border-t border-border/60">
                    <div className="w-[45%] py-1 px-2 border-r border-border/60 font-mono text-[10px] text-muted-foreground">val</div>
                    <div className="w-[55%] py-1 px-2 font-mono text-[10px] text-[var(--color-accent-number)]">1</div>
                </div>
                <div className="flex border-t border-border/60">
                    <div className="w-[45%] py-1 px-2 border-r border-border/60 font-mono text-[10px] text-muted-foreground">next</div>
                    <div className="w-[55%] py-1 px-2 font-mono text-[10px] text-[var(--color-accent-pointer)] flex items-center justify-between">
                        0x2c3d4e
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 ml-1" />
                    </div>
                </div>
            </div>

            {/* Heap node 2 */}
            <div className="absolute rounded-md border border-primary/40 shadow-2xl bg-card overflow-hidden" style={{ left: 432, top: 130, width: 140 }}>
                <div className="px-3 py-1.5 bg-[var(--color-chrome)] border-b border-primary/30 flex justify-between items-center">
                    <span className="text-primary font-mono text-[9px] uppercase tracking-wider">0x2c3d4e</span>
                    <span className="text-[8px] text-muted-foreground font-mono">Node</span>
                </div>
                <div className="flex border-t border-border/60">
                    <div className="w-[45%] py-1 px-2 border-r border-border/60 font-mono text-[10px] text-muted-foreground">val</div>
                    <div className="w-[55%] py-1 px-2 font-mono text-[10px] text-[var(--color-accent-number)]">2</div>
                </div>
                <div className="flex border-t border-border/60">
                    <div className="w-[45%] py-1 px-2 border-r border-border/60 font-mono text-[10px] text-muted-foreground">next</div>
                    <div className="w-[55%] py-1 px-2 font-mono text-[10px] text-muted-foreground/60">nullptr</div>
                </div>
            </div>

            {/* zoom controls */}
            <div className="absolute bottom-3 right-3 flex flex-col gap-1">
                <button className="w-6 h-6 rounded border border-border bg-[var(--color-chrome)] text-muted-foreground text-[12px] flex items-center justify-center hover:text-foreground">+</button>
                <button className="w-6 h-6 rounded border border-border bg-[var(--color-chrome)] text-muted-foreground text-[12px] flex items-center justify-center hover:text-foreground">−</button>
            </div>
        </div>
    )
}

function VariablesMockup() {
    const rows = [
        { name: 'head', value: '0x1a2b3c4d', kind: 'ptr' },
        { name: '  val', value: '1', kind: 'num' },
        { name: '  next', value: '0x2c3d4e5f', kind: 'ptr' },
        { name: 'n', value: '3', kind: 'num' },
        { name: 'curr', value: '0x1a2b3c4d', kind: 'ptr' },
        { name: 'result', value: 'true', kind: 'str' },
    ]
    return (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-chrome)] border-b border-border">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground">Variables</span>
                <span className="text-[9px] font-mono text-primary">frame: main</span>
            </div>
            {/* column headers */}
            <div className="flex border-b border-border/60 bg-[var(--color-rail)]">
                <div className="w-[45%] px-3 py-1 text-[9px] font-mono text-muted-foreground/70 uppercase tracking-widest">Name</div>
                <div className="w-[55%] px-3 py-1 text-[9px] font-mono text-muted-foreground/70 uppercase tracking-widest">Value</div>
            </div>
            {rows.map((r, i) => {
                const valueClass =
                    r.kind === 'ptr' ? 'text-[var(--color-accent-pointer)]'
                    : r.kind === 'num' ? 'text-[var(--color-accent-number)]'
                    : 'text-[var(--color-accent-string)]'
                return (
                    <div key={i} className="flex border-t border-border/40 hover:bg-[var(--color-row-hover)] transition-colors">
                        <div className="w-[45%] py-1 px-3 border-r border-border/40 font-mono text-[11px] text-muted-foreground">{r.name}</div>
                        <div className={`w-[55%] py-1 px-3 font-mono text-[11px] ${valueClass}`}>{r.value}</div>
                    </div>
                )
            })}
        </div>
    )
}

function TestsMockup() {
    const tests = [
        { name: 'test_push_front', status: 'pass', ms: '2ms' },
        { name: 'test_push_back', status: 'pass', ms: '1ms' },
        { name: 'test_remove_middle', status: 'fail', ms: '4ms', msg: 'Expected: 2, Got: 3' },
        { name: 'test_length', status: 'pass', ms: '1ms' },
        { name: 'test_empty_list', status: 'pass', ms: '0ms' },
    ]
    const passed = tests.filter(t => t.status === 'pass').length
    const failed = tests.filter(t => t.status === 'fail').length
    return (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-chrome)] border-b border-border">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground">Tests</span>
                <div className="flex items-center gap-3 text-[9px] font-mono">
                    <span className="text-muted-foreground">{tests.length}/{tests.length}</span>
                    <span className="text-emerald-500">{passed} passed</span>
                    <span className="text-red-500">{failed} failed</span>
                </div>
            </div>
            <div className="py-1">
                {tests.map((t, i) => (
                    <div key={i}>
                        <div className={`flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-row-hover)] transition-colors border-l-2 ${t.status === 'pass' ? 'border-emerald-500/60' : 'border-red-500/60'}`}>
                            {t.status === 'pass'
                                ? <Codicon name="pass-filled" size={13} className="text-emerald-500 flex-shrink-0" />
                                : <Codicon name="error" size={13} className="text-red-500 flex-shrink-0" />
                            }
                            <span className="font-mono text-[11px] flex-1">{t.name}</span>
                            <span className="font-mono text-[9px] text-muted-foreground">{t.ms}</span>
                        </div>
                        {t.msg && (
                            <div className="px-3 pb-1.5 pl-9 font-mono text-[10px] text-red-400/80">
                                └─ {t.msg}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function EditorMockup() {
    const lines: { num: number; indent: string; content: string; bp?: boolean; active?: boolean }[] = [
        { num: 8,  indent: '', content: 'void push_front(int val) {' },
        { num: 9,  indent: '  ', content: 'Node* newNode = new Node(val);' },
        { num: 10, indent: '  ', content: 'newNode->next = head;' },
        { num: 11, indent: '  ', content: 'head = newNode;', bp: true, active: true },
        { num: 12, indent: '  ', content: 'size++;' },
        { num: 13, indent: '', content: '}' },
        { num: 14, indent: '', content: '' },
        { num: 15, indent: '', content: 'int length() const {' },
        { num: 16, indent: '  ', content: 'int count = 0;', bp: true },
        { num: 17, indent: '  ', content: 'Node* curr = head;' },
    ]
    return (
        <div className="rounded-lg border border-border bg-background overflow-hidden font-mono text-[11px]">
            <div className="flex items-center px-3 py-1.5 bg-[var(--color-chrome)] border-b border-border gap-2">
                <Codicon name="file-code" size={11} className="text-muted-foreground" />
                <span className="text-muted-foreground text-[10px]">linked_list.cpp</span>
                <div className="ml-auto flex items-center gap-3 text-[9px] text-muted-foreground">
                    <span className="text-primary font-medium flex items-center gap-1">
                        <Codicon name="debug-pause" size={9} /> Paused at line 11
                    </span>
                </div>
            </div>
            {lines.map((l) => (
                <div
                    key={l.num}
                    className={`flex items-center min-h-[22px] ${l.active ? 'bg-primary/10 border-l-2 border-primary' : 'border-l-2 border-transparent'}`}
                >
                    <div className="w-8 text-center text-[9px] text-muted-foreground/50 select-none flex-shrink-0 flex items-center justify-center">
                        {l.bp
                            ? <span className="w-2 h-2 rounded-full bg-red-500 block" />
                            : <span className="text-[9px]">{l.num}</span>
                        }
                    </div>
                    {l.active && (
                        <Codicon name="debug-stackframe-active" size={10} className="text-primary mr-1 flex-shrink-0" />
                    )}
                    <div className={`pl-1 text-[11px] ${l.active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                        <span className="whitespace-pre">{l.indent}</span>
                        {formatCodeLine(l.content, l.active)}
                    </div>
                </div>
            ))}
            {/* debug toolbar */}
            <div className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-chrome)] border-t border-border">
                <button className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-muted-foreground hover:text-foreground hover:bg-[var(--color-row-hover)]">
                    <Codicon name="debug-step-over" size={10} /> Step Over
                </button>
                <button className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-muted-foreground hover:text-foreground hover:bg-[var(--color-row-hover)]">
                    <Codicon name="debug-step-into" size={10} /> Step Into
                </button>
                <button className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-muted-foreground hover:text-foreground hover:bg-[var(--color-row-hover)]">
                    <Codicon name="debug-continue" size={10} /> Continue
                </button>
            </div>
        </div>
    )
}

function formatCodeLine(content: string, active?: boolean) {
    if (!content) return null
    // Very simple keyword highlighting for the mockup
    const keywords = ['void', 'int', 'new', 'Node', 'return', 'const', 'if']
    // split on keywords and color them
    const parts: { text: string; kind: 'kw' | 'member' | 'plain' }[] = []
    let remaining = content
    while (remaining.length > 0) {
        let matched = false
        for (const kw of keywords) {
            if (remaining.startsWith(kw) && (remaining[kw.length] === ' ' || remaining[kw.length] === '*' || !remaining[kw.length])) {
                parts.push({ text: kw, kind: 'kw' })
                remaining = remaining.slice(kw.length)
                matched = true
                break
            }
        }
        if (!matched) {
            const last = parts[parts.length - 1]
            if (last && last.kind === 'plain') {
                last.text += remaining[0]
            } else {
                parts.push({ text: remaining[0], kind: 'plain' })
            }
            remaining = remaining.slice(1)
        }
    }
    return (
        <span>
            {parts.map((p, i) =>
                p.kind === 'kw'
                    ? <span key={i} className="text-[var(--color-accent-type)]">{p.text}</span>
                    : <span key={i} className={active ? 'text-foreground' : 'text-foreground/70'}>{p.text}</span>
            )}
        </span>
    )
}

// ---------------------------------------------------------------------------
// CTA card
// ---------------------------------------------------------------------------

function CtaCard({
    icon,
    title,
    desc,
    href,
    external,
    highlight,
}: {
    icon: string
    title: string
    desc: string
    href: string
    external?: boolean
    highlight?: boolean
}) {
    const cls = [
        'group flex flex-col gap-3 rounded-xl border p-6 transition-all hover:border-primary/60',
        highlight
            ? 'bg-primary/5 border-primary/30'
            : 'bg-[var(--color-chrome)] border-border hover:bg-[var(--color-row-hover)]',
    ].join(' ')

    const inner = (
        <>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${highlight ? 'bg-primary/20' : 'bg-background'} border border-border group-hover:border-primary/40 transition-colors`}>
                <Codicon name={icon as any} size={20} className={highlight ? 'text-primary' : 'text-muted-foreground group-hover:text-primary transition-colors'} />
            </div>
            <div>
                <h3 className="font-semibold text-[15px] leading-tight group-hover:text-primary transition-colors">{title}</h3>
                <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">{desc}</p>
            </div>
            <div className={`mt-auto text-[12px] font-medium flex items-center gap-1 ${highlight ? 'text-primary' : 'text-muted-foreground group-hover:text-primary transition-colors'}`}>
                Open <Codicon name="arrow-right" size={11} className="transition-transform group-hover:translate-x-0.5" />
            </div>
        </>
    )

    if (external) {
        return <a href={href} className={cls}>{inner}</a>
    }
    return <Link to={href} className={cls}>{inner}</Link>
}

// ---------------------------------------------------------------------------
// Feature section
// ---------------------------------------------------------------------------

function Feature({
    label,
    title,
    desc,
    children,
    flip,
}: {
    label: string
    title: string
    desc: string
    children: React.ReactNode
    flip?: boolean
}) {
    return (
        <div className={`flex flex-col ${flip ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-8 items-center`}>
            <div className="flex-1 min-w-0">
                <span className="inline-block text-[11px] font-mono font-semibold uppercase tracking-widest text-primary mb-3 bg-primary/10 px-2.5 py-0.5 rounded-full">{label}</span>
                <h2 className="text-2xl font-bold tracking-tight leading-snug">{title}</h2>
                <p className="mt-3 text-[14px] text-muted-foreground leading-relaxed">{desc}</p>
            </div>
            <div className="flex-1 min-w-0 w-full">{children}</div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Main landing page
// ---------------------------------------------------------------------------

export default function LandingPage() {
    const { user, configured } = useAuth()

    return (
        <div className="h-full bg-background text-foreground overflow-y-auto">
            {/* ── Navbar ─────────────────────────────────────────── */}
            <header className="sticky top-0 z-20 border-b border-border bg-[var(--color-chrome)]/90 backdrop-blur-sm">
                <div className="max-w-6xl mx-auto px-6 h-12 flex items-center gap-4">
                    <span className="font-bold text-sm tracking-[0.18em] select-none">
                        NOVA<span className="text-primary">·</span>IDE
                    </span>
                    <nav className="ml-auto flex items-center gap-5 text-[12px]">
                        <a href="/ide" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                            <Codicon name="code" size={12} /> IDE
                        </a>
                        <Link to="/learn" className="text-muted-foreground hover:text-foreground transition-colors">Lessons</Link>
                        {configured && (
                            user
                                ? <a href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">Dashboard</a>
                                : <a href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">Sign in</a>
                        )}
                    </nav>
                </div>
            </header>

            {/* ── Hero ────────────────────────────────────────────── */}
            <section className="max-w-6xl mx-auto px-6 pt-16 pb-12">
                <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 text-[11px] font-mono font-medium text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1 mb-5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        Runs entirely in your browser — no install required
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
                        A real C++ debugger,<br />
                        <span className="text-primary">inside your browser.</span>
                    </h1>
                    <p className="mt-5 text-[16px] text-muted-foreground leading-relaxed max-w-xl">
                        Nova is a WebAssembly-powered C++ IDE with step-by-step debugging,
                        live memory graphs, unit testing, and a 10-lesson curriculum —
                        built for CS students and the teachers who guide them.
                    </p>
                </div>

                {/* ── 4 CTA Cards ─── */}
                <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <CtaCard
                        icon="code"
                        title="Standalone IDE"
                        desc="Open the full IDE instantly. No account, no setup."
                        href="/ide"
                        external
                        highlight
                    />
                    <CtaCard
                        icon="book"
                        title="Self-Guided Lessons"
                        desc="10 hands-on lessons from Python to C++ and linked lists."
                        href="/learn"
                    />
                    <CtaCard
                        icon="organization"
                        title="Create a Class"
                        desc="Set up a course, create assignments, and track student progress."
                        href={configured && !user ? '/login' : '/classes/new'}
                    />
                    <CtaCard
                        icon="person-add"
                        title="Join a Class"
                        desc="Enter an invite code to join your teacher's class."
                        href={configured && !user ? '/login' : '/join'}
                    />
                </div>
            </section>

            {/* ── Divider ─── */}
            <div className="max-w-6xl mx-auto px-6">
                <div className="border-t border-border" />
            </div>

            {/* ── Features ────────────────────────────────────────── */}
            <section className="max-w-6xl mx-auto px-6 py-16 flex flex-col gap-20">

                {/* 1. Memory Graph */}
                <Feature
                    label="Memory Graph"
                    title="See pointers as they really are"
                    desc="As you step through your code, Nova draws your stack frames and heap objects as connected nodes — so you can see exactly what each pointer points to, in real time. No more printf debugging."
                >
                    <GraphMockup />
                </Feature>

                {/* 2. Variables Panel */}
                <Feature
                    label="Live Variables"
                    title="Every variable, every frame"
                    desc="The variables panel shows the complete state of your program at each breakpoint — color-coded by type, with pointers highlighted in blue so you can spot them at a glance."
                    flip
                >
                    <VariablesMockup />
                </Feature>

                {/* 3. Testing Framework */}
                <Feature
                    label="Unit Testing"
                    title="Tests that run in the browser"
                    desc="Write STUDENT_TEST / EXPECT_EQUALS assertions directly in your C++ file. Nova compiles and runs them instantly, highlighting exactly which assertions failed and why."
                >
                    <TestsMockup />
                </Feature>

                {/* 4. Editor + Debugger */}
                <Feature
                    label="Step Debugger"
                    title="Real breakpoints, real stepping"
                    desc="Set breakpoints by clicking the gutter, then step over, step into, or continue. The active line is highlighted and the memory graph updates live with every step."
                    flip
                >
                    <EditorMockup />
                </Feature>

            </section>

            {/* ── Footer ──────────────────────────────────────────── */}
            <footer className="border-t border-border mt-4">
                <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[12px] text-muted-foreground">
                    <div>
                        <span className="font-bold text-foreground tracking-[0.14em]">NOVA<span className="text-primary">·</span>IDE</span>
                        <span className="ml-3">A WebAssembly C++ debugger for CS education</span>
                    </div>
                    <nav className="flex items-center gap-4">
                        <a href="/ide" className="hover:text-foreground transition-colors">Standalone IDE</a>
                        <Link to="/learn" className="hover:text-foreground transition-colors">Lessons</Link>
                        {configured && (
                            user
                                ? <a href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</a>
                                : <a href="/login" className="hover:text-foreground transition-colors">Sign in</a>
                        )}
                    </nav>
                </div>
            </footer>
        </div>
    )
}
