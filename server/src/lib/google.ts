import { google } from 'googleapis';
import { env, readGoogleCredentialsFile } from '../config/env';

/**
 * Настоящие интеграции Google Forms / Docs / Drive через сервисный аккаунт.
 * Если GOOGLE_SERVICE_ACCOUNT_JSON/FILE не заданы — все методы бросают
 * NOT_CONFIGURED, а UI показывает статус «Не настроено».
 */

const SCOPES = [
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive',
];

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super(
      'Google API не настроено. Задайте GOOGLE_SERVICE_ACCOUNT_JSON (или GOOGLE_SERVICE_ACCOUNT_FILE) и включите Forms API, Docs API и Drive API. См. docs/GOOGLE-API.md.'
    );
  }
}

function getCredentials(): { client_email: string; private_key: string } | null {
  if (env.googleServiceAccountJson) {
    try {
      const parsed = JSON.parse(env.googleServiceAccountJson);
      if (parsed.client_email && parsed.private_key) return parsed;
    } catch {
      /* invalid JSON */
    }
  }
  const fileCreds = readGoogleCredentialsFile();
  if (fileCreds && (fileCreds as any).client_email && (fileCreds as any).private_key) {
    return fileCreds as any;
  }
  return null;
}

export function googleConfigured(): boolean {
  return getCredentials() !== null;
}

function jwt() {
  const creds = getCredentials();
  if (!creds) throw new GoogleNotConfiguredError();
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
}

export interface QuestionDef {
  title: string;
  type: 'PARAGRAPH' | 'MULTIPLE_CHOICE';
  options?: string[];
  required?: boolean;
}

export interface CreatedGoogleForm {
  formId: string;
  responderUri: string;
  editUri: string;
}

export async function createGoogleForm(input: {
  title: string;
  description?: string;
  questions: QuestionDef[];
}): Promise<CreatedGoogleForm> {
  const auth = jwt();
  const forms = google.forms({ version: 'v1', auth });

  const created = await forms.forms.create({
    requestBody: { info: { title: input.title, documentTitle: input.title } },
  });
  const formId = created.data.formId as string;

  const requests: any[] = [];
  if (input.description) {
    requests.push({
      updateFormInfo: { info: { description: input.description }, updateMask: 'description' },
    });
  }
  input.questions.forEach((q, index) => {
    const question: any =
      q.type === 'MULTIPLE_CHOICE'
        ? {
            choiceQuestion: {
              options: (q.options && q.options.length ? q.options : ['Вариант 1']).map((o) => ({ value: o })),
            },
          }
        : { textQuestion: { paragraph: true } };
    requests.push({
      createItem: {
        item: {
          title: q.title,
          questionItem: { question: { ...question, required: q.required !== false } },
        },
        location: { index },
      },
    });
  });
  if (requests.length) {
    await forms.forms.batchUpdate({ formId, requestBody: { requests } });
  }

  const drive = google.drive({ version: 'v3', auth });
  await drive.permissions.create({ fileId: formId, requestBody: { role: 'reader', type: 'anyone' } });

  const full = await forms.forms.get({ formId });
  return {
    formId,
    responderUri: (full.data.responderUri as string) || `https://docs.google.com/forms/d/${formId}/viewform`,
    editUri: `https://docs.google.com/forms/d/${formId}/edit`,
  };
}

export async function createGoogleDoc(title: string, initialText?: string): Promise<{ docId: string; url: string }> {
  const auth = jwt();
  const docs = google.docs({ version: 'v1', auth });
  const doc = await docs.documents.create({ requestBody: { title } });
  const docId = doc.data.documentId as string;

  if (initialText) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests: [{ insertText: { location: { index: 1 }, text: initialText } }] },
    });
  }

  const drive = google.drive({ version: 'v3', auth });
  await drive.permissions.create({ fileId: docId, requestBody: { role: 'reader', type: 'anyone' } });

  return { docId, url: `https://docs.google.com/document/d/${docId}/edit` };
}

/** Резервная копия JSON в Google Drive (если сервисный аккаунт настроен) */
export async function uploadBackupToDrive(filename: string, json: string): Promise<string | null> {
  if (!getCredentials()) return null;
  const auth = jwt();
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.create({
    requestBody: { name: filename, parents: undefined },
    media: { mimeType: 'application/json', body: Buffer.from(json, 'utf8') } as any,
    fields: 'id, webViewLink',
  });
  return res.data.webViewLink || null;
}

export function credentialsEmail(): string | null {
  const creds = getCredentials();
  return creds ? creds.client_email : null;
}
