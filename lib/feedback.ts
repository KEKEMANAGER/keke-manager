import { supabase } from './supabase';

export async function submitFeedback(message: string): Promise<{ ok: boolean; error: Error | null }> {
  const text = message.trim();
  if (!text) {
    return { ok: false, error: new Error('empty') };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return { ok: false, error: new Error(authError?.message ?? 'not_authenticated') };
  }

  const { error } = await supabase.from('feedbacks').insert({
    user_id: user.id,
    message: text,
  });

  if (error) {
    return { ok: false, error: new Error(error.message) };
  }
  return { ok: true, error: null };
}
