import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CanvasView } from '@/components/canvas/CanvasView'
import { Terminal } from '@/components/terminal/Terminal'
import { Separator } from '@/components/ui/separator'
import { Gamepad2, Brain } from 'lucide-react'

export function RightPanel() {
    return (
        <div className="flex flex-col h-full">
            {/* Top: Canvas / Memory tabs */}
            <Tabs defaultValue="canvas" className="flex flex-col flex-1 min-h-0">
                <TabsList className="w-full justify-start rounded-none border-b bg-card h-8">
                    <TabsTrigger value="canvas" className="text-xs gap-1 h-7 data-[state=active]:bg-background">
                        <Gamepad2 className="h-3 w-3" /> Game Screen
                    </TabsTrigger>
                    <TabsTrigger value="memory" className="text-xs gap-1 h-7 data-[state=active]:bg-background">
                        <Brain className="h-3 w-3" /> Memory
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="canvas" className="flex-1 min-h-0 m-0">
                    <CanvasView />
                </TabsContent>
                <TabsContent value="memory" className="flex-1 min-h-0 m-0 flex items-center justify-center text-muted-foreground text-sm">
                    <div className="text-center">
                        <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Memory Visualizer</p>
                        <p className="text-xs opacity-60 mt-1">Available in Part 2</p>
                    </div>
                </TabsContent>
            </Tabs>

            <Separator />

            {/* Bottom: Terminal */}
            <div className="h-[220px] min-h-[120px] flex flex-col">
                <div className="flex items-center px-3 h-7 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b bg-card">
                    Terminal
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                    <Terminal />
                </div>
            </div>
        </div>
    )
}
