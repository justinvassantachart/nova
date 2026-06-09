import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserMenu } from '@/lms/components/UserMenu'
import { useAuth } from '@/shared/context/auth-context'
import { createClass } from '@/shared/firebase/classes'

export default function CreateClass() {
  const { user, appUser } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !name.trim()) return
    setCreating(true)
    try {
      const classId = await createClass({
        name: name.trim(),
        description: description.trim(),
        teacherUid: user.uid,
        teacherDisplayName: appUser?.displayName || user.email || 'Teacher',
      })
      navigate(`/classes/${classId}`, { replace: true })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between">
        <button onClick={() => navigate('/dashboard')} className="text-sm underline">
          ← Back
        </button>
        <UserMenu />
      </header>
      <main className="flex-1 overflow-auto p-6">
        <form onSubmit={handleCreate} className="max-w-md mx-auto space-y-4">
          <h2 className="text-lg font-medium">Create a class</h2>
          <div className="space-y-1">
            <label className="text-sm font-medium">Class name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CS 101 — Fall 2026"
              className="w-full border rounded-md px-3 py-2 text-sm bg-transparent"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this class about?"
              rows={3}
              className="w-full border rounded-md px-3 py-2 text-sm bg-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create class'}
          </button>
        </form>
      </main>
    </div>
  )
}
