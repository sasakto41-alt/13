import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card, Spinner, Empty, Pagination, fmtDate } from '../components/ui';

interface Item {
  id: string;
  actorLogin: string | null;
  actorRole: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  details: any;
  ip: string | null;
  createdAt: string;
}

export default function AuditLog() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [days, setDays] = useState('30');

  const load = useCallback(async () => {
    const search = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (action) search.set('action', action);
    if (actor) search.set('actor', actor);
    if (days) search.set('days', days);
    const d = await api.get<{ items: Item[]; total: number }>(`/audit?${search}`);
    setItems(d.items);
    setTotal(d.total);
  }, [action, actor, days, page]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  return (
    <>
      <h1>Журнал действий</h1>
      <div className="toolbar">
        <input type="text" placeholder="Действие (напр. forms.)" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        <input type="text" placeholder="Логин" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} />
        <select value={days} onChange={(e) => { setDays(e.target.value); setPage(1); }}>
          <option value="1">Сутки</option>
          <option value="7">7 дней</option>
          <option value="30">30 дней</option>
          <option value="90">90 дней</option>
          <option value="">Всё время</option>
        </select>
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty text="Записей нет" />
      ) : (
        <Card className="mb0">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Время</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Детали</th><th>IP</th></tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className="small">{fmtDate(a.createdAt)}</td>
                    <td className="small">
                      {a.actorLogin || '—'}
                      {a.actorRole ? <span className="muted"> ({a.actorRole})</span> : null}
                    </td>
                    <td className="mono">{a.action}</td>
                    <td className="small">{a.entity ? `${a.entity}` : '—'}{a.entityId ? <span className="muted mono"> {a.entityId.slice(0, 10)}…</span> : null}</td>
                    <td className="small mono" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.details ? JSON.stringify(a.details) : '—'}
                    </td>
                    <td className="small mono">{a.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={30} total={total} onPage={setPage} />
        </Card>
      )}
    </>
  );
}
