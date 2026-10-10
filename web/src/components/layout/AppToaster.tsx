import { Toaster } from 'sonner';
import type { ThemeMode } from '../../hooks/useTheme';

/** Notifications at the top of the window, styled with the app's colors. */
export function AppToaster({ theme }: { theme: ThemeMode }) {
  return (
    <Toaster
      theme={theme}
      position="top-center"
      toastOptions={{
        style: {
          background: 'var(--surface-2)',
          color: 'var(--ink)',
          border: '1px solid var(--line)',
          fontFamily: 'var(--font-sans)',
        },
      }}
    />
  );
}
