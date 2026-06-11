import { useState } from 'react'
import { Modal, ModalActions } from './Modal'
import {
  deleteClassCascade,
  regenerateInviteCode,
  updateClassMeta,
} from '@/shared/firebase/classes'
import type { Class } from '@/shared/types'

// Class-level administration: rename, description, invite-code rotation,
// and deletion (typed confirmation; cascades assignments + submissions).
export function ClassSettingsDialog({
  klass,
  onClose,
  onDeleted,
}: {
  klass: Class
  onClose: () => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(klass.name)
  const [description, setDescription] = useState(klass.description ?? '')
  const [confirmName, setConfirmName] = useState('')
  const [busy, setBusy] = useState<'save' | 'code' | 'delete' | null>(null)
  const [error, setError] = useState('')

  async function run(kind: 'save' | 'code' | 'delete', fn: () => Promise<void>) {
    setBusy(kind)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal title="Class settings" onClose={onClose}>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Class name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded-md px-2 py-1.5 text-sm bg-transparent"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full border rounded-md px-2 py-1.5 text-sm bg-transparent resize-y"
        />
      </label>

      <ModalActions>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
        >
          Close
        </button>
        <button
          disabled={busy !== null || !name.trim()}
          onClick={() =>
            run('save', async () => {
              await updateClassMeta(klass.id, { name: name.trim(), description })
              onClose()
            })
          }
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
        >
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
      </ModalActions>

      <div className="border-t pt-4 space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Invite code</div>
        <div className="flex items-center gap-3">
          <code className="font-mono tracking-widest px-2 py-1 bg-accent/30 rounded text-sm">
            {klass.inviteCode}
          </code>
          <button
            disabled={busy !== null}
            onClick={() => {
              if (!confirm('Generate a new invite code? Existing links and the old code stop working. Enrolled students are unaffected.')) return
              void run('code', async () => {
                await regenerateInviteCode(klass.id)
              })
            }}
            className="text-xs underline text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {busy === 'code' ? 'Generating…' : 'Regenerate'}
          </button>
        </div>
      </div>

      <div className="border-t pt-4 space-y-2">
        <div className="text-xs font-medium text-destructive">Danger zone</div>
        <p className="text-xs text-muted-foreground">
          Deleting the class removes all assignments and student submissions.
          This cannot be undone. Type <strong>{klass.name}</strong> to confirm.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={klass.name}
            className="flex-1 border rounded-md px-2 py-1.5 text-sm bg-transparent"
          />
          <button
            disabled={busy !== null || confirmName !== klass.name}
            onClick={() =>
              run('delete', async () => {
                await deleteClassCascade(klass.id)
                onDeleted()
              })
            }
            className="px-3 py-1.5 rounded-md border border-destructive text-destructive text-sm hover:bg-destructive/10 disabled:opacity-40"
          >
            {busy === 'delete' ? 'Deleting…' : 'Delete class'}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </Modal>
  )
}
