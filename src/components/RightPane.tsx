import { useNovaStore } from '../store';
import CanvasView from './CanvasView';
import MemoryVisualizer from './MemoryVisualizer';
import Terminal from './Terminal';

export default function RightPane() {
    const { rightTab, setRightTab } = useNovaStore();

    return (
        <div className="nova-right">
            {/* ── Tabs ── */}
            <div className="nova-right__tabs">
                <button
                    className={`nova-right__tab ${rightTab === 'canvas' ? 'nova-right__tab--active' : ''}`}
                    onClick={() => setRightTab('canvas')}
                >
                    🎮 Game Screen
                </button>
                <button
                    className={`nova-right__tab ${rightTab === 'memory' ? 'nova-right__tab--active' : ''}`}
                    onClick={() => setRightTab('memory')}
                >
                    🧠 Memory
                </button>
            </div>

            {/* ── Top Half: Canvas or Memory ── */}
            {rightTab === 'canvas' ? (
                <div className="nova-right__canvas-area">
                    <CanvasView />
                </div>
            ) : (
                <MemoryVisualizer />
            )}

            {/* ── Bottom Half: Terminal ── */}
            <div className="nova-right__terminal">
                <div className="nova-right__terminal-header">Terminal</div>
                <div className="nova-right__terminal-body">
                    <Terminal />
                </div>
            </div>
        </div>
    );
}
