import { storagePublicUrlBase } from './mediaUpload';
import { resolveProfileAvatarUrl } from './profileAvatar';
import { supabase } from './supabase';

export async function fetchUserAvatarUrl(userId: string): Promise<string | null> {
  const [profileRes, userRes] = await Promise.all([
    supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle(),
    supabase.from('users').select('avatar_url').eq('id', userId).maybeSingle(),
  ]);
  const profile = profileRes.data as { avatar_url?: string | null } | null;
  const user = userRes.data as { avatar_url?: string | null } | null;
  return resolveProfileAvatarUrl(profile?.avatar_url, user?.avatar_url);
}

export async function saveUserAvatarUrl(userId: string, publicUrl: string) {
  const cleanUrl = storagePublicUrlBase(publicUrl);
  const { data, error } = await supabase
    .from('users')
    .update({ avatar_url: cleanUrl })
    .eq('id', userId)
    .select('id');

  if (error) return { error };

  if (data && data.length > 0) {
    await supabase.from('profiles').upsert({ id: userId, avatar_url: cleanUrl }, { onConflict: 'id' });
    return { error: null };
  }

  const ins = await supabase.from('users').insert({
    id: userId,
    avatar_url: cleanUrl,
    role: null,
    full_name: null,
    email: null,
  });
  if (!ins.error) {
    await supabase.from('profiles').upsert({ id: userId, avatar_url: cleanUrl }, { onConflict: 'id' });
  }
  return { error: ins.error };
}
