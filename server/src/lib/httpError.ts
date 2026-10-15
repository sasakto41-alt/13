export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, 'BAD_REQUEST', message);
}

export function notConfigured(message: string): HttpError {
  return new HttpError(503, 'NOT_CONFIGURED', message);
}

type AsyncHandler = (req: any, res: any, next: any) => Promise<any>;

export function ah(fn: AsyncHandler) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
