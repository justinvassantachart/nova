import type { VariableNode } from './IIDEEngine';

/**
 * DAP-compatible formatters for complex types.
 * These work by post-processing the VariableNode produced by NpmDapEngine.
 */

export interface FormatterContext {
    v: any; // Raw DAP variable
    isHeap: boolean;
    processVariable: (v: any, isHeap: boolean) => VariableNode;
}

export interface DapFormatter {
    match: (v: any) => boolean;
    format: (node: VariableNode, ctx: FormatterContext) => VariableNode;
}

function getBaseType(type: string): string {
    // Remove "struct " or "class " prefix
    const clean = type.replace(/^(struct|class)\s+/, '');
    return clean.split('<')[0].split('::').pop() || '';
}

export const StdStringFormatter: DapFormatter = {
    match: (v) => {
        const type = v.type ?? '';
        const base = getBaseType(type);
        return (base === 'string' || base === 'basic_string') && !type.includes('*') && !type.includes('&');
    },
    format: (node) => {
        return node;
    }
};

export const StdVectorFormatter: DapFormatter = {
    match: (v) => {
        const type = v.type ?? '';
        const base = getBaseType(type);
        return (base === 'vector' || type.includes('std::vector')) && !type.includes('*') && !type.includes('&');
    },
    format: (node) => {
        if (node.members) {
            node.value = `size=${node.members.length}`;
        }
        return node;
    }
};

export const StdMapFormatter: DapFormatter = {
    match: (v) => {
        const type = v.type ?? '';
        const base = getBaseType(type);
        return (base === 'map' || base === 'unordered_map' || type.includes('map')) && !type.includes('*') && !type.includes('&');
    },
    format: (node) => {
        if (node.members) {
            node.value = `size=${node.members.length}`;
            for (const member of node.members) {
                // LLDB/DAP synthetic children for maps are pairs.
                const first = member.members?.find(m => m.name === 'first' || m.name === 'key');
                const second = member.members?.find(m => m.name === 'second' || m.name === 'value');
                if (first && second) {
                    member.value = `${first.value} : ${second.value}`;
                    member.isPointer = false;
                }
            }
        }
        return node;
    }
};

export const StdSetFormatter: DapFormatter = {
    match: (v) => {
        const type = v.type ?? '';
        const base = getBaseType(type);
        return (base === 'set' || base === 'unordered_set' || type.includes('set')) && !type.includes('*') && !type.includes('&');
    },
    format: (node) => {
        if (node.members) {
            node.value = `size=${node.members.length}`;
        }
        return node;
    }
};

export const StanfordCollectionFormatter: DapFormatter = {
    match: (v) => {
        const type = v.type ?? '';
        const base = getBaseType(type);
        return /^(Vector|Set|HashSet|Map|HashMap|Stack|Queue|Grid|GenericSet|GenericMap)$/.test(base) && !type.includes('*') && !type.includes('&');
    },
    format: (node) => {
        const elements = node.members?.find(m => ['_elements', 'elements', '_entries', 'entries', '_map', 'map'].includes(m.name));
        const size = node.members?.find(m => ['_size', 'size', '_count', 'count', 'm_size'].includes(m.name));

        if (size) {
            node.value = `size=${size.value}`;
        }

        if (elements && elements.members) {
            node.members = elements.members;
        }

        // Handle Map/Set entry formatting (Stanford collections often wrap a map)
        if (node.members) {
            node.members.forEach(member => {
                const first = member.members?.find(m => m.name === 'first' || m.name === 'key');
                const second = member.members?.find(m => m.name === 'second' || m.name === 'value');
                if (first && second) {
                    member.value = `${first.value} : ${second.value}`;
                    member.isPointer = false;
                }
            });
        }

        return node;
    }
};

export const PRETTY_PRINTERS: DapFormatter[] = [
    StdStringFormatter,
    StdVectorFormatter,
    StdMapFormatter,
    StdSetFormatter,
    StanfordCollectionFormatter
];
