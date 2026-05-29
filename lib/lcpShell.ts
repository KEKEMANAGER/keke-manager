/** Dismiss the static LCP shell after React paints (keeps early LCP on the inlined hero image). */
export function dismissLcpShell(): void {
  if (typeof document === 'undefined') return;
  const shell = document.getElementById('keke-lcp-shell');
  if (!shell) return;
  shell.classList.add('keke-lcp-done');
  window.setTimeout(() => {
    shell.remove();
  }, 4000);
}
