import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { Modal, ModalActions } from './Modal'
import { updateAssignmentMeta } from '@/shared/firebase/assignments'
import { fromLocalInputValue, toLocalInputValue } from '@/lms/format'
import type { Assignment } from '@/shared/types'

// Edit an assignment's details (title, description, due date, published).
// Starter files are edited in the IDE view; this dialog is everything else.
export function AssignmentEditDialog({
  classId,
  assignment,
  onClose,
}: {
  classId: string
  assignment: Assignment
  onClose: () => void
}) {
  const [title, setTitle] = useState(assignment.title)
  const [description, setDescription] = useState(assignment.description ?? '')
  const [dueLocal, setDueLocal] = useState(toLocalInputValue(assignment.dueDate))
  const [published, setPublished] = useState(assignment.published)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const due = fromLocalInputValue(dueLocal)
      await updateAssignmentMeta(classId, assignment.id, {
        title: title.trim() || 'Untitled assignment',
        description,
        published,
        dueDate: due ? Timestamp.fromDate(due) : null,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <Modal title="Edit assignment" onClose={onClose}>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border rounded-md px-2 py-1.5 text-sm bg-transparent"
          autoFocus
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Instructions students see alongside the assignment."
          className="w-full border rounded-md px-2 py-1.5 text-sm bg-transparent resize-y"
        />
      </label>

      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Due date</span>
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => setDueLocal(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm bg-transparent"
          />
          {dueLocal && (
            <button
              onClick={() => setDueLocal('')}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Optional. Late submissions are accepted and flagged.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
        />
        Published (visible to students)
      </label>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <ModalActions>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </ModalActions>
    </Modal>
  )
}
