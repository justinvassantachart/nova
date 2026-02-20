import { useExecutionStore } from '@/store/execution-store'
import { CanvasView } from '@/components/canvas/CanvasView'
import { MemoryVisualizer } from '@/components/debug/MemoryVisualizer'
import { Terminal } from '@/components/terminal/Terminal'

export function RightPanel() {
    const { rightTab: activeTab, setRightTab: setActiveTab } = useExecutionStore()

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

            {/* Tab content — takes available space above terminal */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {activeTab === 'canvas' ? (
                    <CanvasView />
                ) : (
                    <MemoryVisualizer />
                )}
            </div>

            {/* Terminal — fixed height at bottom */}
            <div className="border-t h-[200px] shrink-0">
                <Terminal />
            </div>
        </div>
    )
}
