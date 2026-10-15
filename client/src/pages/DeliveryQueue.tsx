import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card, Badge, Spinner, Empty, Pagination, useToast, fmtDate, DELIVERY_STATUS } from '../components/ui';

interface Job {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  targetUrlMasked: string | null;
  dedupeKey: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export default function DeliveryQueue() {
  const toast = useToast();
  const [items, setItems] = useState<Job[] | null>(null);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('ALL');

  const load = useCallback(async () => {
    const search = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (status !== 'ALL') search.set('status', status);
    const d = await api.get<{ items: Job[]; total: number; byStatus: Record<string, number> }>(`/delivery?${search}`);
    setItems(d.items);
    setTotal(d.total);
    setByStatus(d.byStatus);
  }, [status, page]);

  useEffect(() => {
    load().catch((e) => toast(e.message, 'error'));
    const t = setInterval(() => load().catch(() => {}), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const retry = async (j: Job) => {
    try {
      await api.post(`/delivery/${j.id}/retry`);
      toast('Задача возвращена в очередь', 'success');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const cancel = async (j: Job) => {
    if (!window.confirm('Отменить задачу?')) return;
    try {
      await api.post(`/delivery/${j.id}/cancel`);
      toast('Задача отменена', 'success');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const chips: { key: string; label: string }[] = [
    { key: 'PENDING', label: 'В очереди' },
    { key: 'DELIVERED', label: 'Доставлено' },
    { key: 'DEAD', label: 'Не доставлено' },
  ];

  return (
    <>
      <h1>Очередь доставки в Discord</h1>

      <div className="stat-grid">
        {chips.map((c) => (
          <div key={c.key} className="stat" style={{ cursor: 'pointer' }} onClick={() => { setStatus(c.key); setPage(1); }}>
            <div className="stat-value">{byStatus[c.key] || 0}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="ALL">Все статусы</option>
          <option value="PENDING">В очереди</option>
          <option value="DELIVERED">Доставлено</option>
          <option value="DEAD">Не доставлено</option>
        </select>
        <span className="muted small">Обновляется автоматически каждые 15 секунд</span>
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty text="Задач нет" />
      ) : (
        <Card className="mb0">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Создана</th><th>Цель</th><th>Статус</th><th>Попытки</th><th>Ошибка</th><th>След. попытка</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((j) => {
                  const st = DELIVERY_STATUS[j.status] || DELIVERY_STATUS.PENDING;
                  return (
                    <tr key={j.id}>
                      <td className="small">{fmtDate(j.createdAt)}</td>
                      <td className="mono small">{j.targetUrlMasked || '—'}</td>
                      <td><Badge kind={st.kind}>{st.label}</Badge></td>
                      <td className="small">{j.attempts}/{j.maxAttempts}</td>
                      <td className="small" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.lastError || '—'}</td>
                      <td className="small">{j.status === 'PENDING' ? fmtDate(j.nextAttemptAt) : (j.deliveredAt ? fmtDate(j.deliveredAt) : '—')}</td>
                      <td className="actions">
                        {j.status !== 'DELIVERED' && (
                          <>
                            <button className="btn sm" onClick={() => retry(j)}>Переотправить</button>
                            <button className="btn sm danger" onClick={() => cancel(j)}>Отменить</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={30} total={total} onPage={setPage} />
        </Card>
      )}
    </>
  );
}
