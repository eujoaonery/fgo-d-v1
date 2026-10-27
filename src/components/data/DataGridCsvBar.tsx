import { useRef, useState } from 'react'
import { Download, FileDown, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { downloadCsvFile } from '@/lib/csv/escape'
import { exportAssetsCsv, exportTeamsCsv, importAssetsCsv, importTeamsCsv } from '@/lib/api'

type Kind = 'assets' | 'teams'

interface DataGridCsvBarProps {
  kind: Kind
  apiConnected: boolean
  canView: boolean
  canManage: boolean
  canExport?: boolean
  filteredCount: number
  totalCount: number
  getFilteredCsv: () => string
  getTemplateCsv: () => string
  filteredFilename: string
  onImported: () => Promise<void>
}

export function DataGridCsvBar({
  kind,
  apiConnected,
  canView,
  canManage,
  canExport = false,
  filteredCount,
  totalCount,
  getFilteredCsv,
  getTemplateCsv,
  filteredFilename,
  onImported,
}: DataGridCsvBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!canView) return null

  async function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file, 'utf-8')
    })
  }

  async function handleImport(file: File) {
    setBusy(true)
    setMessage(null)
    try {
      const csv = await readFile(file)
      const result =
        kind === 'assets' ? await importAssetsCsv(csv) : await importTeamsCsv(csv)
      setMessage(`${result.imported} registro(s) importado(s).`)
      await onImported()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha na importação')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-fogo-muted">
          Exibindo {filteredCount} de {totalCount}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {canExport ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!apiConnected || busy || filteredCount === 0}
                onClick={() => downloadCsvFile(filteredFilename, getFilteredCsv())}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Exportar filtro
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!apiConnected || busy}
                onClick={() =>
                  void (kind === 'assets' ? exportAssetsCsv() : exportTeamsCsv())
                }
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Exportar tudo
              </Button>
            </>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => downloadCsvFile(`modelo-${kind === 'assets' ? 'ativos' : 'agentes'}.csv`, getTemplateCsv())}
          >
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Modelo CSV
          </Button>
          {canManage ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleImport(f)
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!apiConnected || busy}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {busy ? 'Importando…' : 'Importar CSV'}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {message ? <p className="text-xs text-fogo-text">{message}</p> : null}
    </div>
  )
}
