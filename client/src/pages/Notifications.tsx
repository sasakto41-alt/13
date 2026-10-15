import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Card, Badge, Spinner, Empty, Pagination, useToast, fmtDate } from '../components/ui';

interface Item {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function Notifications() {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[] | null>(null);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    const d = await api.get<{ items: Item[] }>(`/notifications?page=${page}&pageSize=50${unreadOnly ? '&unread=1' : ''}`);
    setItems(d.items);
  }, [page, unreadOnly]);

  useEffect(() => { load().catch((e) => toast(e.message, 'error')); }, [load]);

  const markRead = async (n: Item) => {
    try {
      await api.post(`/notifications/${n.id}/read`);
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <div className="flex-between">
        <h1>Уведомления</h1>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <label className="checkbox-row" style={{ marginBottom: 0 }}>
            <input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} />
            <span>Только непрочитанные</span>
          </label>
          <button className="btn" onClick={markAll}>Прочитать все</button>
        </div>
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty text="Уведомлений нет" />
      ) : (
        items.map((n) => (
          <Card key={n.id}>
            <div className="flex-between">
              <div>
                <div className="flex">
                  {!n.isRead && <Badge kind="gold">Новое</Badge>}
                  <b>{n.title}</b>
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>{n.body}</div>
                <div className="muted small" style={{ marginTop: 4 }}>{fmtDate(n.createdAt)}</div>
              </div>
              <div className="flex">
                {n.link && <button className="btn sm" onClick={() => navigate(n.link!)}>{n.link === '/delivery' ? 'Очередь доставки' : 'Открыть'}</button>}
                {!n.isRead && <button className="btn sm" onClick={() => markRead(n)}>Прочитано</button>}
              </div>
            </div>
          </Card>
        ))
      )}
      <Pagination page={page} pageSize={50} total={items?.length || 0} onPage={setPage} />
    </>
  );
}
