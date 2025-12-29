import { Separator } from 'react-resizable-panels';

interface ResizeHandleProps {
  orientation?: 'vertical' | 'horizontal';
}

export function ResizeHandle({ orientation = 'vertical' }: ResizeHandleProps) {
  const isVertical = orientation === 'vertical';
  return (
    <Separator
      className={`group relative flex items-center justify-center transition-all resize-handle ${
        isVertical ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'
      }`}
    >
      {/* Visible drag line */}
      <div
        className={`bg-gray-750 group-hover:bg-blurple-400 group-active:bg-blurple-300 transition-colors ${
          isVertical ? 'w-px h-full' : 'h-px w-full'
        }`}
      />
      {/* Grip dots indicator - subtly visible, enhanced on hover */}
      <div
        className={`absolute flex items-center justify-center gap-1 opacity-30 group-hover:opacity-100 transition-opacity pointer-events-none resize-handle-dots ${
          isVertical ? 'inset-y-0 flex-col' : 'inset-x-0 flex-row'
        }`}
      >
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blurple-400 transition-colors" />
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blurple-400 transition-colors" />
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blurple-400 transition-colors" />
      </div>
    </Separator>
  );
}
