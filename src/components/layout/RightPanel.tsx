import { useExecutionStore } from '@/store/execution-store'
import { CanvasView } from '@/components/canvas/CanvasView'
import { MemoryVisualizer } from '@/components/debug/MemoryVisualizer'

export function RightPanel() {
    const { activeTab, setActiveTab } = useExecutionStore()

    return (
        <div className="flex flex-col h-full">
            {/* Tab bar */}
            <div className="flex border-b bg-card">
                <button
                    className={`px-4 py-2 text-xs font-medium transition-colors ${activeTab === 'canvas'
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                    onClick={() => setActiveTab('canvas')}
                >
                    🎮 Game Screen
                </button>
                <button
                    className={`px-4 py-2 text-xs font-medium transition-colors ${activeTab === 'memory'
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                    onClick={() => setActiveTab('memory')}
                >
                    🧠 Memory
                </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'canvas' ? (
                    <CanvasView />
                ) : (
                    <MemoryVisualizer />
                )}
            </div>

            {/* Terminal area */}
            <div className="border-t" id="terminal-container" />
        </div>
    )
}
