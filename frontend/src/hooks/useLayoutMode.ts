import { useMemo } from 'react';
import type { SessionSummary } from '../types';

/**
 * Layout modes for the main content area.
 * Each mode represents a specific combination of selected items and open sessions.
 */
export type LayoutMode =
  | 'issue-sessions'      // Issue context + sessions side-by-side (resizable)
  | 'pr-sessions'         // PR context + sessions side-by-side (resizable)
  | 'schedule-sessions'   // Schedule + sessions side-by-side (resizable)
  | 'issue-only'          // Just issue detail panel
  | 'pr-only'             // Just PR detail panel
  | 'schedule-only'       // Just schedule detail panel
  | 'sessions-only'       // Just sessions panel (no context)
  | 'issue-create'        // Issue creation form
  | 'empty';              // Nothing selected, no sessions

export interface LayoutModeInput {
  selectedIssue: number | null;
  selectedPR: number | null;
  selectedSchedule: number | null;
  isCreatingIssue: boolean;
  openSessions: SessionSummary[];
  activeIssueNumber: number | null;  // Issue from session context
  activePRNumber: number | null;      // PR from session context
}

export interface LayoutModeResult {
  mode: LayoutMode;
  // Derived values for convenience
  hasIssueContext: boolean;
  hasPRContext: boolean;
  showSideBySide: boolean;
  showIssueSideBySide: boolean;
  showPRSideBySide: boolean;
}

/**
 * Hook to compute the current layout mode based on selection state.
 * Centralizes all the conditional layout logic in one place.
 */
export function useLayoutMode(input: LayoutModeInput): LayoutModeResult {
  const {
    selectedIssue,
    selectedPR,
    selectedSchedule,
    isCreatingIssue,
    openSessions,
    activeIssueNumber,
    activePRNumber,
  } = input;

  return useMemo(() => {
    const hasOpenSessions = openSessions.length > 0;
    const hasIssueContext = !!activeIssueNumber;
    const hasPRContext = !!activePRNumber;

    // Show side-by-side when we have sessions AND any issue/PR context
    const showSideBySide = hasOpenSessions && (hasIssueContext || hasPRContext);

    // Determine which context to show in side-by-side (issue vs PR)
    // Prioritize user's explicit selection over session context
    const showIssueSideBySide = selectedIssue ? true : (hasIssueContext && !hasPRContext);
    const showPRSideBySide = selectedPR ? true : (!selectedIssue && hasPRContext);

    // Compute layout mode
    let mode: LayoutMode;

    if (isCreatingIssue) {
      mode = 'issue-create';
    } else if (showSideBySide && showIssueSideBySide) {
      mode = 'issue-sessions';
    } else if (showSideBySide && showPRSideBySide) {
      mode = 'pr-sessions';
    } else if (selectedSchedule && hasOpenSessions) {
      mode = 'schedule-sessions';
    } else if (selectedSchedule) {
      mode = 'schedule-only';
    } else if (selectedIssue && !showSideBySide) {
      mode = 'issue-only';
    } else if (selectedPR && !showSideBySide) {
      mode = 'pr-only';
    } else if (hasOpenSessions && !hasIssueContext && !hasPRContext) {
      mode = 'sessions-only';
    } else {
      mode = 'empty';
    }

    return {
      mode,
      hasIssueContext,
      hasPRContext,
      showSideBySide,
      showIssueSideBySide,
      showPRSideBySide,
    };
  }, [
    selectedIssue,
    selectedPR,
    selectedSchedule,
    isCreatingIssue,
    openSessions,
    activeIssueNumber,
    activePRNumber,
  ]);
}
