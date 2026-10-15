import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, notConfigured, ah } from '../lib/httpError';
import { googleConfigured, createGoogleDoc } from '../lib/google';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  ah(async (_req, res) => {
    const items = await prisma.document.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ items, googleConfigured: googleConfigured() });
  })
);

const createSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  googleDocUrl: z.string().max(500).optional().nullable(),
  // Создать настоящий Google Doc:
  createInGoogle: z.boolean().default(false),
  // kind='work_report' — автонаполнение статистикой за период
  kind: z.enum(['plain', 'work_report']).default('plain'),
  days: z.number().int().min(1).max(365).default(30),
});

async function buildWorkReportText(days: number): Promise<string> {
  const since = new Date(Date.now() - days * 86400000);
  const [activeEmployees, submissions, reports, byDivision] = await Promise.all([
    prisma.employee.count({ where: { status: 'ACTIVE' } }),
    prisma.formSubmission.count({ where: { receivedAt: { gte: since } } }),
    prisma.report.count({ where: { submittedAt: { gte: since } } }),
    prisma.employee.groupBy({ by: ['division'], _count: { _all: true }, where: { status: 'ACTIVE' } }),
  ]);
  const lines: string[] = [
    `Отчёт о работе Sheriff Department`,
    `Период: последние ${days} дн. (с ${since.toISOString().slice(0, 10)})`,
    `Сформирован: ${new Date().toISOString()}`,
    ``,
    `Активные сотрудники: ${activeEmployees}`,
    `Ответов форм получено: ${submissions}`,
    `Отчётов сдано: ${reports}`,
    ``,
    `Распределение по подразделениям:`,
  ];
  for (const d of byDivision) {
    lines.push(`  - ${d.division || 'Без подразделения'}: ${d._count._all}`);
  }
  return lines.join('\n');
}

router.post(
  '/',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const data = createSchema.parse(req.body);

    let docId: string | null = null;
    let docUrl: string | null = data.googleDocUrl || null;

    if (data.createInGoogle || data.kind === 'work_report') {
      if (!googleConfigured()) {
        throw notConfigured('Google API не настроено (GOOGLE_SERVICE_ACCOUNT_JSON). См. docs/GOOGLE-API.md');
      }
      const text = data.kind === 'work_report' ? await buildWorkReportText(data.days) : data.description || undefined;
      const created = await createGoogleDoc(data.title, text);
      docId = created.docId;
      docUrl = created.url;
    }

    const document = await prisma.document.create({
      data: {
        title: data.title,
        description: data.description || null,
        category: data.category || null,
        googleDocId: docId,
        googleDocUrl: docUrl,
        createdBy: req.user!.login,
      },
    });
    await audit(req, 'documents.create', 'Document', document.id, {
      title: data.title,
      inGoogle: Boolean(docId),
      kind: data.kind,
    });
    res.status(201).json({ item: document });
  })
);

const updateSchema = createSchema.partial().omit({ createInGoogle: true, kind: true, days: true });

router.patch(
  '/:id',
  requireRole('LEADER', 'DEPUTY'),
  ah(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const document = await prisma.document.update({
      where: { id: req.params.id },
      data: {
        title: data.title,
        description: data.description === undefined ? undefined : data.description || null,
        category: data.category === undefined ? undefined : data.category || null,
        googleDocUrl: data.googleDocUrl === undefined ? undefined : data.googleDocUrl || null,
      },
    });
    await audit(req, 'documents.update', 'Document', document.id, { title: document.title });
    res.json({ item: document });
  })
);

router.delete(
  '/:id',
  requireRole('LEADER'),
  ah(async (req, res) => {
    await prisma.document.delete({ where: { id: req.params.id } });
    await audit(req, 'documents.delete', 'Document', req.params.id);
    res.json({ ok: true });
  })
);

export default router;
