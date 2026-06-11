// Zip-download helpers shared by the student "download my work" action,
// the teacher's single-submission download, and the bulk class export.

import { strToU8, zipSync } from 'fflate'
import type { Submission } from '@/shared/types'

function cleanPath(path: string): string {
  return path.replace(/^\/workspace\//, '').replace(/^\/+/, '')
}

// Sanitize a student name into a zip-folder-safe segment.
function folderName(s: Submission): string {
  const base = s.studentDisplayName || s.studentEmail || s.studentUid
  return base.replace(/[^a-zA-Z0-9._@-]+/g, '_')
}

function triggerDownload(filename: string, zipped: Uint8Array) {
  const blob = new Blob([new Uint8Array(zipped)], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadFilesZip(filename: string, files: Record<string, string>) {
  const tree: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries(files)) {
    tree[cleanPath(path) || 'main.cpp'] = strToU8(content)
  }
  triggerDownload(filename, zipSync(tree))
}

// One folder per student: <Student Name>/<file>. Students with colliding
// sanitized names get a uid suffix so nobody's work silently overwrites.
export function downloadSubmissionsZip(filename: string, submissions: Submission[]) {
  const tree: Record<string, Uint8Array> = {}
  const seen = new Map<string, number>()
  for (const s of submissions) {
    let folder = folderName(s)
    const n = seen.get(folder) ?? 0
    seen.set(folder, n + 1)
    if (n > 0) folder = `${folder}_${s.studentUid.slice(0, 6)}`
    for (const [path, content] of Object.entries(s.files ?? {})) {
      tree[`${folder}/${cleanPath(path) || 'main.cpp'}`] = strToU8(content)
    }
  }
  triggerDownload(filename, zipSync(tree))
}
