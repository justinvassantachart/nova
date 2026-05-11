import { UserMenu } from '@/lms/components/UserMenu'

export default function TeacherDashboard() {
  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between">
        <h1 className="font-semibold">Nova · Teacher</h1>
        <UserMenu />
      </header>
      <main className="flex-1 p-6 text-sm text-muted-foreground">
        Teacher dashboard — assignments list coming in Phase 3.
      </main>
    </div>
  )
}
