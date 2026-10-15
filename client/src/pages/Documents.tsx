import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth';
import { Card, Spinner, Empty, Modal, Field, useToast, fmtDay, Badge } from '../components/ui';

interface DocItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  googleDocId: string | null;
  googleDocUrl: string | null;
  createdAt: string;
}

export default function Documents() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canManage = hasRole('LEADER', 'DEPUTY');

  const [items, setItems] = useState<DocItem[] | null>(null);
  const [googleOk, setGoogleOk] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: '', googleDocUrl: '', createInGoogle: false, kind: 'plain' as 'plain' | 'work_report', days: 30 });

  const load = useCallback(async () => {
    const d = await api.get<{ items: DocItem[]; googleConfigured: boolean }>('/documents');
    setItems(d.items);
    setGoogleOk(d.googleConfigured);
  }, []);

  useEffect(() => { load().catch((e) => toast(e.message, 'error')); }, [load]);

  const create = async () => {
    try {
      await api.post('/documents', {
        title: form.title,
        description: form.description || null,
        category: form.category || null,
        googleDocUrl: form.googleDocUrl || null,
        createInGoogle: form.createInGoogle,
        kind: form.kind,
        days: Number(form.days),
      });
      toast(form.createInGoogle || form.kind === 'work_report' ? 'Google Документ создан' : 'Документ сохранён', 'success');
      setCreating(false);
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const remove = async (d: DocItem) => {
    if (!window.confirm(`Удалить документ «${d.title}»?`)) return;
    try {
      await api.del(`/documents/${d.id}`);
      toast('Удалено', 'success');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <div className="flex-between">
        <h1>Документы</h1>
        {canManage && <button className="btn primary" onClick={() => setCreating(true)}>Добавить документ</button>}
      </div>

      <Card>
        <div className="muted small">
          Приказы, отчёты о работе и инструкции. Документ можно создать как настоящий Google Doc (заполняется
          статистикой за период, если выбран тип «Отчёт о работе»).
        </div>
      </Card>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty text="Документов пока нет" />
      ) : (
        <Card className="mb0">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Название</th><th>Категория</th><th>Создан</th><th>Ссылка</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.title}
                      {d.description && <div className="muted small">{d.description}</div>}
                    </td>
                    <td>{d.category ? <Badge kind="muted">{d.category}</Badge> : '—'}</td>
                    <td className="small">{fmtDay(d.createdAt)}</td>
                    <td>
                      {d.googleDocUrl ? (
                        <a href={d.googleDocUrl} target="_blank" rel="noreferrer">Открыть в Google Docs</a>
                      ) : (
                        <span className="muted small">нет ссылки</span>
                      )}
                    </td>
                    <td className="actions">
                      {hasRole('LEADER') && <button className="btn sm danger" onClick={() => remove(d)}>Удалить</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {creating && (
        <Modal title="Новый документ" onClose={() => setCreating(false)}>
          <Field label="Название *">
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Категория">
            <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Приказ / Инструкция / Отчёт" />
          </Field>
          <Field label="Описание / текст документа">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Или ссылка на существующий документ">
            <input type="url" value={form.googleDocUrl} onChange={(e) => setForm({ ...form, googleDocUrl: e.target.value })} placeholder="https://docs.google.com/document/d/…" />
          </Field>

          <div className="card" style={{ background: 'var(--panel-2)' }}>
            <div className="card-title"><h3>Создание в Google Docs</h3></div>
            {!googleOk && (
              <div className="muted small" style={{ marginBottom: 8 }}>
                Google API не настроено — создание недоступно (см. Настройки → Диагностика).
              </div>
            )}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.createInGoogle}
                disabled={!googleOk}
                onChange={(e) => setForm({ ...form, createInGoogle: e.target.checked })}
              />
              <span>Создать настоящий Google Doc из текста выше</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.kind === 'work_report'}
                disabled={!googleOk}
                onChange={(e) => setForm({ ...form, kind: e.target.checked ? 'work_report' : 'plain', createInGoogle: e.target.checked ? true : form.createInGoogle })}
              />
              <span>Отчёт о работе — автонаполнение статистикой за период</span>
            </label>
            {form.kind === 'work_report' && (
              <Field label="Период (дней)">
                <input type="number" min={1} max={365} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} />
              </Field>
            )}
          </div>

          <div className="modal-actions">
            <button className="btn" onClick={() => setCreating(false)}>Отмена</button>
            <button className="btn primary" onClick={create} disabled={form.title.length < 2}>Сохранить</button>
          </div>
        </Modal>
      )}
    </>
  );
}
