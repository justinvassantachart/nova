import { useEffect, useRef } from 'react'
import { WebIDE, type WebIDEConfiguration, type WebIDEInstanceHandle } from 'web-ide'
import { WebIDEHostProvider, type WebIDEHost } from 'web-ide/host'
import { canvasPlugin } from 'web-ide/plugins'
import { novaWebIDEConfiguration } from '@/nova/configuration'
import { assignmentActivityPlugin } from '@/nova/assignment-activity-plugin'
import { linkedListEntryLine, linkedListExample } from './showcase-example'

const host: WebIDEHost = {
    workspace: {
        // The embedded and full-page views intentionally share local edits.
        id: 'web-ide:linked-list-showcase:v4',
        initialFiles: { '/workspace/main.cpp': linkedListExample },
        initialBreakpoints: { '/workspace/main.cpp': [linkedListEntryLine] },
    },
}

const configuration: WebIDEConfiguration = {
    ...novaWebIDEConfiguration,
    brand: 'web-ide',
    terminalName: 'web-ide terminal',
    plugins: novaWebIDEConfiguration.plugins.filter(plugin =>
        plugin.id !== canvasPlugin.id && plugin.id !== assignmentActivityPlugin.id),
    initialLayout: {
        selectedPanelId: 'graph',
        panelColumnPercent: 44,
        panelContentPercent: 66,
    },
}

/** An unrestricted IDE with an editable example, embedded through public APIs. */
export default function ShowcaseIDE() {
    const ideRef = useRef<WebIDEInstanceHandle>(null)

    useEffect(() => {
        const instance = ideRef.current
        if (!instance) return
        const open = () => instance.ensureFilesOpen(['/workspace/main.cpp'], '/workspace/main.cpp')
        if (open()) return
        const unsubscribe = instance.subscribe(() => {
            if (open()) unsubscribe()
        })
        return unsubscribe
    }, [])

    return (
        <div className="h-full w-full overflow-hidden">
            <WebIDEHostProvider host={host}>
                <WebIDE ref={ideRef} configuration={configuration} />
            </WebIDEHostProvider>
        </div>
    )
}
