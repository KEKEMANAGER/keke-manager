import { supabase } from './supabase';

export async function fetchUserAvatarUrl(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('users').select('avatar_url').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  const u = data as { avatar_url?: string | null };
  return typeof u.avatar_url === 'string' && u.avatar_url.startsWith('http') ? u.avatar_url : null;
}

export async function saveUserAvatarUrl(userId: string, publicUrl: string) {
  const { data, error } = await supabase
    .from('users')
    .update({ avatar_url: publicUrl })
    .eq('id', userId)
    .select('id');

  if (error) return { error };

  if (data && data.length > 0) {
    return { error: null };
  }

  const ins = await supabase.from('users').insert({
    id: userId,
    avatar_url: publicUrl,
    role: null,
    full_name: null,
    email: null,
  });
  return { error: ins.error };
}
