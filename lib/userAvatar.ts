import { supabase } from './supabase';

export async function fetchUserAvatarUrl(clerkId: string): Promise<string | null> {
  const { data, error } = await supabase.from('users').select('avatar_url').eq('clerk_id', clerkId).maybeSingle();
  if (error || !data) return null;
  const u = data as { avatar_url?: string | null };
  return typeof u.avatar_url === 'string' && u.avatar_url.startsWith('http') ? u.avatar_url : null;
}

export async function saveUserAvatarUrl(clerkId: string, publicUrl: string) {
  const { data, error } = await supabase
    .from('users')
    .update({ avatar_url: publicUrl })
    .eq('clerk_id', clerkId)
    .select('clerk_id');

  if (error) return { error };

  if (data && data.length > 0) {
    return { error: null };
  }

  const ins = await supabase.from('users').insert({
    clerk_id: clerkId,
    avatar_url: publicUrl,
    role: null,
    full_name: null,
    email: null,
  });
  return { error: ins.error };
}
