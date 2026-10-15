export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)spanel_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* not json */
  }

  if (!res.ok) {
    const code = data?.error || 'ERROR';
    const message = data?.message || `Ошибка ${res.status}`;
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T,>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T,>(path: string) => request<T>('DELETE', path),
};

export function downloadCsv(path: string): void {
  const a = document.createElement('a');
  a.href = '/api' + path;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
