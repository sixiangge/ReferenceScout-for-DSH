import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ReferenceScoutConfig } from '../types.js'
import type { NS } from './locales.js'

export interface CredentialState {
  status: 'loading' | 'configured' | 'not-configured' | 'unavailable'
  source?: string
}

export interface ReferenceSettingsFace {
  hooks: {
    referenceSettings: SettingsScope<ReferenceScoutConfig>
    referenceCredential: SnapshotStore<CredentialState>
  }
  saveReferenceSettings(value: ReferenceScoutConfig): Promise<void>
  clearReferenceCache(): Promise<void>
}

type Props = PropsRuntime<'settings.plugin.item'> & PropsLocale<typeof NS> & InjectFace<ReferenceSettingsFace>

function copy(value: ReferenceScoutConfig): ReferenceScoutConfig {
  return structuredClone(value)
}

function NumberField({ label, value, min, max, disabled, onChange }: {
  label: string; value: number; min: number; max: number; disabled: boolean; onChange(value: number): void
}) {
  return (
    <label className="rs-field">
      <span>{label}</span>
      <input className="rs-input" type="number" min={min} max={max} value={value} disabled={disabled}
        onChange={event => { onChange(Number(event.currentTarget.value)) }} />
    </label>
  )
}

export function ReferenceSettingsCard(props: Props) {
  const { t } = props
  const settings = props.useReferenceSettings(value => value)
  const credential = props.useReferenceCredential(value => value)
  const [draft, setDraft] = useState<ReferenceScoutConfig | null>(() => settings.value === undefined ? null : copy(settings.value))
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (settings.value !== undefined) setDraft(copy(settings.value))
  }, [settings.value])

  if (draft === null) {
    return <li className="rs-card"><h3 className="rs-title">{t('title')}</h3><p className="rs-live">{settings.status}</p></li>
  }

  const disabled = busy || !settings.writable || settings.status !== 'ready'
  const update = (change: (next: ReferenceScoutConfig) => void): void => {
    setDraft(current => {
      if (current === null) return current
      const next = copy(current)
      change(next)
      return next
    })
    setMessage('')
  }
  const valid = draft.github.selectTop <= draft.github.hydrateTop
    && draft.github.hydrateTop <= draft.github.maxCandidates
    && draft.policy.allowedLicenses.length > 0
  const credentialLabel = credential.status === 'configured'
    ? t('configured')
    : credential.status === 'not-configured' ? t('notConfigured') : t('unknown')

  const save = async (): Promise<void> => {
    if (!valid) return
    setBusy(true)
    setMessage('')
    try {
      await props.saveReferenceSettings(draft)
      setMessage(t('saved'))
    } catch {
      setMessage(t('saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rs-card" aria-labelledby="rs-settings-title">
      <div className="rs-head">
        <div><h3 id="rs-settings-title" className="rs-title">{t('title')}</h3><p className="rs-hint">{t('description')}</p></div>
        <span className="rs-badge" data-status={draft.enabled ? 'configured' : 'disabled'}>{draft.enabled ? t('enabled') : 'Off'}</span>
      </div>

      <fieldset className="rs-section">
        <legend>{t('mode')}</legend>
        <label className="rs-check"><input type="checkbox" checked={draft.enabled} disabled={disabled} onChange={event => { update(next => { next.enabled = event.currentTarget.checked }) }} /><span>{t('enabled')}</span></label>
        <label className="rs-check"><input type="checkbox" checked={draft.autoTrigger} disabled={disabled || !draft.enabled} onChange={event => { update(next => { next.autoTrigger = event.currentTarget.checked }) }} /><span>{t('autoTrigger')}</span></label>
        <label className="rs-check"><input type="checkbox" checked={draft.intent.skipSmallChanges} disabled={disabled || !draft.autoTrigger} onChange={event => { update(next => { next.intent.skipSmallChanges = event.currentTarget.checked }) }} /><span>{t('skipSmall')}</span></label>
        <div className="rs-radio-group">
          {(['suggest', 'strict'] as const).map(mode => <label key={mode} className="rs-radio"><input type="radio" name="rs-mode" checked={draft.mode === mode} disabled={disabled} onChange={() => { update(next => { next.mode = mode }) }} /><span>{t(mode)}</span></label>)}
        </div>
        <p className="rs-hint">{t('strictHint')}</p>
      </fieldset>

      <fieldset className="rs-section">
        <legend>{t('credential')}</legend>
        <div className="rs-between"><span className="rs-subtle">{draft.github.tokenEnv}</span><span className="rs-badge" data-status={credential.status}>{credentialLabel}{credential.source === undefined ? '' : ` · ${credential.source}`}</span></div>
        <label className="rs-field"><span>{t('tokenEnv')}</span><input className="rs-input" value={draft.github.tokenEnv} disabled={disabled} spellCheck={false} onChange={event => { update(next => { next.github.tokenEnv = event.currentTarget.value }) }} /></label>
        <p className="rs-hint">{t('credentialHint')}</p>
      </fieldset>

      <fieldset className="rs-section">
        <legend>{t('budgets')}</legend>
        <div className="rs-grid">
          <NumberField label={t('maxCandidates')} value={draft.github.maxCandidates} min={1} max={50} disabled={disabled} onChange={value => { update(next => { next.github.maxCandidates = value }) }} />
          <NumberField label={t('hydrateTop')} value={draft.github.hydrateTop} min={1} max={20} disabled={disabled} onChange={value => { update(next => { next.github.hydrateTop = value }) }} />
          <NumberField label={t('selectTop')} value={draft.github.selectTop} min={1} max={10} disabled={disabled} onChange={value => { update(next => { next.github.selectTop = value }) }} />
          <NumberField label={t('maxRequests')} value={draft.github.maxRequests} min={1} max={100} disabled={disabled} onChange={value => { update(next => { next.github.maxRequests = value }) }} />
          <NumberField label={t('timeout')} value={draft.github.timeoutMs} min={1000} max={120000} disabled={disabled} onChange={value => { update(next => { next.github.timeoutMs = value }) }} />
          <NumberField label={t('concurrency')} value={draft.github.concurrency} min={1} max={8} disabled={disabled} onChange={value => { update(next => { next.github.concurrency = value }) }} />
          <NumberField label={t('minStars')} value={draft.github.minStars} min={0} max={1000000} disabled={disabled} onChange={value => { update(next => { next.github.minStars = value }) }} />
          <NumberField label={t('cacheTtl')} value={Math.round(draft.cacheTtlMs / 60000)} min={0} max={1440} disabled={disabled} onChange={value => { update(next => { next.cacheTtlMs = value * 60000 }) }} />
        </div>
      </fieldset>

      <fieldset className="rs-section">
        <legend>{t('evidence')}</legend>
        <label className="rs-check"><input type="checkbox" checked={draft.evidence.allowCodeExcerpts} disabled={disabled} onChange={event => { update(next => { next.evidence.allowCodeExcerpts = event.currentTarget.checked }) }} /><span>{t('excerpts')}</span></label>
        <div className="rs-grid">
          <NumberField label={t('maxFiles')} value={draft.evidence.maxFilesPerRepo} min={0} max={10} disabled={disabled} onChange={value => { update(next => { next.evidence.maxFilesPerRepo = value }) }} />
          <NumberField label={t('maxChars')} value={draft.evidence.maxTotalChars} min={1000} max={100000} disabled={disabled} onChange={value => { update(next => { next.evidence.maxTotalChars = value }) }} />
          <label className="rs-field"><span>{t('network')}</span><select className="rs-select" value={draft.policy.network} disabled={disabled} onChange={event => { update(next => { next.policy.network = event.currentTarget.value as 'always' | 'never' }) }}><option value="always">{t('always')}</option><option value="never">{t('never')}</option></select></label>
          <label className="rs-field"><span>{t('licenses')}</span><input className="rs-input" value={draft.policy.allowedLicenses.join(', ')} disabled={disabled} onChange={event => { update(next => { next.policy.allowedLicenses = event.currentTarget.value.split(',').map(value => value.trim()).filter(Boolean) }) }} /></label>
        </div>
        <p className="rs-hint">{t('security')}</p>
      </fieldset>

      {!settings.writable && <p className="rs-live rs-danger">{t('readOnly')}</p>}
      {!valid && <p className="rs-live rs-danger">selectTop ≤ hydrateTop ≤ maxCandidates; licenses ≥ 1</p>}
      <div className="rs-between">
        <button className="rs-button" type="button" disabled={disabled} onClick={() => { dialog.current?.showModal() }}>{t('clearCache')}</button>
        <button className="rs-button rs-button-primary" type="button" disabled={disabled || !valid} onClick={() => { void save() }}>{t('save')}</button>
      </div>
      <p className="rs-live" role="status" aria-live="polite">{message}</p>

      <dialog ref={dialog} className="rs-dialog">
        <form method="dialog">
          <h3 className="rs-title">{t('clearCache')}</h3><p className="rs-hint">{t('clearConfirm')}</p>
          <div className="rs-actions"><button className="rs-button" value="cancel">{t('cancel')}</button><button className="rs-button rs-button-primary" value="confirm" onClick={() => { void props.clearReferenceCache().then(() => { setMessage(t('cleared')) }) }}>{t('confirm')}</button></div>
        </form>
      </dialog>
    </li>
  )
}
