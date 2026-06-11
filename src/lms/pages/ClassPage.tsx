import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Codicon } from '@/components/ui/codicon'
import { UserMenu } from '@/lms/components/UserMenu'
import { AssignmentEditDialog } from '@/lms/components/AssignmentEditDialog'
import { ClassSettingsDialog } from '@/lms/components/ClassSettingsDialog'
import { useAuth } from '@/shared/context/auth-context'
import { useClass, useClassMembers } from '@/lms/hooks/useClasses'
import { useClassAssignments } from '@/lms/hooks/useAssignments'
import { useMySubmissionStatuses, useSubmissionCounts } from '@/lms/hooks/useSubmissionMeta'
import {
  createAssignment,
  deleteAssignment,
  duplicateAssignment,
  reorderAssignments,
  updateAssignmentMeta,
} from '@/shared/firebase/assignments'
import { leaveClass, removeMember } from '@/shared/firebase/classes'
import { movedIds, nextOrder } from '@/shared/assignment-order'
import { dueLabel, fmtDateTime, isPastDue } from '@/lms/format'
import type { Assignment, Class } from '@/shared/types'

export default function ClassPage() {
  const { classId } = useParams<{ classId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { klass, loading: cLoading } = useClass(classId)

  const isTeacher = !!(klass && user && klass.teacherUid === user.uid)

  if (cLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!klass) {
    return (
      <div className="p-6 text-sm">
        Class not found.{' '}
        <button className="underline" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </button>
      </div>
    )
  }
  if (!classId) return null

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/dashboard')} className="text-sm underline shrink-0">
            ← Back
          </button>
          <div className="min-w-0">
            <div className="font-semibold truncate">{klass.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {isTeacher ? 'You teach this class' : `Taught by ${klass.teacherDisplayName}`}
            </div>
          </div>
        </div>
        <UserMenu />
      </header>
      <main className="flex-1 overflow-auto p-6">
        {isTeacher ? (
          <TeacherView classId={classId} klass={klass} />
        ) : (
          <StudentView classId={classId} userUid={user?.uid} />
        )}
      </main>
    </div>
  )
}

// Small icon-only action button used across the assignment rows.
function IconButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={
        'p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent ' +
        (danger ? 'text-destructive' : 'text-muted-foreground hover:text-foreground')
      }
    >
      <Codicon name={icon} size={14} />
    </button>
  )
}

