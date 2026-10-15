import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Card, Field, Modal, Badge, useToast } from '../components/ui';

interface QuestionDef { title: string; type: 'PARAGRAPH' | 'MULTIPLE_CHOICE'; options?: string[]; required?: boolean }

interface FormItem {
  id: string;
  title: string;
  description: string | null;
  type: 'APPLICATION' | 'REPORT' | 'OTHER';
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  formKey: string | null;
  googleFormUrl: string | null;
  questions: QuestionDef[];
  webhook: {
    enabled: boolean;
    hasCustomUrl: boolean;
    urlMasked: string | null;
    username: string | null;
    avatarUrl: string | null;
    content: string | null;
    title: string | null;
    color: number | null;
    footer: string | null;
    timestamp: boolean;
    mention: string | null;
  };
}

/* Шаблоны форм (§ ТЗ: 5 шаблонов) */
const TEMPLATES: Record<string, { title: string; description: string; type: FormItem['type']; questions: QuestionDef[] }> = {
  blank: { title: '', description: '', type: 'APPLICATION', questions: [{ title: 'Ваш игровой никнейм', type: 'PARAGRAPH' }] },
  joining: {
    title: 'Заявка на вступление в Sheriff Department',
    description: 'Заполните все поля. Заявка рассматривается в Discord.',
    type: 'APPLICATION',
    questions: [
      { title: 'Ваш игровой никнейм', type: 'PARAGRAPH' },
      { title: 'Ваш игровой ID', type: 'PARAGRAPH' },
      { title: 'Ваш Discord-тег', type: 'PARAGRAPH' },
      { title: 'Возраст', type: 'PARAGRAPH' },
      { title: 'Почему хотите вступить в Sheriff Department?', type: 'PARAGRAPH' },
      { title: 'Ваш опыт в роли государственных структур', type: 'PARAGRAPH' },
    ],
  },
  report: {
    title: 'Отчёт о проделанной работе',
    description: 'Отчёт сдаётся раз в неделю. Ответы автоматически попадают в статистику.',
    type: 'REPORT',
    questions: [
      { title: 'Ваш игровой никнейм', type: 'PARAGRAPH' },
      { title: 'Ваш игровой ID', type: 'PARAGRAPH' },
      { title: 'Что было сделано за отчётный период', type: 'PARAGRAPH' },
      { title: 'Дата отчётного периода', type: 'PARAGRAPH' },
    ],
  },
  leave: {
    title: 'Заявка на отпуск / неактив',
    description: 'Укажите срок и причину. Рассмотрение в Discord.',
    type: 'APPLICATION',
    questions: [
      { title: 'Ваш игровой никнейм', type: 'PARAGRAPH' },
      { title: 'Ваш игровой ID', type: 'PARAGRAPH' },
      { title: 'Срок неактива (даты)', type: 'PARAGRAPH' },
      { title: 'Причина', type: 'PARAGRAPH' },
    ],
  },
  recert: {
    title: 'Заявка на переаттестацию',
    description: 'Заполните данные для назначения даты переаттестации.',
    type: 'APPLICATION',
    questions: [
      { title: 'Ваш игровой никнейм', type: 'PARAGRAPH' },
      { title: 'Ваш игровой ID', type: 'PARAGRAPH' },
      { title: 'Текущее звание', type: 'PARAGRAPH' },
      { title: 'Удобное время для переаттестации', type: 'PARAGRAPH' },
    ],
  },
};

function intToHex(c: number | null): string {
  return '#' + (c == null ? 'd4af37' : c.toString(16).padStart(6, '0'));
}
function hexToInt(hex: string): number {
  const v = parseInt(hex.replace('#', ''), 16);
  return isNaN(v) ? 0xd4af37 : v;
}

