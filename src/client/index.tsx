import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { ReferenceScoutConfig } from '../types.js'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { referenceResearchDefinition, referenceResearchView } from './data.js'
import { en, NS, zh, type ReferenceScoutKey } from './locales.js'
import {
  ReferenceHeaderAction, ReferencePanel, ReferencePanelTitle, ReferenceToolView,
  type ReferenceActionsFace,
} from './research-ui.js'
import { ReferenceSettingsCard, type CredentialState, type ReferenceSettingsFace } from './settings-card.js'
import { installStyles } from './styles.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    referenceScout: ReferenceScoutKey
  }
}

export const name = 'reference-scout-client'
export const inject = [
  'slots', 'locale', 'uiConversation', 'sidebarRight', 'sidebarRightTabs',
  'settingsScope', 'remote', 'remote.commands', 'remote.credentials',
]

const PANEL_ID = 'dsh-reference-scout'
const PANEL_KIND = 'reference-scout'

export function apply(ctx: Context): void {
  ctx.effect(() => installStyles(), 'reference-scout: styles')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'reference-scout: dictionaries')
  ctx.uiConversation.events.register(referenceResearchDefinition)
  ctx.uiConversation.views.register(referenceResearchView)

  const settings = ctx.settingsScope.bind<ReferenceScoutConfig>({ namespace: 'reference-scout' })
  const credential = createSnapshotStore<CredentialState>({ status: 'loading' })
  let requestedRef = ''
  const refreshCredential = async (): Promise<void> => {
    const ref = settings.getSnapshot().value?.github.tokenEnv?.trim()
    if (ref === undefined || ref === '') {
      credential.set({ status: 'not-configured' })
      return
    }
    requestedRef = ref
    credential.set({ status: 'loading' })
    const response = await ctx.remote.credentials.describe([ref])
    if (requestedRef !== ref) return
    if (!response.ok) {
      credential.set({ status: 'unavailable' })
      return
    }
    const info = response.value[ref]
    credential.set(info?.configured === true
      ? { status: 'configured', ...(info.source === undefined ? {} : { source: info.source }) }
      : { status: 'not-configured' })
  }
  ctx.effect(() => settings.subscribe(() => { void refreshCredential() }), 'reference-scout: credential setting')
  ctx.effect(() => ctx.remote.$on('credentials/reference-updated', ref => {
    if (ref === requestedRef) void refreshCredential()
  }), 'reference-scout: credential invalidation')
  void refreshCredential()

  const settingsFace: ReferenceSettingsFace = {
    hooks: { referenceSettings: settings, referenceCredential: credential },
    async saveReferenceSettings(value) {
      await settings.mutate([
        { op: 'set', path: ['enabled'], value: value.enabled },
        { op: 'set', path: ['autoTrigger'], value: value.autoTrigger },
        { op: 'set', path: ['mode'], value: value.mode },
        { op: 'set', path: ['intent'], value: JSON.parse(JSON.stringify(value.intent)) },
        { op: 'set', path: ['github'], value: JSON.parse(JSON.stringify(value.github)) },
        { op: 'set', path: ['evidence'], value: JSON.parse(JSON.stringify(value.evidence)) },
        { op: 'set', path: ['policy'], value: JSON.parse(JSON.stringify(value.policy)) },
        { op: 'set', path: ['cacheTtlMs'], value: value.cacheTtlMs },
      ])
    },
    async clearReferenceCache() {
      await settings.set('maintenanceEpoch', Date.now())
    },
  }

  const actionFace = (boundSessionId: SessionId): ReferenceActionsFace => ({
    hooks: { referenceResearch: ctx.uiConversation.binding(boundSessionId).target('reference-scout') },
    openReferencePanel() { ctx.sidebarRight.openTab(PANEL_KIND) },
    async runReferenceAction(sessionId, action, query, reason) {
      const payload = JSON.stringify({ action, query, ...(reason === undefined ? {} : { reason }) })
      const response = await ctx.remote.commands.execute(sessionId, `/reference ${payload}`, [])
      if (!response.ok) return `${response.error.message} (${response.error.code})`
      if (response.value === undefined) return 'unknown command: /reference'
      return response.value.result.kind === 'error' ? response.value.result.text : null
    },
  })

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PANEL_ID,
    kind: PANEL_KIND,
    priority: 'extension',
    title: () => ctx.locale.bind(NS)('panelTitle'),
    guide: [{
      order: 40,
      title: () => ctx.locale.bind(NS)('panelTitle'),
      description: () => ctx.locale.bind(NS)('panelDescription'),
    }],
  }), 'reference-scout: right panel type')

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item', key: 'reference-scout', locale: NS, inject: () => settingsFace,
  }, ReferenceSettingsCard))
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'reference-scout', order: 30, locale: NS, inject: actionFace,
  }, ReferenceHeaderAction))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'research_reference', locale: NS, inject: actionFace,
  }, ReferenceToolView))
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: PANEL_ID, locale: NS, inject: actionFace,
  }, ReferencePanel)), 'reference-scout: panel body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title', key: PANEL_ID,
  }, ReferencePanelTitle)), 'reference-scout: panel title')
}
