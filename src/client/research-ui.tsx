import { useRef, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ResearchResult } from '../types.js'
import type { NS } from './locales.js'
import { parseResearchResult, type ReferenceResearchRecord, type ReferenceScoutViewSnapshot } from './data.js'

export interface ReferenceActionsFace {
  hooks: {
    referenceResearch: ObservableSnapshot<ReferenceScoutViewSnapshot | undefined>
  }
  openReferencePanel(): void
  runReferenceAction(sessionId: SessionId, action: 'research' | 'skip', query: string, reason?: string): Promise<string | null>
}

type Localized = PropsLocale<typeof NS>

function statusLabel(status: ResearchResult['status']): string {
  return status.replace('-', ' ')
}

function originLabel(record: ReferenceResearchRecord, t: Localized['t']): string {
  if (record.origin === 'automatic') return t('originAutomatic')
  if (record.origin === 'command') return t('originCommand')
  return t('originTool')
}

function Candidate({ candidate, t }: { candidate: ResearchResult['selected'][number]; t: Localized['t'] }) {
  return (
    <li className="rs-repo">
      <div className="rs-between">
        <a href={`${candidate.repository.htmlUrl}/tree/${candidate.commitSha}`} target="_blank" rel="noreferrer" title={t('repository')}>{candidate.repository.fullName}</a>
        <span className="rs-badge">{t('score')} {candidate.score.total.toFixed(1)}</span>
      </div>
      <div className="rs-meta rs-subtle"><span>{candidate.repository.stars.toLocaleString()} {t('stars')}</span><span>{t('commit')} {candidate.commitSha.slice(0, 12)}</span><span>{candidate.repository.license ?? 'NOASSERTION'}</span></div>
      {candidate.signals.length > 0 && <div><span className="rs-subtle">{t('signals')}</span><div className="rs-tags">{candidate.signals.map(signal => <span key={signal} className="rs-tag">{signal}</span>)}</div></div>}
      {candidate.evidencePaths.length > 0 && <details><summary className="rs-subtle">{t('evidencePaths')} ({candidate.evidencePaths.length})</summary><ul>{candidate.evidencePaths.map(path => <li key={path}><code>{path}</code></li>)}</ul></details>}
      {candidate.excerpts.length > 0 && <details><summary className="rs-subtle">{t('excerptsLabel')} ({candidate.excerpts.length})</summary>{candidate.excerpts.map(excerpt => <div key={excerpt.path}><p className="rs-subtle"><code>{excerpt.path}</code></p><pre className="rs-code">{excerpt.text}</pre></div>)}</details>}
    </li>
  )
}

