import { useState, useRef, useEffect } from 'react';
import { ANALYSIS_TYPES, DEFAULT_ANALYSIS_TYPE, type AnalysisTypeConfig } from '../constants/analysisTypes';

// Minimal issue info needed for analysis
export interface AnalyzableIssue {
  number: number;
  title: string;
  body: string;
}

interface AnalyzeButtonProps {
  issue: AnalyzableIssue;
  onAnalyze: (issue: AnalyzableIssue, analysisType: AnalysisTypeConfig) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function AnalyzeButton({ issue, onAnalyze, size = 'md', className = '' }: AnalyzeButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedType, setSelectedType] = useState<AnalysisTypeConfig>(DEFAULT_ANALYSIS_TYPE);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMainClick = () => {
    onAnalyze(issue, selectedType);
  };

  const handleTypeSelect = (type: AnalysisTypeConfig) => {
    setSelectedType(type);
    setShowDropdown(false);
    onAnalyze(issue, type);
  };

  const sizeClasses = size === 'sm'
    ? 'text-xs py-1'
    : 'text-sm py-2';

  return (
    <div className={`relative inline-flex ${className}`} ref={dropdownRef}>
      {/* Main button */}
      <button
        onClick={handleMainClick}
        className={`px-3 ${sizeClasses} bg-blue-600 hover:bg-blue-700 text-white rounded-l-lg font-medium border-r border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:ring-offset-gray-900 focus:z-10`}
      >
        {selectedType.shortName}
      </button>

      {/* Dropdown trigger */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowDropdown(!showDropdown);
        }}
        className={`px-2 ${sizeClasses} bg-blue-600 hover:bg-blue-700 text-white rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:ring-offset-gray-900`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      <div
        className={`absolute right-0 top-full mt-1 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-20 transition-all duration-150 origin-top-right ${
          showDropdown
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        {ANALYSIS_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={(e) => {
                e.stopPropagation();
                handleTypeSelect(type);
              }}
              className={`w-full px-3 py-2 text-left hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg focus:outline-none focus:bg-gray-700 ${
                selectedType.id === type.id ? 'bg-gray-700' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{type.name}</span>
                {selectedType.id === type.id && (
                  <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{type.description}</p>
            </button>
        ))}
      </div>
    </div>
  );
}
