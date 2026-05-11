import { UserMenu } from '@/lms/components/UserMenu'

export default function StudentDashboard() {
  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between">
        <h1 className="font-semibold">Nova · Student</h1>
        <UserMenu />
      </header>
      <main className="flex-1 p-6 text-sm text-muted-foreground">
        Student dashboard — assignments list coming in Phase 4.
      </main>
    </div>
  )
}
