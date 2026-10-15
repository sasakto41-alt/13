/**
 * Шаблон Google Apps Script: отправка ответов формы в панель.
 * Основан на рабочем скрипте пользователя (Google Forms → Discord),
 * адаптирован: панель сама формирует embed по настройкам вебхука формы.
 */
export function renderAppsScriptTemplate(input: { panelUrl: string; sharedSecret: string; formKey: string }): string {
  return `/**
 * Sheriff Department Panel — отправка ответов Google Form в панель управления.
 *
 * Установка:
 *   1. Откройте форму -> меню «Ещё» (три точки) -> «Редактор скриптов» (Apps Script).
 *   2. Удалите содержимое и вставьте этот код целиком.
 *   3. Сохраните (Ctrl+S).
 *   4. Слева «Триггеры» -> «Добавить триггер» -> функция: onSubmit ->
 *      источник: «Из формы» -> тип: «При отправке формы» -> Сохранить.
 *
 * Скрипт отправляет ответы на защищённый endpoint панели; Discord-сообщение
 * (текст, цвет, аватарка, заголовок) настраивается в конструкторе форм панели.
 */

const PANEL_URL = '${input.panelUrl.replace(/\\'/g, "\\'")}';       // адрес панели
const SHARED_SECRET = '${input.sharedSecret.replace(/\\'/g, "\\'")}';  // INTEGRATION_SHARED_SECRET панели
const FORM_KEY = '${input.formKey.replace(/\\'/g, "\\'")}';            // ключ формы из конструктора

function onSubmit(e) {
  var response = e.response;
  var items = response.getItemResponses().map(function (r) {
    return {
      question: r.getItem().getTitle(),
      answer: r.getResponse()
    };
  });

  var payload = {
    formKey: FORM_KEY,
    externalId: response.getId(),
    formTitle: e.form ? e.form.getTitle() : '',
    respondentEmail: response.getRespondentEmail ? response.getRespondentEmail() : '',
    submittedAt: response.getTimestamp ? response.getTimestamp().toISOString() : new Date().toISOString(),
    answers: items
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Shared-Secret': SHARED_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var url = PANEL_URL.replace(/\\/+$/, '') + '/api/integrations/ingest';
  var res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() >= 300) {
    console.error('Panel ingest failed: ' + res.getResponseCode() + ' ' + res.getContentText());
  }
}
`;
}
