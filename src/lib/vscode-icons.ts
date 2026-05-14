// Resolves filenames/folder names to Material Icon Theme SVG URLs.
//
// The npm package ships the same `material-icons.json` manifest used by the
// VS Code extension plus the raw SVGs. We use Vite's import.meta.glob to turn
// every SVG path into a hashed asset URL at build time, then index into that
// map by icon name. Lookups are O(1) and only the icons actually rendered are
// fetched by the browser.

import iconManifest from 'material-icon-theme/dist/material-icons.json'

type IconDef = { iconPath: string }
type Manifest = {
    iconDefinitions: Record<string, IconDef>
    folderNames: Record<string, string>
    folderNamesExpanded: Record<string, string>
    fileExtensions: Record<string, string>
    fileNames: Record<string, string>
    languageIds: Record<string, string>
    file: string
    folder: string
    folderExpanded: string
}

const M = iconManifest as unknown as Manifest

// eager + ?url makes Vite emit each SVG as a static asset and gives us a
// `{ '/.../foo.svg': '/assets/foo-hash.svg' }` map at build time.
const svgUrls = import.meta.glob<string>(
    '/node_modules/material-icon-theme/icons/*.svg',
    { eager: true, query: '?url', import: 'default' }
)

// Build name → url lookup once at module load.
const urlByName = new Map<string, string>()
for (const fullPath in svgUrls) {
    const name = fullPath.split('/').pop()!.replace(/\.svg$/, '')
    urlByName.set(name, svgUrls[fullPath])
}

function urlForIconName(iconName: string | undefined): string | undefined {
    if (!iconName) return undefined
    const def = M.iconDefinitions[iconName]
    if (!def) return undefined
    const fileName = def.iconPath.split('/').pop()!.replace(/\.svg$/, '')
    return urlByName.get(fileName)
}

const DEFAULT_FILE = urlForIconName(M.file)!
const DEFAULT_FOLDER = urlForIconName(M.folder)!
const DEFAULT_FOLDER_OPEN = urlForIconName(M.folderExpanded)!

export function getFileIconUrl(filename: string): string {
    const lower = filename.toLowerCase()
    const byName = M.fileNames[lower]
    if (byName) {
        const u = urlForIconName(byName)
        if (u) return u
    }
    const parts = lower.split('.')
    // walk longest → shortest extension (e.g. "test.spec.ts" tries "spec.ts" then "ts")
    for (let i = 1; i < parts.length; i++) {
        const ext = parts.slice(i).join('.')
        const iconName = M.fileExtensions[ext]
        if (iconName) {
            const u = urlForIconName(iconName)
            if (u) return u
        }
    }
    return DEFAULT_FILE
}

export function getFolderIconUrl(folderName: string, expanded: boolean): string {
    const lower = folderName.toLowerCase()
    const table = expanded ? M.folderNamesExpanded : M.folderNames
    const iconName = table[lower]
    if (iconName) {
        const u = urlForIconName(iconName)
        if (u) return u
    }
    return expanded ? DEFAULT_FOLDER_OPEN : DEFAULT_FOLDER
}
