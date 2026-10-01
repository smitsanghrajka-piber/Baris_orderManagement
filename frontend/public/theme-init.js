// Applies the saved theme before first paint so dark mode never flashes light.
// A separate file (not inline) because the API's CSP has script-src 'self'.
try {
  var t = localStorage.getItem('baris.theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
} catch (e) { /* storage blocked: stay light */ }
