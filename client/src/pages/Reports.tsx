import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadCsv } from '../api/client';
import { useAuth } from '../auth';
import { Card, Badge, Spinner, Empty, Modal, Field, Pagination, useToast, fmtDate } from '../components/ui';

interface ReportItem {
  id: string;
  title: string;
  type: string;
  source: string;
  submittedAt: string;
  employee?: { id: string; fullName: string; rank: string | null } | null;
  content: any;
}

export default function Reports() {
  const { hasRole } = useAuth();
  const toast = useToast();

  const [items, setItems] = useState<ReportItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('ALL');
  const [days, setDays] = useState('30');
  const [missing, setMissing] = useState<{ items: { id: string; fullName: string; rank: string | null }[]; days: number } | null>(null);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ employeeId: '', title: '', content: '' });
  const [employees, setEmployees] = useState<{ items: { id: string; fullName: string }[] } | null>(null);

  const canManage = hasRole('LEADER', 'DEPUTY');

  const load = useCallback(async () => {
    const search = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (type !== 'ALL') search.set('type', type);
    if (days) search.set('days', days);
    const d = await api.get<{ items: ReportItem[]; total: number }>(`/reports?${search}`);
    setItems(d.items);
    setTotal(d.total);
  }, [type, days, page]);

  useEffect(() => { load().catch((e) => toast(e.message, 'error')); }, [load]);
  useEffect(() => {
    api.get<{ items: any }>(`/reports/missing?days=${days || 7}`).then(setMissing).catch(() => {});
  }, [days]);

  const openCreate = async () => {
    setForm({ employeeId: '', title: '', content: '' });
    setCreating(true);
    if (!employees) {
      try {
        const d = await api.get<{ items: { id: string; fullName: string }[] }>('/employees?pageSize=100&status=ACTIVE');
        setEmployees(d);
      } catch { /* ignore */ }
    }
  };

  const create = async () => {
    try {
      await api.post('/reports', { employeeId: form.employeeId, title: form.title, content: form.content || undefined, type: 'manual' });
      toast('Отчёт добавлен', 'success');
      setCreating(false);
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <h1>Отчёты</h1>
      <div className="toolbar">
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="ALL">Все типы</option>
          <option value="form_report">Из форм</option>
          <option value="manual">Ручные</option>
          <option value="weekly">Недельные</option>
        </select>
        <select value={days} onChange={(e) => { setDays(e.target.value); setPage(1); }}>
          <option value="">За всё время</option>
          <option value="1">Сутки</option>
          <option value="7">7 дней</option>
          <option value="30">30 дней</option>
          <option value="90">90 дней</option>
        </select>
        <div className="spacer" />
        <button className="btn" onClick={() => downloadCsv(`/reports/export.csv?${type !== 'ALL' ? `type=${type}&` : ''}${days ? `days=${days}` : ''}`)}>Экспорт CSV</button>
        {canManage && <button className="btn primary" onClick={openCreate}>Добавить отчёт</button>}
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty text="Отчётов по выбранным фильтрам нет" />
      ) : (
        <Card className="mb0">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Дата</th><th>Сотрудник</th><th>Заголовок</th><th>Тип</th><th>Источник</th></tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{fmtDate(r.submittedAt)}</td>
                    <td>{r.employee ? <Link to={`/employees/${r.employee.id}`}>{r.employee.fullName}</Link> : <span className="muted">—</span>}</td>
                    <td>{r.title}</td>
                    <td><Badge kind="muted">{r.type}</Badge></td>
                    <td><Badge kind={r.source === 'google_form' ? 'info' : 'muted'}>{r.source === 'google_form' ? 'Форма' : 'Вручную'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
        </Card>
      )}

      <Card title={`Сотрудники без отчётов (${days || 7} дн.)`}>
        {!missing ? (
          <Spinner />
        ) : missing.items.length === 0 ? (
          <Empty text="Все активные сотрудники сдали отчёты" />
        ) : (
          <div className="flex" style={{ flexWrap: 'wrap' }}>
            {missing.items.map((e) => (
              <span key={e.id} className="badge warn" style={{ margin: '2px 4px 2px 0' }}>
                {e.fullName}{e.rank ? ` (${e.rank})` : ''}
              </span>
            ))}
          </div>
        )}
      </Card>

      {creating && (
        <Modal title="Добавить отчёт вручную" onClose={() => setCreating(false)}>
          <Field label="Сотрудник *">
            <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">— выберите —</option>
              {(employees?.items || []).map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </Field>
          <Field label="Заголовок *">
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Содержание">
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </Field>
          <div className="modal-actions">
            <button className="btn" onClick={() => setCreating(false)}>Отмена</button>
            <button className="btn primary" onClick={create} disabled={!form.employeeId || form.title.length < 2}>Сохранить</button>
          </div>
        </Modal>
      )}
    </>
  );
}
