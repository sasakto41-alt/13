import rateLimit from 'express-rate-limit';

/** Жёсткий лимит на вход: блокировка после 5 неудачных попыток за 15 минут. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: 'TOO_MANY_ATTEMPTS',
    message: 'Слишком много неудачных попыток входа. Подождите 15 минут и попробуйте снова.',
  },
});

/** Мягкий лимит на весь API. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Слишком много запросов. Попробуйте позже.' },
});

/** Лимит на endpoint приёма ответов от Apps Script. */
export const ingestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Слишком много запросов приёма.' },
});
