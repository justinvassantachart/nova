import { useCallback, useState, useEffect } from 'react'
import { ReactFlow, Background, type Node, type Edge, type NodeChange, type EdgeChange, Position, Handle, Panel, useViewport, applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { useDebugStore } from '@/store/debug-store'
import type { MemoryValue } from '@/lib/memory-reader'

// ── Recursive Table Row ──
function VariableRow({ variable, depth = 0, nodeId }: { variable: MemoryValue; depth?: number; nodeId: string }) {
    return (
        <div className="flex flex-col border-t border-[#30363d] w-full group relative">
            <div className="flex items-stretch min-h-[26px] hover:bg-[#21262d] transition-colors relative w-full">
                {/* Left Column: Name */}
                <div className="w-[45%] py-1 px-3 border-r border-[#30363d] text-[#8b949e] flex items-center font-mono text-[11px]"
                    style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}>
                    <span className="truncate" title={variable.name}>{variable.name}</span>
                </div>
                {/* Right Column: Value */}
                <div className="w-[55%] py-1 px-3 relative flex items-center font-mono text-[11px] text-[#e6edf3]">
                    <span className={`truncate ${variable.type.includes('string') || variable.type.includes('char') ? 'text-[#a5d6ff]' : ''}`}
                        title={String(variable.value)}>
                        {variable.isStruct && variable.value === '{...}' ? '' : String(variable.value)}
                    </span>

                    {variable.isPointer && variable.pointsTo !== 0 && variable.pointsTo !== undefined && (
                        <Handle type="source" position={Position.Right} id={`${nodeId}-${variable.name}`}
                            className="!w-2 !h-2 !bg-[#58a6ff] !border-0 !-right-1" />
                    )}
                </div>
            </div>

            {variable.isStruct && variable.members && (
                <div className="flex flex-col w-full bg-[#0d1117]/30">
                    {variable.members.map(m => <VariableRow key={m.name} variable={m} depth={depth + 1} nodeId={`${nodeId}-${variable.name}`} />)}
                </div>
            )}
        </div>
    )
}

function StackFrameNode({ data }: { data: { id: string; label: string; isActive: boolean; variables: MemoryValue[] } }) {
    const borderColor = data.isActive ? 'border-slate-300' : 'border-[#30363d]'
    return (
        <div className={`flex flex-col rounded-md border ${borderColor} bg-[#0d1117] min-w-[260px] shadow-2xl overflow-visible`}>
            {data.isActive && <div className="absolute -top-[1px] -left-[1px] -right-[1px] h-[2px] bg-slate-300 rounded-t-md" />}
            <div className="px-3 py-2 bg-[#161b22] border-b border-[#30363d] flex justify-between items-center rounded-t-md">
                <span className="text-[#c9d1d9] font-bold text-[11px] font-mono uppercase tracking-wider">{data.label}</span>
                {data.isActive && <span className="bg-[#e6edf3] text-[#0d1117] text-[9px] px-1.5 rounded-sm font-bold tracking-wider">ACTIVE</span>}
            </div>
            <div className="flex flex-col w-full">
                {data.variables.length === 0 ? (
                    <div className="p-2 text-xs text-[#8b949e] italic text-center">No variables</div>
                ) : data.variables.map(v => <VariableRow key={v.name} variable={v} nodeId={data.id} />)}
            </div>
            <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        </div>
    )
}

function HeapNode({ data }: { data: { id: string; label: string; ptr: number; members: MemoryValue[] } }) {
    return (
        <div className="flex flex-col rounded-md border border-[#58a6ff]/40 bg-[#0d1117] min-w-[220px] shadow-2xl overflow-visible relative">
            <div className="px-3 py-2 bg-[#161b22] border-b border-[#58a6ff]/30 flex justify-between items-center rounded-t-md">
                <span className="text-[#58a6ff] font-mono text-[10px] uppercase tracking-wider truncate mr-2" title={data.label}>{data.label}</span>
                <span className="text-[#8b949e] font-mono text-[10px]">0x{data.ptr.toString(16).padStart(6, '0')}</span>
            </div>
            <div className="flex flex-col w-full">
                {data.members.length === 0 ? (
                    <div className="p-2 text-xs text-[#8b949e] italic text-center">Raw Data</div>
                ) : data.members.map(m => <VariableRow key={m.name} variable={m} nodeId={data.id} />)}
            </div>
            <Handle type="target" position={Position.Left} id="target" className="!w-2 !h-2 !bg-[#58a6ff] !border-0 !-left-1 opacity-80" />
        </div>
    )
}

