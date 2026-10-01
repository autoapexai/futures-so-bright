/**
 * VALUE FOR VALUE: TIME (suggestions) and TALENT (resume upload). Everything goes through
 * SECURITY DEFINER RPCs (fsb_suggest, fsb_resume_start, fsb_resume_done); resume files go to the
 * private Storage bucket 'fsb-resumes', upload-only for anon and only to the path the RPC issued.
 * The only id sent is a SHA-256 of this browser's random visitor id (no IP, no fingerprint).
 */
import { rpc, remoteEnabled, SUPABASE_ANON, SUPABASE_BASE } from './remoteBoard';

export const SUGGEST_MAX = 1000;
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
export const RESUME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

async function clientHash(): Promise<string | null> {
  try {
    const KEY = 'fsb-visitor-v1';
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export function validEmail(e: string): boolean {
  return e.length <= 254 && EMAIL_RE.test(e);
}

export async function sendSuggestion(message: string, name: string, email: string, honeypot: string): Promise<void> {
  const m = message.trim();
  if (!m || m.length > SUGGEST_MAX) throw new Error('Please write 1 to 1,000 characters.');
  if (email && !validEmail(email.trim())) throw new Error('That email looks off.');
  if (!remoteEnabled) throw new Error('Offline right now. Try again later.');
  await rpc('fsb_suggest', { p_message: m, p_name: name.trim() || null, p_email: email.trim() || null, p_client: await clientHash(), p_hp: honeypot || null }, 8000);
}

/** The file's extension and MIME if it's an allowed resume (PDF, DOC, DOCX up to 5 MB), else an error message. */
export function checkResume(f: File | null | undefined): { ext: string; mime: string } | string {
  if (!f) return 'Pick a PDF, DOC or DOCX file.';
  const ext = (f.name.split('.').pop() ?? '').toLowerCase();
  const mime = RESUME_TYPES[ext];
  if (!mime) return 'Only PDF, DOC or DOCX, please.';
  if (f.type && f.type !== mime && !(ext === 'doc' && f.type === 'application/octet-stream')) return 'That file type does not match its name.';
  if (f.size <= 0 || f.size > RESUME_MAX_BYTES) return 'Files up to 5 MB, please.';
  return { ext, mime };
}

export async function sendResume(name: string, email: string, note: string, file: File, honeypot: string): Promise<void> {
  const n = name.trim();
  const e = email.trim();
  if (!n || n.length > 80) throw new Error('Please add your name.');
  if (!validEmail(e)) throw new Error('Please add an email so Dan can reply.');
  if (note.length > 500) throw new Error('Notes up to 500 characters.');
  const ok = checkResume(file);
  if (typeof ok === 'string') throw new Error(ok);
  if (!remoteEnabled) throw new Error('Offline right now. Try again later.');
  const path = (await rpc(
    'fsb_resume_start',
    { p_name: n, p_email: e, p_note: note.trim() || null, p_file_name: file.name.slice(0, 120), p_mime: ok.mime, p_size: file.size, p_client: await clientHash(), p_hp: honeypot || null },
    8000,
  )) as string;
  if (typeof path !== 'string' || !/^r\/[0-9a-f-]{36}\.(pdf|docx?)$/.test(path)) {
    if (typeof path === 'string' && path.startsWith('hp/')) return; // honeypot: pretend it worked
    throw new Error('Upload not accepted.');
  }
  const headers: Record<string, string> = { apikey: SUPABASE_ANON, 'Content-Type': ok.mime, 'x-upsert': 'false' };
  if (SUPABASE_ANON.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_ANON}`;
  const res = await fetch(`${SUPABASE_BASE}/storage/v1/object/fsb-resumes/${path}`, { method: 'POST', headers, body: file });
  if (!res.ok) throw new Error(`Upload failed (${res.status}). Try again later.`);
  await rpc('fsb_resume_done', { p_path: path }, 8000);
}
