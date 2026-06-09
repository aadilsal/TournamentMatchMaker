import { useEffect } from 'react';

/** Prevents the browser "Save page" dialog on Ctrl+S / Cmd+S site-wide. */
export function useBlockSaveShortcut() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSave =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';

      if (!isSave) return;

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);
}
