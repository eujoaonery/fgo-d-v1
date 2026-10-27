import { useMemo } from 'react'
import { CCO_MODULE_DEFS, type CcoModuleKey, type CcoPermissions } from '@/lib/ccoPermissions'

export function PermissionMatrix({
  value,
  onChange,
  disabled,
}: {
  value: CcoPermissions
  onChange: (next: CcoPermissions) => void
  disabled?: boolean
}) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof CCO_MODULE_DEFS>()
    for (const m of CCO_MODULE_DEFS) {
      const list = map.get(m.group) ?? []
      list.push(m)
      map.set(m.group, list)
    }
    return [...map.entries()]
  }, [])

  function toggle(module: CcoModuleKey, field: 'view' | 'manage' | 'export', checked: boolean) {
    const slice = { ...value[module], export: value[module].export === true }
    if (field === 'manage' && checked) slice.view = true
    if (field === 'view' && !checked) {
      slice.manage = false
      slice.export = false
    }
    if (field === 'export' && checked) slice.view = true
    slice[field] = checked
    onChange({ ...value, [module]: slice })
  }

  return (
    <div className="space-y-4">
      {groups.map(([group, mods]) => (
        <div key={group}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fogo-muted">{group}</p>
          <div className="overflow-x-auto rounded-fogo-md border border-fogo-border/80">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="bg-fogo-bg/60 text-fogo-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Módulo</th>
                  <th className="px-3 py-2 font-medium">Ver</th>
                  <th className="px-3 py-2 font-medium">Gerir</th>
                  <th className="px-3 py-2 font-medium">Exportar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fogo-border/60">
                {mods.map((m) => (
                  <tr key={m.key}>
                    <td className="px-3 py-2 text-fogo-text">{m.label}</td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={value[m.key].view}
                        onChange={(e) => toggle(m.key, 'view', e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={value[m.key].manage}
                        onChange={(e) => toggle(m.key, 'manage', e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={value[m.key].export === true}
                        onChange={(e) => toggle(m.key, 'export', e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
