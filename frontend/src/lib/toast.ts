// Minimal toast bus. Anything (API interceptors included) can call toast();
// <Toaster/> subscribes and renders. Kept outside React so non-component
// code can raise one.

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';
export interface Toast { id: number; message: string; tone: ToastTone }

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(toasts));

export function toast(message: string, tone: ToastTone = 'info', ms = tone === 'danger' ? 7000 : 4500) {
  // Collapse an identical toast already on screen instead of stacking repeats.
  if (toasts.some((t) => t.message === message && t.tone === tone)) return;
  const t = { id: nextId++, message, tone };
  toasts = [...toasts, t].slice(-4);
  emit();
  window.setTimeout(() => dismissToast(t.id), ms);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(l: Listener) {
  listeners.add(l);
  l(toasts);
  return () => { listeners.delete(l); };
}