const nodeTypes = { stackFrame: StackFrameNode, heapNode: HeapNode }

// ── Graph Layout Engine ──
function countRows(vars: MemoryValue[]): number {
    let rows = 0;
    for (const v of vars) {
        rows++;
        if (v.isStruct && v.members) rows += countRows(v.members);
    }
    return rows;
}

function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 120 })

    nodes.forEach(node => {
        const vars = node.type === 'stackFrame' ? (node.data.variables as MemoryValue[]) : (node.data.members as MemoryValue[]);
        const rows = countRows(vars);
        g.setNode(node.id, { width: 260, height: Math.max(60, rows * 28 + 40) })
    })

    edges.forEach(edge => g.setEdge(edge.source, edge.target))
    dagre.layout(g)

    return nodes.map((node) => {
        const pos = g.node(node.id)
        return { ...node, position: { x: pos.x - 130, y: pos.y - (pos.height / 2) } }
    })
}

function findSeparatorX(nodes: Node[]): number | null {
    let maxStackX = -Infinity
    let minHeapX = Infinity
    for (const node of nodes) {
        if (node.type === 'stackFrame') {
            maxStackX = Math.max(maxStackX, (node.position?.x ?? 0) + 260)
        } else if (node.type === 'heapNode') {
            minHeapX = Math.min(minHeapX, node.position?.x ?? 0)
        }
    }
    if (maxStackX === -Infinity || minHeapX === Infinity) return null
    return (maxStackX + minHeapX) / 2
}

/** Viewport-aware separator that stays aligned with the ReactFlow coordinate system */
function SeparatorOverlay({ separatorX }: { separatorX: number }) {
    const { x, zoom } = useViewport()
    const screenX = separatorX * zoom + x

    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 5,
            }}
        >
            <line
                x1={screenX}
                y1={0}
                x2={screenX}
                y2="100%"
                stroke="#30363d"
                strokeWidth={1}
                strokeDasharray="6 4"
            />
            <text
                x={screenX + 16}
                y={20}
                fill="#8b949e"
                fontSize={10}
                fontFamily="monospace"
                textAnchor="start"
            >
                OBJECTS (HEAP)
            </text>
        </svg>
    )
}

