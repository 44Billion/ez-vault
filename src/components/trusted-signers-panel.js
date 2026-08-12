import { injectComponentStyles } from '../helpers/dom.js'
import * as trustedSigners from '../services/trusted-signers.js'
import * as secrets from '../services/secrets.js'
import * as passkey from '../services/passkey.js'
import * as toast from './shared/toast.js'
import { defineLocales, getLocale, getT, subscribeLocaleChanged } from '../i18n/index.js'

export const trustedSignersLocales = defineLocales({
  unknown: ['inconnu', 'sconosciuto', 'unbekannt', 'desconocido', 'desconhecido', 'неизвестно', '未知', '未知', '不明', '알 수 없음'],
  'No trusted devices yet.': ['Aucun appareil de confiance.', 'Nessun dispositivo attendibile.', 'Noch keine vertrauenswürdigen Geräte.', 'Aún no hay dispositivos de confianza.', 'Ainda não há dispositivos confiáveis.', 'Доверенных устройств пока нет.', '尚无受信任的设备。', '尚無受信任的裝置。', '信頼済みデバイスはまだありません。', '아직 신뢰할 수 있는 기기가 없습니다.'],
  'Unlock to view trusted devices.': ['Déverrouillez pour voir les appareils de confiance.', 'Sblocca per vedere i dispositivi attendibili.', 'Entsperren, um vertrauenswürdige Geräte anzuzeigen.', 'Desbloquea para ver los dispositivos de confianza.', 'Desbloqueie para ver os dispositivos confiáveis.', 'Разблокируйте, чтобы увидеть доверенные устройства.', '解锁以查看受信任的设备。', '解鎖以查看受信任的裝置。', '信頼済みデバイスを表示するにはロックを解除してください。', '신뢰할 수 있는 기기를 보려면 잠금을 해제하세요.'],
  'Unlock with passkey': ['Déverrouiller avec la clé d’accès', 'Sblocca con passkey', 'Mit Passkey entsperren', 'Desbloquear con passkey', 'Desbloquear com passkey', 'Разблокировать ключом доступа', '使用通行密钥解锁', '使用通行金鑰解鎖', 'パスキーでロック解除', '패스키로 잠금 해제'],
  'Trusted device': ['Appareil de confiance', 'Dispositivo attendibile', 'Vertrauenswürdiges Gerät', 'Dispositivo de confianza', 'Dispositivo confiável', 'Доверенное устройство', '受信任的设备', '受信任的裝置', '信頼済みデバイス', '신뢰할 수 있는 기기'],
  'trusted {{time}}': ['approuvé {{time}}', 'attendibile {{time}}', 'vertraut {{time}}', 'de confianza {{time}}', 'confiável {{time}}', 'доверено {{time}}', '受信任于 {{time}}', '信任於 {{time}}', '信頼日時 {{time}}', '신뢰됨 {{time}}'],
  'Remove trusted device': ['Supprimer l’appareil de confiance', 'Rimuovi dispositivo attendibile', 'Vertrauenswürdiges Gerät entfernen', 'Eliminar dispositivo de confianza', 'Remover dispositivo confiável', 'Удалить доверенное устройство', '移除受信任的设备', '移除受信任的裝置', '信頼済みデバイスを削除', '신뢰할 수 있는 기기 삭제'],
  'Remove this trusted device? Future sync will stop, but data already synced to it cannot be removed.': ['Supprimer cet appareil de confiance ? La synchronisation future s’arrêtera, mais les données déjà synchronisées ne pourront pas être supprimées.', 'Rimuovere questo dispositivo attendibile? La sincronizzazione futura si interromperà, ma i dati già sincronizzati non potranno essere rimossi.', 'Dieses vertrauenswürdige Gerät entfernen? Künftige Synchronisierung wird beendet, bereits synchronisierte Daten können jedoch nicht entfernt werden.', '¿Eliminar este dispositivo de confianza? La sincronización futura se detendrá, pero los datos ya sincronizados no se pueden eliminar.', 'Remover este dispositivo confiável? Sincronizações futuras serão interrompidas, mas os dados já sincronizados não poderão ser removidos.', 'Удалить это доверенное устройство? Дальнейшая синхронизация прекратится, но уже синхронизированные данные удалить нельзя.', '要移除此受信任的设备吗？之后将停止同步，但已同步到该设备的数据无法移除。', '要移除此受信任的裝置嗎？之後將停止同步，但已同步到該裝置的資料無法移除。', 'この信頼済みデバイスを削除しますか？今後の同期は停止しますが、すでに同期されたデータは削除できません。', '이 신뢰할 수 있는 기기를 삭제할까요? 향후 동기화는 중지되지만 이미 동기화된 데이터는 삭제할 수 없습니다.'],
  'Trusted device removed': ['Appareil de confiance supprimé', 'Dispositivo attendibile rimosso', 'Vertrauenswürdiges Gerät entfernt', 'Dispositivo de confianza eliminado', 'Dispositivo confiável removido', 'Доверенное устройство удалено', '已移除受信任的设备', '已移除受信任的裝置', '信頼済みデバイスを削除しました', '신뢰할 수 있는 기기 삭제됨'],
  'Could not remove device': ['Impossible de supprimer l’appareil', 'Impossibile rimuovere il dispositivo', 'Gerät konnte nicht entfernt werden', 'No se pudo eliminar el dispositivo', 'Não foi possível remover o dispositivo', 'Не удалось удалить устройство', '无法移除设备', '無法移除裝置', 'デバイスを削除できませんでした', '기기를 삭제하지 못했습니다'],
  'Could not unlock': ['Impossible de déverrouiller', 'Impossibile sbloccare', 'Entsperren nicht möglich', 'No se pudo desbloquear', 'Não foi possível desbloquear', 'Не удалось разблокировать', '无法解锁', '無法解鎖', 'ロックを解除できませんでした', '잠금을 해제하지 못했습니다']
})

