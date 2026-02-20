import { useNovaStore, type VFSNode } from '../store';

interface FileTreeItemProps {
    node: VFSNode;
    depth: number;
}

function FileTreeItem({ node, depth }: FileTreeItemProps) {
    const { activeFile, setActiveFile } = useNovaStore();

    const handleClick = () => {
        if (!node.isDirectory) {
            // Read content from memfs (imported lazily to avoid circular deps)
            import('../vfs/volume').then(({ readFile }) => {
                const content = readFile(node.path);
                setActiveFile(node.path, content);
            });
        }
    };

    const isActive = activeFile === node.path;

    return (
        <>
            <div
                className={`nova-explorer__item ${isActive ? 'nova-explorer__item--active' : ''
                    } ${node.isDirectory ? 'nova-explorer__item--dir' : ''}`}
                style={{ paddingLeft: 16 + depth * 16 }}
                onClick={handleClick}
            >
                <span>{node.isDirectory ? '📁' : '📄'}</span>
                <span>{node.name}</span>
            </div>
            {node.isDirectory &&
                node.children?.map((child) => (
                    <FileTreeItem key={child.path} node={child} depth={depth + 1} />
                ))}
        </>
    );
}

export default function FileExplorer() {
    const files = useNovaStore((s) => s.files);

    return (
        <div className="nova-explorer">
            <div className="nova-explorer__header">Explorer</div>
            {files.map((node) => (
                <FileTreeItem key={node.path} node={node} depth={0} />
            ))}
        </div>
    );
}
