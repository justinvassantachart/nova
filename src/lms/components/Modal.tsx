import { useEffect, type ReactNode } from 'react'

// Minimal modal for the LMS's few dialogs: overlay click or Escape closes,
// content clicks don't propagate. Deliberately not a generic design-system
// dialog — the LMS keeps its chrome plain.
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-background text-foreground border rounded-lg shadow-xl w-full max-w-md p-5 space-y-4 max-h-[85vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold">{title}</div>
        {children}
      </div>
    </div>
  )
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2 pt-1">{children}</div>
}
