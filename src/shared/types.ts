import type { Timestamp } from 'firebase/firestore'

export type { EventType } from '@/ide-host'

export type AppUser = {
  uid: string
  email: string
  displayName: string
  createdAt: Timestamp | null
}

export type Class = {
  id: string
  name: string
  description: string
  teacherUid: string
  teacherDisplayName: string
  inviteCode: string
  createdAt: Timestamp | null
}

export type ClassMember = {
  uid: string
  email: string
  displayName: string
  joinedAt: Timestamp | null
}

// Mirror of ClassMember stored under users/{uid}/memberships/{classId} so a
// signed-in user can list their own classes without a collectionGroup query.
// Denormalized — class rename does not propagate; refreshes on next class write.
export type Membership = {
  classId: string
  className: string
  teacherDisplayName: string
  joinedAt: Timestamp | null
}

export type Assignment = {
  id: string
  classId: string
  teacherUid: string
  title: string
  description: string
  starterFiles: Record<string, string>
  published: boolean
  createdAt: Timestamp | null
  dueDate?: Timestamp | null
  // Manual syllabus position (0-based). Docs created before this field
  // existed fall back to createdAt millis — see assignment-order.ts.
  order?: number
}

export type Submission = {
  studentUid: string
  studentDisplayName: string
  studentEmail: string
  assignmentId: string
  classId: string
  files: Record<string, string>
  updatedAt: Timestamp | null
  submittedAt?: Timestamp | null
}