function PublishChip({
  published,
  onToggle,
}: {
  published: boolean
  onToggle?: () => void
}) {
  const cls = published
    ? 'bg-green-600/15 text-green-500 border-green-700/50'
    : 'text-muted-foreground border-border'
  return (
    <button
      onClick={onToggle}
      disabled={!onToggle}
      title={onToggle ? (published ? 'Click to unpublish' : 'Click to publish') : undefined}
      className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${cls} ${onToggle ? 'hover:opacity-80' : 'cursor-default'}`}
    >
      {published ? 'Published' : 'Draft'}
    </button>
  )
}

function TeacherView({ classId, klass }: { classId: string; klass: Class }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { list: assignments, loading: aLoading } = useClassAssignments(classId)
  const { list: members, loading: mLoading } = useClassMembers(classId)
  const counts = useSubmissionCounts(classId, assignments.map((a) => a.id))
  const [showSettings, setShowSettings] = useState(false)
  const [editing, setEditing] = useState<Assignment | null>(null)

  async function handleNew() {
    if (!user) return
    const id = await createAssignment({
      classId,
      teacherUid: user.uid,
      order: nextOrder(assignments),
    })
    navigate(`/classes/${classId}/assignments/${id}`)
  }

  async function handleMove(index: number, direction: 'up' | 'down') {
    const ids = movedIds(assignments, index, direction)
    if (ids) await reorderAssignments(classId, ids)
  }

  async function handleDuplicate(a: Assignment) {
    if (!user) return
    await duplicateAssignment({
      classId,
      teacherUid: user.uid,
      source: a,
      order: nextOrder(assignments),
    })
  }

  async function handleDeleteAssignment(a: Assignment) {
    const started = counts[a.id]?.started ?? 0
    const warning = started > 0
      ? ` This also deletes work from ${started} student${started === 1 ? '' : 's'}.`
      : ''
    if (!confirm(`Delete "${a.title || 'Untitled'}"?${warning} This cannot be undone.`)) return
    await deleteAssignment(classId, a.id)
  }

  async function handleRemoveMember(uid: string, name: string) {
    if (!confirm(`Remove ${name} from class? Their submitted work is kept.`)) return
    await removeMember(classId, uid)
  }

  async function copyInvite() {
    const url = `${location.origin}/join/${klass.inviteCode}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      prompt('Copy this invite link:', url)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground flex-1">{klass.description}</p>
        <button
          onClick={() => setShowSettings(true)}
          className="px-3 py-1.5 rounded-md border text-xs hover:bg-accent flex items-center gap-1.5 shrink-0"
        >
          <Codicon name="settings-gear" size={13} /> Class settings
        </button>
      </div>

      <section className="border rounded-md p-4 space-y-2">
        <div className="text-sm font-medium">Invite students</div>
        <div className="flex items-center gap-3">
          <code className="text-2xl font-mono tracking-widest px-3 py-1 bg-accent/30 rounded">
            {klass.inviteCode}
          </code>
          <button
            onClick={copyInvite}
            className="px-3 py-1.5 rounded-md border text-xs hover:bg-accent"
          >
            Copy invite link
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          Students can join at <code>/join/{klass.inviteCode}</code> or enter the code at <code>/join</code>.
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Assignments</h2>
          <button
            onClick={handleNew}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
          >
            New assignment
          </button>
        </div>
        {aLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!aLoading && assignments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No assignments yet. Click "New assignment" to create one.
          </p>
        )}
        <ul className="space-y-2">
          {assignments.map((a, i) => {
            const c = counts[a.id]
            const due = dueLabel(a.dueDate)
            return (
              <li
                key={a.id}
                className="border rounded-md p-3 flex items-center gap-2 hover:bg-accent/30"
              >
                <span className="text-xs text-muted-foreground font-mono w-6 text-right shrink-0">
                  {i + 1}.
                </span>
                <button
                  onClick={() => navigate(`/classes/${classId}/assignments/${a.id}`)}
                  className="text-left flex-1 min-w-0"
                >
                  <div className="font-medium truncate">{a.title || 'Untitled'}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {due && <span>{due} · </span>}
                    {Object.keys(a.starterFiles ?? {}).length} starter file
                    {Object.keys(a.starterFiles ?? {}).length === 1 ? '' : 's'}
                    {c && members.length > 0 && (
                      <span title={`${c.started} of ${members.length} students opened it`}>
                        {' '}· {c.submitted}/{members.length} submitted
                      </span>
                    )}
                  </div>
                </button>
                <PublishChip
                  published={a.published}
                  onToggle={() =>
                    void updateAssignmentMeta(classId, a.id, { published: !a.published })
                  }
                />
                <div className="flex items-center shrink-0">
                  <IconButton
                    icon="arrow-up"
                    label="Move up"
                    disabled={i === 0}
                    onClick={() => void handleMove(i, 'up')}
                  />
                  <IconButton
                    icon="arrow-down"
                    label="Move down"
                    disabled={i === assignments.length - 1}
                    onClick={() => void handleMove(i, 'down')}
                  />
                  <IconButton icon="edit" label="Edit details" onClick={() => setEditing(a)} />
                  <IconButton icon="copy" label="Duplicate" onClick={() => void handleDuplicate(a)} />
                  <IconButton
                    icon="trash"
                    label="Delete"
                    danger
                    onClick={() => void handleDeleteAssignment(a)}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Students ({members.length})</h2>
        {mLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!mLoading && members.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No students yet. Share the invite code above.
          </p>
        )}
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.uid}
              className="border rounded-md p-3 flex items-center justify-between text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{m.displayName || m.email}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {m.email} · joined {fmtDateTime(m.joinedAt)}
                </div>
              </div>
              <button
                onClick={() => handleRemoveMember(m.uid, m.displayName || m.email)}
                className="text-xs text-destructive hover:underline ml-3 shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      {showSettings && (
        <ClassSettingsDialog
          klass={klass}
          onClose={() => setShowSettings(false)}
          onDeleted={() => navigate('/dashboard', { replace: true })}
        />
      )}
      {editing && (
        <AssignmentEditDialog
          classId={classId}
          assignment={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function StudentView({ classId, userUid }: { classId: string; userUid: string | undefined }) {
  const navigate = useNavigate()
  const { list: assignments, loading } = useClassAssignments(classId, { publishedOnly: true })
  const statuses = useMySubmissionStatuses(classId, assignments.map((a) => a.id), userUid)

  async function handleLeave() {
    if (!userUid) return
    if (!confirm('Leave this class? You can rejoin with the invite code.')) return
    await leaveClass(classId, userUid)
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Assignments</h2>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && assignments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No assignments yet. Check back later.
          </p>
        )}
        <ul className="space-y-2">
          {assignments.map((a, i) => {
            const st = statuses[a.id]
            const submitted = !!st?.submittedAt
            const overdue = !submitted && isPastDue(a.dueDate)
            const due = dueLabel(a.dueDate)
            return (
              <li key={a.id}>
                <button
                  onClick={() => navigate(`/classes/${classId}/assignments/${a.id}`)}
                  className="w-full text-left border rounded-md p-3 hover:bg-accent/30 flex items-center gap-3"
                >
                  <span className="text-xs text-muted-foreground font-mono w-6 text-right shrink-0">
                    {i + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{a.title || 'Untitled'}</div>
                    <div className="text-xs mt-0.5 truncate">
                      {due && (
                        <span className={overdue ? 'text-destructive' : 'text-muted-foreground'}>
                          {due}{overdue && ' · past due'}
                        </span>
                      )}
                      {due && a.description && <span className="text-muted-foreground"> · </span>}
                      {a.description && (
                        <span className="text-muted-foreground">{a.description}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={
                      'text-[11px] px-2 py-0.5 rounded-full border shrink-0 ' +
                      (submitted
                        ? 'bg-green-600/15 text-green-500 border-green-700/50'
                        : st
                          ? 'text-foreground border-border'
                          : 'text-muted-foreground border-border')
                    }
                  >
                    {submitted ? 'Submitted' : st ? 'In progress' : 'Not started'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="pt-4">
        <button
          onClick={handleLeave}
          className="text-xs text-destructive hover:underline"
        >
          Leave class
        </button>
      </div>
    </div>
  )
}
