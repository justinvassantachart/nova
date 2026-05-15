// VS Code-style activity bar. 48px wide, codicon buttons stacked vertically,
// active item shows a 2px left accent border. The bottom section holds the
// settings gear which opens [SettingsMenu] (theme + clangd toggle).

import { Codicon } from '@/components/ui/codicon'
import { useSidebarStore, type SidebarView } from './sidebar-store'
import { SettingsMenu } from './SettingsMenu'

type Item = { id: SidebarView; icon: string; label: string }

// Order matches the user's brief: assignment first, files second.
const TOP_ITEMS: Item[] = [
    { id: 'assignment', icon: 'checklist', label: 'Assignment' },
    { id: 'files', icon: 'files', label: 'Explorer' },
]

export function ActivityBar() {
    const { activeView, collapsed, onActivityClick } = useSidebarStore()

    return (
        <div className="nova-activitybar" role="navigation" aria-label="Activity Bar">
            <div className="nova-ab-section">
                {TOP_ITEMS.map((item) => {
                    const isActive = !collapsed && activeView === item.id
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={`nova-ab-btn${isActive ? ' active' : ''}`}
                            onClick={() => onActivityClick(item.id)}
                            aria-label={item.label}
                            aria-pressed={isActive}
                        >
                            <Codicon name={item.icon} />
                            <span className="nova-ab-tooltip" role="tooltip">
                                {item.label}
                            </span>
                        </button>
                    )
                })}
            </div>

            <div className="nova-ab-section bottom">
                <SettingsMenu />
            </div>
        </div>
    )
}
