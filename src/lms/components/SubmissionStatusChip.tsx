// One source of truth for the Submitted / In progress / Not started chip,
// shared by the student class list and the teacher's submissions roster
// (which adds the Late companion chip).

export function SubmissionStatusChip({
  submitted,
  started,
  late = false,
}: {
  submitted: boolean
  started: boolean
  late?: boolean
}) {
  if (submitted) {
    return (
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-green-600/15 text-green-500 border-green-700/50">
          Submitted
        </span>
        {late && (
          <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-600/15 text-amber-500 border-amber-700/50">
            Late
          </span>
        )}
      </span>
    )
  }
  if (started) {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full border border-border text-foreground shrink-0">
        In progress
      </span>
    )
  }
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground shrink-0">
      Not started
    </span>
  )
}
