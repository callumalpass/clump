import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ScheduleDetail } from './ScheduleDetail';
import type { ScheduledJob, ScheduledJobRun, SessionSummary, CommandsResponse, CommandMetadata } from '../types';
import * as useSchedulesModule from '../hooks/useSchedules';

// Mock the useScheduleDetail hook
vi.mock('../hooks/useSchedules', async (importOriginal) => {
  const original = await importOriginal<typeof useSchedulesModule>();
  return {
    ...original,
    useScheduleDetail: vi.fn(),
  };
});

// Helper to create a mock schedule
function createMockSchedule(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: 'test-schedule-123',
    name: 'Daily Issue Triage',
    description: 'Automatically triage new issues every morning',
    status: 'active',
    cron_expression: '0 9 * * *',
    timezone: 'America/New_York',
    target_type: 'issues',
    filter_query: 'state:open label:bug',
    command_id: 'triage-cmd',
    custom_prompt: null,
    max_items: 10,
    only_new: true,
    permission_mode: 'auto-accept',
    allowed_tools: null,
    max_turns: 5,
    model: 'claude-3-sonnet',
    cli_type: 'claude',
    next_run_at: '2024-01-16T14:00:00Z',
    last_run_at: '2024-01-15T14:00:00Z',
    last_run_status: 'completed',
    run_count: 5,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T14:00:00Z',
    ...overrides,
  };
}

// Helper to create a mock run
function createMockRun(overrides: Partial<ScheduledJobRun> = {}): ScheduledJobRun {
  return {
    id: 1,
    schedule_id: 'test-schedule-123',
    status: 'completed',
    started_at: '2024-01-15T14:00:00Z',
    completed_at: '2024-01-15T14:05:00Z',
    items_found: 5,
    items_processed: 4,
    items_skipped: 1,
    items_failed: 0,
    error_message: null,
    session_ids: ['session-1', 'session-2'],
    ...overrides,
  };
}

// Helper to create mock session
function createMockSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'session-1',
    encoded_path: '-test-path',
    repo_path: '/test/path',
    repo_name: 'test/repo',
    title: 'Triage Session',
    model: 'claude-3-sonnet',
    start_time: '2024-01-15T14:00:00Z',
    end_time: '2024-01-15T14:05:00Z',
    message_count: 10,
    modified_at: '2024-01-15T14:05:00Z',
    file_size: 1024,
    entities: [{ kind: 'issue', number: 42 }],
    tags: [],
    starred: false,
    is_active: false,
    ...overrides,
  };
}

// Helper to create mock commands
function createMockCommands(): CommandsResponse {
  return {
    issue: [
      { id: 'triage-cmd', name: 'Triage', description: 'Triage an issue', template: 'Triage this issue' },
      { id: 'fix-cmd', name: 'Fix', description: 'Fix an issue', template: 'Fix this issue' },
    ],
    pr: [
      { id: 'review-cmd', name: 'Review', description: 'Review a PR', template: 'Review this PR' },
    ],
    general: [
      { id: 'audit-cmd', name: 'Audit', description: 'Security audit', template: 'Run security audit' },
    ],
  };
}

