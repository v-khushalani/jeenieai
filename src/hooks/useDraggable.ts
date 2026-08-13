import { useState, useCallback, useEffect, useRef } from 'react';

interface Position {
  x: number;
  y: number;
}

export const useDraggable = (initialPosition: Position = { x: 0, y: 0 }) => {
  const [position, setPosition] = useState<Position>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<Position | null>(null);
  const lastPosition = useRef<Position>(initialPosition);

  const onMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    dragStartPos.current = { x: clientX, y: clientY };
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging || !dragStartPos.current) return;

      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

      const deltaX = clientX - dragStartPos.current.x;
      const deltaY = clientY - dragStartPos.current.y;

      // Update position relative to initial drag point
      // We want to update from the last stable position
      const newX = lastPosition.current.x + deltaX;
      const newY = lastPosition.current.y + deltaY;

      // Basic viewport containment (approximate)
      const boundedX = Math.max(-window.innerWidth + 80, Math.min(0, newX));
      const boundedY = Math.max(-window.innerHeight + 80, Math.min(0, newY));

      setPosition({ x: boundedX, y: boundedY });
    };

    const onMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        lastPosition.current = position;
        dragStartPos.current = null;
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onMouseMove);
      window.addEventListener('touchend', onMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onMouseMove);
      window.removeEventListener('touchend', onMouseUp);
    };
  }, [isDragging, position]);

  return { position, isDragging, onMouseDown };
};