export function ResearchResultView({ record, t, compact = false }: { record: ReferenceResearchRecord; t: Localized['t']; compact?: boolean }) {
  const result = record.result
  return (
    <article className="rs-result" aria-label={`${t('toolResult')}: ${statusLabel(result.status)}`}>
      <div className="rs-result-body">
        <div className="rs-between"><span className="rs-badge" data-status={result.status}>{statusLabel(result.status)}</span><span className="rs-subtle">{originLabel(record, t)} · {new Date(record.time).toLocaleString()}</span></div>
        <div><span className="rs-subtle">{t('task')}</span><p className="rs-task">{result.task.task}</p></div>
        {!compact && result.selected.length > 0 && <section aria-labelledby={`rs-selected-${record.id}`}><h4 id={`rs-selected-${record.id}`} className="rs-title">{t('selected')} ({result.selected.length})</h4><ul className="rs-list">{result.selected.map(candidate => <Candidate key={`${candidate.repository.fullName}-${candidate.commitSha}`} candidate={candidate} t={t} />)}</ul></section>}
        {!compact && result.warnings.length > 0 && <details><summary className="rs-summary">{t('warnings')} ({result.warnings.length})</summary><ul>{result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></details>}
        {!compact && result.excluded.length > 0 && <details><summary className="rs-summary">{t('excluded')} ({result.excluded.length})</summary><ul>{result.excluded.map(item => <li key={`${item.repository}-${item.reason}`}><strong>{item.repository}</strong>: {item.reason}</li>)}</ul></details>}
      </div>
    </article>
  )
}

type PanelProps = PropsRuntime<'sidebar.right.pane.tab'> & Localized & InjectFace<ReferenceActionsFace>

export function ReferencePanel({ useReferenceResearch, sessionId, t, runReferenceAction }: PanelProps) {
  const snapshot = useReferenceResearch(value => value)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [manualQuery, setManualQuery] = useState('')
  const skipDialog = useRef<HTMLDialogElement>(null)
  const records = snapshot?.records ?? []
  const latest = snapshot?.latest ?? null

  const run = async (action: 'research' | 'skip'): Promise<void> => {
    const query = latest?.result.task.task ?? manualQuery.trim()
    if (query === '') return
    setBusy(true); setMessage('')
    const error = await runReferenceAction(sessionId, action, query, action === 'skip' ? reason : undefined)
    setBusy(false)
    if (error !== null) setMessage(`${t('runFailed')}: ${error}`)
    else if (action === 'skip') { setReason(''); skipDialog.current?.close() }
  }

  return (
    <div className="rs-panel">
      <header className="rs-panel-head"><div className="rs-between"><div><h2 className="rs-title">{t('panelTitle')}</h2><p className="rs-hint">{t('panelDescription')}</p></div>{records.length > 0 && <span className="rs-badge rs-count">{records.length}</span>}</div></header>
      <div className="rs-panel-scroll">
        {latest === null ? <div className="rs-empty"><p>{t('noResearch')}</p><label className="rs-field"><span>{t('task')}</span><textarea className="rs-textarea" value={manualQuery} onChange={event => { setManualQuery(event.currentTarget.value) }} /></label><div className="rs-actions"><button type="button" className="rs-button rs-button-primary" disabled={busy || manualQuery.trim() === ''} onClick={() => { void run('research') }}>{busy ? t('running') : t('rerun')}</button><button type="button" className="rs-button" disabled={busy || manualQuery.trim() === ''} onClick={() => { skipDialog.current?.showModal() }}>{t('skip')}</button></div><p className="rs-live" role="status" aria-live="polite">{message}</p></div> : <>
          <div className="rs-actions"><button type="button" className="rs-button rs-button-primary" disabled={busy} onClick={() => { void run('research') }}>{busy ? t('running') : t('rerun')}</button><button type="button" className="rs-button" disabled={busy} onClick={() => { skipDialog.current?.showModal() }}>{t('skip')}</button></div>
          <p className="rs-live" role="status" aria-live="polite">{message}</p>
          <section><h3 className="rs-title">{t('latest')}</h3><ResearchResultView record={latest} t={t} /></section>
          {records.length > 1 && <details className="rs-history"><summary className="rs-summary">{t('history')} ({records.length - 1})</summary><div className="rs-list">{records.slice(0, -1).reverse().map(item => <ResearchResultView key={`${item.seq}-${item.id}`} record={item} t={t} compact />)}</div></details>}
        </>}
      </div>
      <dialog ref={skipDialog} className="rs-dialog"><form method="dialog" onSubmit={event => { event.preventDefault(); void run('skip') }}><h3 className="rs-title">{t('skip')}</h3><label className="rs-field"><span>{t('skipReason')}</span><textarea className="rs-textarea" required value={reason} onChange={event => { setReason(event.currentTarget.value) }} /></label><div className="rs-actions"><button type="button" className="rs-button" onClick={() => { skipDialog.current?.close() }}>{t('cancel')}</button><button type="submit" className="rs-button rs-button-primary" disabled={reason.trim() === '' || busy}>{t('skip')}</button></div></form></dialog>
    </div>
  )
}

type HeaderProps = PropsRuntime<'conversation.session.header.actions'> & Localized & InjectFace<ReferenceActionsFace>

export function ReferenceHeaderAction({ useReferenceResearch, openReferencePanel, t }: HeaderProps) {
  const count = useReferenceResearch(value => value?.records.length ?? 0)
  if (count === 0) return null
  return <button type="button" className="rs-header-action" onClick={openReferencePanel} aria-label={t('openPanel')} title={t('openPanel')}><span aria-hidden="true" className="rs-badge rs-count">{count}</span><span>{t('panelTitle')}</span></button>
}

type ToolProps = ToolCallViewProps & Localized & InjectFace<ReferenceActionsFace>

function toolRecord(block: ToolProps['block']): ReferenceResearchRecord | null {
  if (!('kind' in block)) return null
  const meta = typeof block.meta === 'object' && block.meta !== null ? block.meta as Record<string, unknown> : null
  const result = parseResearchResult(meta?.result)
  return result === null ? null : { id: block.callId, seq: block.seq, time: block.time, origin: 'tool', result }
}

export function ReferenceToolView({ block, openReferencePanel, t }: ToolProps): ReactNode {
  const result = toolRecord(block)
  if (result === null) return <div className="rs-tool" role="status"><div className="rs-tool-row"><strong>{t('toolRunning')}</strong><span className="rs-badge">{t('running')}</span></div></div>
  return (
    <details className="rs-tool">
      <summary className="rs-tool-row"><strong>{t('toolResult')}</strong><span className="rs-title-inline"><span className="rs-badge" data-status={result.result.status}>{statusLabel(result.result.status)}</span><span className="rs-subtle">{result.result.selected.length}</span></span></summary>
      <div className="rs-result-body"><ResearchResultView record={result} t={t} compact /><button type="button" className="rs-button" onClick={event => { event.preventDefault(); openReferencePanel() }}>{t('openPanel')}</button></div>
    </details>
  )
}

export function ReferencePanelTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>) {
  return <span>{useTabInfo().tab.title}</span>
}

export function emptySnapshot(): ReferenceScoutViewSnapshot {
  return { records: [], latest: null }
}
