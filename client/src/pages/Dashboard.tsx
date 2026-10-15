import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { api } from '../api/client';
import { useAuth } from '../auth';
import { Card, Stat, Badge, Spinner, Empty, fmtDate, SUBMISSION_STATUS } from '../components/ui';

interface Stats {
  days: number;
  totals: { submissions: number; reports: number; employeesActive: number; employeesTotal: number };
  submissionsByDay: { day: string; count: number }[];
  reportsByDay: { day: string; count: number }[];
  delivery: { delivered: number; pending: number; failed: number; dead: number };
}

interface SubItem {
  id: string;
  receivedAt: string;
  status: string;
  form?: { title: string } | null;
  employee?: { fullName: string } | null;
  meta?: any;
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<SubItem[]>([]);

  const isEmployee = user?.role === 'EMPLOYEE';

  useEffect(() => {
    if (isEmployee) return;
    Promise.all([
      api.get<Stats>('/statistics?days=30'),
      api.get<{ items: SubItem[] }>('/submissions?pageSize=8'),
    ])
      .then(([s, r]) => {
        setStats(s);
        setRecent(r.items);
      })
      .catch(() => {});
  }, [isEmployee]);

  if (isEmployee) {
    return (
      <>
        <h1>Дашборд</h1>
        <Card title="Мой профиль">
          <div className="flex" style={{ gap: 20, flexWrap: 'wrap' }}>
            <div><b>{user?.fullName}</b></div>
            {user?.rank && <div className="muted">Звание: {user.rank}</div>}
            {user?.division && <div className="muted">Подразделение: {user.division}</div>}
          </div>
        </Card>
        <Card title="Мои отчёты">
          <MyReports />
        </Card>
        <Card>
          <div className="muted small">
            Заявки рассматриваются в Discord. Здесь доступна история ваших отчётов и общие документы.
          </div>
        </Card>
      </>
    );
  }

  if (!stats) return <Spinner />;

  const chartData = stats.submissionsByDay.map((d, i) => ({
    day: d.day.slice(5),
    submissions: d.count,
    reports: stats.reportsByDay[i]?.count ?? 0,
  }));

  const deliveryIssues = stats.delivery.failed + stats.delivery.dead;

  return (
    <>
      <h1>Дашборд</h1>
      <div className="stat-grid">
        <Stat value={stats.totals.employeesActive} label="Активных сотрудников" />
        <Stat value={stats.totals.submissions} label="Ответов форм (30 дн.)" />
        <Stat value={stats.totals.reports} label="Отчётов (30 дн.)" />
        <Stat
          value={
            <span style={{ color: deliveryIssues > 0 ? 'var(--warn)' : undefined }}>
              {stats.delivery.delivered}
              {deliveryIssues > 0 ? ` / ${deliveryIssues}` : ''}
            </span>
          }
          label="Доставлено в Discord (с ошибками)"
        />
      </div>

      <Card title="Активность за 30 дней (по дням)">
        {chartData.every((d) => d.submissions === 0 && d.reports === 0) ? (
          <Empty text="За этот период данных пока нет" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#263049" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="#93a0b8" fontSize={11} />
              <YAxis allowDecimals={false} stroke="#93a0b8" fontSize={11} />
              <Tooltip contentStyle={{ background: '#1b2438', border: '1px solid #263049', borderRadius: 8 }} />
              <Legend />
              <Line type="monotone" dataKey="submissions" name="Ответы форм" stroke="#4c8dff" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="reports" name="Отчёты" stroke="#e3b34c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid-2">
        <Card
          title="Последние ответы форм"
          actions={hasRole('LEADER', 'DEPUTY', 'CURATOR') ? <Link to="/submissions">Все ответы</Link> : undefined}
        >
          {recent.length === 0 ? (
            <Empty text="Ответов пока нет" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Форма</th>
                    <th>Сотрудник</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((s) => {
                    const st = SUBMISSION_STATUS[s.status] || SUBMISSION_STATUS.NEW;
                    return (
                      <tr key={s.id}>
                        <td className="small">{fmtDate(s.receivedAt)}</td>
                        <td>{s.form?.title || <Badge kind="warn">Форма не найдена</Badge>}</td>
                        <td>{s.employee?.fullName || <Badge kind="warn">Не найден</Badge>}</td>
                        <td><Badge kind={st.kind}>{st.label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Состояние доставки">
          <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Stat value={stats.delivery.delivered} label="Доставлено" />
            <Stat value={stats.delivery.pending} label="В очереди" />
            <Stat value={stats.delivery.failed} label="Ошибки (повторяются)" />
            <Stat value={stats.delivery.dead} label="Не доставлено" />
          </div>
          {hasRole('LEADER', 'DEPUTY') && (
            <Link to="/delivery" className="small">Открыть очередь доставки</Link>
          )}
        </Card>
      </div>
    </>
  );
}

function MyReports() {
  const [data, setData] = useState<{ items: any[] } | null>(null);
  useEffect(() => {
    api.get<{ items: any[] }>('/reports?mine=1&pageSize=20').then(setData).catch(() => setData({ items: [] }));
  }, []);
  if (!data) return <Spinner />;
  if (data.items.length === 0) return <Empty text="Отчётов пока нет" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Дата</th><th>Заголовок</th><th>Тип</th></tr>
        </thead>
        <tbody>
          {data.items.map((r) => (
            <tr key={r.id}>
              <td className="small">{fmtDate(r.submittedAt)}</td>
              <td>{r.title}</td>
              <td><Badge kind="muted">{r.type}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
