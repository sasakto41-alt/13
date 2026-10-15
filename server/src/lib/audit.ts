import type { Request } from 'express';
import { prisma } from './prisma';

const SECRET_KEY_RE = /(password|secret|token|url|key)/i;

/** Убирает секреты из деталей аудита */
export function sanitizeDetails(d: unknown): Record<string, unknown> | undefined {
  if (d == null || typeof d !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) {
      out[k] = v ? '•••' : v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export async function audit(
  req: Request,
  action: string,
  entity?: string,
  entityId?: string,
  details?: unknown
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorLogin: (req as any).user?.login || null,
        actorRole: (req as any).user?.role || null,
        action,
        entity: entity || null,
        entityId: entityId || null,
        details: (sanitizeDetails(details) as any) ?? undefined,
        ip: req.ip || null,
      },
    });
  } catch (e) {
    console.error('audit write failed:', e);
  }
}
