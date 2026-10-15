import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { api, downloadCsv } from '../api/client';
import { useAuth } from '../auth';
import { Card, Stat, Spinner, Empty, useToast } from '../components/ui';

interface Stats {
  days: number;
  totals: { submissions: number; reports: number; employeesActive: number; employeesTotal: number };
  submissionsByDay: { day: string; count: number }[];
  statusCounts: Record<string, number>;
  byDivision: { division: string; count: number }[];
  forms: { id: string; title: string; type: string; status: string; submissions: number }[];
  topEmployees: { id: string; fullName: string; rank: string | null; division: string | null; reports: number; submissions: number }[];
  withoutReports: { id: string; fullName: string; rank: string | null }[];
  delivery: { delivered: number; pending: number; failed: number; dead: number };
}

const STATUS_RU: Record<string, string> = {
  NEW: 'Новые',
  NOTIFIED: 'Доставлено',
  NO_EMPLOYEE: 'Сотрудник не найден',
  NO_FORM: 'Форма не найдена',
  FAILED: 'Ошибка доставки',
};
const STATUS_COLORS = ['#4c8dff', '#3fbf6f', '#e0a03c', '#e0a03c', '#e05252'];

export default function Statistics() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Stats | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    api.get<Stats>(`/statistics?days=${days}`).then(setData).catch((e) => toast(e.message, 'error'));
  }, [days]);

  const publish = async () => {
    setPublishing(true);
    try {
      await api.post('/statistics/publish', { days });
      toast('Статистика поставлена в очередь доставки в Discord', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setPublishing(false);
    }
  };

  if (!data) return <Spinner />;

  const statusPie = Object.entries(data.statusCounts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: STATUS_RU[k] || k, value: v }));

  return (
    <>
      <div className="flex-between">
        <h1>Статистика</h1>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>Сутки</option>
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
          </select>
          {hasRole('LEADER', 'DEPUTY') && (
            <>
              <button className="btn" onClick={publish} disabled={publishing}>Опубликовать в Discord</button>
              <button className="btn" onClick={() => downloadCsv(`/submissions/export.csv?days=${days}`)}>CSV: ответы</button>
              <button className="btn" onClick={() => downloadCsv(`/reports/export.csv?days=${days}`)}>CSV: отчёты</button>
              <button className="btn" onClick={() => downloadCsv('/employees/export.csv')}>CSV: сотрудники</button>
            </>
          )}
        </div>
      </div>

      <div className="stat-grid">
        <Stat value={data.totals.employeesActive} label={`Активных сотрудников (всего ${data.totals.employeesTotal})`} />
        <Stat value={data.totals.submissions} label={`Ответов форм за ${data.days} дн.`} />
        <Stat value={data.totals.reports} label={`Отчётов за ${data.days} дн.`} />
        <Stat value={`${data.delivery.delivered}/${data.delivery.delivered + data.delivery.dead}`} label="Доставка Discord (успех/неудачи)" />
      </div>

      <Card title={`Ответы форм по дням (${data.days} дн.)`}>
        {data.submissionsByDay.every((d) => d.count === 0) ? (
          <Empty text="Данных за период нет" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.submissionsByDay.map((d) => ({ day: d.day.slice(5), count: d.count }))}>
              <CartesianGrid stroke="#263049" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="#93a0b8" fontSize={11} />
              <YAxis allowDecimals={false} stroke="#93a0b8" fontSize={11} />
              <Tooltip contentStyle={{ background: '#1b2438', border: '1px solid #263049', borderRadius: 8 }} />
              <Bar dataKey="count" name="Ответов" fill="#4c8dff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Статусы ответов (весь период)">
          {statusPie.length === 0 ? (
            <Empty text="Данных нет" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {statusPie.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1b2438', border: '1px solid #263049', borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Ответы по формам (топ-10)">
          {data.forms.length === 0 ? (
            <Empty text="Форм нет" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.forms.map((f) => ({ title: f.title.length > 18 ? f.title.slice(0, 18) + '…' : f.title, count: f.submissions }))} layout="vertical">
                <CartesianGrid stroke="#263049" strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} stroke="#93a0b8" fontSize={11} />
                <YAxis type="category" dataKey="title" width={140} stroke="#93a0b8" fontSize={11} />
                <Tooltip contentStyle={{ background: '#1b2438', border: '1px solid #263049', borderRadius: 8 }} />
                <Bar dataKey="count" name="Ответов" fill="#e3b34c" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card title="Самые активные сотрудники">
        {data.topEmployees.length === 0 ? (
          <Empty text="За период активности нет" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Сотрудник</th><th>Подразделение</th><th>Отчёты</th><th>Ответы форм</th></tr>
              </thead>
              <tbody>
                {data.topEmployees.map((e) => (
                  <tr key={e.id}>
                    <td>{e.fullName}{e.rank ? <span className="muted small"> · {e.rank}</span> : null}</td>
                    <td>{e.division || '—'}</td>
                    <td>{e.reports}</td>
                    <td>{e.submissions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Без отчётов за ${data.days} дн.`}>
        {data.withoutReports.length === 0 ? (
          <Empty text="Все активные сотрудники сдали отчёты" />
        ) : (
          <div className="flex" style={{ flexWrap: 'wrap' }}>
            {data.withoutReports.map((e) => (
              <span key={e.id} className="badge warn" style={{ margin: '2px 4px 2px 0' }}>{e.fullName}</span>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