const t = getT(trustedSignersLocales)

const ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3l6 0v3" /></svg>'
const ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>'

const STYLES = /* css */`
  trusted-signers-panel {
    display: block;
  }
  body:not(.dev) accordion-panel:has(trusted-signers-panel[data-empty]) {
    display: none;
  }
  trusted-signers-panel .empty-state {
    margin: 0;
    color: var(--fg);
    font-size: 13rem;
    line-height: 1.35;
  }
  trusted-signers-panel .locked-state {
    display: grid;
    gap: 10px;
  }
  trusted-signers-panel .unlock-btn {
    min-height: 36px;
    border: 0;
    border-radius: 9999px;
    padding: 9px 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background-color: var(--success);
    color: var(--fg-on-accent);
    font-size: 13rem;
    font-weight: 600;
    cursor: pointer;
  }
  trusted-signers-panel .unlock-btn:active {
    background-color: var(--success-active);
  }
  trusted-signers-panel .unlock-btn:disabled {
    opacity: 0.7;
    cursor: default;
  }
  trusted-signers-panel .unlock-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  trusted-signers-panel .unlock-icon svg {
    width: 16px;
    height: 16px;
  }
  trusted-signers-panel .device-list {
    display: grid;
    gap: 8px;
  }
  trusted-signers-panel .device-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    gap: 8px;
    align-items: start;
    padding: 8px 0;
    border-top: 1px solid var(--border);
  }
  trusted-signers-panel .device-row:first-child {
    border-top: 0;
    padding-top: 0;
  }
  trusted-signers-panel .device-title {
    color: var(--fg-strong);
    font-size: 14rem;
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  trusted-signers-panel .device-meta {
    margin-top: 3px;
    color: var(--fg);
    font-size: 12rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  trusted-signers-panel .remove-btn {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--error-fg);
    background-color: oklch(from var(--error) l c h / 0.5);
    cursor: pointer;
  }
  trusted-signers-panel .remove-btn:active {
    background-color: oklch(from var(--error) l c h / 0.65);
  }
  trusted-signers-panel .remove-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }
  trusted-signers-panel .remove-btn svg {
    width: 17px;
    height: 17px;
  }
`

