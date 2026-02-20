import { useRef, useEffect } from 'react'

export function CanvasView() {
    const ref = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        if (!ref.current) return
        const canvas = ref.current
        const resize = () => {
            const p = canvas.parentElement
            if (p) { canvas.width = p.clientWidth; canvas.height = p.clientHeight }
        }
        resize()
        const ro = new ResizeObserver(resize)
        if (canvas.parentElement) ro.observe(canvas.parentElement)
            ; (window as any).__novaCanvas = canvas // eslint-disable-line @typescript-eslint/no-explicit-any
        return () => ro.disconnect()
    }, [])

    return <canvas ref={ref} id="nova-canvas" className="w-full h-full block bg-black" />
}