export default function FormEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = !id;

  const [loaded, setLoaded] = useState(isNew);
  const [item, setItem] = useState<FormItem | null>(null);
  const [busy, setBusy] = useState(false);

  // Основное
  const [template, setTemplate] = useState('blank');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<FormItem['type']>('APPLICATION');
  const [status, setStatus] = useState<FormItem['status']>('DRAFT');
  const [googleFormUrl, setGoogleFormUrl] = useState('');
  const [questions, setQuestions] = useState<QuestionDef[]>([]);

  // Вебхук
  const [whEnabled, setWhEnabled] = useState(true);
  const [whUrl, setWhUrl] = useState('');
  const [whUrlReplace, setWhUrlReplace] = useState(false);
  const [whUsername, setWhUsername] = useState('');
  const [whAvatar, setWhAvatar] = useState('');
  const [whContent, setWhContent] = useState('');
  const [whTitle, setWhTitle] = useState('');
  const [whColor, setWhColor] = useState('#d4af37');
  const [whFooter, setWhFooter] = useState('');
  const [whTimestamp, setWhTimestamp] = useState(true);
  const [whMention, setWhMention] = useState('');

  const [scriptModal, setScriptModal] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<{ item: FormItem }>(`/forms/${id}`)
      .then(({ item: f }) => {
        setItem(f);
        setTitle(f.title);
        setDescription(f.description || '');
        setType(f.type);
        setStatus(f.status);
        setGoogleFormUrl(f.googleFormUrl || '');
        setQuestions((f.questions as QuestionDef[]) || []);
        setWhEnabled(f.webhook.enabled);
        setWhUsername(f.webhook.username || '');
        setWhAvatar(f.webhook.avatarUrl || '');
        setWhContent(f.webhook.content || '');
        setWhTitle(f.webhook.title || '');
        setWhColor(intToHex(f.webhook.color));
        setWhFooter(f.webhook.footer || '');
        setWhTimestamp(f.webhook.timestamp);
        setWhMention(f.webhook.mention || '');
        setLoaded(true);
      })
      .catch((e) => { toast(e.message, 'error'); navigate('/forms'); });
  }, [id]);

  const applyTemplate = (key: string) => {
    setTemplate(key);
    const t = TEMPLATES[key];
    if (!t || !isNew) return;
    setTitle(t.title);
    setDescription(t.description);
    setType(t.type);
    setQuestions(t.questions.map((q) => ({ ...q, options: q.options ? [...q.options] : undefined })));
  };

  const savePayload = () => ({
    title,
    description: description || null,
    type,
    status,
    questions,
    ...(googleFormUrl !== (item?.googleFormUrl || '') ? { googleFormUrl: googleFormUrl || null } : {}),
    webhook: {
      enabled: whEnabled,
      username: whUsername || null,
      avatarUrl: whAvatar || null,
      content: whContent || null,
      title: whTitle || null,
      color: hexToInt(whColor),
      footer: whFooter || null,
      timestamp: whTimestamp,
      mention: (whMention || null) as string | null,
    },
  });

  const save = async (): Promise<string | null> => {
    setBusy(true);
    try {
      if (isNew) {
        const payload: any = savePayload();
        if (whUrl) payload.webhookUrl = whUrl;
        const { item: created } = await api.post<{ item: FormItem }>('/forms', payload);
        toast('Форма создана', 'success');
        navigate(`/forms/${created.id}/edit`, { replace: true });
        return created.id;
      } else {
        const payload: any = savePayload();
        if (whUrlReplace && whUrl) payload.webhookUrl = whUrl;
        const { item: updated } = await api.patch<{ item: FormItem }>(`/forms/${id}`, payload);
        setItem(updated);
        toast('Сохранено', 'success');
        return id!;
      }
    } catch (e: any) {
      toast(e.message, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const testWebhook = async () => {
    let target = id;
    if (!target) {
      target = await save();
      if (!target) return;
    }
    try {
      const res = await api.post<{ ok: boolean; error: string | null; targetMasked: string | null }>(`/forms/${target}/test-webhook`);
      if (res.ok) toast(`Тестовое сообщение отправлено в ${res.targetMasked}`, 'success');
      else toast(`Ошибка отправки: ${res.error}`, 'error');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const createGoogleForm = async () => {
    let target = id;
    if (!target) {
      target = await save();
      if (!target) return;
    }
    try {
      const res = await api.post<{ item: { googleFormUrl: string; editUri: string } }>(`/forms/${target}/create-google-form`);
      setGoogleFormUrl(res.item.googleFormUrl);
      toast('Google Форма создана! Ссылка для заполнения получена.', 'success');
      window.open(res.item.editUri, '_blank');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const showAppsScript = async () => {
    let target = id;
    if (!target) {
      target = await save();
      if (!target) return;
    }
    try {
      const res = await api.get<{ code: string }>(`/forms/${target}/apps-script`);
      setScriptModal(res.code);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const clearWebhookUrl = async () => {
    if (!id) return;
    try {
      await api.patch(`/forms/${id}`, { webhookUrl: null });
      setItem((prev) => (prev ? { ...prev, webhook: { ...prev.webhook, hasCustomUrl: false, urlMasked: null } } : prev));
      setWhUrlReplace(false);
      setWhUrl('');
      toast('Вебхук формы удалён (будет использоваться глобальный)', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const updateQuestion = (i: number, patch: Partial<QuestionDef>) => {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  };

  const previewColor = useMemo(() => whColor, [whColor]);

  if (!loaded) return null;

  return (
    <>
      <div className="flex-between">
        <h1>{isNew ? 'Новая форма' : 'Конструктор формы'}</h1>
        <Link to="/forms">К списку форм</Link>
      </div>

      {isNew && (
        <Card title="Шаблон">
          <div className="form-row">
            <Field label="Выберите шаблон (заполнит поля ниже)">
              <select value={template} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="blank">Пустая форма</option>
                <option value="joining">Заявка на вступление</option>
                <option value="report">Отчёт о работе</option>
                <option value="leave">Отпуск / неактив</option>
                <option value="recert">Переаттестация</option>
              </select>
            </Field>
          </div>
        </Card>
      )}

      <Card title="Основное">
        <Field label="Название формы *">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Заявка на вступление" />
        </Field>
        <Field label="Описание">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Пояснение для заполняющих" />
        </Field>
        <div className="form-row">
          <Field label="Тип" hint="Ответы формы-отчёта создают отчёт сотруднику">
            <select value={type} onChange={(e) => setType(e.target.value as FormItem['type'])}>
              <option value="APPLICATION">Заявка</option>
              <option value="REPORT">Отчёт</option>
              <option value="OTHER">Другое</option>
            </select>
          </Field>
          <Field label="Статус">
            <select value={status} onChange={(e) => setStatus(e.target.value as FormItem['status'])}>
              <option value="DRAFT">Черновик</option>
              <option value="ACTIVE">Активна</option>
              <option value="ARCHIVED">Архив</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Вопросы формы" actions={<Badge kind="info">{questions.length} вопрос(ов)</Badge>}>
        <div className="muted small" style={{ marginBottom: 10 }}>
          Используются при создании настоящей Google Формы через Forms API.
        </div>
        {questions.map((q, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <div className="form-row">
              <Field label={`Вопрос ${i + 1}`}>
                <input type="text" value={q.title} onChange={(e) => updateQuestion(i, { title: e.target.value })} />
              </Field>
              <Field label="Тип" >
                <select value={q.type} onChange={(e) => updateQuestion(i, { type: e.target.value as QuestionDef['type'] })}>
                  <option value="PARAGRAPH">Развёрнутый ответ</option>
                  <option value="MULTIPLE_CHOICE">Один вариант</option>
                </select>
              </Field>
            </div>
            {q.type === 'MULTIPLE_CHOICE' && (
              <Field label="Варианты (по одному в строке)">
                <textarea
                  value={(q.options || []).join('\n')}
                  onChange={(e) => updateQuestion(i, { options: e.target.value.split('\n').filter(Boolean) })}
                />
              </Field>
            )}
            <div className="flex-between">
              <label className="checkbox-row" style={{ marginBottom: 0 }}>
                <input type="checkbox" checked={q.required !== false} onChange={(e) => updateQuestion(i, { required: e.target.checked })} />
                <span className="small">Обязательный</span>
              </label>
              <button className="btn sm danger" onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== i))}>Удалить вопрос</button>
            </div>
          </div>
        ))}
        <button className="btn" onClick={() => setQuestions((qs) => [...qs, { title: '', type: 'PARAGRAPH', required: true }])}>
          Добавить вопрос
        </button>
      </Card>

      <Card title="Google Форма">
        <Field label="Ссылка на форму для заполнения" hint="Вставьте готовую ссылку или создайте форму через API">
          <input type="url" value={googleFormUrl} onChange={(e) => setGoogleFormUrl(e.target.value)} placeholder="https://docs.google.com/forms/d/…" />
        </Field>
        <div className="flex">
          <button className="btn" onClick={createGoogleForm} disabled={busy || questions.length === 0} title="Создать настоящую Google Форму по вопросам выше">
            Создать в Google (Forms API)
          </button>
          <button className="btn" onClick={showAppsScript}>Apps Script для этой формы</button>
        </div>
      </Card>

      <Card title="Discord-вебхук этой формы">
        <div className="muted small" style={{ marginBottom: 12 }}>
          Настройки действуют на ответы именно этой формы. Текст, цвет, аватарка — как в обычном Discord-вебхуке.
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={whEnabled} onChange={(e) => setWhEnabled(e.target.checked)} />
          <span>Отправлять ответы формы в Discord</span>
        </label>

        <Field
          label={item?.webhook.hasCustomUrl ? 'URL вебхука формы (сохранён скрытно)' : 'URL вебхука формы'}
          hint={
            item?.webhook.hasCustomUrl
              ? `Сохранён: ${item.webhook.urlMasked}. Включите «Заменить», чтобы задать новый.`
              : 'Discord: настройки канала → Интеграции → Вебхуки → создать и скопировать URL. Если не указан — используется глобальный.'
          }
        >
          <div className="flex">
            {item?.webhook.hasCustomUrl && (
              <label className="checkbox-row" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={whUrlReplace} onChange={(e) => setWhUrlReplace(e.target.checked)} />
                <span>Заменить</span>
              </label>
            )}
            <input
              type="password"
              value={whUrl}
              onChange={(e) => setWhUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…"
              disabled={Boolean(item?.webhook.hasCustomUrl) && !whUrlReplace}
            />
          </div>
        </Field>
        {item?.webhook.hasCustomUrl && (
          <button className="btn sm danger" onClick={clearWebhookUrl} style={{ marginBottom: 12 }}>
            Удалить вебхук формы (вернуть глобальный)
          </button>
        )}

        <div className="form-row">
          <Field label="Имя отправителя" hint="Имя вебхука в Discord">
            <input type="text" value={whUsername} onChange={(e) => setWhUsername(e.target.value)} placeholder="Sheriff Department" />
          </Field>
          <Field label="Аватарка (ссылка на изображение)">
            <input type="url" value={whAvatar} onChange={(e) => setWhAvatar(e.target.value)} placeholder="https://…/avatar.png" />
          </Field>
        </div>

        <Field label="Текст сообщения (content)" hint="Виден над embed. Можно оставить пустым.">
          <textarea value={whContent} onChange={(e) => setWhContent(e.target.value)} placeholder="Новая заявка — рассмотрение в Discord" />
        </Field>

        <div className="form-row">
          <Field label="Упоминание">
            <select value={whMention} onChange={(e) => setWhMention(e.target.value)}>
              <option value="">Без упоминания</option>
              <option value="@everyone">@everyone</option>
              <option value="@here">@here</option>
            </select>
          </Field>
          <Field label="Цвет линии embed">
            <div className="color-row">
              <input type="color" value={previewColor} onChange={(e) => setWhColor(e.target.value)} />
              <input type="text" value={whColor} onChange={(e) => setWhColor(e.target.value)} />
            </div>
          </Field>
        </div>

        <div className="form-row">
          <Field label="Заголовок embed" hint="По умолчанию — название формы">
            <input type="text" value={whTitle} onChange={(e) => setWhTitle(e.target.value)} placeholder={title || 'Заголовок'} />
          </Field>
          <Field label="Текст снизу (footer)">
            <input type="text" value={whFooter} onChange={(e) => setWhFooter(e.target.value)} placeholder="Sheriff Department — ответ формы" />
          </Field>
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={whTimestamp} onChange={(e) => setWhTimestamp(e.target.checked)} />
          <span>Показывать время ответа в Discord</span>
        </label>

        <DiscordPreview
          username={whUsername || 'Sheriff Department'}
          avatar={whAvatar}
          mention={whMention}
          content={whContent}
          title={whTitle || title || 'Заголовок формы'}
          color={previewColor}
          footer={whFooter || 'Sheriff Department — ответ формы'}
          timestamp={whTimestamp}
        />
      </Card>

      <div className="flex" style={{ marginBottom: 40 }}>
        <button className="btn primary" onClick={save} disabled={busy || title.trim().length < 2}>
          {busy ? 'Сохранение…' : 'Сохранить форму'}
        </button>
        <button className="btn" onClick={testWebhook} disabled={busy}>Проверить вебхук</button>
        <button className="btn" onClick={showAppsScript}>Apps Script</button>
      </div>

      {scriptModal && (
        <Modal title="Apps Script для этой формы" onClose={() => setScriptModal(null)} wide>
          <ol className="small" style={{ marginTop: 0 }}>
            <li>Откройте вашу Google Форму → «Ещё» → «Редактор скриптов».</li>
            <li>Вставьте код ниже вместо содержимого и сохраните.</li>
            <li>Триггеры → Добавить триггер → onSubmit → «Из формы» → «При отправке формы».</li>
          </ol>
          <div className="code-block">{scriptModal}</div>
          <div className="modal-actions">
            <button
              className="btn primary"
              onClick={() => {
                navigator.clipboard.writeText(scriptModal).then(() => toast('Код скопирован', 'success'));
              }}
            >
              Скопировать код
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function DiscordPreview(p: { username: string; avatar: string; mention: string; content: string; title: string; color: string; footer: string; timestamp: boolean }) {
  return (
    <div className="discord-preview mt">
      <div className="dp-header">
        <div className="dp-avatar" style={p.avatar ? { backgroundImage: `url(${p.avatar})` } : undefined} />
        <div>
          <div className="dp-name">{p.username}</div>
        </div>
      </div>
      {(p.mention || p.content) && (
        <div style={{ marginBottom: 4 }}>
          {p.mention && <span className="dp-mention">{p.mention}</span>} {p.content}
        </div>
      )}
      <div className="dp-embed" style={{ borderLeftColor: p.color }}>
        <div className="dp-embed-title">{p.title}</div>
        <div className="dp-field">
          <div className="dp-field-name">Ваш игровой никнейм</div>
          <div className="dp-field-value">John_Smith</div>
        </div>
        <div className="dp-field">
          <div className="dp-field-name">Ваш игровой ID</div>
          <div className="dp-field-value">12345</div>
        </div>
        {p.timestamp && (
          <div className="dp-footer">
            {p.footer} · {new Date().toLocaleString('ru-RU')}
          </div>
        )}
      </div>
    </div>
  );
}
