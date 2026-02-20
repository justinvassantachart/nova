// ── Memory Visualizer ──────────────────────────────────────────────
// React Flow component that visualizes WASM memory as an interactive graph.
// Shows stack variables as nodes and heap allocations as connected nodes
// with pointer arrows between them. Supports multi-frame call stacks.

import { useCallback, useMemo } from 'react'
import {
    ReactFlow,
    Background,
    type Node,
    type Edge,
    Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { useDebugStore } from '@/store/debug-store'
import { useExecutionStore } from '@/store/execution-store'
import { readMemorySnapshot, type MemoryValue, type HeapAllocation } from '@/lib/memory-reader'

// ── Custom Node Components ─────────────────────────────────────────

function StackFrameNode({ data }: { data: { label: string; funcName: string; isActive: boolean; variables: MemoryValue[] } }) {
    const borderColor = data.isActive ? 'border-blue-500/60' : 'border-slate-500/30'
    const bgColor = data.isActive ? 'bg-blue-950/60' : 'bg-slate-950/40'
    const headerBg = data.isActive ? 'bg-blue-500/10' : 'bg-slate-500/10'
    const headerText = data.isActive ? 'text-blue-300' : 'text-slate-400'
    const nameText = data.isActive ? 'text-blue-200' : 'text-slate-300'
    const valueText = data.isActive ? 'text-blue-100/70' : 'text-slate-200/50'
    const shadow = data.isActive ? 'shadow-blue-500/10' : 'shadow-none'

    return (
        <div className={`rounded-lg border ${borderColor} ${bgColor} backdrop-blur-sm min-w-[200px] shadow-lg ${shadow} transition-all duration-200`}>
            <div className={`px-3 py-1.5 border-b ${borderColor} ${headerBg} rounded-t-lg flex items-center gap-2`}>
                <span className={`text-[10px] font-bold ${headerText} uppercase tracking-wider`}>
                    {data.label}
                </span>
                <span className={`text-[10px] font-mono ${headerText} opacity-60`}>
                    {data.funcName}()
                </span>
            </div>
            <div className="p-2 space-y-0.5">
                {data.variables.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic px-1">No variables yet</div>
                ) : (
                    data.variables.map((v, i) => (
                        <div key={i} className="flex items-center justify-between text-xs px-1 py-0.5 rounded hover:bg-blue-500/10">
                            <span className={`${nameText} font-mono`}>{v.name}</span>
                            <span className={`${valueText} font-mono ml-4 tabular-nums`}>
                                {v.isPointer ? (
                                    <span className="text-amber-400">{String(v.value)}</span>
                                ) : (
                                    String(v.value)
                                )}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

function HeapNode({ data }: { data: { label: string; ptr: number; members: MemoryValue[] } }) {
    return (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/60 backdrop-blur-sm min-w-[160px] shadow-lg shadow-emerald-500/10">
            <div className="px-3 py-1.5 border-b border-emerald-500/30 bg-emerald-500/10 rounded-t-lg flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                    {data.label}
                </span>
                <span className="text-[10px] text-emerald-400/60 font-mono">
                    0x{data.ptr.toString(16).padStart(8, '0')}
                </span>
            </div>
            <div className="p-2 space-y-1">
                {data.members.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs px-1 py-0.5">
                        <span className="text-emerald-200 font-mono">{m.name}</span>
                        <span className="text-emerald-100/70 font-mono ml-3">{String(m.value)}</span>
                    </div>
                ))}
                {data.members.length === 0 && (
                    <div className="text-xs text-muted-foreground italic px-1">Empty</div>
                )}
            </div>
        </div>
    )
}

const nodeTypes = {
    stackFrame: StackFrameNode,
    heapNode: HeapNode,
}

// ── Layout ─────────────────────────────────────────────────────────

function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 })

    for (const node of nodes) {
        g.setNode(node.id, { width: 220, height: 140 })
    }
    for (const edge of edges) {
        g.setEdge(edge.source, edge.target)
    }

    dagre.layout(g)

    return nodes.map((node) => {
        const pos = g.node(node.id)
        return {
            ...node,
            position: { x: pos.x - 110, y: pos.y - 70 },
        }
    })
}

// ── Main Component ─────────────────────────────────────────────────

export function MemoryVisualizer() {
    const { debugMode, dwarfInfo, memoryBuffer, stackPointer, currentLine, currentFunc } = useDebugStore()
    const { allocations } = useExecutionStore()

    // Read memory snapshot with scope + time-travel filters
    const snapshot = useMemo(() => {
        if (debugMode !== 'paused' || !memoryBuffer) return null
        return readMemorySnapshot(memoryBuffer, dwarfInfo, allocations, stackPointer, currentLine, currentFunc)
    }, [debugMode, dwarfInfo, allocations, memoryBuffer, stackPointer, currentLine, currentFunc])

    // Build React Flow nodes + edges from memory snapshot
    const { nodes, edges } = useMemo(() => {
        if (!snapshot) {
            return { nodes: [] as Node[], edges: [] as Edge[] }
        }

        const nodes: Node[] = []
        const edges: Edge[] = []

        // Stack frame node (active function)
        nodes.push({
            id: 'stack',
            type: 'stackFrame',
            position: { x: 0, y: 0 },
            data: {
                label: 'Stack Frame',
                funcName: currentFunc ?? 'main',
                isActive: true,
                variables: snapshot.stackVariables,
            },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
        })

        // Heap allocation nodes
        snapshot.heapAllocations.forEach((alloc: HeapAllocation, i: number) => {
            const nodeId = `heap-${alloc.ptr}`
            nodes.push({
                id: nodeId,
                type: 'heapNode',
                position: { x: 300, y: i * 160 },
                data: {
                    label: alloc.label,
                    ptr: alloc.ptr,
                    members: alloc.members,
                },
                sourcePosition: Position.Right,
                targetPosition: Position.Left,
            })

            // Create edges from pointer variables to heap allocations
            snapshot.stackVariables
                .filter((v: MemoryValue) => v.isPointer && v.pointsTo === alloc.ptr)
                .forEach((v: MemoryValue) => {
                    edges.push({
                        id: `${v.name}->${nodeId}`,
                        source: 'stack',
                        target: nodeId,
                        animated: true,
                        style: { stroke: '#f59e0b', strokeWidth: 2 },
                    })
                })
        })

        // Layout the graph
        const layouted = layoutGraph(nodes, edges)
        return { nodes: layouted, edges }
    }, [snapshot, currentFunc])

    const onNodesChange = useCallback(() => { }, [])
    const onEdgesChange = useCallback(() => { }, [])

    // Idle / Not debugging state
    if (debugMode === 'idle') {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center space-y-2">
                    <div className="text-2xl">🧠</div>
                    <div className="text-sm font-medium">Memory Visualizer</div>
                    <div className="text-xs text-muted-foreground/60">
                        Click <span className="text-purple-400 font-medium">Debug</span> to inspect memory
                    </div>
                </div>
            </div>
        )
    }

    // Running state
    if (debugMode === 'running' || debugMode === 'compiling') {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center space-y-2">
                    <div className="animate-spin text-2xl">⏳</div>
                    <div className="text-sm">
                        {debugMode === 'compiling' ? 'Compiling…' : 'Running…'}
                    </div>
                </div>
            </div>
        )
    }

    // Paused state — show the graph
    return (
        <div className="w-full h-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.5}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                className="bg-background"
            >
                <Background gap={16} size={0.5} color="hsl(var(--muted-foreground) / 0.1)" />
            </ReactFlow>
        </div>
    )
}
