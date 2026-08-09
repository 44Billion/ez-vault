import { defineLocales, getT, subscribeLocaleChanged } from './index.js'

export const shellLocales = defineLocales({
  'New Account': ['Nouveau compte', 'Nuovo account', 'Neues Konto', 'Nueva cuenta', 'Nova conta', 'Новая учётная запись', '新建账户', '新增帳戶', '新しいアカウント', '새 계정'],
  'Add Account': ['Ajouter un compte', 'Aggiungi account', 'Konto hinzufügen', 'Añadir cuenta', 'Adicionar conta', 'Добавить учётную запись', '添加账户', '新增帳戶', 'アカウントを追加', '계정 추가'],
  Add: ['Ajouter', 'Aggiungi', 'Hinzufügen', 'Añadir', 'Adicionar', 'Добавить', '添加', '新增', '追加', '추가'],
  'Sync Devices': ['Synchroniser les appareils', 'Sincronizza dispositivi', 'Geräte synchronisieren', 'Sincronizar dispositivos', 'Sincronizar dispositivos', 'Синхронизировать устройства', '同步设备', '同步裝置', 'デバイスを同期', '기기 동기화'],
  Sync: ['Synchroniser', 'Sincronizza', 'Synchronisieren', 'Sincronizar', 'Sincronizar', 'Синхронизация', '同步', '同步', '同期', '동기화'],
  'Trusted devices': ['Appareils de confiance', 'Dispositivi attendibili', 'Vertrauenswürdige Geräte', 'Dispositivos de confianza', 'Dispositivos confiáveis', 'Доверенные устройства', '受信任的设备', '受信任的裝置', '信頼済みデバイス', '신뢰할 수 있는 기기'],
  'Activity log': ['Journal d’activité', 'Registro attività', 'Aktivitätsprotokoll', 'Registro de actividad', 'Registro de atividades', 'Журнал активности', '活动日志', '活動記錄', 'アクティビティログ', '활동 로그']
})

const t = getT(shellLocales)
const textKeys = {
  'new-account': 'New Account',
  'add-account': 'Add Account',
  add: 'Add',
  'sync-devices': 'Sync Devices',
  sync: 'Sync'
}
const headerKeys = {
  'trusted-devices': 'Trusted devices',
  'activity-log': 'Activity log'
}

export function translateShell () {
  for (const [name, key] of Object.entries(textKeys)) {
    const node = document.querySelector(`[data-i18n="${name}"]`)
    if (node) node.textContent = t(key)
  }
  for (const [name, key] of Object.entries(headerKeys)) {
    const panel = document.querySelector(`[data-i18n-header="${name}"]`)
    panel?.setAttribute('header', t(key))
    const label = panel?.querySelector('.accordion-label')
    if (label) label.textContent = t(key)
  }
}

export function initShellI18n () {
  translateShell()
  return subscribeLocaleChanged(translateShell)
}
