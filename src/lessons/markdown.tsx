// Dependency-free renderer for the markdown-lite dialect used in lesson
// bodies: paragraphs, **bold**, *italic*, `inline code`, ```fenced code
// blocks``` and "- " bullet lists. Deliberately tiny — lesson prose doesn't
// need tables, links or images, and keeping the lesson module self-contained
// matters more than dialect coverage.

import React from 'react'

function renderInline(text: string, keyBase: string): React.ReactNode[] {
    // Tokenize `code`, **bold**, *italic* in one pass.
    const parts: React.ReactNode[] = []
    const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
    let last = 0
    let m: RegExpExecArray | null
    let i = 0
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) parts.push(text.slice(last, m.index))
        const tok = m[0]
        const key = `${keyBase}-${i++}`
        if (tok.startsWith('`')) {
            parts.push(
                <code
                    key={key}
                    className="px-1 py-0.5 rounded bg-[var(--color-chrome)] border border-border font-mono text-[0.85em] whitespace-nowrap"
                >
                    {tok.slice(1, -1)}
                </code>,
            )
        } else if (tok.startsWith('**')) {
            parts.push(<strong key={key} className="font-semibold text-foreground">{tok.slice(2, -2)}</strong>)
        } else {
            parts.push(<em key={key}>{tok.slice(1, -1)}</em>)
        }
        last = m.index + tok.length
    }
    if (last < text.length) parts.push(text.slice(last))
    return parts
}

export function MarkdownLite({ text }: { text: string }) {
    const blocks: React.ReactNode[] = []
    const lines = text.split('\n')
    let i = 0
    let key = 0

    while (i < lines.length) {
        const line = lines[i]

        if (line.trim() === '') { i++; continue }

        // Fenced code block.
        if (line.trimStart().startsWith('```')) {
            const code: string[] = []
            i++
            while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
                code.push(lines[i])
                i++
            }
            i++ // closing fence
            blocks.push(
                <pre
                    key={key++}
                    className="my-2 p-2.5 rounded-md bg-[var(--color-chrome)] border border-border overflow-x-auto font-mono text-[11.5px] leading-relaxed"
                >
                    {code.join('\n')}
                </pre>,
            )
            continue
        }

        // Bullet list.
        if (line.trimStart().startsWith('- ')) {
            const items: string[] = []
            while (i < lines.length && lines[i].trimStart().startsWith('- ')) {
                items.push(lines[i].trimStart().slice(2))
                i++
            }
            blocks.push(
                <ul key={key++} className="my-2 ml-4 list-disc space-y-1">
                    {items.map((it, j) => <li key={j}>{renderInline(it, `li${key}-${j}`)}</li>)}
                </ul>,
            )
            continue
        }

        // Paragraph: consume until blank line / structural marker.
        const para: string[] = []
        while (
            i < lines.length
            && lines[i].trim() !== ''
            && !lines[i].trimStart().startsWith('```')
            && !lines[i].trimStart().startsWith('- ')
        ) {
            para.push(lines[i])
            i++
        }
        blocks.push(<p key={key++} className="my-2">{renderInline(para.join(' '), `p${key}`)}</p>)
    }

    return <div className="text-[13px] leading-relaxed text-foreground/90">{blocks}</div>
}