describe('ScheduleDetail', () => {
  let mockUseScheduleDetail: ReturnType<typeof vi.fn>;
  let mockUpdateSchedule: ReturnType<typeof vi.fn>;
  let mockTriggerNow: ReturnType<typeof vi.fn>;
  let mockPauseSchedule: ReturnType<typeof vi.fn>;
  let mockResumeSchedule: ReturnType<typeof vi.fn>;
  let mockGoToRunsPage: ReturnType<typeof vi.fn>;
  let mockRefresh: ReturnType<typeof vi.fn>;

  const defaultProps = {
    repoId: 1,
    scheduleId: 'test-schedule-123',
    onShowSession: vi.fn(),
    sessions: [createMockSession()],
    commands: createMockCommands(),
    onScheduleDeleted: vi.fn(),
    onScheduleUpdated: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    mockUpdateSchedule = vi.fn().mockResolvedValue(createMockSchedule());
    mockTriggerNow = vi.fn().mockResolvedValue(undefined);
    mockPauseSchedule = vi.fn().mockResolvedValue(createMockSchedule({ status: 'paused' }));
    mockResumeSchedule = vi.fn().mockResolvedValue(createMockSchedule({ status: 'active' }));
    mockGoToRunsPage = vi.fn();
    mockRefresh = vi.fn();

    mockUseScheduleDetail = vi.fn().mockReturnValue({
      schedule: createMockSchedule(),
      runs: [createMockRun()],
      runsTotal: 1,
      runsPage: 1,
      runsTotalPages: 1,
      loading: false,
      error: null,
      refresh: mockRefresh,
      goToRunsPage: mockGoToRunsPage,
      updateSchedule: mockUpdateSchedule,
      triggerNow: mockTriggerNow,
      pauseSchedule: mockPauseSchedule,
      resumeSchedule: mockResumeSchedule,
    });

    vi.mocked(useSchedulesModule.useScheduleDetail).mockImplementation(mockUseScheduleDetail);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading State', () => {
    it('renders loading skeleton when loading', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: null,
        runs: [],
        runsTotal: 0,
        runsPage: 1,
        runsTotalPages: 0,
        loading: true,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      // Should show skeleton loading
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error message when there is an error', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: null,
        runs: [],
        runsTotal: 0,
        runsPage: 1,
        runsTotalPages: 0,
        loading: false,
        error: 'Failed to fetch schedule',
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('Error: Failed to fetch schedule')).toBeInTheDocument();
    });
  });

  describe('Schedule Display', () => {
    it('displays schedule name and status', () => {
      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('Daily Issue Triage')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('displays cron description', () => {
      render(<ScheduleDetail {...defaultProps} />);

      // describeCron returns "Every day at 9:00 AM" for "0 9 * * *"
      expect(screen.getByText(/at 9:00/i)).toBeInTheDocument();
    });

    it('displays configuration details', () => {
      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('Target:')).toBeInTheDocument();
      expect(screen.getByText('Issues')).toBeInTheDocument();
      expect(screen.getByText('Max Items:')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('displays filter query when set', () => {
      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('Filter:')).toBeInTheDocument();
      expect(screen.getByText('state:open label:bug')).toBeInTheDocument();
    });

    it('displays command name when set', () => {
      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('Command:')).toBeInTheDocument();
      expect(screen.getByText('Triage')).toBeInTheDocument();
    });

    it('shows paused status for paused schedules', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule({ status: 'paused' }),
        runs: [],
        runsTotal: 0,
        runsPage: 1,
        runsTotalPages: 0,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('Paused')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('shows Run Now button', () => {
      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Run Now' })).toBeInTheDocument();
    });

    it('calls triggerNow when Run Now is clicked', async () => {
      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Run Now' }));

      await waitFor(() => {
        expect(mockTriggerNow).toHaveBeenCalled();
      });
    });

    it('shows Pause button for active schedules', () => {
      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    });

    it('calls pauseSchedule when Pause is clicked and confirmed', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to pause this schedule?');
        expect(mockPauseSchedule).toHaveBeenCalled();
      });

      confirmSpy.mockRestore();
    });

    it('does not call pauseSchedule when confirm is cancelled', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

      expect(mockPauseSchedule).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('shows Resume button for paused schedules', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule({ status: 'paused' }),
        runs: [],
        runsTotal: 0,
        runsPage: 1,
        runsTotalPages: 0,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    });

    it('calls resumeSchedule when Resume is clicked and confirmed', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule({ status: 'paused' }),
        runs: [],
        runsTotal: 0,
        runsPage: 1,
        runsTotalPages: 0,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to resume this schedule?');
        expect(mockResumeSchedule).toHaveBeenCalled();
      });

      confirmSpy.mockRestore();
    });

    it('shows Edit button', () => {
      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('shows Delete button', () => {
      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('handles delete with confirmation', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this schedule?');
        expect(defaultProps.onScheduleDeleted).toHaveBeenCalled();
      });

      confirmSpy.mockRestore();
    });

    it('does not delete when confirm is cancelled', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(defaultProps.onScheduleDeleted).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });

  describe('Edit Mode', () => {
    it('enters edit mode when Edit is clicked', async () => {
      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      });
    });

    it('shows name input in edit mode', async () => {
      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        const nameInput = screen.getByDisplayValue('Daily Issue Triage');
        expect(nameInput).toBeInTheDocument();
        expect(nameInput.tagName.toLowerCase()).toBe('input');
      });
    });

    it('exits edit mode when Cancel is clicked', async () => {
      render(<ScheduleDetail {...defaultProps} />);

      // Enter edit mode
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      });

      // Cancel edit
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
      });
    });

    it('saves changes when Save is clicked', async () => {
      render(<ScheduleDetail {...defaultProps} />);

      // Enter edit mode
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      });

      // Modify the name
      const nameInput = screen.getByDisplayValue('Daily Issue Triage');
      fireEvent.change(nameInput, { target: { value: 'Updated Schedule Name' } });

      // Save
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockUpdateSchedule).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Updated Schedule Name' })
        );
      });
    });

    it('shows validation error for invalid cron expression', async () => {
      render(<ScheduleDetail {...defaultProps} />);

      // Enter edit mode
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      });

      // Find the first combobox (cron select)
      const cronSelect = screen.getAllByRole('combobox')[0];
      expect(cronSelect).toBeInTheDocument();

      // Select custom cron option
      fireEvent.change(cronSelect, { target: { value: 'custom' } });

      // Wait for custom input to appear and enter invalid cron
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/e\.g\., 30 14/)).toBeInTheDocument();
      });

      const cronInput = screen.getByPlaceholderText(/e\.g\., 30 14/);
      fireEvent.change(cronInput, { target: { value: 'invalid cron' } });

      // Try to save
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(screen.getByText(/Invalid cron expression/)).toBeInTheDocument();
      });
    });

    it('calls onScheduleUpdated callback after successful save', async () => {
      const updatedSchedule = createMockSchedule({ name: 'Updated Name' });
      mockUpdateSchedule.mockResolvedValue(updatedSchedule);

      render(<ScheduleDetail {...defaultProps} />);

      // Enter edit mode
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      });

      // Save without changes
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(defaultProps.onScheduleUpdated).toHaveBeenCalledWith(updatedSchedule);
      });
    });
  });

  describe('Run History', () => {
    it('displays run history section', () => {
      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('Run History')).toBeInTheDocument();
    });

    it('shows total runs count', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule(),
        runs: [createMockRun()],
        runsTotal: 15,
        runsPage: 1,
        runsTotalPages: 2,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('(15 total)')).toBeInTheDocument();
    });

    it('shows empty state when no runs', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule(),
        runs: [],
        runsTotal: 0,
        runsPage: 1,
        runsTotalPages: 0,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('No runs yet')).toBeInTheDocument();
      expect(screen.getByText(/Click "Run Now" to trigger/)).toBeInTheDocument();
    });

    it('displays run status and counts', () => {
      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('4/5 processed')).toBeInTheDocument();
    });

    it('shows failed count when there are failures', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule(),
        runs: [createMockRun({ items_failed: 2 })],
        runsTotal: 1,
        runsPage: 1,
        runsTotalPages: 1,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('(2 failed)')).toBeInTheDocument();
    });

    it('expands run to show sessions', async () => {
      render(<ScheduleDetail {...defaultProps} />);

      // Click on run header to expand
      const runButton = screen.getByRole('button', { name: /4\/5 processed/i });
      fireEvent.click(runButton);

      await waitFor(() => {
        expect(screen.getByText('Sessions created:')).toBeInTheDocument();
        expect(screen.getByText('Triage Session')).toBeInTheDocument();
      });
    });

    it('calls onShowSession when clicking a session', async () => {
      render(<ScheduleDetail {...defaultProps} />);

      // Expand run
      const runButton = screen.getByRole('button', { name: /4\/5 processed/i });
      fireEvent.click(runButton);

      await waitFor(() => {
        expect(screen.getByText('Triage Session')).toBeInTheDocument();
      });

      // Click session
      fireEvent.click(screen.getByText('Triage Session'));

      expect(defaultProps.onShowSession).toHaveBeenCalledWith('session-1');
    });

    it('shows error message in expanded run', async () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule(),
        runs: [createMockRun({ status: 'failed', error_message: 'Connection timeout' })],
        runsTotal: 1,
        runsPage: 1,
        runsTotalPages: 1,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      // Expand run
      const runButton = screen.getByRole('button', { name: /processed/i });
      fireEvent.click(runButton);

      await waitFor(() => {
        expect(screen.getByText('Error: Connection timeout')).toBeInTheDocument();
      });
    });

    it('calls refresh when Refresh is clicked', async () => {
      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  describe('Pagination', () => {
    it('shows pagination when there are multiple pages', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule(),
        runs: [createMockRun()],
        runsTotal: 25,
        runsPage: 1,
        runsTotalPages: 3,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Prev/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument();
    });

    it('disables Prev button on first page', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule(),
        runs: [createMockRun()],
        runsTotal: 25,
        runsPage: 1,
        runsTotalPages: 3,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByRole('button', { name: /Prev/ })).toBeDisabled();
    });

    it('disables Next button on last page', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule(),
        runs: [createMockRun()],
        runsTotal: 25,
        runsPage: 3,
        runsTotalPages: 3,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    });

    it('calls goToRunsPage when Next is clicked', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule(),
        runs: [createMockRun()],
        runsTotal: 25,
        runsPage: 1,
        runsTotalPages: 3,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /Next/ }));

      expect(mockGoToRunsPage).toHaveBeenCalledWith(2);
    });

    it('calls goToRunsPage when Prev is clicked', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule(),
        runs: [createMockRun()],
        runsTotal: 25,
        runsPage: 2,
        runsTotalPages: 3,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /Prev/ }));

      expect(mockGoToRunsPage).toHaveBeenCalledWith(1);
    });
  });

  describe('Error Handling', () => {
    it('displays action error and allows dismissal', async () => {
      mockTriggerNow.mockRejectedValue(new Error('Failed to trigger schedule'));

      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Run Now' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to trigger schedule')).toBeInTheDocument();
      });

      // Dismiss error
      const dismissButton = screen.getByTitle('Dismiss error');
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText('Failed to trigger schedule')).not.toBeInTheDocument();
      });
    });

    it('shows delete error on API failure', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ detail: 'Database error' }),
      });

      render(<ScheduleDetail {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(screen.getByText('Database error')).toBeInTheDocument();
      });

      confirmSpy.mockRestore();
    });
  });

  describe('Custom Target Type', () => {
    it('shows custom prompt when target type is custom', () => {
      mockUseScheduleDetail.mockReturnValue({
        schedule: createMockSchedule({
          target_type: 'custom',
          custom_prompt: 'Run security audit on all API endpoints',
        }),
        runs: [],
        runsTotal: 0,
        runsPage: 1,
        runsTotalPages: 0,
        loading: false,
        error: null,
        refresh: mockRefresh,
        goToRunsPage: mockGoToRunsPage,
        updateSchedule: mockUpdateSchedule,
        triggerNow: mockTriggerNow,
        pauseSchedule: mockPauseSchedule,
        resumeSchedule: mockResumeSchedule,
      });

      render(<ScheduleDetail {...defaultProps} />);

      expect(screen.getByText('Custom Prompt:')).toBeInTheDocument();
      expect(screen.getByText('Run security audit on all API endpoints')).toBeInTheDocument();
    });
  });
});
