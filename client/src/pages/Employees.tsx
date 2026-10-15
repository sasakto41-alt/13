import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, downloadCsv } from '../api/client';
import { useAuth, ROLE_LABELS } from '../auth';
import { Card, Badge, Spinner, Empty, Modal, Field, Pagination, useToast, fmtDay, EMPLOYEE_STATUS } from '../components/ui';

interface Employee {
  id: string;
  fullName: string;
  login: string | null;
  role: keyof typeof ROLE_LABELS;
  rank: string | null;
  division: string | null;
  status: keyof typeof EMPLOYEE_STATUS;
  gameId: string | null;
  discordTag: string | null;
  hiredAt: string | null;
}

const emptyForm = {
  fullName: '',
  login: '',
  password: '',
  role: 'EMPLOYEE' as Employee['role'],
  rank: '',
  division: '',
  gameId: '',
  discordTag: '',
  notes: '',
};

export default function Employees() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState<{ items: Employee[]; total: number; pageSize: number; divisions: string[] } | null>(null);
  const [q, setQ] = useState(params.get('q') || '');
  const [status, setStatus] = useState(params.get('status') || 'ALL');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const canManage = hasRole('LEADER', 'DEPUTY');

  const load = useCallback(async () => {
    const search = new URLSearchParams({ q, status, page: String(page), pageSize: '20' });
    const d = await api.get<{ items: Employee[]; total: number; pageSize: number; divisions: string[] }>(`/employees?${search}`);
    setData(d);
  }, [q, status, page]);

  useEffect(() => { load().catch((e) => toast(e.message, 'error')); }, [load]);

  const openCreate = () => { setForm({ ...emptyForm }); setCreating(true); };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      fullName: e.fullName,
      login: e.login || '',
      password: '',
      role: e.role,
      rank: e.rank || '',
      division: e.division || '',
      gameId: e.gameId || '',
      discordTag: e.discordTag || '',
      notes: '',
    });
  };

  const save = async () => {
    try {
      const payload: any = {
        fullName: form.fullName,
        role: form.role,
        rank: form.rank || undefined,
        division: form.division || undefined,
        gameId: form.gameId || undefined,
        discordTag: form.discordTag || undefined,
      };
      if (creating) {
        payload.login = form.login || undefined;
        payload.password = form.password || undefined;
        if (form.login && !form.password) {
          toast('Укажите пароль для нового логина', 'error');
          return;
        }
        await api.post('/employees', payload);
        toast('Сотрудник добавлен', 'success');
      } else if (editing) {
        payload.login = form.login === (editing.login || '') ? undefined : (form.login || null);
        await api.patch(`/employees/${editing.id}`, payload);
        toast('Сохранено', 'success');
      }
      setCreating(false);
      setEditing(null);
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const resetPassword = async (e: Employee) => {
    const password = window.prompt(`Новый пароль для ${e.fullName} (минимум 8 символов):`);
    if (!password) return;
    try {
      await api.post(`/employees/${e.id}/password`, { password });
      toast('Пароль обновлён', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const fire = async (e: Employee) => {
    if (!window.confirm(`Уволить ${e.fullName}?`)) return;
    try {
      await api.post(`/employees/${e.id}/fire`);
      toast('Сотрудник уволен', 'success');
      load();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const restore = async (e: Employee) => {
    try {
      await api.post(`/employees/${e.id}/restore`);
      toast('Сотрудник восстановлен', 'success');
      load();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <h1>Сотрудники</h1>
      <div className="toolbar">
        <input type="text" placeholder="Поиск: ФИО, ID, Discord…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ minWidth: 240 }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="ALL">Все статусы</option>
          <option value="ACTIVE">Работают</option>
          <option value="ON_LEAVE">В отпуске</option>
          <option value="FIRED">Уволены</option>
        </select>
        <div className="spacer" />
        <button className="btn" onClick={() => downloadCsv('/employees/export.csv')}>Экспорт CSV</button>
        {canManage && <button className="btn primary" onClick={openCreate}>Добавить сотрудника</button>}
      </div>

      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty text="Сотрудники не найдены" />
      ) : (
        <Card className="mb0">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ФИО</th><th>Роль</th><th>Звание</th><th>Подразделение</th><th>Игровой ID</th><th>Discord</th><th>Статус</th><th>Принят</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => {
                  const st = EMPLOYEE_STATUS[e.status] || EMPLOYEE_STATUS.ACTIVE;
                  return (
                    <tr key={e.id}>
                      <td><Link to={`/employees/${e.id}`}>{e.fullName}</Link></td>
                      <td>{ROLE_LABELS[e.role]}</td>
                      <td>{e.rank || '—'}</td>
                      <td>{e.division || '—'}</td>
                      <td className="mono">{e.gameId || '—'}</td>
                      <td className="small">{e.discordTag || '—'}</td>
                      <td><Badge kind={st.kind}>{st.label}</Badge></td>
                      <td className="small">{fmtDay(e.hiredAt)}</td>
                      <td className="actions">
                        {canManage && <button className="btn sm" onClick={() => openEdit(e)}>Изменить</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </Card>
      )}

      {(creating || editing) && (
        <Modal title={creating ? 'Новый сотрудник' : `Редактирование: ${editing?.fullName}`} onClose={() => { setCreating(false); setEditing(null); }}>
          <Field label="ФИО *">
            <input type="text" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </Field>
          <div className="form-row">
            <Field label="Роль">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Employee['role'] })}>
                {hasRole('LEADER') && <option value="LEADER">Лидер</option>}
                <option value="DEPUTY">Заместитель</option>
                <option value="CURATOR">Куратор</option>
                <option value="EMPLOYEE">Сотрудник</option>
              </select>
            </Field>
            <Field label="Звание">
              <input type="text" value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} placeholder="например, Undersheriff" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Подразделение">
              <input type="text" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} />
            </Field>
            <Field label="Игровой ID" hint="Для сопоставления ответов форм">
              <input type="text" value={form.gameId} onChange={(e) => setForm({ ...form, gameId: e.target.value })} />
            </Field>
          </div>
          <Field label="Discord-тег" hint="Формат name#0000 или новый ник — для сопоставления ответов">
            <input type="text" value={form.discordTag} onChange={(e) => setForm({ ...form, discordTag: e.target.value })} />
          </Field>
          <div className="form-row">
            <Field label={creating ? 'Логин для входа (необязательно)' : 'Логин'}>
              <input type="text" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} placeholder="латиница, цифры" />
            </Field>
            {creating && (
              <Field label="Пароль (если задан логин)">
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} />
              </Field>
            )}
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => { setCreating(false); setEditing(null); }}>Отмена</button>
            <button className="btn primary" onClick={save} disabled={!form.fullName || form.fullName.length < 2}>Сохранить</button>
          </div>
        </Modal>
      )}

      {editing && (
        <div className="card">
          <div className="flex-between">
            <h3 className="mb0">Действия с сотрудником</h3>
            <div className="flex">
              {hasRole('LEADER', 'DEPUTY') && (
                <>
                  <button className="btn" onClick={() => resetPassword(editing)}>Сбросить пароль</button>
                  {editing.status === 'FIRED' ? (
                    <button className="btn" onClick={() => restore(editing)}>Восстановить</button>
                  ) : (
                    <button className="btn danger" onClick={() => fire(editing)}>Уволить</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
