import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth';
import { Card, Field, Badge, useToast, fmtDate } from '../components/ui';

interface Diagnostics {
  google: { configured: boolean; serviceAccount: string | null };
  appsScript: { configured: boolean };
  discord: { webhooks: Record<string, string | null>; anyConfigured: boolean };
  panelUrl: string;
  lastDeliveryAt: string | null;
  lastBackupDay: string | null;
  warnings: string[];
  cookieSecure: boolean;
  statsTz: string;
}

const WEBHOOK_LABELS: Record<string, string> = {
  applications: 'Заявки (DISCORD_APPLICATIONS_WEBHOOK_URL)',
  reports: 'Отчёты (DISCORD_REPORTS_WEBHOOK_URL)',
  tech: 'Технический (DISCORD_TECH_WEBHOOK_URL)',
  stats: 'Статистика (DISCORD_STATS_WEBHOOK_URL)',
  backup: 'Резервные копии (DISCORD_BACKUP_WEBHOOK_URL)',
};

export default function Settings() {
  const { user, hasRole, refresh } = useAuth();
  const toast = useToast();
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [panelUrl, setPanelUrl] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const load = () => {
    api.get<Diagnostics>('/settings')
      .then((d) => {
        setDiag(d);
        setPanelUrl(d.panelUrl);
      })
      .catch((e) => toast(e.message, 'error'));
  };

  useEffect(load, []);

  const savePanelUrl = async () => {
    try {
      await api.put('/settings/panel-url', { url: panelUrl });
      toast('Адрес панели сохранён (используется в Apps Script)', 'success');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword });
      toast('Пароль изменён', 'success');
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <h1>Настройки и диагностика</h1>

      <Card title="Интеграции">
        {!diag ? (
          <Spinner />
        ) : (
          <>
            <div className="integration-row">
              <div>
                <b>Google API (Forms / Docs / Drive)</b>
                <div className="muted small">
                  {diag.google.configured
                    ? `Настроено. Сервисный аккаунт: ${diag.google.serviceAccount}`
                    : 'Не настроено — задайте GOOGLE_SERVICE_ACCOUNT_JSON на сервере (Railway → Variables). См. docs/GOOGLE-API.md'}
                </div>
              </div>
              <Badge kind={diag.google.configured ? 'ok' : 'warn'}>{diag.google.configured ? 'Настроено' : 'Не настроено'}</Badge>
            </div>

            <div className="integration-row">
              <div>
                <b>Google Apps Script (приём ответов форм)</b>
                <div className="muted small">
                  {diag.appsScript.configured
                    ? 'Общий секрет задан. Скрипт для каждой формы — в её конструкторе.'
                    : 'Не настроено — задайте INTEGRATION_SHARED_SECRET на сервере.'}
                </div>
              </div>
              <Badge kind={diag.appsScript.configured ? 'ok' : 'warn'}>{diag.appsScript.configured ? 'Настроено' : 'Не настроено'}</Badge>
            </div>

            <div className="integration-row">
              <div>
                <b>Discord-вебхуки (глобальные)</b>
                {Object.entries(diag.discord.webhooks).map(([k, v]) => (
                  <div key={k} className="small" style={{ marginTop: 4 }}>
                    {WEBHOOK_LABELS[k] || k}:{' '}
                    {v ? <span className="mono">{v}</span> : <span className="muted">не настроено</span>}
                  </div>
                ))}
                <div className="muted small" style={{ marginTop: 6 }}>
                  Пер-формные вебхуки задаются в конструкторе каждой формы и имеют приоритет для её ответов.
                </div>
              </div>
              <Badge kind={diag.discord.anyConfigured ? 'ok' : 'warn'}>{diag.discord.anyConfigured ? 'Есть настроенные' : 'Не настроено'}</Badge>
            </div>

            {diag.warnings.length > 0 && (
              <div className="mt">
                {diag.warnings.map((w, i) => (
                  <div key={i} className="badge warn" style={{ display: 'block', marginBottom: 6, whiteSpace: 'normal' }}>{w}</div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {hasRole('LEADER') && diag && (
        <Card title="Адрес панели" >
          <Field label="Публичный адрес (https)" hint="Подставляется в генерируемый Apps Script. Например: https://sheriff-panel-production.up.railway.app">
            <input type="url" value={panelUrl} onChange={(e) => setPanelUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <button className="btn primary" onClick={savePanelUrl}>Сохранить адрес</button>
        </Card>
      )}

      <Card title="Смена своего пароля">
        <form onSubmit={changePassword}>
          <div className="form-row">
            <Field label="Текущий пароль">
              <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required autoComplete="current-password" />
            </Field>
            <Field label="Новый пароль (минимум 8 символов)">
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            </Field>
          </div>
          <button className="btn primary" type="submit">Изменить пароль</button>
        </form>
      </Card>

      {diag && (
        <Card title="Служебная информация">
          <table>
            <tbody>
              <tr><td className="muted">Ваша учётная запись</td><td>{user?.fullName} ({user?.login})</td></tr>
              <tr><td className="muted">Часовой пояс статистики</td><td>{diag.statsTz}</td></tr>
              <tr><td className="muted">Secure cookie</td><td>{diag.cookieSecure ? 'включено' : 'выключено'}</td></tr>
              <tr><td className="muted">Последняя успешная доставка</td><td>{fmtDate(diag.lastDeliveryAt)}</td></tr>
              <tr><td className="muted">Последний день резервной копии</td><td>{diag.lastBackupDay || 'копий ещё не было'}</td></tr>
            </tbody>
          </table>
          <div className="muted small mt">
            Изменение переменных окружения (вебхуки, ключи, Google) выполняется на сервере: Railway → ваш сервис → Variables.
          </div>
        </Card>
      )}
    </>
  );
}
