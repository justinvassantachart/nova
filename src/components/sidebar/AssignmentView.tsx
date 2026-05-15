// Placeholder assignment view for the activity-bar slot.
//
// The real assignment chrome (title, description, submit button,
// teacher tabs) lives in [src/lms/pages/AssignmentPage.tsx] today and
// will be lifted into here on the follow-up feat/assignment-sidebar-view
// branch. For this branch we just surface what we can read from
// [useIDEHost] so the view isn't empty.

import { useIDEHost } from '@/ide-host-context'

export function AssignmentView() {
    const host = useIDEHost()

    return (
        <div className="nova-view-assignment">
            <div className="nova-view-titlebar">
                <span className="nova-view-titlebar-label">Assignment</span>
            </div>
            <div className="nova-view-body">
                {host?.assignmentId ? (
                    <div className="nova-view-empty">
                        <p>
                            Mode: <code>{host.mode}</code>
                        </p>
                        <p style={{ marginTop: 8, wordBreak: 'break-all' }}>
                            ID: {host.assignmentId}
                        </p>
                        <p style={{ marginTop: 12 }}>
                            Assignment details are surfaced here on the next branch.
                        </p>
                    </div>
                ) : (
                    <div className="nova-view-empty">
                        Open an assignment from the LMS to see details here.
                    </div>
                )}
            </div>
        </div>
    )
}
