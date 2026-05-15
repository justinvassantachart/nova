// Gear-icon popup at the bottom of the activity bar.
//
// VS Code's gear opens a context menu with theme + settings options. We
// inline the two toggles the brief asked for: color theme and clangd. The
// popup is plain absolute-positioning instead of radix so the chrome can
// match VS Code's quickpick exactly (4px radius, 1px border, 220px min).

import { useCallback, useEffect, useRef, useState } from 'react'
import { Codicon } from '@/components/ui/codicon'
import { useThemeStore, type Theme } from '@/theme/theme-store'
import { isClangdEnabled, setClangdEnabled } from '@/clangd/preferences'

const POPUP_WIDTH = 240

export function SettingsMenu() {
    const [open, setOpen] = useState(false)
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
    const btnRef = useRef<HTMLButtonElement>(null)
    const popupRef = useRef<HTMLDivElement>(null)

    const theme = useThemeStore((s) => s.theme)
    const setTheme = useThemeStore((s) => s.setTheme)
    // Local mirror of the localStorage value — the underlying preference is
    // a read-on-demand getter, so we re-read each time the popup opens.
    const [clangd, setClangd] = useState(false)

    const openMenu = useCallback(() => {
        const r = btnRef.current?.getBoundingClientRect()
        if (!r) return
        // Anchor above the gear, flush to the activity-bar's right edge.
        // Use a fixed 240px tall guess; clamp to viewport after first paint.
        setPos({ left: r.right + 6, top: r.bottom - 240 })
        setClangd(isClangdEnabled())
        setOpen(true)
    }, [])

    // Clamp the popup so it never bleeds off the bottom or right edge after
    // we measure its real height.
    useEffect(() => {
        if (!open) return
        const el = popupRef.current
        if (!el || !pos) return
        const r = el.getBoundingClientRect()
        const maxLeft = window.innerWidth - r.width - 4
        const maxTop = window.innerHeight - r.height - 4
        const next = {
            left: Math.min(pos.left, maxLeft),
            top: Math.min(Math.max(pos.top, 4), maxTop),
        }
        if (next.left !== pos.left || next.top !== pos.top) setPos(next)
    }, [open, pos])

    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (popupRef.current?.contains(e.target as Node)) return
            if (btnRef.current?.contains(e.target as Node)) return
            setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false)
        }
        window.addEventListener('mousedown', onDown)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('mousedown', onDown)
            window.removeEventListener('keydown', onKey)
        }
    }, [open])

    const handlePickTheme = (t: Theme) => {
        setTheme(t)
        setOpen(false)
    }

    const handleToggleClangd = () => {
        const next = !clangd
        setClangdEnabled(next)
        setClangd(next)
        // Clangd boot is wired in ClangdProvider on mount — a reload is the
        // cheapest way to honor the new preference end-to-end.
        window.location.reload()
    }

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={`nova-ab-btn${open ? ' active' : ''}`}
                onClick={() => (open ? setOpen(false) : openMenu())}
                aria-label="Manage"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <Codicon name="settings-gear" />
                <span className="nova-ab-tooltip" role="tooltip">
                    Manage
                </span>
            </button>

            {open && pos && (
                <div
                    ref={popupRef}
                    className="nova-settings-popup"
                    role="menu"
                    style={{ left: pos.left, top: pos.top, minWidth: POPUP_WIDTH }}
                >
                    <div className="nova-popup-section">Color Theme</div>
                    <div
                        role="menuitemradio"
                        aria-checked={theme === 'dark'}
                        className="nova-popup-item"
                        onClick={() => handlePickTheme('dark')}
                    >
                        <span className="nova-popup-check">
                            {theme === 'dark' && <Codicon name="check" />}
                        </span>
                        <span className="nova-popup-label">Dark (Modern)</span>
                    </div>
                    <div
                        role="menuitemradio"
                        aria-checked={theme === 'light'}
                        className="nova-popup-item"
                        onClick={() => handlePickTheme('light')}
                    >
                        <span className="nova-popup-check">
                            {theme === 'light' && <Codicon name="check" />}
                        </span>
                        <span className="nova-popup-label">Light (Modern)</span>
                    </div>

                    <div className="nova-popup-sep" />

                    <div className="nova-popup-section">Language Server</div>
                    <div
                        role="menuitemcheckbox"
                        aria-checked={clangd}
                        className="nova-popup-item"
                        onClick={handleToggleClangd}
                    >
                        <span className="nova-popup-check">
                            {clangd && <Codicon name="check" />}
                        </span>
                        <span className="nova-popup-label">Enable clangd (reloads)</span>
                    </div>
                </div>
            )}
        </>
    )
}
