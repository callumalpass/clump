import { memo } from 'react';
import type { WorkItem } from '../types';
import { focusRing } from '../utils/styles';

// Priority badge color mapping
const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-500/20', text: 'text-red-400' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  low: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
};

// Local status badge color mapping
const STATUS_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  open: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: '○' },
  in_progress: { bg: 'bg-blurple-500/20', text: 'text-blurple-400', icon: '◐' },
  completed: { bg: 'bg-mint-400/20', text: 'text-mint-400', icon: '✓' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400', icon: '✗' },
};

interface WorkItemListItemProps {
  item: WorkItem;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

const WorkItemListItem = memo(function WorkItemListItem({
  item,
  index,
  isSelected,
  onSelect,
}: WorkItemListItemProps) {
  const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS['open']!;
  const priorityStyle = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS['medium']!;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group p-4 mx-2 my-2 cursor-pointer rounded-stoody-lg session-card-light transition-colors duration-150 list-item-enter list-item-hover focus-visible:ring-2 focus-visible:ring-blurple-400 focus-visible:ring-inset ${
        isSelected
          ? 'bg-blurple-500/20 ring-2 ring-blurple-400'
          : 'bg-gray-800 hover:bg-gray-750'
      }`}
      style={{ '--item-index': Math.min(index, 15) } as React.CSSProperties}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={isSelected}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">#{item.id}</span>
            <h3 className="text-sm font-medium text-white truncate group-hover:text-pink-400 transition-colors" title={item.title}>
              {item.title}
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span
              className={`px-2.5 py-1 text-xs font-medium rounded-stoody-lg ${statusStyle.bg} ${statusStyle.text}`}
              title={`Status: ${item.status}`}
            >
              {statusStyle.icon} {item.status.replace('_', ' ')}
            </span>
            <span
              className={`px-2.5 py-1 text-xs font-medium rounded-stoody-lg ${priorityStyle.bg} ${priorityStyle.text}`}
              title={`Priority: ${item.priority}`}
            >
              {item.priority}
            </span>
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 text-xs rounded-stoody-lg bg-gray-700 text-gray-300"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="list-item-metadata text-xs text-gray-400 mt-2">
             Created {new Date(item.created_at || '').toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
});

interface WorkItemListProps {
  items: WorkItem[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
  loading: boolean;
  error?: string | null;
  onCreateItem: () => void;
  onRefresh: () => void;
}

export function WorkItemList({
  items,
  selectedItemId,
  onSelectItem,
  loading,
  error,
  onCreateItem,
  onRefresh,
}: WorkItemListProps) {

  // Simple client-side sorting/filtering could go here if needed
  // For now just pass through

  return (
    <div className="flex flex-col flex-1 min-h-0">
      
      {/* Loading state */}
      {loading && (
        <div className="flex flex-col">
           {/* Simple skeleton */}
           {[0, 1, 2].map(i => (
             <div key={i} className="p-4 m-2 h-24 bg-gray-800/50 rounded-stoody-lg animate-pulse" />
           ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-red-400">
          <p>Error loading work items: {error}</p>
          <button onClick={onRefresh} className="mt-2 text-sm underline">Try again</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
         <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-400">
           <p>No work items found.</p>
           <button onClick={onCreateItem} className="mt-4 px-3 py-2 bg-blurple-500 text-white rounded-stoody-lg">
             Create First Item
           </button>
         </div>
      )}

      {/* List */}
      {!loading && items.length > 0 && (
        <div className="flex-1 overflow-auto min-h-0 flex flex-col">
          {items.map((item, index) => (
            <WorkItemListItem
              key={item.id}
              item={item}
              index={index}
              isSelected={selectedItemId === item.id}
              onSelect={() => onSelectItem(item.id)}
            />
          ))}
        </div>
      )}
      
      {/* Footer */}
      <div className="shrink-0 border-t border-gray-750 p-2 flex items-center justify-between text-sm">
         <span className="text-gray-400">{items.length} items</span>
         <button
            onClick={onCreateItem}
            className={`px-2 py-1 text-xs bg-green-600 hover:bg-green-700 active:scale-95 text-white rounded transition-all ${focusRing}`}
          >
            + New
          </button>
      </div>
    </div>
  );
}
