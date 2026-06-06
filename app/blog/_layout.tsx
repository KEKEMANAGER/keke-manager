import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { BLOG_WEB_CSS } from '../../components/blog/blogWebStyles';
import { BlogManifestProvider } from '../../lib/BlogManifestProvider';

export default function BlogLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'blog-web-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = BLOG_WEB_CSS;
    document.head.appendChild(el);
  }, []);

  return (
    <BlogManifestProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#ffffff' },
        }}
      />
    </BlogManifestProvider>
  );
}