function shortPubkey (pubkey) {
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-8)}`
}

function formatTime (seconds) {
  if (!seconds) return t('unknown')
  try {
    return new Date(seconds * 1000).toLocaleString(getLocale())
  } catch {
    return t('unknown')
  }
}

export class TrustedSignersPanel extends HTMLElement {
  #unsubscribers = []

  connectedCallback () {
    injectComponentStyles('trusted-signers-panel', STYLES)
    this.#unsubscribers.push(trustedSigners.subscribe(() => this.#render()))
    this.#unsubscribers.push(secrets.subscribe(() => this.#render()))
    this.#unsubscribers.push(subscribeLocaleChanged(() => this.#render()))
    this.#render()
  }

  disconnectedCallback () {
    for (const unsubscribe of this.#unsubscribers.splice(0)) unsubscribe()
  }

  #render () {
    const signers = trustedSigners.list()
    if (!signers.length) {
      if (!secrets.isUnlocked() && passkey.hasPasskey() && trustedSigners.hasStoredActive()) {
        this.#renderLocked()
        return
      }
      this.dataset.empty = 'true'
      this.innerHTML = `<p class="empty-state">${t('No trusted devices yet.')}</p>`
      return
    }
    delete this.dataset.empty
    this.replaceChildren(this.#deviceList(signers))
  }

  #renderLocked () {
    delete this.dataset.empty
    this.innerHTML = `
      <div class="locked-state">
        <p class="empty-state">${t('Unlock to view trusted devices.')}</p>
        <button type="button" class="unlock-btn">
          <span class="unlock-icon">${ICON_LOCK}</span>
          <span>${t('Unlock with passkey')}</span>
        </button>
      </div>
    `
    this.querySelector('.unlock-btn')?.addEventListener('click', event => this.#unlock(event.currentTarget))
  }

  #deviceList (signers) {
    const list = document.createElement('div')
    list.className = 'device-list'
    for (const signer of signers) list.append(this.#deviceRow(signer))
    return list
  }

  #deviceRow (signer) {
    const row = document.createElement('div')
    row.className = 'device-row'

    const body = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'device-title'
    title.textContent = signer.platform || t('Trusted device')
    const meta = document.createElement('div')
    meta.className = 'device-meta'
    meta.textContent = `${shortPubkey(signer.pubkey)} · ${t('trusted {{time}}', { time: formatTime(signer.addedAt || signer.updatedAt) })}`
    body.append(title, meta)

    const remove = document.createElement('button')
    remove.className = 'remove-btn'
    remove.type = 'button'
    remove.title = t('Remove trusted device')
    remove.innerHTML = ICON_TRASH
    remove.addEventListener('click', () => this.#removeSigner(signer.pubkey, remove))

    row.append(body, remove)
    return row
  }

  async #removeSigner (pubkey, button) {
    const ok = window.confirm(t('Remove this trusted device? Future sync will stop, but data already synced to it cannot be removed.'))
    if (!ok) return
    button.disabled = true
    try {
      await passkey.ensureRegistered()
      const actorPubkey = await secrets.getDeviceSignerPubkey()
      await trustedSigners.remove(pubkey, { actorPubkey })
      toast.success(t('Trusted device removed'))
    } catch (err) {
      button.disabled = false
      toast.error(t('Could not remove device'), err?.message ?? String(err))
    }
  }

  async #unlock (button) {
    if (button.disabled) return
    const icon = button.querySelector('.unlock-icon')
    button.disabled = true
    icon?.classList.add('pulsate')
    try {
      await passkey.unlock()
      passkey.flushPendingIconUpdate().catch(err => {
        console.warn('icon signal failed', err?.message ?? err)
      })
    } catch (err) {
      console.error('passkey unlock failed', err?.message ?? err)
      toast.error(t('Could not unlock'), err?.message ?? '')
    } finally {
      button.disabled = false
      icon?.classList.remove('pulsate')
    }
  }
}

customElements.define('trusted-signers-panel', TrustedSignersPanel)
