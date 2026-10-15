import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth, ROLE_LABELS, User } from '../auth';
import { api } from '../api/client';

interface NavEntry {
  to: string;
  label: string;
  roles?: User['role'][];
}

const NAV: NavEntry[] = [
  { to: '/', label: 'Дашборд' },
  { to: '/employees', label: 'Сотрудники', roles: ['LEADER', 'DEPUTY', 'CURATOR'] },
  { to: '/forms', label: 'Формы', roles: ['LEADER', 'DEPUTY'] },
  { to: '/submissions', label: 'Ответы форм', roles: ['LEADER', 'DEPUTY', 'CURATOR'] },
  { to: '/reports', label: 'Отчёты' },
  { to: '/documents', label: 'Документы' },
  { to: '/statistics', label: 'Статистика', roles: ['LEADER', 'DEPUTY', 'CURATOR'] },
  { to: '/delivery', label: 'Очередь доставки', roles: ['LEADER', 'DEPUTY'] },
  { to: '/notifications', label: 'Уведомления' },
  { to: '/audit', label: 'Журнал действий', roles: ['LEADER'] },
  { to: '/settings', label: 'Настройки', roles: ['LEADER', 'DEPUTY'] },
];

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api.get<{ unreadCount: number }>('/notifications?unread=1');
        if (alive) setUnread(data.unreadCount);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Sheriff Department</div>
        {NAV.filter((n) => !n.roles || hasRole(...n.roles)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            {n.label}
            {n.to === '/notifications' && unread > 0 && (
              <span className="badge gold" style={{ marginLeft: 'auto' }}>{unread}</span>
            )}
          </NavLink>
        ))}
        <div className="sidebar-footer">
          {user?.fullName}
          <br />
          {user && ROLE_LABELS[user.role]}
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div />
          <div className="topbar-user">
            <span>{user?.fullName}</span>
            {user && <span className="badge gold">{ROLE_LABELS[user.role]}</span>}
            <button className="btn sm" onClick={doLogout}>Выйти</button>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
