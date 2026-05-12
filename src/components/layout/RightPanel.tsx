import { useExecutionStore, type RightTab } from '@/store/execution-store'
import { CanvasView } from '@/components/canvas/CanvasView'
import { MemoryVisualizer } from '@/components/debug/MemoryVisualizer'
import { VariablesPanel } from '@/components/debug/VariablesPanel'
import { Terminal } from '@/components/terminal/Terminal'
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable'

const TABS: { id: RightTab; label: string }[] = [
    { id: 'variables', label: 'Variables' },
    { id: 'graph', label: 'Graph' },
    { id: 'canvas', label: 'Canvas' },
]

export function RightPanel() {
    const { rightTab: activeTab, setRightTab: setActiveTab } = useExecutionStore()

    return (
        <ResizablePanelGroup orientation="vertical" className="h-full">
            <ResizablePanel defaultSize="70" minSize="25">
                <div className="flex flex-col h-full bg-background">
                    <div className="flex border-b border-border bg-[var(--color-chrome)] h-9 px-1 items-stretch">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative px-4 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                                    activeTab === tab.id
                                        ? 'text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {tab.label}
                                {activeTab === tab.id && (
                                    <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-primary rounded-full" />
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 min-h-0 overflow-hidden">
                        {activeTab === 'variables' && <VariablesPanel />}
                        {activeTab === 'graph' && <MemoryVisualizer />}
                        {activeTab === 'canvas' && <CanvasView />}
                    </div>
                </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize="30" minSize="10">
                <div className="h-full flex flex-col bg-background">
                    <div className="nova-panel-header">
                        <span className="nova-panel-label">Terminal</span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <Terminal />
                    </div>
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}
