import { useState } from 'react';
import type { WorkItem, WorkItemStatus, WorkItemPriority, WorkItemUpdate, CommandMetadata } from '../types';
import { Markdown } from './Markdown';
import { Editor } from './Editor';
import { StartSessionButton } from './StartSessionButton';

interface WorkItemDetailProps {
  item: WorkItem;
  commands: CommandMetadata[];
  onUpdate: (updates: WorkItemUpdate) => Promise<void>;
  onStartSession: (item: WorkItem, command: CommandMetadata) => void;
  onDelete: () => Promise<void>;
}

// Status options
const STATUS_OPTIONS: { value: WorkItemStatus; label: string; icon: string; color: string }[] = [
  { value: 'open', label: 'Open', icon: '○', color: 'text-gray-400' },
  { value: 'in_progress', label: 'In Progress', icon: '◐', color: 'text-blurple-400' },
  { value: 'completed', label: 'Completed', icon: '✓', color: 'text-mint-400' },
  { value: 'cancelled', label: 'Cancelled', icon: '✗', color: 'text-red-400' },
];

// Priority options
const PRIORITY_OPTIONS: { value: WorkItemPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'text-gray-400' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-400' },
  { value: 'high', label: 'High', color: 'text-orange-400' },
  { value: 'critical', label: 'Critical', color: 'text-red-400' },
];

