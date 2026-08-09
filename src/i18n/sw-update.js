import { defineLocales } from './index.js'

// Shared by the in-flow update banner and the lock/create overlay
// indicators (single translation source for the update prompt).
export const swUpdateLocales = defineLocales({
  'Update available': ['Mise à jour disponible', 'Aggiornamento disponibile', 'Update verfügbar', 'Actualización disponible', 'Atualização disponível', 'Доступно обновление', '有可用更新', '有可用更新', 'アップデートがあります', '업데이트 사용 가능'],
  Update: ['Mettre à jour', 'Aggiorna', 'Aktualisieren', 'Actualizar', 'Atualizar', 'Обновить', '更新', '更新', '更新', '업데이트']
})
