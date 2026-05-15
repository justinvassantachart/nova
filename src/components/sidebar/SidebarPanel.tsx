// The wide panel that sits next to the activity bar and shows the active
// view's content. Each view ([ExplorerView], [AssignmentView]) renders its
// own titlebar and body chrome — SidebarPanel is just the outer container
// so it stays out of the way for resizing.

import { useSidebarStore } from './sidebar-store'
import { ExplorerView } from './ExplorerView'
import { AssignmentView } from './AssignmentView'

export function SidebarPanel() {
    const activeView = useSidebarStore((s) => s.activeView)

    return (
        <div className="nova-sidebar">
            {activeView === 'files' && <ExplorerView />}
            {activeView === 'assignment' && <AssignmentView />}
        </div>
    )
}
