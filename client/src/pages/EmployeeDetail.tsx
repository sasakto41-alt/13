import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ROLE_LABELS } from '../auth';
import { Card, Badge, Spinner, Empty, fmtDate, EMPLOYEE_STATUS, SUBMISSION_STATUS } from '../components/ui';

interface Detail {
  item: {
    id: string; fullName: string; login: string | null; role: string; rank: string | null;
    division: string | null; status: string; gameId: string | null; discordTag: string | null;
    hiredAt: string | null; firedAt: string | null; notes: string | null;
  };
  reports: { id: string; title: string; type: string; submittedAt: string; source: string }[];
  submissions: { id: string; receivedAt: string; status: string; form?: { title: string } | null }[];
  reportsTotal: number;
  submissionsTotal: number;
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Detail>(`/employees/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Empty text={error} />;
  if (!data) return <Spinner />;

  const e = data.item;
  const st = EMPLOYEE_STATUS[e.status] || EMPLOYEE_STATUS.ACTIVE;

  return (
    <>
      <div className="flex-between">
        <h1>{e.fullName}</h1>
        <Link to="/employees">К списку</Link>
      </div>

      <div className="grid-2">
        <Card title="Профиль">
          <table>
            <tbody>
              <tr><td className="muted">Роль</td><td>{ROLE_LABELS[e.role as keyof typeof ROLE_LABELS] || e.role}</td></tr>
              <tr><td className="muted">Звание</td><td>{e.rank || '—'}</td></tr>
              <tr><td className="muted">Подразделение</td><td>{e.division || '—'}</td></tr>
              <tr><td className="muted">Игровой ID</td><td className="mono">{e.gameId || '—'}</td></tr>
              <tr><td className="muted">Discord</td><td>{e.discordTag || '—'}</td></tr>
              <tr><td className="muted">Логин</td><td>{e.login || 'нет доступа к панели'}</td></tr>
              <tr><td className="muted">Статус</td><td><Badge kind={st.kind}>{st.label}</Badge></td></tr>
              <tr><td className="muted">Принят</td><td>{fmtDate(e.hiredAt)}</td></tr>
              {e.firedAt && <tr><td className="muted">Уволен</td><td>{fmtDate(e.firedAt)}</td></tr>}
            </tbody>
          </table>
        </Card>

        <Card title={`Отчёты (${data.reportsTotal})`}>
          {data.reports.length === 0 ? (
            <div>
              <Empty text="Отчётов нет" />
              <div className="muted small" style={{ textAlign: 'center' }}>Отчёт отсутствует за весь период наблюдения</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Дата</th><th>Заголовок</th><th>Источник</th></tr></thead>
                <tbody>
                  {data.reports.map((r) => (
                    <tr key={r.id}>
                      <td className="small">{fmtDate(r.submittedAt)}</td>
                      <td>{r.title}</td>
                      <td><Badge kind="muted">{r.source === 'google_form' ? 'Форма' : 'Вручную'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title={`Ответы форм (${data.submissionsTotal})`}>
        {data.submissions.length === 0 ? (
          <Empty text="Ответов нет" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Дата</th><th>Форма</th><th>Статус</th></tr></thead>
              <tbody>
                {data.submissions.map((s) => {
                  const ss = SUBMISSION_STATUS[s.status] || SUBMISSION_STATUS.NEW;
                  return (
                    <tr key={s.id}>
                      <td className="small">{fmtDate(s.receivedAt)}</td>
                      <td>{s.form?.title || <Badge kind="warn">Форма не найдена</Badge>}</td>
                      <td><Badge kind={ss.kind}>{ss.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
