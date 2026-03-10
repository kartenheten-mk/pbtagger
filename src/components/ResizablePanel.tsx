import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ResizablePanelProps {
  children: React.ReactNode;
  side: 'left' | 'right';
  defaultWidth?: number;
  minWidth?: number;
  snapThreshold?: number;
  storageKey: string;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  side,
  defaultWidth = 300,
  minWidth = 200,
  snapThreshold = 100,
  storageKey,
}) => {
  const [width, setWidth] = useState<number>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : defaultWidth;
  });
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem(`${storageKey}_collapsed`);
    return saved === 'true';
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, width.toString());
  }, [width, storageKey]);

  useEffect(() => {
    localStorage.setItem(`${storageKey}_collapsed`, isCollapsed.toString());
  }, [isCollapsed, storageKey]);

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
        setIsCollapsed(true);
        setWidth(defaultWidth); // Keep the width stored for when it uncollapses
      } else {
        setIsCollapsed(false);
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
    setIsCollapsed(!isCollapsed);
  };

  const resizerClass = `w-1.5 hover:bg-blue-400 bg-gray-200 cursor-col-resize transition-colors flex-shrink-0 relative z-10 flex items-center justify-center group ${
    isResizing ? 'bg-blue-500' : ''
  }`;

  if (isCollapsed) {
    return (
      <div
        className={`bg-gray-50 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors w-8 ${
          side === 'left' ? 'border-r border-gray-200' : 'border-l border-gray-200'
        }`}
        onClick={toggleCollapse}
        title={`Expand ${side} panel`}
      >
        <span className="text-gray-400 transform -rotate-90 whitespace-nowrap text-xs font-medium tracking-wider">
          Expand
        </span>
      </div>
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
