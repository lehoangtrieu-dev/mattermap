import { useEffect } from 'react';

let lockCount = 0;

export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    lockCount++;
    if (lockCount === 1) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      }
    };
  }, [isLocked]);
}
