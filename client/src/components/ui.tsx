import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';

/* ---------- Toasts ---------- */

interface Toast { id: number; text: string; kind: 'info' | 'error' | 'success' }
interface ToastCtx { push: (text: string, kind?: Toast['kind']) => void }

const ToastContext = createContext<ToastCtx>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 5200);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ---------- Primitives ---------- */

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`card ${className || ''}`}>
      {(title || actions) && (
        <div className="card-title">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Badge({ kind, children }: { kind: 'ok' | 'warn' | 'danger' | 'info' | 'gold' | 'muted'; children: ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

export function Spinner() {
  return <div className="spinner" />;
}

export function Empty({ text = 'Нет данных' }: { text?: string }) {
  return <div className="empty">{text}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="flex-between">
          <h2>{title}</h2>
          <button className="btn sm ghost" onClick={onClose}>Закрыть</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Назад</button>
      <span>Стр. {page} из {pages} (всего {total})</span>
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Вперёд</button>
    </div>
  );
}

/* ---------- Status labels ---------- */

export const SUBMISSION_STATUS: Record<string, { label: string; kind: 'ok' | 'warn' | 'danger' | 'info' | 'gold' | 'muted' }> = {
  NEW: { label: 'Новый', kind: 'info' },
  NOTIFIED: { label: 'Доставлено в Discord', kind: 'ok' },
  NO_EMPLOYEE: { label: 'Сотрудник не найден', kind: 'warn' },
  NO_FORM: { label: 'Форма не найдена', kind: 'warn' },
  FAILED: { label: 'Ошибка доставки', kind: 'danger' },
};

export const DELIVERY_STATUS: Record<string, { label: string; kind: 'ok' | 'warn' | 'danger' | 'info' | 'gold' | 'muted' }> = {
  PENDING: { label: 'В очереди', kind: 'info' },
  SENDING: { label: 'Отправляется', kind: 'info' },
  DELIVERED: { label: 'Доставлено', kind: 'ok' },
  FAILED: { label: 'Ошибка', kind: 'danger' },
  DEAD: { label: 'Не доставлено', kind: 'danger' },
};

export const EMPLOYEE_STATUS: Record<string, { label: string; kind: 'ok' | 'warn' | 'danger' | 'info' | 'gold' | 'muted' }> = {
  ACTIVE: { label: 'Работает', kind: 'ok' },
  ON_LEAVE: { label: 'Отпуск', kind: 'warn' },
  FIRED: { label: 'Уволен', kind: 'danger' },
};

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
