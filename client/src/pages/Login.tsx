import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth';
import { useToast, Field } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'loading' | 'login' | 'setup'>('loading');
  const [needsSecret, setNeedsSecret] = useState(false);
  const [busy, setBusy] = useState(false);

  const [loginVal, setLoginVal] = useState('leader');
  const [password, setPassword] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    api
      .get<{ needsSetup: boolean; setupSecretRequired: boolean }>('/auth/status')
      .then((d) => {
        if (d.needsSetup) {
          setMode('setup');
          setNeedsSecret(d.setupSecretRequired);
        } else {
          setMode('login');
        }
      })
      .catch(() => setMode('login'));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'setup') {
        await api.post('/auth/setup', {
          setupSecret: setupSecret || undefined,
          fullName,
          password,
        });
        toast('Аккаунт лидера создан', 'success');
        window.location.href = '/';
        return;
      }
      await login(loginVal, password);
      navigate('/');
    } catch (err: any) {
      toast(err.message || 'Ошибка входа', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'loading') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Sheriff Department</h1>
          <div className="sub">Загрузка…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Sheriff Department</h1>
        <div className="sub">
          {mode === 'setup'
            ? 'Первоначальная настройка: создайте аккаунт лидера'
            : 'Панель управления — вход'}
        </div>

        {mode === 'setup' && (
          <>
            {needsSecret && (
              <Field label="Секрет первоначальной настройки (SETUP_SECRET)">
                <input type="password" value={setupSecret} onChange={(e) => setSetupSecret(e.target.value)} required />
              </Field>
            )}
            <Field label="Ваше имя (ФИО)">
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
            </Field>
          </>
        )}

        {mode === 'login' && (
          <Field label="Логин">
            <input type="text" value={loginVal} onChange={(e) => setLoginVal(e.target.value)} required autoComplete="username" />
          </Field>
        )}

        <Field label={mode === 'setup' ? 'Придумайте пароль (минимум 8 символов)' : 'Пароль'}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'setup' ? 8 : 1}
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
          />
        </Field>

        <button className="btn primary" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
          {busy ? 'Подождите…' : mode === 'setup' ? 'Создать аккаунт лидера' : 'Войти'}
        </button>

        {mode === 'setup' && (
          <div className="hint mt" style={{ color: 'var(--muted)', fontSize: 12 }}>
            Секрет задаётся переменной SETUP_SECRET на сервере. Если она не заполнена, настройка доступна без секрета —
            выполните её сразу после развёртывания.
          </div>
        )}
      </form>
    </div>
  );
}
