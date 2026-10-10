import { supabase } from './supabase';

/**
 * Every company file that went through the importer.
 *
 * The bug that started this feature was a PDF that produced no booking and no
 * trace: the company saw nothing happen, and there was nothing to look at
 * afterwards. A row per upload — including the refused ones — turns that into a
 * question with an answer.
 */

export type ImportLogStatus = 'ok' | 'empty' | 'error';

export type ImportLogRow = {
  id: string;
  created_at: string;
  company_id: string | null;
  companyName: string | null;
  file_name: string | null;
  file_bytes: number | null;
  status: ImportLogStatus;
  error: string | null;
  used_ai: boolean;
  service_count: number;
  warnings: string[];
  duration_ms: number | null;
};

export type ImportLogTotals = {
  total: number;
  ok: number;
  failed: number;
};

const SELECT =
  'id, created_at, company_id, file_name, file_bytes, status, error, used_ai, service_count, warnings, duration_ms';

function asStatus(value: unknown): ImportLogStatus {
  return value === 'empty' || value === 'error' ? value : 'ok';
}

export async function fetchImportLog(limit = 80): Promise<{
  data: ImportLogRow[];
  totals: ImportLogTotals;
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('booking_import_log')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [], totals: { total: 0, ok: 0, failed: 0 }, error: new Error(error.message) };
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  const companyIds = [
    ...new Set(rows.map((r) => String(r.company_id ?? '').trim()).filter(Boolean)),
  ];
  const nameById = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', companyIds);
    for (const u of (users ?? []) as Record<string, unknown>[]) {
      const name = String(u.full_name ?? '').trim();
      if (name) nameById.set(String(u.id), name);
    }
  }

  const out: ImportLogRow[] = rows.map((r) => {
    const companyId = String(r.company_id ?? '').trim() || null;
    return {
      id: String(r.id),
      created_at: String(r.created_at ?? ''),
      company_id: companyId,
      companyName: companyId ? (nameById.get(companyId) ?? null) : null,
      file_name: (r.file_name as string | null) ?? null,
      file_bytes: r.file_bytes == null ? null : Number(r.file_bytes),
      status: asStatus(r.status),
      error: (r.error as string | null) ?? null,
      used_ai: r.used_ai === true,
      service_count: Number(r.service_count ?? 0),
      warnings: Array.isArray(r.warnings) ? r.warnings.map((w) => String(w)) : [],
      duration_ms: r.duration_ms == null ? null : Number(r.duration_ms),
    };
  });

  return {
    data: out,
    totals: {
      total: out.length,
      ok: out.filter((r) => r.status === 'ok').length,
      failed: out.filter((r) => r.status !== 'ok').length,
    },
    error: null,
  };
}

export function formatFileSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