export function WorkItemDetail({
  item,
  commands,
  onUpdate,
  onStartSession,
  onDelete,
}: WorkItemDetailProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState(item.description || '');

  const [updating, setUpdating] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);

  const handleTitleSave = async () => {
    if (editTitle.trim() === item.title) {
        setIsEditingTitle(false);
        return;
    }
    setUpdating(true);
    try {
        await onUpdate({ title: editTitle.trim() });
        setIsEditingTitle(false);
    } finally {
        setUpdating(false);
    }
  };

  const handleDescSave = async () => {
    if (editDesc.trim() === (item.description || '')) {
        setIsEditingDesc(false);
        return;
    }
    setUpdating(true);
    try {
        await onUpdate({ description: editDesc.trim() });
        setIsEditingDesc(false);
    } finally {
        setUpdating(false);
    }
  };

  const handleStatusChange = async (status: WorkItemStatus) => {
      setUpdating(true);
      setShowStatusDropdown(false);
      try {
          await onUpdate({ status });
      } finally {
          setUpdating(false);
      }
  };

  const handlePriorityChange = async (priority: WorkItemPriority) => {
      setUpdating(true);
      setShowPriorityDropdown(false);
      try {
          await onUpdate({ priority });
      } finally {
          setUpdating(false);
      }
  };

  const currentStatus = STATUS_OPTIONS.find(s => s.value === item.status) || STATUS_OPTIONS[0]!;
  const currentPriority = PRIORITY_OPTIONS.find(p => p.value === item.priority) || PRIORITY_OPTIONS[1]!;

  return (
    <div className="p-4 overflow-auto h-full min-w-0">
      
      {/* Header / Title */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <div className="text-sm text-gray-400 mb-1">Work Item #{item.id}</div>
          {isEditingTitle ? (
             <div className="flex gap-2">
                 <input 
                    type="text" 
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xl font-semibold text-white focus:outline-none focus:border-blurple-500"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTitleSave();
                        if (e.key === 'Escape') {
                            setEditTitle(item.title);
                            setIsEditingTitle(false);
                        }
                    }}
                    autoFocus
                 />
                 <button onClick={handleTitleSave} disabled={updating} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Save</button>
                 <button onClick={() => { setIsEditingTitle(false); setEditTitle(item.title); }} className="px-3 py-1 bg-gray-700 text-white rounded text-sm">Cancel</button>
             </div>
          ) : (
            <h2 
                className="text-xl font-semibold text-white cursor-pointer hover:bg-gray-800 rounded px-1 -ml-1 border border-transparent hover:border-gray-700 transition-colors"
                onClick={() => setIsEditingTitle(true)}
                title="Click to edit title"
            >
                {item.title}
            </h2>
          )}
          
          {/* Metadata Controls */}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            
            {/* Status Dropdown */}
            <div className="relative">
                <button
                    onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                    disabled={updating}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-stoody-lg transition-colors border border-gray-700 hover:border-gray-500 ${
                        currentStatus.value === 'open' ? 'bg-gray-500/20 text-gray-300' :
                        currentStatus.value === 'in_progress' ? 'bg-blurple-500/20 text-blurple-400' :
                        currentStatus.value === 'completed' ? 'bg-mint-400/20 text-mint-400' :
                        'bg-red-500/20 text-red-400'
                    }`}
                >
                    <span>{currentStatus.icon}</span>
                    {currentStatus.label}
                    <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                {showStatusDropdown && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowStatusDropdown(false)} />
                        <div className="absolute top-full left-0 mt-1 w-40 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-20 py-1">
                            {STATUS_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => handleStatusChange(opt.value)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-750 transition-colors text-gray-300"
                                >
                                    <span className={opt.color}>{opt.icon}</span>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Priority Dropdown */}
            <div className="relative">
                <button
                    onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                    disabled={updating}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-stoody-lg transition-colors border border-gray-700 hover:border-gray-500 ${currentPriority.color.replace('text-', 'bg-')}/20 ${currentPriority.color}`}
                >
                    {currentPriority.label}
                    <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7 7" />
                    </svg>
                </button>
                {showPriorityDropdown && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowPriorityDropdown(false)} />
                        <div className="absolute top-full left-0 mt-1 w-40 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-20 py-1">
                            {PRIORITY_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => handlePriorityChange(opt.value)}
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-750 transition-colors ${opt.color}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

             {/* Delete Button */}
             <button
                onClick={() => {
                    if (window.confirm('Are you sure you want to delete this work item?')) {
                        onDelete();
                    }
                }}
                className="text-xs text-red-400 hover:text-red-300 hover:underline ml-auto"
             >
                Delete Item
             </button>
          </div>
        </div>
        
        <div className="flex flex-col gap-2">
            <StartSessionButton
                issue={{ number: item.id, title: item.title, body: item.description || '' }}
                commands={commands}
                onStart={(_, command) => onStartSession(item, command)}
                className="whitespace-nowrap"
            />
        </div>
      </div>

      {/* Description */}
      <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-400">Description</h3>
             {!isEditingDesc && (
                 <button onClick={() => setIsEditingDesc(true)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
             )}
          </div>
          
          {isEditingDesc ? (
              <div className="bg-gray-800 rounded-lg p-2">
                  <Editor
                     value={editDesc}
                     onChange={setEditDesc}
                     placeholder="Describe the work item..."
                     minHeight="200px"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => { setIsEditingDesc(false); setEditDesc(item.description || ''); }} className="px-3 py-1 bg-gray-700 text-white rounded text-sm">Cancel</button>
                      <button onClick={handleDescSave} disabled={updating} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Save Description</button>
                  </div>
              </div>
          ) : (
            <div 
                className="bg-gray-800 rounded-lg p-4 min-h-[100px] cursor-pointer hover:bg-gray-750 transition-colors border border-transparent hover:border-gray-700"
                onClick={() => setIsEditingDesc(true)}
            >
                {item.description ? (
                    <Markdown>{item.description}</Markdown>
                ) : (
                    <p className="text-gray-500 italic">No description provided. Click to add one.</p>
                )}
            </div>
          )}
      </div>

      {/* AI Analysis (Read Only for now, populated by backend logic) */}
      {(item.ai_summary || item.suggested_approach || item.complexity) && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-blurple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Analysis
          </h3>
          <div className="bg-gray-800 rounded-lg p-4 space-y-4">
             <div className="flex flex-wrap gap-2">
                 {item.complexity && (
                     <span className="px-2.5 py-1 text-xs font-medium rounded-stoody-lg bg-gray-700 text-gray-300">
                         Complexity: {item.complexity}
                     </span>
                 )}
                 {item.risk && (
                     <span className="px-2.5 py-1 text-xs font-medium rounded-stoody-lg bg-gray-700 text-gray-300">
                         Risk: {item.risk}
                     </span>
                 )}
             </div>

             {item.ai_summary && (
              <div>
                <div className="text-xs text-gray-400 mb-1">Summary</div>
                <div className="text-sm text-gray-300"><Markdown>{item.ai_summary}</Markdown></div>
              </div>
            )}

            {item.suggested_approach && (
              <div>
                <div className="text-xs text-gray-400 mb-1">Suggested Approach</div>
                <div className="text-sm text-gray-300"><Markdown>{item.suggested_approach}</Markdown></div>
              </div>
            )}
             
            {item.analyzed_at && (
              <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
                Analyzed on {new Date(item.analyzed_at).toLocaleString()}
                {item.analyzed_by && ` by ${item.analyzed_by}`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
