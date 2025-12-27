import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GitHubTokenSetup } from './GitHubTokenSetup';

describe('GitHubTokenSetup', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial Load - Token Not Configured', () => {
    it('shows warning banner when no token is configured', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: false, masked_token: null }),
      });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('GitHub Token Required')).toBeInTheDocument();
      });

      expect(screen.getByText(/Without a GitHub token/)).toBeInTheDocument();
      expect(screen.getByText('Add Token')).toBeInTheDocument();
      expect(screen.getByText('Create token on GitHub →')).toBeInTheDocument();
    });

    it('shows editing form when Add Token button is clicked', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: false, masked_token: null }),
      });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      expect(screen.getByText('Configure GitHub Token')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save Token' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });
  });

  describe('Initial Load - Token Configured', () => {
    it('shows configured status when token exists', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****abcd' }),
      });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('ghp_****abcd')).toBeInTheDocument();
      });

      expect(screen.getByText(/GitHub token:/)).toBeInTheDocument();
      expect(screen.getByText('Change')).toBeInTheDocument();
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });

    it('shows editing form when Change button is clicked', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****abcd' }),
      });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Change')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Change'));

      expect(screen.getByText('Configure GitHub Token')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx')).toBeInTheDocument();
    });
  });

  describe('Token Form', () => {
    it('closes form when Cancel is clicked', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: false, masked_token: null }),
      });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));
      expect(screen.getByText('Configure GitHub Token')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.getByText('GitHub Token Required')).toBeInTheDocument();
      });
    });

    it('clears input and error when Cancel is clicked', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: false, masked_token: null }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ detail: 'Invalid token' }),
        });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      const input = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      fireEvent.change(input, { target: { value: 'test_token' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Token' }));

      await waitFor(() => {
        expect(screen.getByText('Invalid token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Re-open form
      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Add Token'));

      const newInput = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(newInput).toHaveValue('');
      expect(screen.queryByText('Invalid token')).not.toBeInTheDocument();
    });

    it('shows token permission requirements', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: false, masked_token: null }),
      });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      expect(screen.getByText('Create a token with these permissions:')).toBeInTheDocument();
      expect(screen.getByText('repo')).toBeInTheDocument();
      expect(screen.getByText('read:org')).toBeInTheDocument();
    });

    it('has correct GitHub link for creating token', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: false, masked_token: null }),
      });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      const link = screen.getByText('Create new token on GitHub →');
      expect(link).toHaveAttribute('href', 'https://github.com/settings/tokens/new?description=Claude%20Code%20Hub&scopes=repo,read:org');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('Save Token', () => {
    it('saves token successfully and calls onTokenConfigured', async () => {
      const onTokenConfigured = vi.fn();

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: false, masked_token: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****test' }),
        });

      render(<GitHubTokenSetup onTokenConfigured={onTokenConfigured} />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      const input = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      fireEvent.change(input, { target: { value: 'ghp_testtoken123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Token' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/settings/github-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'ghp_testtoken123' }),
        });
      });

      await waitFor(() => {
        expect(onTokenConfigured).toHaveBeenCalled();
      });

      // Should show configured status
      await waitFor(() => {
        expect(screen.getByText('ghp_****test')).toBeInTheDocument();
      });
    });

    it('shows saving state while request is pending', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: false, masked_token: null }),
        })
        .mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      const input = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      fireEvent.change(input, { target: { value: 'ghp_testtoken123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Token' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Saving...' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
      });
    });

    it('shows error when save fails with detail', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: false, masked_token: null }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ detail: 'Token validation failed: insufficient permissions' }),
        });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      const input = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      fireEvent.change(input, { target: { value: 'ghp_invalid' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Token' }));

      await waitFor(() => {
        expect(screen.getByText('Token validation failed: insufficient permissions')).toBeInTheDocument();
      });
    });

    it('shows generic error when save fails without detail', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: false, masked_token: null }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({}),
        });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      const input = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      fireEvent.change(input, { target: { value: 'ghp_invalid' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Token' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to save token')).toBeInTheDocument();
      });
    });

    it('shows error when network request fails', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: false, masked_token: null }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      const input = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      fireEvent.change(input, { target: { value: 'ghp_testtoken123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Token' }));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Remove Token', () => {
    it('removes token when Remove button is clicked', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****abcd' }),
        })
        .mockResolvedValueOnce({
          ok: true,
        });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Remove')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Remove'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/settings/github-token', {
          method: 'DELETE',
        });
      });

      await waitFor(() => {
        expect(screen.getByText('GitHub Token Required')).toBeInTheDocument();
      });
    });

    it('logs error when remove fails', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****abcd' }),
        })
        .mockRejectedValueOnce(new Error('Delete failed'));

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Remove')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Remove'));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to remove token:', expect.any(Error));
      });
    });
  });

  describe('Fetch Status Error Handling', () => {
    it('handles non-ok response gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      render(<GitHubTokenSetup />);

      // Should show warning banner (default state when fetch fails)
      await waitFor(() => {
        expect(screen.getByText('GitHub Token Required')).toBeInTheDocument();
      });
    });

    it('handles network error gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      render(<GitHubTokenSetup />);

      // Should show warning banner (default state when fetch fails)
      await waitFor(() => {
        expect(screen.getByText('GitHub Token Required')).toBeInTheDocument();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch token status:', expect.any(Error));
    });
  });

  describe('Form Submission', () => {
    it('prevents default form submission', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: false, masked_token: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****test' }),
        });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      const input = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      fireEvent.change(input, { target: { value: 'ghp_testtoken123' } });

      const form = input.closest('form');
      expect(form).not.toBeNull();

      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(submitEvent, 'preventDefault');
      form?.dispatchEvent(submitEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('requires token input', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: false, masked_token: null }),
      });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      const input = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(input).toHaveAttribute('required');
    });

    it('uses password input type for security', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: false, masked_token: null }),
      });

      render(<GitHubTokenSetup />);

      await waitFor(() => {
        expect(screen.getByText('Add Token')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Token'));

      const input = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(input).toHaveAttribute('type', 'password');
    });
  });
});
