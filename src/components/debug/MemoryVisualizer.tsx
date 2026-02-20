import { useMemo } from 'react'
import { ReactFlow, Background, type Node, type Edge, Position, Handle } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { useDebugStore } from '@/store/debug-store'
import { readMemorySnapshot, type MemoryValue } from '@/lib/memory-reader'

// ── The Two-Column Table Row ──
function VariableRow({ variable, depth = 0, nodeId }: { variable: MemoryValue; depth?: number; nodeId: string }) {
    return (
        <div className="flex flex-col border-t border-[#30363d] w-full">
            <div className="flex items-stretch hover:bg-[#21262d] transition-colors relative w-full group min-h-[28px]">
                {/* Left Column: Name */}
                <div className="w-[40%] py-1.5 px-3 border-r border-[#30363d] text-[#8b949e] flex items-center font-mono text-[11px]"
                    style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}>
                    <span className="truncate">{variable.name}</span>
                </div>
                {/* Right Column: Value */}
                <div className="w-[60%] py-1.5 px-3 relative flex items-center font-mono text-[11px] text-[#e6edf3]">
                    <span className={`truncate ${variable.type.includes('string') || variable.type === 'char' ? 'text-emerald-400' : ''}`}>
                        {variable.isStruct ? '' : String(variable.value)}
                    </span>

                    {/* A Handle embedded exactly on the row holding the pointer */}
                    {variable.isPointer && variable.pointsTo !== 0 && variable.pointsTo !== undefined && (
                        <Handle type="source" position={Position.Right} id={`${nodeId}-${variable.name}`}
                            className="!w-2 !h-2 !bg-[#e6edf3] !border-0 !-right-1 opacity-80" />
                    )}
                </div>
            </div>

            {/* Recursive Struct Expansion */}
            {variable.isStruct && variable.members && (
                <div className="flex flex-col w-full bg-[#0d1117]/50">
                    {variable.members.map(m => <VariableRow key={m.name} variable={m} depth={depth + 1} nodeId={`${nodeId}-${variable.name}`} />)}
                </div>
            )}
        </div>
    )
}

function StackFrameNode({ data }: { data: { id: string; label: string; isActive: boolean; variables: MemoryValue[] } }) {
    const borderColor = data.isActive ? 'border-slate-300' : 'border-[#30363d]'
    return (
        <div className={`flex flex-col rounded-md border ${borderColor} bg-[#0d1117] min-w-[240px] shadow-2xl overflow-visible`}>
            {data.isActive && <div className="absolute -top-[1px] -left-[1px] -right-[1px] h-[2px] bg-slate-300 rounded-t-md" />}
            <div className="px-3 py-2 bg-[#161b22] flex justify-between items-center rounded-t-md">
                <span className="text-[#c9d1d9] font-bold text-[11px] font-mono">{data.label}</span>
                {data.isActive && <span className="bg-[#e6edf3] text-[#0d1117] text-[9px] px-1.5 rounded-sm font-bold tracking-wider">ACTIVE</span>}
            </div>
            <div className="flex flex-col w-full">
                {data.variables.length === 0 ? (
                    <div className="p-2 text-xs border-t border-[#30363d] text-[#8b949e] italic text-center">No variables</div>
                ) : data.variables.map(v => <VariableRow key={v.name} variable={v} nodeId={data.id} />)}
            </div>
            <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        </div>
    )
}

function HeapNode({ data }: { data: { id: string; label: string; ptr: number; members: MemoryValue[] } }) {
    return (
        <div className="flex flex-col rounded-md border border-[#30363d] bg-[#0d1117] min-w-[200px] shadow-2xl overflow-visible relative">
            <div className="px-3 py-2 bg-[#161b22] flex justify-between items-center rounded-t-md">
                <span className="text-[#8b949e] font-mono text-[10px] uppercase tracking-wider">{data.label}</span>
                <span className="text-[#8b949e] font-mono text-[10px]">0x{data.ptr.toString(16).padStart(6, '0')}</span>
            </div>
            <div className="flex flex-col w-full">
                {data.members.length === 0 ? (
                    <div className="p-2 text-xs border-t border-[#30363d] text-[#8b949e] italic text-center">Raw Data</div>
                ) : data.members.map(m => <VariableRow key={m.name} variable={m} nodeId={data.id} />)}
            </div>
            <Handle type="target" position={Position.Left} id="target" className="!w-2 !h-2 !bg-[#e6edf3] !border-0 !-left-1 opacity-80" />
        </div>
    )
}

const nodeTypes = { stackFrame: StackFrameNode, heapNode: HeapNode }

