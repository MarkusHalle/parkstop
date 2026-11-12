import { useCallback, useEffect, useState } from 'react'
import { hu } from '../i18n/hu'
import { violations } from '../report/ReportForm'
import { deleteAllReports, deleteReport, duplicateReport, exportAll, listReports } from './db'
import { exportFileName, summaryDate } from './summary'
import type { ReportSummary, StoredReport } from './types'
import './history.css'

interface Props {
  onOpen: (id: string) => void
  onDuplicated: (r: StoredReport) => void
  /** The empty state's "Új bejelentés" button: back to the map. */
  onStart?: () => void
  onCountChange?: (n: number) => void
  refreshKey?: number
  /** After a delete: the report's id, or null when all were deleted. */
  onDeleted?: (id: string | null) => void
  /** Extra top-level data for the export file (the settings). */
  exportExtra?: () => Record<string, unknown>
}

const labelFor = (s: ReportSummary) =>
  (s.violationId === 'egyeb' && s.customText.trim()) || (violations.find((v) => v.id === s.violationId)?.label ?? '')

export function HistoryPage({ onOpen, onDuplicated, onStart, onCountChange, refreshKey, onDeleted, exportExtra }: Props) {
  const [items, setItems] = useState<ReportSummary[] | null>(null)
  const [error, setError] = useState(false)
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    try {
      const list = await listReports()
      setItems(list)
      setError(false)
      onCountChange?.(list.length)
    } catch {
      setError(true)
      setItems([])
    }
  }, [onCountChange])

  useEffect(() => {
    let live = true
    listReports().then(
      (list) => {
        if (!live) return
        setItems(list)
        setError(false)
        onCountChange?.(list.length)
      },
      () => {
        if (!live) return
        setError(true)
        setItems([])
      },
    )
    return () => {
      live = false
    }
  }, [onCountChange, refreshKey])

  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn()
      setStatus(ok)
      await load()
    } catch {
      setStatus(hu.history.saveError)
    }
  }

  const onDelete = (s: ReportSummary) => {
    if (window.confirm(hu.history.confirmDelete)) void run(async () => { await deleteReport(s.id); onDeleted?.(s.id) }, hu.history.deleted)
  }
  const onDeleteAll = () => {
    if (window.confirm(hu.history.confirmDeleteAll)) void run(async () => { await deleteAllReports(); onDeleted?.(null) }, hu.history.deletedAll)
  }
  const onDuplicate = async (s: ReportSummary) => {
    try {
      const copy = await duplicateReport(s.id)
      setStatus(hu.history.duplicated)
      await load()
      onDuplicated(copy)
    } catch {
      setStatus(hu.history.saveError)
    }
  }
  const onExport = async () => {
    try {
      const blob = await exportAll(exportExtra?.() ?? {})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = exportFileName(new Date())
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus(hu.history.exported)
    } catch {
      setStatus(hu.history.exportError)
    }
  }

  const now = new Date()
  const list = items ?? []

  return (
    <div className="history">
      {error && (
        <div className="notice notice-error notice-action history-message" role="alert">
          <p>{hu.history.loadError}</p>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void load()}>{hu.history.retry}</button>
        </div>
      )}
      {!error && items && list.length === 0 && (
        <div className="history-empty">
          <p className="history-empty-title">{hu.history.emptyTitle}</p>
          <p className="muted">{hu.history.empty}</p>
          {onStart && <button type="button" className="btn btn-primary btn-small" onClick={onStart}>{hu.history.startReport}</button>}
        </div>
      )}
      {list.length > 0 && (
        <ul className="history-list">
          {list.map((s) => {
            const name = s.plate || hu.history.noPlate
            return (
              <li key={s.id} className="history-row">
                <button type="button" className="history-open" onClick={() => onOpen(s.id)}>
                  <span className="history-line1">
                    <span className={`history-plate${s.plate ? '' : ' history-plate-empty'}`}>{name}</span>
                    <span className={`chip ${s.status === 'handed' ? 'chip-ok' : 'chip-warn'}`}>{hu.history.status[s.status]}</span>
                  </span>
                  <span className="history-line2">{[labelFor(s), s.address || hu.history.noAddress].filter(Boolean).join(' · ')}</span>
                  <span className="history-line3">{[summaryDate(s, now), s.recipientName].filter(Boolean).join(' · ')}</span>
                </button>
                <div className="history-actions">
                  <button type="button" className="history-act" aria-label={hu.history.duplicateLabel(name)} onClick={() => void onDuplicate(s)}>
                    {hu.history.duplicate}
                  </button>
                  <button type="button" className="history-act history-act-danger" aria-label={hu.history.deleteLabel(name)} onClick={() => onDelete(s)}>
                    {hu.history.delete}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="history-foot">
        <p className="muted small">{hu.history.note}</p>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => void onExport()} disabled={list.length === 0}>{hu.history.export}</button>
          <button type="button" className="btn btn-secondary btn-danger" onClick={onDeleteAll} disabled={list.length === 0}>{hu.history.deleteAll}</button>
        </div>
        <p className="small muted" role="status">{status}</p>
      </div>
    </div>
  )
}
