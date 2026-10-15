import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Card, Badge, Spinner, Empty, useToast, fmtDate } from '../components/ui';

interface FormItem {
  id: string;
  title: string;
  description: string | null;
  type: 'APPLICATION' | 'REPORT' | 'OTHER';
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  formKey: string | null;
  googleFormUrl: string | null;
  webhook: { enabled: boolean; hasCustomUrl: boolean; urlMasked: string | null; color: number | null };
  createdAt: string;
  _count?: { submissions: number };
}

const TYPE_LABELS: Record<string, string> = {
  APPLICATION: 'Заявка',
  REPORT: 'Отчёт',
  OTHER: 'Другое',
};

const STATUS_LABELS: Record<string, { label: string; kind: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }> = {
  DRAFT: { label: 'Черновик', kind: 'muted' },
  ACTIVE: { label: 'Активна', kind: 'ok' },
  ARCHIVED: { label: 'Архив', kind: 'muted' },
};

export default function Forms() {
  const toast = useToast();
  const [items, setItems] = useState<FormItem[] | null>(null);

  useEffect(() => {
    api.get<{ items: FormItem[] }>('/forms').then((d) => setItems(d.items)).catch((e) => toast(e.message, 'error'));
  }, []);

  if (!items) return <Spinner />;

  return (
    <>
      <div className="flex-between">
        <h1>Формы</h1>
        <Link to="/forms/new" className="btn primary">Создать форму</Link>
      </div>

      <Card>
        <div className="muted small">
          Для каждой формы задаются собственные настройки Discord-вебхука: URL, текст сообщения, цвет линии,
          аватарка, заголовок и упоминание. Если у формы свой вебхук — используется он, иначе глобальный
          (DISCORD_APPLICATIONS_WEBHOOK_URL).
        </div>
      </Card>

      {items.length === 0 ? (
        <Empty text="Форм пока нет. Создайте первую форму." />
      ) : (
        items.map((f) => {
          const st = STATUS_LABELS[f.status] || STATUS_LABELS.DRAFT;
          return (
            <Card key={f.id}>
              <div className="flex-between">
                <div>
                  <h3 style={{ marginBottom: 4 }}>
                    {f.title}{' '}
                    <Badge kind={st.kind}>{st.label}</Badge>{' '}
                    <Badge kind="info">{TYPE_LABELS[f.type]}</Badge>
                  </h3>
                  <div className="muted small">
                    Ключ: <span className="mono">{f.formKey || '—'}</span> · Ответов: {f._count?.submissions ?? 0} · Создана: {fmtDate(f.createdAt)}
                  </div>
                  <div className="small mt">
                    {f.webhook.enabled ? (
                      <>
                        Вебхук: {f.webhook.hasCustomUrl ? (
                          <span className="mono">{f.webhook.urlMasked}</span>
                        ) : (
                          <span className="muted">глобальный (не задан у формы)</span>
                        )}
                      </>
                    ) : (
                      <span className="muted">Доставка отключена</span>
                    )}
                  </div>
                  {f.googleFormUrl && (
                    <div className="small mt">
                      Google Form: <a href={f.googleFormUrl} target="_blank" rel="noreferrer">открыть для заполнения</a>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <Link to={`/forms/${f.id}/edit`} className="btn">Открыть конструктор</Link>
                  <Link to={`/submissions?formId=${f.id}`} className="btn ghost">Ответы</Link>
                </div>
              </div>
            </Card>
          );
        })
      )}
    </>
  );
}
