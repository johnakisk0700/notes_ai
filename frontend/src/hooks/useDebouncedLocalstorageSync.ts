import { useEffect, useRef } from 'react';

export const useDebouncedLocalstorageSync = (val: string, key: string) => {
  // debounced sync of value to desired key
  const debounceTimerRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      localStorage.setItem(key, val);
    }, 400);

    return () => {
      if (debounceTimerRef.current) return clearTimeout(debounceTimerRef.current);
    };
  }, [val]);
};
