// ── Debug Controls ─────────────────────────────────────────────────
// Toolbar segment for debugger controls. Shown when debugMode === 'paused'.
//
// Two distinct groups:
//   1. Execution  — Continue, Step Over, Step Into (live engine commands)
//   2. Time-travel — Back, Forward (replay through step history)
//   3. Stop

import {
    FastForward,
    StepForward,
    ArrowDown,
    SkipBack,
    SkipForward,
    Square,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { useDebugStore } from '@/store/debug-store'
import {
    debugStepInto,
    debugStepOver,
    debugContinue,
    debugStop,
} from '@/engine/executor'

// ── Types ──────────────────────────────────────────────────────────

interface DebugAction {
    label: string
    shortcut: string
    icon: React.ReactNode
    onClick: () => void
    disabled?: boolean
    className: string
    destructive?: boolean
}

// ── Component ──────────────────────────────────────────────────────

export function DebugControls() {
    const { stepHistory, stepIndex, stepBack, stepForward } = useDebugStore()

    const isAtLiveEdge = stepIndex < 0
    const canStepBack = isAtLiveEdge ? stepHistory.length >= 2 : stepIndex > 0
    const canStepForward = !isAtLiveEdge && stepIndex < stepHistory.length - 1

    // ── Execution controls (live engine commands) ──────────────────

    const execution: DebugAction[] = [
        {
            label: 'Continue',
            shortcut: 'F5',
            icon: <FastForward className="h-3.5 w-3.5" />,
            onClick: debugContinue,
            className: 'bg-green-600 hover:bg-green-500 text-white',
        },
        {
            label: 'Step Over',
            shortcut: 'F10',
            icon: <StepForward className="h-3.5 w-3.5" />,
            onClick: debugStepOver,
            className: 'bg-blue-600 hover:bg-blue-500 text-white',
        },
        {
            label: 'Step Into',
            shortcut: 'F11',
            icon: <ArrowDown className="h-3.5 w-3.5" />,
            onClick: debugStepInto,
            className: 'bg-indigo-600 hover:bg-indigo-500 text-white',
        },
    ]

    // ── Time-travel controls (step history replay) ─────────────────

    const timeTravel: DebugAction[] = [
        {
            label: 'Back',
            shortcut: '⇧F11',
            icon: <SkipBack className="h-3.5 w-3.5" />,
            onClick: stepBack,
            disabled: !canStepBack,
            className: 'bg-zinc-700 hover:bg-zinc-600 text-white',
        },
        {
            label: 'Forward',
            shortcut: '⇧F10',
            icon: <SkipForward className="h-3.5 w-3.5" />,
            onClick: stepForward,
            disabled: !canStepForward,
            className: 'bg-zinc-700 hover:bg-zinc-600 text-white',
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
                    icon: <Square className="h-3.5 w-3.5" />,
                    onClick: debugStop,
                    className: '',
                    destructive: true,
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
    const { label, shortcut, icon, onClick, disabled, className, destructive } = action
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    size="sm"
                    variant={destructive ? 'destructive' : 'default'}
                    onClick={onClick}
                    disabled={disabled}
                    className={`gap-1 ${className}`}
                >
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
