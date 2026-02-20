import { useNovaStore } from '../store';

export default function Toolbar() {
    const { isRunning, isCompiling, setIsCompiling, setIsRunning } = useNovaStore();

    const handleRun = async () => {
        const term = (window as any).__novaTerminal; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!term) return;

        try {
            // Clear terminal
            term.clear();
            term.writeln('\x1b[1;33m⏳ Compiling…\x1b[0m');
            setIsCompiling(true);

            // Gather all files from memfs
            const { getAllFiles } = await import('../vfs/volume');
            const files = getAllFiles();

            // Send to compiler worker
            const { compile } = await import('../engine/compiler');
            const result = await compile(files);

            setIsCompiling(false);

            if (!result.success) {
                term.writeln('\x1b[1;31m✗ Compilation failed:\x1b[0m');
                result.errors.forEach((err: string) => {
                    term.writeln(`  \x1b[31m${err}\x1b[0m`);
                });
                return;
            }

            term.writeln('\x1b[1;32m✓ Compiled successfully\x1b[0m');
            term.writeln('\x1b[90m─────────────────────────\x1b[0m');

            // Execute the compiled WASM
            setIsRunning(true);
            const { execute } = await import('../engine/executor');
            await execute(result.wasmBinary!);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            term.writeln(`\x1b[1;31m✗ Error: ${message}\x1b[0m`);
        } finally {
            setIsCompiling(false);
            setIsRunning(false);
        }
    };

    const handleStop = () => {
        import('../engine/executor').then(({ stop }) => stop());
        setIsRunning(false);
    };

    return (
        <div className="nova-toolbar">
            <span className="nova-toolbar__title">✦ NOVA</span>

            {/* Status */}
            <div className="nova-toolbar__status">
                <span
                    className={`nova-toolbar__status-dot ${isCompiling
                            ? 'nova-toolbar__status-dot--compiling'
                            : isRunning
                                ? 'nova-toolbar__status-dot--running'
                                : ''
                        }`}
                />
                <span>
                    {isCompiling ? 'Compiling…' : isRunning ? 'Running' : 'Ready'}
                </span>
            </div>

            {/* Buttons */}
            {!isRunning ? (
                <button
                    className="nova-toolbar__btn nova-toolbar__btn--run"
                    onClick={handleRun}
                    disabled={isCompiling}
                >
                    ▶ Run
                </button>
            ) : (
                <button
                    className="nova-toolbar__btn nova-toolbar__btn--stop"
                    onClick={handleStop}
                >
                    ■ Stop
                </button>
            )}
        </div>
    );
}
