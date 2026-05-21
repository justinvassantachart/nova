import { Codicon } from '@/components/ui/codicon'
import { useEditorStore } from '@/store/editor-store'
import { useExecutionStore } from '@/store/execution-store'
import { fileExists, readFile } from '@/vfs/volume'
import type { TestAssert, TestCase } from './test-store'
import { useTestStore } from './test-store'

export function TestsPanel() {
    const tests = useTestStore((s) => s.tests)
    const isTesting = useTestStore((s) => s.isTesting)
    const totalCount = useTestStore((s) => s.totalCount)
    const completedCount = useTestStore((s) => s.completedCount)
    const isCompiling = useExecutionStore((s) => s.isCompiling)

    if (tests.length === 0 && !isTesting && !isCompiling) {
        return (
            <aside className="flex flex-col items-center justify-center h-full min-h-0 bg-background text-muted-foreground text-xs font-mono gap-3 p-6 text-center">
                <Codicon name="beaker" size={28} className="opacity-60" />
                <div>
                    Click <span className="text-primary">Tests</span> in the toolbar to run your tests
                </div>
                <div className="opacity-80 leading-relaxed">
                    Declare tests with{' '}
                    <code className="text-foreground/80">STUDENT_TEST("name") {'{'} ... {'}'}</code>{' '}
                    and assert with{' '}
                    <code className="text-foreground/80">EXPECT_EQUALS(actual, expected)</code>
                </div>
            </aside>
        )
    }

    const passed = tests.filter((t) => t.status === 'pass').length
    const failed = tests.filter((t) => t.status === 'fail').length
    const running = tests.filter((t) => t.status === 'running').length

    return (
        <aside className="flex flex-col h-full min-h-0 bg-background text-foreground">
            <div className="nova-panel-header">
                <span className="nova-panel-label">Tests</span>
                <div className="flex items-center gap-3 text-[10px] font-mono">
                    {isCompiling ? (
                        <span className="text-primary flex items-center gap-1">
                            <Codicon name="loading" size={10} spin /> compiling
                        </span>
                    ) : (
                        <>
                            <span className="text-muted-foreground">
                                {completedCount}/{totalCount || tests.length}
                            </span>
                            {passed > 0 && <span className="text-emerald-500">{passed} passed</span>}
                            {failed > 0 && <span className="text-red-500">{failed} failed</span>}
                            {running > 0 && (
                                <span className="text-primary flex items-center gap-1">
                                    <Codicon name="loading" size={10} spin /> {running}
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto py-1">
                {tests.length === 0 ? (
                    <div className="px-3 py-3 text-[11px] font-mono text-muted-foreground italic">
                        {isCompiling ? 'Compiling tests…' : 'Waiting for results…'}
                    </div>
                ) : (
                    tests.map((t, i) => <TestRow key={i} test={t} />)
                )}
            </div>
        </aside>
    )
}

function TestRow({ test }: { test: TestCase }) {
    const failedAsserts = test.asserts.filter((a) => a.status === 'FAIL')
    const showDetails = test.status === 'fail' && failedAsserts.length > 0

    const borderColor =
        test.status === 'pass' ? 'border-emerald-500/60'
        : test.status === 'fail' ? 'border-red-500/70'
        : 'border-primary/50'

    return (
        <div className={`border-l-2 ${borderColor}`}>
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono">
                <StatusIcon status={test.status} />
                <span className="truncate">{test.name}</span>
            </div>

            {showDetails && (
                <div className="pl-7 pr-3 pb-2 space-y-2">
                    {failedAsserts.map((a, i) => (
                        <AssertRow key={i} assert={a} />
                    ))}
                </div>
            )}
        </div>
    )
}

function StatusIcon({ status }: { status: TestCase['status'] }) {
    if (status === 'pass') {
        return <Codicon name="check" size={12} className="text-emerald-500 shrink-0" />
    }
    if (status === 'fail') {
        return <Codicon name="error" size={12} className="text-red-500 shrink-0" />
    }
    return <Codicon name="loading" size={12} spin className="text-primary shrink-0" />
}

function AssertRow({ assert: a }: { assert: TestAssert }) {
    // __FILE__ from the compiler omits the /workspace/ prefix since compile()
    // strips it before mounting. Map back so the editor can resolve the file.
    const openFile = () => {
        const candidate = a.file.startsWith('/workspace/')
            ? a.file
            : `/workspace/${a.file.replace(/^\/+/, '')}`
        if (fileExists(candidate)) {
            useEditorStore.getState().setActiveFile(candidate, readFile(candidate))
        }
    }

    return (
        <div className="text-[11px] font-mono border-l-2 border-red-500/30 pl-2">
            <div className="text-red-400">EXPECT_EQUALS failed</div>
            <div className="mt-1 flex gap-1">
                <span className="text-muted-foreground/70 shrink-0">actual</span>
                <span className="text-foreground/60 truncate">{a.actualExpr}</span>
                <span className="text-muted-foreground/70">=</span>
                <span className="text-red-400 truncate">{a.actualVal}</span>
            </div>
            <div className="flex gap-1">
                <span className="text-muted-foreground/70 shrink-0">expected</span>
                <span className="text-foreground/60 truncate">{a.expectedExpr}</span>
                <span className="text-muted-foreground/70">=</span>
                <span className="text-emerald-400 truncate">{a.expectedVal}</span>
            </div>
            {a.line > 0 && (
                <button
                    type="button"
                    onClick={openFile}
                    className="mt-1 text-[10px] text-muted-foreground/70 hover:text-foreground hover:underline"
                >
                    {a.file.split('/').pop()}:{a.line}
                </button>
            )}
        </div>
    )
}
