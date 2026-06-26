import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = { userId?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'missing_authorization' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !serviceKey) {
      console.error('admin-delete-user: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey || serviceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user: caller },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !caller) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    const { data: callerRow, error: roleErr } = await userClient
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();

    if (roleErr) {
      return jsonResponse({ error: roleErr.message }, 403);
    }
    if ((callerRow as { role?: string } | null)?.role !== 'admin') {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    const targetId = String(body.userId ?? '').trim();
    if (!targetId) {
      return jsonResponse({ error: 'userId_required' }, 400);
    }
    if (targetId === caller.id) {
      return jsonResponse({ error: 'cannot_delete_self' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: purgeErr } = await admin.rpc('purge_user_data', { p_target_id: targetId });
    if (purgeErr) {
      return jsonResponse({ error: purgeErr.message }, 400);
    }

    return jsonResponse({ ok: true }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error';
    return jsonResponse({ error: msg }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
