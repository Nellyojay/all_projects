import { useEffect, useRef, useState, type RefObject } from 'react';

const RELEASE_DISTANCE = 108;
const MAX_PULL_DISTANCE = 120;

export function usePullToIntro(
  onRelease: () => void,
): {
  containerRef: RefObject<HTMLDivElement | null>;
  distance: number;
  isReady: boolean;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const onReleaseRef = useRef(onRelease);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    onReleaseRef.current = onRelease;
  }, [onRelease]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startX: number | null = null;
    let startY: number | null = null;
    let pullDistance = 0;

    const reset = () => {
      startX = null;
      startY = null;
      pullDistance = 0;
      setDistance(0);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;

      const target = event.target;
      if (target instanceof Element && target.closest(
        'button, a, input, textarea, select, [contenteditable="true"], .mobile-nav, .record-composer-page, .record-details-page',
      )) return;

      if (window.scrollY > 0 || document.documentElement.scrollTop > 0) return;

      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      pullDistance = 0;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (startX === null || startY === null || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaY = touch.clientY - startY;
      const deltaX = touch.clientX - startX;
      if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
        reset();
        return;
      }

      event.preventDefault();
      pullDistance = Math.min(deltaY, MAX_PULL_DISTANCE);
      setDistance(pullDistance);
    };

    const handleTouchEnd = () => {
      const shouldNavigate = startY !== null && pullDistance >= RELEASE_DISTANCE;
      reset();
      if (shouldNavigate) onReleaseRef.current();
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', reset);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', reset);
    };
  }, []);

  return {
    containerRef,
    distance,
    isReady: distance >= RELEASE_DISTANCE,
  };
}
