import MonacoEditor from '@monaco-editor/react';
import { useNovaStore } from '../store';
import { useCallback, useRef } from 'react';
import { writeFile } from '../vfs/volume';

let opfsSyncTimer: ReturnType<typeof setTimeout> | null = null;

export default function Editor() {
    const { activeFile, activeFileContent, setActiveFileContent } = useNovaStore();
    const editorRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

    const handleChange = useCallback(
        (value: string | undefined) => {
            if (!value || !activeFile) return;

            // Update Zustand state
            setActiveFileContent(value);

            // Write to memfs immediately
            writeFile(activeFile, value);

            // Debounced OPFS sync (2 seconds)
            if (opfsSyncTimer) clearTimeout(opfsSyncTimer);
            opfsSyncTimer = setTimeout(() => {
                import('../vfs/opfs-sync').then(({ syncToOPFS }) => {
                    syncToOPFS(activeFile, value);
                });
            }, 2000);
        },
        [activeFile, setActiveFileContent],
    );

    if (!activeFile) {
        return (
            <div className="nova-editor">
                <div className="nova-editor__empty">
                    Select a file from the explorer to begin editing
                </div>
            </div>
        );
    }

    return (
        <div className="nova-editor">
            <MonacoEditor
                height="100%"
                language="cpp"
                theme="vs-dark"
                value={activeFileContent}
                onChange={handleChange}
                onMount={(editor) => {
                    editorRef.current = editor;
                }}
                options={{
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: 14,
                    lineHeight: 22,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                    renderLineHighlight: 'gutter',
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    tabSize: 4,
                    automaticLayout: true,
                }}
            />
        </div>
    );
}
