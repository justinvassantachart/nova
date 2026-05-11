import type { Timestamp } from 'firebase/firestore'

export type { EventType } from '@/ide-host'

export type Role = 'teacher' | 'student'

export type AppUser = {
  uid: string
  email: string
  displayName: string
  role: Role | null
  createdAt: Timestamp | null
}

export type Assignment = {
  id: string
  title: string
  description: string
  teacherUid: string
  starterFiles: Record<string, string>
  published: boolean
  createdAt: Timestamp | null
  dueDate?: Timestamp | null
}

export type Submission = {
  id: string // `${assignmentId}_${studentUid}`
  assignmentId: string
  studentUid: string
  files: Record<string, string>
  updatedAt: Timestamp | null
  submittedAt?: Timestamp | null
}
