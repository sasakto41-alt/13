/**
 * Sheriff Department Panel — отправка ответов Google Form в панель управления.
 *
 * Установка:
 *   1. Откройте форму -> меню «Ещё» (три точки) -> «Редактор скриптов» (Apps Script).
 *   2. Удалите содержимое и вставьте код, сгенерированный панелью
 *      (Формы -> выбрать форму -> «Apps Script»: он уже содержит адрес панели,
 *       общий секрет и ключ формы).
 *   3. Сохраните (Ctrl+S).
 *   4. Слева «Триггеры» -> «Добавить триггер» -> функция: onSubmit ->
 *      источник: «Из формы» -> тип: «При отправке формы» -> Сохранить.
 *
 * Discord-сообщение (текст, цвет линии, аватарка, заголовок, упоминание)
 * настраивается в конструкторе форм панели — скрипт ничего этого не содержит.
 */

const PANEL_URL = 'https://YOUR-PANEL.up.railway.app';      // адрес панели
const SHARED_SECRET = 'YOUR_INTEGRATION_SHARED_SECRET';     // INTEGRATION_SHARED_SECRET панели
const FORM_KEY = 'F-XXXXXXXX';                              // ключ формы из конструктора

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

  var url = PANEL_URL.replace(/\/+$/, '') + '/api/integrations/ingest';
  var res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() >= 300) {
    console.error('Panel ingest failed: ' + res.getResponseCode() + ' ' + res.getContentText());
  }
}
