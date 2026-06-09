// ── Debug Controls ─────────────────────────────────────────────────
// Toolbar segment for debugger controls. Shown when debugMode === 'paused'.
//
// Two distinct groups:
//   1. Execution  — Continue, Step Over, Step Into, Step Out (live engine commands)
//   2. Time-travel — Back, Forward (replay through step history)
//   3. Stop

import { Codicon } from '@/components/ui/codicon'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { useDebugStore } from '@/store/debug-store'
import { useEngine } from '@/engine/engine-context'
import { useIDEHost } from '@/use-ide-host'

// ── Types ──────────────────────────────────────────────────────────

type ButtonVariant = 'default' | 'outline' | 'destructive'

interface DebugAction {
    label: string
    shortcut: string
    icon: React.ReactNode
    onClick: () => void
    disabled?: boolean
    variant: ButtonVariant
}

// ── Component ──────────────────────────────────────────────────────

export function DebugControls() {
    const { stepHistory, stepIndex, stepBack, stepForward, reset } = useDebugStore()
    const engine = useEngine()
    const host = useIDEHost()

    const isAtLiveEdge = stepIndex < 0
    const canStepBack = isAtLiveEdge ? stepHistory.length >= 2 : stepIndex > 0
    const canStepForward = !isAtLiveEdge && stepIndex < stepHistory.length - 1

    // ── Execution controls (live engine commands) ──────────────────

    const execution: DebugAction[] = [
        {
            label: 'Continue',
            shortcut: 'F5',
            icon: <Codicon name="debug-continue" size={14} />,
            onClick: () => { host?.onEvent?.('debug_continue', {}); engine.continueExecution() },
            variant: 'default',
            disabled: !isAtLiveEdge,
        },
        {
            label: 'Step Over',
            shortcut: 'F10',
            icon: <Codicon name="debug-step-over" size={14} />,
            onClick: () => { host?.onEvent?.('debug_step_over', {}); engine.stepOver() },
            variant: 'outline',
            disabled: !isAtLiveEdge,
        },
        {
            label: 'Step Into',
            shortcut: 'F11',
            icon: <Codicon name="debug-step-into" size={14} />,
            onClick: () => { host?.onEvent?.('debug_step_into', {}); engine.stepInto() },
            variant: 'outline',
            disabled: !isAtLiveEdge,
        },
        {
            label: 'Step Out',
            shortcut: '⇧F11',
            icon: <Codicon name="debug-step-out" size={14} />,
            onClick: () => { host?.onEvent?.('debug_step_out', {}); engine.stepOut() },
            variant: 'outline',
            disabled: !isAtLiveEdge,
        },
    ]

    // ── Time-travel controls (step history replay) ─────────────────

    const timeTravel: DebugAction[] = [
        {
            label: 'Back',
            shortcut: '⇧F11',
            icon: <Codicon name="debug-step-back" size={14} />,
            onClick: () => { host?.onEvent?.('debug_step_back', {}); stepBack() },
            disabled: !canStepBack,
            variant: 'outline',
        },
        {
            label: 'Forward',
            shortcut: '⇧F10',
            icon: <Codicon name="debug-continue-small" size={14} />,
            onClick: () => { host?.onEvent?.('debug_step_forward', {}); stepForward() },
            disabled: !canStepForward,
            variant: 'outline',
        },
    ]

    return (
        <div className="flex items-center gap-1">
            {/* Execution */}
            <ActionGroup actions={execution} />

            <Separator orientation="vertical" className="mx-1 h-5" />

            {/* Time-travel */}
            <ActionGroup actions={timeTravel} />

            <Separator orientation="vertical" className="mx-1 h-5" />

            {/* Stop */}
            <ActionButton
                action={{
                    label: 'Stop',
                    shortcut: '⇧F5',
                    icon: <Codicon name="debug-stop" size={14} />,
                    onClick: () => { engine.stop(); reset(); },
                    variant: 'destructive',
                }}
            />
        </div>
    )
}

// ── Primitives ─────────────────────────────────────────────────────

function ActionGroup({ actions }: { actions: DebugAction[] }) {
    return (
        <div className="flex gap-1">
            {actions.map((action) => (
                <ActionButton key={action.label} action={action} />
            ))}
        </div>
    )
}

function ActionButton({ action }: { action: DebugAction }) {
    const { label, shortcut, icon, onClick, disabled, variant } = action
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button size="sm" variant={variant} onClick={onClick} disabled={disabled} className="gap-1">
                    {icon}
                    <span className="hidden sm:inline">{label}</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
                <p>
                    {label} <kbd className="ml-1 text-[10px] opacity-60">{shortcut}</kbd>
                </p>
            </TooltipContent>
        </Tooltip>
    )
}
