// Separate context for the sidebar's AssignmentView. Lives next to the
// rest of the sidebar (IDE-land) so the AssignmentView import doesn't
// reach into src/lms. The LMS pages (AssignmentPage, SubmissionView)
// wrap their <App /> mount with [AssignmentInfoProvider]; standalone /ide
// renders without one, and the view falls back to its empty state.

import { type ReactNode } from 'react'
import type { AssignmentInfo } from '@/ide-host'
import { AssignmentInfoContext } from './use-assignment-info'

export function AssignmentInfoProvider({
    info, children,
}: {
    info: AssignmentInfo
    children: ReactNode
}) {
    return <AssignmentInfoContext.Provider value={info}>{children}</AssignmentInfoContext.Provider>
}
