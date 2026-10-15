import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, downloadCsv } from '../api/client';
import { useAuth } from '../auth';
import { Card, Badge, Spinner, Empty, Modal, Pagination, useToast, fmtDate, SUBMISSION_STATUS } from '../components/ui';

interface SubItem {
  id: string;
  receivedAt: string;
  status: string;
  externalId: string | null;
  answers: { question: string; answer: string }[];
  form?: { id: string; title: string } | null;
  employee?: { id: string; fullName: string } | null;
}

interface FormLite { id: string; title: string }

export default function Submissions() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [items, setItems] = useState<SubItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [forms, setForms] = useState<FormLite[]>([]);

  const [formId, setFormId] = useState(params.get('formId') || '');
  const [status, setStatus] = useState(params.get('status') || 'ALL');
  const [days, setDays] = useState(params.get('days') || '');
  const [detail, setDetail] = useState<SubItem | null>(null);

  useEffect(() => {
    api.get<{ items: FormLite[] }>('/forms').then((d) => setForms(d.items)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const search = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (formId) search.set('formId', formId);
    if (status !== 'ALL') search.set('status', status);
    if (days) search.set('days', days);
    const d = await api.get<{ items: SubItem[]; total: number; pageSize: number }>(`/submissions?${search}`);
    setItems(d.items);
    setTotal(d.total);
    setPageSize(d.pageSize);
  }, [formId, status, days, page]);

  useEffect(() => { load().catch((e) => toast(e.message, 'error')); }, [load]);

  const resend = async (s: SubItem) => {
    try {
      await api.post(`/submissions/${s.id}/resend`);
      toast('Повторная отправка поставлена в очередь', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const applyFilters = () => {
    const search = new URLSearchParams();
    if (formId) search.set('formId', formId);
    if (status !== 'ALL') search.set('status', status);
    if (days) search.set('days', days);
    setParams(search);
    setPage(1);
  };

  return (
    <>
      <h1>Ответы форм</h1>
      <div className="toolbar">
        <select value={formId} onChange={(e) => { setFormId(e.target.value); setPage(1); }}>
          <option value="">Все формы</option>
          {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="ALL">Все статусы</option>
          <option value="NEW">Новые</option>
          <option value="NOTIFIED">Доставленные</option>
          <option value="NO_EMPLOYEE">Сотрудник не найден</option>
          <option value="NO_FORM">Форма не найдена</option>
          <option value="FAILED">Ошибка доставки</option>
        </select>
        <select value={days} onChange={(e) => { setDays(e.target.value); setPage(1); }}>
          <option value="">За всё время</option>
          <option value="1">Сутки</option>
          <option value="7">7 дней</option>
          <option value="30">30 дней</option>
        </select>
        <button className="btn" onClick={applyFilters}>Обновить фильтр</button>
        <div className="spacer" />
        <button className="btn" onClick={() => downloadCsv(`/submissions/export.csv?${formId ? `formId=${formId}&` : ''}${status !== 'ALL' ? `status=${status}&` : ''}${days ? `days=${days}` : ''}`)}>Экспорт CSV</button>
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty text="Ответов по выбранным фильтрам нет" />
      ) : (
        <Card className="mb0">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Дата</th><th>Форма</th><th>Сотрудник</th><th>Статус</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((s) => {
                  const st = SUBMISSION_STATUS[s.status] || SUBMISSION_STATUS.NEW;
                  return (
                    <tr key={s.id}>
                      <td className="small">{fmtDate(s.receivedAt)}</td>
                      <td>{s.form?.title || <Badge kind="warn">Форма не найдена</Badge>}</td>
                      <td>{s.employee?.fullName || <Badge kind="warn">Сотрудник не найден</Badge>}</td>
                      <td><Badge kind={st.kind}>{st.label}</Badge></td>
                      <td className="actions">
                        <button className="btn sm" onClick={() => setDetail(s)}>Просмотр</button>
                        {hasRole('LEADER', 'DEPUTY') && <button className="btn sm" onClick={() => resend(s)}>Переотправить</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
        </Card>
      )}

      {detail && (
        <Modal title="Ответ на форму" onClose={() => setDetail(null)} wide>
          <div className="small muted" style={{ marginBottom: 10 }}>
            {detail.form?.title || 'Форма не найдена'} · {fmtDate(detail.receivedAt)}
            {detail.externalId && <> · ID ответа: <span className="mono">{detail.externalId.slice(0, 24)}…</span></>}
          </div>
          <table>
            <tbody>
              {((detail.answers as any[]) || []).map((a, i) => (
                <tr key={i}>
                  <td style={{ width: '35%' }} className="muted">{a?.question}</td>
                  <td>{Array.isArray(a?.answer) ? a.answer.join(', ') : String(a?.answer ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="modal-actions">
            {hasRole('LEADER', 'DEPUTY') && (
              <button className="btn" onClick={() => { resend(detail); setDetail(null); }}>Переотправить в Discord</button>
            )}
            <button className="btn primary" onClick={() => setDetail(null)}>Закрыть</button>
          </div>
        </Modal>
      )}
    </>
  );
}
