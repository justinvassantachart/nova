// ── C++ Type AST Parser ──────────────────────────────────────────
// Lexer and parser for C++ type signatures. Single source of truth
// for extracting template arguments, pointer/reference qualifiers,
// array dimensions, and base type names from DWARF type strings.

export interface ParsedType {
    baseName: string;
    templateArgs: ParsedType[];
    pointerCount: number;
    isReference: boolean;
    isRValueReference: boolean;
    isConst: boolean;
    isVolatile: boolean;
    arrayDims: number[]; // e.g. [10] becomes 10, [] becomes 0
}

export function tokenizeCppType(s: string): string[] {
    const tokens = s.match(/::|[a-zA-Z_]\w*|\d+|[<>,*&()\[\]]/g) || [];
    return tokens;
}

export function parseCppType(typeStr: string): ParsedType {
    const tokens = tokenizeCppType(typeStr);
    let pos = 0;

    function peek() { return pos < tokens.length ? tokens[pos] : null; }
    function consume() { return pos < tokens.length ? tokens[pos++] : null; }

    function parseType(): ParsedType {
        let isConst = false;
        let isVolatile = false;

        // 1. Prefix Modifiers
        while (peek() === 'const' || peek() === 'volatile' || peek() === 'restrict' || peek() === 'struct' || peek() === 'class' || peek() === 'enum') {
            if (peek() === 'const') isConst = true;
            if (peek() === 'volatile') isVolatile = true;
            consume();
        }

        // 2. Base Name
        const nameParts: string[] = [];
        if (peek() === '::') {
            nameParts.push(consume()!);
        }

        while (peek() && /^[a-zA-Z_]\w*$/.test(peek()!)) {
            nameParts.push(consume()!);
            if (peek() === '::') {
                nameParts.push(consume()!);
            } else if (['unsigned', 'long', 'short', 'int', 'char', 'double', 'float', 'signed'].includes(peek()!)) {
                nameParts.push(' '); // join space for primitive modifiers
            } else {
                break;
            }
        }

        let name = nameParts.join('').replace(/\s*::\s*/g, '::').replace(/\s+/g, ' ').trim();
        if (!name && !['const', 'volatile', '*', '&', 'restrict', '['].includes(peek() || '')) {
            if (peek()) name = consume()!;
        }

        // 3. Template Arguments
        const args: ParsedType[] = [];
        if (peek() === '<') {
            consume();
            if (peek() !== '>') {
                while (true) {
                    const arg = parseType();
                    if (arg && (arg.baseName || arg.pointerCount > 0 || arg.arrayDims.length > 0)) {
                        args.push(arg);
                    } else {
                        consume();
                    }
                    if (peek() === ',') consume();
                    else break;
                }
            }
            if (peek() === '>') consume();
        }

        // 4. Suffix Modifiers
        while (peek() === 'const' || peek() === 'volatile' || peek() === 'restrict') {
            if (peek() === 'const') isConst = true;
            if (peek() === 'volatile') isVolatile = true;
            consume();
        }

        let pointerCount = 0;
        let isReference = false;
        let isRValueReference = false;

        while (peek() === '*' || peek() === '&') {
            const t = consume()!;
            if (t === '*') {
                pointerCount++;
                while (peek() === 'const' || peek() === 'volatile' || peek() === 'restrict') consume();
            } else if (t === '&') {
                if (peek() === '&') {
                    consume();
                    isRValueReference = true;
                } else {
                    isReference = true;
                }
            }
        }

        const arrayDims: number[] = [];
        while (peek() === '[') {
            consume();
            let d = "0";
            if (peek() !== ']') {
                d = consume()!;
            }
            if (peek() === ']') consume();
            arrayDims.push(parseInt(d, 10) || 0);
        }

        return { baseName: name, templateArgs: args, pointerCount, isReference, isRValueReference, isConst, isVolatile, arrayDims };
    }

    try {
        const res = parseType();
        if (!res.baseName && res.pointerCount === 0 && res.arrayDims.length === 0) {
            res.baseName = typeStr.trim();
        }
        return res;
    } catch {
        return { baseName: typeStr.trim(), templateArgs: [], pointerCount: 0, isReference: false, isRValueReference: false, isConst: false, isVolatile: false, arrayDims: [] };
    }
}

export function stringifyCppType(type: ParsedType, dropUnimportant = true): string {
    let base = type.baseName;

    // Normalize inline libc++ namespaces natively
    base = base.replace(/^std::(?:__1::|__2::)/, 'std::');

    if (base === 'std::basic_string' || base === 'basic_string') {
        if (type.templateArgs.length > 0 && type.templateArgs[0].baseName === 'char') {
            base = 'std::string';
            type = { ...type, templateArgs: [] };
        }
    }

    let args = type.templateArgs;
    if (dropUnimportant) {
        args = args.filter(a => {
            const b = a.baseName.replace(/^std::(?:__1::|__2::)/, 'std::');
            if (b === 'std::allocator' || b === 'std::less' || b === 'std::char_traits' || b === 'std::equal_to' || b === 'std::hash') return false;
            return true;
        });
    }

    let result = base;
    if (args.length > 0) {
        result += `<${args.map(a => stringifyCppType(a, dropUnimportant)).join(', ')}>`;
    }

    for (let i = 0; i < type.pointerCount; i++) result += '*';
    if (type.isReference) result += '&';
    if (type.isRValueReference) result += '&&';

    if (type.arrayDims && type.arrayDims.length > 0) {
        for (const dim of type.arrayDims) {
            result += dim === 0 ? '[]' : `[${dim}]`;
        }
    }

    return result;
}

export function getBaseTypeNoNamespaces(t: ParsedType): string {
    const parts = t.baseName.split('::');
    return parts[parts.length - 1] || '';
}

export function typesMatch(req: ParsedType, def: ParsedType): boolean {
    if (getBaseTypeNoNamespaces(req) !== getBaseTypeNoNamespaces(def)) return false;
    if (req.pointerCount !== def.pointerCount) return false;
    if (req.arrayDims.length !== def.arrayDims.length) return false;
    for (let i = 0; i < req.templateArgs.length; i++) {
        if (i >= def.templateArgs.length) return false;
        if (!typesMatch(req.templateArgs[i], def.templateArgs[i])) return false;
    }
    return true;
}

export function canonicalizeTypeName(typeStr: string): string {
    if (!typeStr) return 'unknown';
    try {
        const ast = parseCppType(typeStr);
        return stringifyCppType(ast, true);
    } catch {
        return typeStr.trim();
    }
}
