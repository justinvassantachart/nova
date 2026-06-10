// Floating debug toolbar, VS Code style: a small icon pill centered at the
// top of the editor while a debug session is active. It stays mounted across
// the paused→running→paused cycle of each step so the controls don't flicker
// in and out of the top toolbar (where they used to live).
//
// Button groups, mirroring VS Code's order:
//   Continue · Step Over · Step Into · Step Out │ Back · Forward │ Restart · Stop
// Back/Forward are Nova's time-travel replay through the step history.

import { Codicon } from '@/components/ui/codicon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDebugStore } from '@/store/debug-store'
import { useEngine } from '@/engine/engine-context'
import { useIDEHost } from '@/use-ide-host'
import { useRunPipeline } from './use-run-pipeline'

interface ToolbarAction {
    label: string
    shortcut?: string
    icon: string
    onClick: () => void
    disabled?: boolean
    /** VS Code debug icon colors: blue actions, green restart, red stop. */
    tone: 'blue' | 'green' | 'red' | 'plain'
}

const TONE_CLASS: Record<ToolbarAction['tone'], string> = {
    blue: 'text-[#75beff]',
    green: 'text-[#89d185]',
    red: 'text-[#f48771]',
    plain: 'text-foreground',
}

export function DebugToolbar() {
    const { debugMode, stepHistory, stepIndex, stepBack, stepForward } = useDebugStore()
    const engine = useEngine()
    const host = useIDEHost()
    const { stop, restart } = useRunPipeline()

    // Visible for the whole debug session (running or paused) — but not for
    // plain Run sessions, which keep debugMode at 'idle'.
    if (debugMode !== 'paused' && debugMode !== 'running') return null

    const paused = debugMode === 'paused'
    const isAtLiveEdge = stepIndex < 0
    const canAct = paused && isAtLiveEdge
    const canStepBack = paused && (isAtLiveEdge ? stepHistory.length >= 2 : stepIndex > 0)
    const canStepForward = paused && !isAtLiveEdge && stepIndex < stepHistory.length - 1

    const groups: ToolbarAction[][] = [
        [
            { label: 'Continue', shortcut: 'F5', icon: 'debug-continue', tone: 'blue', disabled: !canAct, onClick: () => { host?.onEvent?.('debug_continue', {}); engine.continueExecution() } },
            { label: 'Step Over', shortcut: 'F10', icon: 'debug-step-over', tone: 'blue', disabled: !canAct, onClick: () => { host?.onEvent?.('debug_step_over', {}); engine.stepOver() } },
            { label: 'Step Into', shortcut: 'F11', icon: 'debug-step-into', tone: 'blue', disabled: !canAct, onClick: () => { host?.onEvent?.('debug_step_into', {}); engine.stepInto() } },
            { label: 'Step Out', shortcut: '⇧F11', icon: 'debug-step-out', tone: 'blue', disabled: !canAct, onClick: () => { host?.onEvent?.('debug_step_out', {}); engine.stepOut() } },
        ],
        [
            { label: 'Step Back (replay)', icon: 'debug-step-back', tone: 'plain', disabled: !canStepBack, onClick: () => { host?.onEvent?.('debug_step_back', {}); stepBack() } },
            { label: 'Step Forward (replay)', icon: 'debug-continue-small', tone: 'plain', disabled: !canStepForward, onClick: () => { host?.onEvent?.('debug_step_forward', {}); stepForward() } },
        ],
        [
            { label: 'Restart', shortcut: '⇧⌘F5', icon: 'debug-restart', tone: 'green', onClick: () => { void restart(true) } },
            { label: 'Stop', shortcut: '⇧F5', icon: 'debug-stop', tone: 'red', onClick: stop },
        ],
    ]

    return (
        <div className="nova-debug-toolbar" role="toolbar" aria-label="Debug controls">
            {groups.map((group, gi) => (
                <div key={gi} className="nova-debug-toolbar-group">
                    {group.map((a) => (
                        <Tooltip key={a.label}>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    aria-label={a.label}
                                    className={`nova-debug-toolbar-btn ${TONE_CLASS[a.tone]}`}
                                    disabled={a.disabled}
                                    onClick={a.onClick}
                                >
                                    <Codicon name={a.icon} size={16} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p>
                                    {a.label}
                                    {a.shortcut && <kbd className="ml-1.5 text-[10px] opacity-60">{a.shortcut}</kbd>}
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </div>
            ))}
        </div>
    )
}
