// Assignment view rendered in the activity bar's first slot.
//
// Reads everything from the IDE host's optional [assignment] field —
// IDE-land never imports LMS code, so the host (set in
// src/lms/pages/AssignmentPage.tsx) is the one that translates Firestore
// data into this contract.
//
// Teacher mode shows inline title + description inputs and a publish
// toggle. Student mode shows read-only metadata, a submit button, and a
// download-zip action.

import { useState } from 'react'
import { Codicon } from '@/components/ui/codicon'
import { useAssignmentInfo } from './use-assignment-info'
import type { AssignmentInfo } from '@/ide-host'

export function AssignmentView() {
    const info = useAssignmentInfo()

    if (!info) {
        return (
            <div className="nova-view-assignment">
                <div className="nova-view-titlebar">
                    <span className="nova-view-titlebar-label">Assignment</span>
                </div>
                <div className="nova-view-body">
                    <div className="nova-view-empty">
                        Open an assignment from the LMS to see details here.
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="nova-view-assignment">
            <div className="nova-view-titlebar">
                <span className="nova-view-titlebar-label">Assignment</span>
            </div>
            <div className="nova-view-body">
                {info.isTeacher ? <TeacherBody info={info} /> : <StudentBody info={info} />}
            </div>
        </div>
    )
}

function StudentBody({ info }: { info: AssignmentInfo }) {
    return (
        <div className="nova-assignment-body">
            <h2 className="nova-assignment-title" title={info.title}>{info.title}</h2>
            {info.description && (
                <p className="nova-assignment-desc">{info.description}</p>
            )}

            <div className="nova-assignment-status">
                {info.submitted ? (
                    <span className="nova-pill submitted">
                        <Codicon name="check" /> Submitted
                    </span>
                ) : (
                    <span className="nova-pill in-progress">In progress</span>
                )}
            </div>

            <div className="nova-assignment-actions">
                {info.onSubmit && (
                    <button
                        type="button"
                        className="nova-btn primary"
                        onClick={() => void info.onSubmit?.()}
                    >
                        <Codicon name="cloud-upload" />
                        {info.submitted ? 'Re-submit' : 'Submit'}
                    </button>
                )}
                {info.onDownload && (
                    <button
                        type="button"
                        className="nova-btn"
                        onClick={info.onDownload}
                    >
                        <Codicon name="cloud-download" /> Download .zip
                    </button>
                )}
            </div>
        </div>
    )
}

function TeacherBody({ info }: { info: AssignmentInfo }) {
    // Local mirror so typing feels instant; commit on blur (mirrors the
    // pattern used by the old TeacherView header).
    const [title, setTitle] = useState(info.title)
    const [desc, setDesc] = useState(info.description)

    // Keep local state in sync if Firestore pushes an update we didn't
    // originate (e.g. another teacher renames the assignment). Adjust-state-
    // during-render (guarded by previous-value comparisons) instead of
    // effects, so remote updates land without an intermediate stale paint.
    const [prevTitle, setPrevTitle] = useState(info.title)
    if (info.title !== prevTitle) {
        setPrevTitle(info.title)
        setTitle(info.title)
    }
    const [prevDesc, setPrevDesc] = useState(info.description)
    if (info.description !== prevDesc) {
        setPrevDesc(info.description)
        setDesc(info.description)
    }

    const commitTitle = () => {
        const trimmed = title.trim()
        if (trimmed && trimmed !== info.title) info.onTitleChange?.(trimmed)
    }
    const commitDesc = () => {
        if (desc !== info.description) info.onDescriptionChange?.(desc)
    }

    return (
        <div className="nova-assignment-body">
            <label className="nova-assignment-field">
                <span className="nova-assignment-field-label">Title</span>
                <input
                    name="assignment-title"
                    className="nova-assignment-input title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={commitTitle}
                    placeholder="Assignment title"
                />
            </label>

            <label className="nova-assignment-field">
                <span className="nova-assignment-field-label">Description</span>
                <textarea
                    name="assignment-description"
                    className="nova-assignment-input desc"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    onBlur={commitDesc}
                    placeholder="Shown to students"
                    rows={4}
                />
            </label>

            {info.onTogglePublish && (
                <button
                    type="button"
                    className={`nova-btn ${info.published ? 'published' : ''}`}
                    onClick={info.onTogglePublish}
                >
                    <Codicon name={info.published ? 'eye' : 'eye-closed'} />
                    {info.published ? 'Published' : 'Unpublished'}
                </button>
            )}
        </div>
    )
}
