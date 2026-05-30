import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ResizablePanelProps {
  children: React.ReactNode;
  side: 'left' | 'right';
  label?: string;
  defaultWidth?: number;
  minWidth?: number;
  snapThreshold?: number;
  autoCollapseBelow?: number;
  overlayWidth?: number;
  storageKey: string;
}

function getViewportWidth(): number {
  return typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  side,
  label,
  defaultWidth = 300,
  minWidth = 200,
  snapThreshold = 100,
  autoCollapseBelow,
  overlayWidth,
  storageKey,
}) => {
  const [width, setWidth] = useState<number>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : defaultWidth;
  });
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem(`${storageKey}_collapsed`);
    return saved === 'true';
  });
  const [isResizing, setIsResizing] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(getViewportWidth);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, width.toString());
  }, [width, storageKey]);

  useEffect(() => {
    localStorage.setItem(`${storageKey}_collapsed`, isManuallyCollapsed.toString());
  }, [isManuallyCollapsed, storageKey]);

  useEffect(() => {
    if (!autoCollapseBelow) return;

    const handleResize = () => setViewportWidth(getViewportWidth());

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [autoCollapseBelow]);

  const isAutoCollapsed =
    typeof autoCollapseBelow === 'number' && viewportWidth < autoCollapseBelow;
  const isCollapsed = isManuallyCollapsed || isAutoCollapsed;

  useEffect(() => {
    if (!isAutoCollapsed) {
      setIsOverlayOpen(false);
    }
  }, [isAutoCollapsed]);

  useEffect(() => {
    if (!isOverlayOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOverlayOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOverlayOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const maxWidth = window.innerWidth / 3;
      let newWidth;

      if (side === 'left') {
        newWidth = e.clientX;
      } else {
        newWidth = window.innerWidth - e.clientX;
      }

      if (newWidth < snapThreshold) {
        setIsManuallyCollapsed(true);
        setWidth(defaultWidth); // Keep the width stored for when it uncollapses
      } else {
        setIsManuallyCollapsed(false);
        if (newWidth >= minWidth && newWidth <= maxWidth) {
          setWidth(newWidth);
        } else if (newWidth > maxWidth) {
          setWidth(maxWidth);
        } else if (newWidth < minWidth) {
          setWidth(minWidth);
        }
      }
    },
    [isResizing, side, minWidth, snapThreshold, defaultWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const toggleCollapse = () => {
    if (isAutoCollapsed) {
      setIsOverlayOpen(true);
      return;
    }

    setIsManuallyCollapsed(!isManuallyCollapsed);
  };

  const resizerClass = `w-1.5 hover:bg-blue-400 bg-gray-200 cursor-col-resize transition-colors flex-shrink-0 relative z-10 flex items-center justify-center group ${
    isResizing ? 'bg-blue-500' : ''
  }`;
  const panelLabel = label ?? (side === 'left' ? 'Sidopanel' : 'Panel');
  const overlayPanelWidth = overlayWidth ?? width;

  if (isCollapsed) {
    return (
      <>
        <button
          type="button"
          className={`bg-gray-50 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors w-8 flex-shrink-0 ${
            side === 'left' ? 'border-r border-gray-200' : 'border-l border-gray-200'
          }`}
          onClick={toggleCollapse}
          title={`Öppna ${panelLabel}`}
          aria-label={`Öppna ${panelLabel}`}
        >
          <span className="text-gray-400 transform -rotate-90 whitespace-nowrap text-xs font-medium tracking-wider">
            {panelLabel}
          </span>
        </button>

        {isAutoCollapsed && isOverlayOpen && (
          <>
            <button
              type="button"
              aria-label={`Stäng ${panelLabel}`}
              className="fixed inset-0 z-40 cursor-default bg-gray-900/20"
              onClick={() => setIsOverlayOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={panelLabel}
              className={`fixed top-0 z-50 h-screen max-w-[calc(100vw-2rem)] bg-white shadow-2xl ${
                side === 'left'
                  ? 'left-0 border-r border-gray-200'
                  : 'right-0 border-l border-gray-200'
              }`}
              style={{ width: `${overlayPanelWidth}px` }}
            >
              {children}
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <>
      {side === 'right' && (
        <div className={resizerClass} onMouseDown={handleMouseDown}>
          <div className="w-0.5 h-8 bg-gray-300 rounded group-hover:bg-white" />
        </div>
      )}

      <div
        ref={panelRef}
        style={{ width: `${width}px` }}
        className="flex-shrink-0 h-full flex flex-col bg-white overflow-hidden relative"
      >
        {children}
      </div>

      {side === 'left' && (
        <div className={resizerClass} onMouseDown={handleMouseDown}>
          <div className="w-0.5 h-8 bg-gray-300 rounded group-hover:bg-white" />
        </div>
      )}
    </>
  );
};
