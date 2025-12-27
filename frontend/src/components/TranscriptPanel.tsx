import { useState, useEffect, useCallback } from 'react';
import type { Analysis, TranscriptResponse } from '../types';
import { fetchTranscript } from '../hooks/useApi';
import { ConversationView, RawTranscriptView } from './ConversationView';

interface TranscriptPanelProps {
  analysis: Analysis;
  onContinue?: () => void;
  onClose: () => void;
}

export function TranscriptPanel({ analysis, onContinue, onClose }: TranscriptPanelProps) {
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [searchVisible, setSearchVisible] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchTranscript(analysis.id)
      .then(setTranscript)
      .catch((err) => setError(err.message || 'Failed to load transcript'))
      .finally(() => setLoading(false));
  }, [analysis.id]);

  // Reset search when analysis changes
  useEffect(() => {
    setSearchQuery('');
    setCurrentMatchIndex(0);
    setTotalMatches(0);
  }, [analysis.id]);

  const handleMatchesFound = useCallback((count: number) => {
    setTotalMatches(count);
    if (count > 0 && currentMatchIndex >= count) {
      setCurrentMatchIndex(0);
    }
  }, [currentMatchIndex]);

  const goToNextMatch = useCallback(() => {
    if (totalMatches > 0) {
      setCurrentMatchIndex((prev) => (prev + 1) % totalMatches);
    }
  }, [totalMatches]);

  const goToPrevMatch = useCallback(() => {
    if (totalMatches > 0) {
      setCurrentMatchIndex((prev) => (prev - 1 + totalMatches) % totalMatches);
    }
  }, [totalMatches]);

  // Keyboard shortcuts for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + F to toggle search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchVisible(true);
        // Focus the search input
        setTimeout(() => {
          const input = document.querySelector('[data-transcript-search]') as HTMLInputElement;
          input?.focus();
        }, 50);
      }

      // Escape to close search
      if (e.key === 'Escape' && searchVisible) {
        setSearchVisible(false);
        setSearchQuery('');
      }

      // Enter to go to next match (when search input is focused)
      if (e.key === 'Enter' && searchVisible) {
        const activeElement = document.activeElement;
        if (activeElement?.hasAttribute('data-transcript-search')) {
          e.preventDefault();
          if (e.shiftKey) {
            goToPrevMatch();
          } else {
            goToNextMatch();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchVisible, goToNextMatch, goToPrevMatch]);

  return (
    <div className="h-full flex flex-col bg-[#0d1117] rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50 border-b border-gray-700">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <h3 className="text-sm font-medium text-white truncate">{analysis.title}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Search toggle button */}
          <button
            onClick={() => {
              setSearchVisible(!searchVisible);
              if (!searchVisible) {
                setTimeout(() => {
                  const input = document.querySelector('[data-transcript-search]') as HTMLInputElement;
                  input?.focus();
                }, 50);
              }
            }}
            className={`p-1.5 rounded transition-colors ${
              searchVisible ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400 hover:text-white'
            }`}
            title="Search transcript (Ctrl+F)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          {/* Continue button */}
          {analysis.claude_session_id && onContinue && (
            <button
              onClick={onContinue}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              Continue Session
            </button>
          )}
          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchVisible && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/30 border-b border-gray-700">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              data-transcript-search
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentMatchIndex(0);
              }}
              placeholder="Search in transcript..."
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm pl-8 focus:border-blue-500 focus:outline-none"
            />
            <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Match count and navigation */}
          {searchQuery && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400 min-w-[4rem] text-right">
                {totalMatches > 0 ? `${currentMatchIndex + 1} of ${totalMatches}` : 'No matches'}
              </span>
              <button
                onClick={goToPrevMatch}
                disabled={totalMatches === 0}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous match (Shift+Enter)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={goToNextMatch}
                disabled={totalMatches === 0}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next match (Enter)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}

          {/* Close search */}
          <button
            onClick={() => {
              setSearchVisible(false);
              setSearchQuery('');
            }}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            title="Close search (Esc)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-gray-400">
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading transcript...
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-400 text-sm">{error}</div>
          </div>
        )}

        {!loading && !error && transcript && (
          transcript.type === 'parsed' ? (
            <ConversationView
              transcript={transcript.transcript}
              searchQuery={searchQuery}
              currentMatchIndex={currentMatchIndex}
              onMatchesFound={handleMatchesFound}
            />
          ) : (
            <div className="p-4">
              <RawTranscriptView transcript={transcript.transcript} />
            </div>
          )
        )}

        {!loading && !error && !transcript && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <svg className="w-12 h-12 text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-400 font-medium mb-1">No transcript available</p>
            <p className="text-gray-500 text-sm">The analysis session didn't produce a transcript</p>
          </div>
        )}
      </div>

      {/* Footer with metadata */}
      <div className="px-4 py-2 border-t border-gray-700 bg-gray-800/30">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {new Date(analysis.created_at).toLocaleString()}
          </span>
          {analysis.claude_session_id && (
            <span className="text-gray-600" title={analysis.claude_session_id}>
              Session: {analysis.claude_session_id.slice(0, 8)}...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
