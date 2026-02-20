import { useRef, useEffect } from 'react';

export default function CanvasView() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;

        // Size to container
        const resize = () => {
            const parent = canvas.parentElement;
            if (!parent) return;
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        };

        resize();
        const observer = new ResizeObserver(resize);
        if (canvas.parentElement) observer.observe(canvas.parentElement);

        // Store reference for renderer
        (window as any).__novaCanvas = canvas; // eslint-disable-line @typescript-eslint/no-explicit-any

        return () => {
            observer.disconnect();
        };
    }, []);

    return <canvas ref={canvasRef} id="nova-canvas" />;
}