export function MemoryVisualizer() {
    const { debugMode, memorySnapshot } = useDebugStore()

    const [nodes, setNodes] = useState<Node[]>([])
    const [edges, setEdges] = useState<Edge[]>([])
    const [separatorX, setSeparatorX] = useState<number | null>(null)

    useEffect(() => {
        if (!memorySnapshot) {
            setNodes([])
            setEdges([])
            setSeparatorX(null)
            return
        }
        const snapshot = memorySnapshot

        const rawNodes: Node[] = []
        const rawEdges: Edge[] = []

        const reversedFrames = [...snapshot.frames].reverse()

        reversedFrames.forEach((frameData, i) => {
            rawNodes.push({
                id: frameData.id, type: 'stackFrame', position: { x: 0, y: 0 },
                draggable: false,
                data: { id: frameData.id, label: `${frameData.funcName}()`, isActive: i === 0, variables: frameData.variables },
            })

            if (i > 0) {
                rawEdges.push({
                    id: `stack-order-${i}`, source: reversedFrames[i - 1].id, target: frameData.id,
                    type: 'straight', style: { stroke: 'transparent', strokeWidth: 0 },
                })
            }

            const extractEdges = (vars: MemoryValue[], parentId: string, nodeIdentifier: string) => {
                for (const v of vars) {
                    const currentHandleId = `${parentId}-${v.name}`;
                    if (v.isPointer && v.pointsTo && snapshot.heapAllocations.some(h => h.ptr === v.pointsTo)) {
                        rawEdges.push({
                            id: `${currentHandleId}->heap-${v.pointsTo}`,
                            source: nodeIdentifier, sourceHandle: currentHandleId,
                            target: `heap-${v.pointsTo}`, targetHandle: 'target',
                            type: 'bezier', animated: i === 0,
                            style: { stroke: i === 0 ? '#58a6ff' : '#475569', strokeWidth: 2 }
                        })
                    }
                    if (v.isStruct && v.members) extractEdges(v.members, currentHandleId, nodeIdentifier);
                }
            }
            extractEdges(frameData.variables, frameData.id, frameData.id);
        })

        snapshot.heapAllocations.forEach((alloc) => {
            const nodeId = `heap-${alloc.ptr}`
            rawNodes.push({
                id: nodeId, type: 'heapNode', position: { x: 0, y: 0 },
                draggable: true,
                data: { id: nodeId, label: alloc.typeName, ptr: alloc.ptr, members: alloc.members },
            })

            const extractHeapEdges = (vars: MemoryValue[], parentId: string, nodeIdentifier: string) => {
                for (const v of vars) {
                    const currentHandleId = `${parentId}-${v.name}`;
                    if (v.isPointer && v.pointsTo && snapshot.heapAllocations.some(h => h.ptr === v.pointsTo)) {
                        rawEdges.push({
                            id: `${currentHandleId}->heap-${v.pointsTo}`,
                            source: nodeIdentifier, sourceHandle: currentHandleId,
                            target: `heap-${v.pointsTo}`, targetHandle: 'target',
                            type: 'bezier', animated: false,
                            style: { stroke: '#8b949e', strokeWidth: 2 }
                        })
                    }
                    if (v.isStruct && v.members) extractHeapEdges(v.members, currentHandleId, nodeIdentifier);
                }
            }
            extractHeapEdges(alloc.members, nodeId, nodeId);
        })

        const laidOut = layoutGraph(rawNodes, rawEdges)
        const sepX = findSeparatorX(laidOut)

        setNodes(prev => {
            return laidOut.map(newNode => {
                const existing = prev.find(p => p.id === newNode.id)
                // Preserve positions of existing heap nodes so they stay where user dragged them
                if (existing && existing.type === 'heapNode') {
                    return { ...newNode, position: existing.position }
                }
                return newNode
            })
        })
        setEdges(rawEdges)
        setSeparatorX(sepX)
    }, [memorySnapshot])

    // Only allow position changes for heap nodes — block stack node drags
    const onNodesChange = useCallback((changes: NodeChange[]) => {
        setNodes(nds => {
            const filtered = changes.filter(change => {
                if (change.type === 'position') {
                    const node = nds.find(n => n.id === change.id)
                    if (node?.type === 'stackFrame') return false
                }
                return true
            })
            return applyNodeChanges(filtered, nds)
        })
    }, [])

    const onEdgesChange = useCallback((changes: EdgeChange[]) => {
        setEdges(eds => applyEdgeChanges(changes, eds))
    }, [])

    if (debugMode === 'idle') return <div className="flex h-full items-center justify-center text-[#8b949e] font-mono text-xs bg-[#010409]">Click Debug to inspect memory</div>
    if (debugMode === 'compiling' || debugMode === 'running') return <div className="flex h-full items-center justify-center text-[#8b949e] font-mono text-xs bg-[#010409]">{debugMode === 'compiling' ? 'Compiling...' : 'Running...'}</div>

    return (
        <div className="w-full h-full bg-[#010409]">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.2}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                panOnDrag={false}
                panOnScroll={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
            >
                <Background gap={16} size={0.5} color="#30363d" />
                <Panel position="top-left" className="!m-0 !p-0">
                    <div className="flex gap-6 px-4 py-2">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-[#8b949e]">
                            Frames (Stack)
                        </span>
                    </div>
                </Panel>
                {separatorX !== null && <SeparatorOverlay separatorX={separatorX} />}
            </ReactFlow>
        </div>
    )
}