// ── Graph Layout Engine ──
function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 120 })

    nodes.forEach(node => {
        // Dynamically estimate height based on table rows
        const rows = node.type === 'stackFrame' ? (node.data.variables as MemoryValue[]).length : (node.data.members as MemoryValue[]).length;
        g.setNode(node.id, { width: 250, height: Math.max(80, rows * 28 + 35) })
    })
    edges.forEach(edge => g.setEdge(edge.source, edge.target))
    dagre.layout(g)

    return nodes.map((node) => {
        const pos = g.node(node.id)
        return { ...node, position: { x: pos.x - 125, y: pos.y - (pos.height / 2) } }
    })
}

export function MemoryVisualizer() {
    const { debugMode, dwarfInfo, memoryBuffer, callStack, heapPointers } = useDebugStore()

    const snapshot = useMemo(() => {
        if (debugMode !== 'paused' || !memoryBuffer) return null
        return readMemorySnapshot(memoryBuffer, dwarfInfo, callStack, heapPointers)
    }, [debugMode, dwarfInfo, memoryBuffer, callStack, heapPointers])

    const { nodes, edges } = useMemo(() => {
        if (!snapshot) return { nodes: [] as Node[], edges: [] as Edge[] }

        const nodes: Node[] = []
        const edges: Edge[] = []
        const reversedFrames = [...snapshot.frames].reverse()

        reversedFrames.forEach((frameData, i) => {
            nodes.push({
                id: frameData.id, type: 'stackFrame', position: { x: 0, y: 0 },
                data: { id: frameData.id, label: frameData.funcName, isActive: i === 0, variables: frameData.variables },
            })

            // Invisible edge to force Stack Frames into a strict vertical column
            if (i > 0) {
                edges.push({
                    id: `stack-order-${i}`, source: reversedFrames[i - 1].id, target: frameData.id,
                    type: 'straight', style: { stroke: 'transparent', strokeWidth: 0 },
                })
            }

            // Extract edges targeting the exact table row handles
            const extractEdges = (vars: MemoryValue[], parentId: string) => {
                for (const v of vars) {
                    if (v.isPointer && v.pointsTo && snapshot.heapAllocations.some(h => h.ptr === v.pointsTo)) {
                        edges.push({
                            id: `${parentId}-${v.name}->heap-${v.pointsTo}`,
                            source: frameData.id, sourceHandle: `${parentId}-${v.name}`,
                            target: `heap-${v.pointsTo}`, targetHandle: 'target',
                            type: 'smoothstep', animated: i === 0,
                            style: { stroke: i === 0 ? '#94a3b8' : '#475569', strokeWidth: 2 }
                        })
                    }
                    if (v.isStruct && v.members) extractEdges(v.members, `${parentId}-${v.name}`);
                }
            }
            extractEdges(frameData.variables, frameData.id);
        })

        snapshot.heapAllocations.forEach((alloc) => {
            const nodeId = `heap-${alloc.ptr}`
            nodes.push({
                id: nodeId, type: 'heapNode', position: { x: 0, y: 0 },
                data: { id: nodeId, label: alloc.typeName, ptr: alloc.ptr, members: alloc.members },
            })

            // Allow pointers from Heap to point to other Heap items (Linked Lists!)
            const extractHeapEdges = (vars: MemoryValue[], parentId: string) => {
                for (const v of vars) {
                    if (v.isPointer && v.pointsTo && snapshot.heapAllocations.some(h => h.ptr === v.pointsTo)) {
                        edges.push({
                            id: `${parentId}-${v.name}->heap-${v.pointsTo}`,
                            source: nodeId, sourceHandle: `${parentId}-${v.name}`,
                            target: `heap-${v.pointsTo}`, targetHandle: 'target',
                            type: 'smoothstep', animated: false,
                            style: { stroke: '#8b949e', strokeWidth: 2 }
                        })
                    }
                    if (v.isStruct && v.members) extractHeapEdges(v.members, `${parentId}-${v.name}`);
                }
            }
            extractHeapEdges(alloc.members, nodeId);
        })

        return { nodes: layoutGraph(nodes, edges), edges }
    }, [snapshot])

    if (debugMode === 'idle') return <div className="flex h-full items-center justify-center text-[#8b949e] font-mono text-xs bg-[#010409]">Click Debug to inspect memory</div>
    if (debugMode === 'compiling' || debugMode === 'running') return <div className="flex h-full items-center justify-center text-[#8b949e] font-mono text-xs bg-[#010409]">⏳ {debugMode === 'compiling' ? 'Compiling...' : 'Running...'}</div>

    return (
        <div className="w-full h-full bg-[#010409]">
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={2} proOptions={{ hideAttribution: true }}>
                <Background gap={16} size={0.5} color="#30363d" />
            </ReactFlow>
        </div>
    )
}
