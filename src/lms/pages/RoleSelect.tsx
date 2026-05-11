import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, updateDoc } from 'firebase/firestore'
import { getDb } from '@/shared/firebase/client'
import { useAuth } from '@/shared/context/AuthProvider'
import type { Role } from '@/shared/types'

export default function RoleSelect() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  async function pick(role: Role) {
    if (!user) return
    setSaving(true)
    await updateDoc(doc(getDb(), 'users', user.uid), { role })
    navigate(role === 'teacher' ? '/teacher' : '/student', { replace: true })
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <h1 className="text-2xl font-semibold">Welcome to Nova</h1>
        <p className="text-sm text-muted-foreground">
          Pick a role. This can only be changed by an administrator afterward.
        </p>
        <div className="flex gap-3">
          <button
            disabled={saving}
            onClick={() => pick('teacher')}
            className="px-5 py-3 rounded-md border hover:bg-accent disabled:opacity-50"
          >
            I'm a teacher
          </button>
          <button
            disabled={saving}
            onClick={() => pick('student')}
            className="px-5 py-3 rounded-md border hover:bg-accent disabled:opacity-50"
          >
            I'm a student
          </button>
        </div>
      </div>
    </div>
  )
}
