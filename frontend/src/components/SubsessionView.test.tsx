import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SubsessionView } from './SubsessionView';
import type { SubsessionDetail, TranscriptMessage, ToolUse } from '../types';

// Mock the fetchSubsession API call
vi.mock('../hooks/useApi', () => ({
  fetchSubsession: vi.fn(),
}));

// Mock the Markdown component
vi.mock('./Markdown', () => ({
  Markdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

import { fetchSubsession } from '../hooks/useApi';

function createMockToolUse(overrides: Partial<ToolUse> = {}): ToolUse {
  return {
    id: 'tool-1',
    name: 'Read',
    input: { file_path: '/test.py' },
    spawned_agent_id: null,
    ...overrides,
  };
}

function createMockMessage(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    uuid: 'msg-1',
    role: 'assistant',
    content: 'Test message content',
    timestamp: '2024-01-15T10:30:00Z',
    thinking: null,
    tool_uses: [],
    model: 'claude-3-opus',
    usage: null,
    ...overrides,
  };
}

function createMockSubsessionDetail(overrides: Partial<SubsessionDetail> = {}): SubsessionDetail {
  return {
    agent_id: 'abc1234',
    parent_session_id: 'parent-uuid-123',
    encoded_path: '-home-user-projects-test',
    repo_path: '/home/user/projects/test',
    messages: [
      createMockMessage({ uuid: 'msg-1', role: 'user', content: 'User message' }),
      createMockMessage({ uuid: 'msg-2', role: 'assistant', content: 'Assistant response' }),
    ],
    summary: 'Test subsession summary',
    model: 'claude-3-opus',
    total_input_tokens: 100,
    total_output_tokens: 50,
    total_cache_read_tokens: 10,
    total_cache_creation_tokens: 5,
    start_time: '2024-01-15T10:30:00Z',
    end_time: '2024-01-15T10:35:00Z',
    ...overrides,
  };
}

describe('SubsessionView', () => {
  const defaultProps = {
    agentId: 'abc1234',
    parentSessionId: 'parent-uuid-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading spinner while fetching', async () => {
      // Make the fetch hang indefinitely
      (fetchSubsession as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {})
      );

      render(<SubsessionView {...defaultProps} />);

      expect(screen.getByText('Loading agent session...')).toBeInTheDocument();
      // Should show spinner
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when fetch fails', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error')
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load subsession/)).toBeInTheDocument();
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('shows message when no subsession data', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No subsession data available')).toBeInTheDocument();
      });
    });
  });

  describe('Loaded State', () => {
    it('renders subsession header with agent ID', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail()
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('agent-abc1234')).toBeInTheDocument();
      });
    });

    it('shows message count in header', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail()
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('2 messages')).toBeInTheDocument();
      });
    });

    it('shows token count in header', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          total_input_tokens: 1000,
          total_output_tokens: 500,
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        // Total tokens = 1000 + 500 = 1500, formatted as 1.5K
        expect(screen.getByText('1.5K tokens')).toBeInTheDocument();
      });
    });

    it('formats large token counts correctly', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          total_input_tokens: 1500000,
          total_output_tokens: 500000,
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        // Total = 2M
        expect(screen.getByText('2.0M tokens')).toBeInTheDocument();
      });
    });

    it('hides token count when zero', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          total_input_tokens: 0,
          total_output_tokens: 0,
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('agent-abc1234')).toBeInTheDocument();
      });

      // Should not show tokens text
      expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
    });

    it('renders messages', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail()
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('User message')).toBeInTheDocument();
        expect(screen.getByText('Assistant response')).toBeInTheDocument();
      });
    });

    it('shows role indicators', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail()
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('You')).toBeInTheDocument();
        expect(screen.getByText('Claude')).toBeInTheDocument();
      });
    });

    it('shows timestamps', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          messages: [
            createMockMessage({
              uuid: 'msg-1',
              role: 'user',
              content: 'Test',
              timestamp: '2024-01-15T10:30:00Z',
            }),
          ],
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        // Check that a time is shown (exact format depends on locale)
        const timeElements = screen.getAllByText(/\d{1,2}:\d{2}/);
        expect(timeElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Thinking Block', () => {
    it('shows thinking preview when message has thinking', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          messages: [
            createMockMessage({
              role: 'assistant',
              thinking: 'This is my internal reasoning about the problem...',
            }),
          ],
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        // Should show truncated thinking preview
        expect(screen.getByText(/This is my internal reasoning/)).toBeInTheDocument();
      });
    });

    it('expands thinking when clicked', async () => {
      const fullThinking = 'This is my internal reasoning about the problem that is quite long and needs to be expanded to be fully visible';
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          messages: [
            createMockMessage({
              role: 'assistant',
              thinking: fullThinking,
            }),
          ],
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        // Find and click the thinking toggle button
        const thinkingButton = screen.getByRole('button', { name: /This is my internal/ });
        fireEvent.click(thinkingButton);
      });

      // Full thinking should be visible now
      expect(screen.getByText(fullThinking)).toBeInTheDocument();
    });
  });

  describe('Tool Uses', () => {
    it('renders tool uses', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          messages: [
            createMockMessage({
              role: 'assistant',
              tool_uses: [
                createMockToolUse({ name: 'Read', input: { file_path: '/test.py' } }),
              ],
            }),
          ],
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Read')).toBeInTheDocument();
      });
    });

    it('shows tool input preview', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          messages: [
            createMockMessage({
              role: 'assistant',
              tool_uses: [
                createMockToolUse({ name: 'Read', input: { file_path: '/test.py' } }),
              ],
            }),
          ],
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/file_path.*test.py/)).toBeInTheDocument();
      });
    });

    it('expands tool input when clicked', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          messages: [
            createMockMessage({
              role: 'assistant',
              tool_uses: [
                createMockToolUse({ name: 'Read', input: { file_path: '/test.py', encoding: 'utf-8' } }),
              ],
            }),
          ],
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        // Click the tool use to expand
        const toolButton = screen.getByText('Read').closest('button');
        if (toolButton) fireEvent.click(toolButton);
      });

      // Expanded input should show formatted JSON - use getAllByText since it appears multiple times
      const encodingElements = screen.getAllByText(/encoding/);
      expect(encodingElements.length).toBeGreaterThan(0);
    });

    it('shows agent badge for spawned agent tools', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          messages: [
            createMockMessage({
              role: 'assistant',
              tool_uses: [
                createMockToolUse({
                  name: 'Task',
                  spawned_agent_id: 'def5678',
                }),
              ],
            }),
          ],
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('agent')).toBeInTheDocument();
      });
    });
  });

  describe('Nested Subsessions', () => {
    it('shows view agent session button for spawned agents', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          messages: [
            createMockMessage({
              role: 'assistant',
              tool_uses: [
                createMockToolUse({
                  name: 'Task',
                  spawned_agent_id: 'def5678',
                }),
              ],
            }),
          ],
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('View agent session')).toBeInTheDocument();
        expect(screen.getByText('agent-def5678')).toBeInTheDocument();
      });
    });

    it('expands nested subsession when clicked', async () => {
      const nestedSubsession = createMockSubsessionDetail({
        agent_id: 'def5678',
        messages: [
          createMockMessage({ content: 'Nested agent message' }),
        ],
      });

      (fetchSubsession as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          createMockSubsessionDetail({
            messages: [
              createMockMessage({
                role: 'assistant',
                tool_uses: [
                  createMockToolUse({
                    name: 'Task',
                    spawned_agent_id: 'def5678',
                  }),
                ],
              }),
            ],
          })
        )
        .mockResolvedValueOnce(nestedSubsession);

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('View agent session')).toBeInTheDocument();
      });

      // Click to expand nested session
      fireEvent.click(screen.getByText('View agent session'));

      await waitFor(() => {
        expect(screen.getByText('Nested agent message')).toBeInTheDocument();
      });
    });

    it('respects max depth limit', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          messages: [
            createMockMessage({
              role: 'assistant',
              tool_uses: [
                createMockToolUse({
                  name: 'Task',
                  spawned_agent_id: 'def5678',
                }),
              ],
            }),
          ],
        })
      );

      // Render at depth 3 (max depth)
      render(<SubsessionView {...defaultProps} depth={3} />);

      await waitFor(() => {
        // Should show max depth message instead of expand button
        expect(screen.getByText(/max nesting depth reached/)).toBeInTheDocument();
        expect(screen.queryByText('View agent session')).not.toBeInTheDocument();
      });
    });
  });

  describe('API Integration', () => {
    it('calls fetchSubsession with correct parameters', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail()
      );

      render(
        <SubsessionView
          agentId="abc1234"
          parentSessionId="parent-uuid-123"
        />
      );

      await waitFor(() => {
        expect(fetchSubsession).toHaveBeenCalledWith('parent-uuid-123', 'abc1234');
      });
    });

    it('refetches when agentId changes', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail()
      );

      const { rerender } = render(
        <SubsessionView
          agentId="abc1234"
          parentSessionId="parent-uuid-123"
        />
      );

      await waitFor(() => {
        expect(fetchSubsession).toHaveBeenCalledWith('parent-uuid-123', 'abc1234');
      });

      rerender(
        <SubsessionView
          agentId="def5678"
          parentSessionId="parent-uuid-123"
        />
      );

      await waitFor(() => {
        expect(fetchSubsession).toHaveBeenCalledWith('parent-uuid-123', 'def5678');
      });
    });

    it('refetches when parentSessionId changes', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail()
      );

      const { rerender } = render(
        <SubsessionView
          agentId="abc1234"
          parentSessionId="parent-uuid-123"
        />
      );

      await waitFor(() => {
        expect(fetchSubsession).toHaveBeenCalledWith('parent-uuid-123', 'abc1234');
      });

      rerender(
        <SubsessionView
          agentId="abc1234"
          parentSessionId="parent-uuid-456"
        />
      );

      await waitFor(() => {
        expect(fetchSubsession).toHaveBeenCalledWith('parent-uuid-456', 'abc1234');
      });
    });
  });

  describe('Styling', () => {
    it('has purple border styling', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail()
      );

      const { container } = render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('agent-abc1234')).toBeInTheDocument();
      });

      // Check for purple border class
      const subsessionContainer = container.querySelector('.border-purple-500\\/50');
      expect(subsessionContainer).toBeInTheDocument();
    });

    it('applies correct styling for user messages', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          messages: [
            createMockMessage({ role: 'user', content: 'User says hello' }),
          ],
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        // User role indicator should have blue color
        expect(screen.getByText('You')).toHaveClass('text-blue-400');
      });
    });

    it('applies correct styling for assistant messages', async () => {
      (fetchSubsession as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockSubsessionDetail({
          messages: [
            createMockMessage({ role: 'assistant', content: 'Claude responds' }),
          ],
        })
      );

      render(<SubsessionView {...defaultProps} />);

      await waitFor(() => {
        // Assistant role indicator should have green color
        expect(screen.getByText('Claude')).toHaveClass('text-green-400');
      });
    });
  });
});
