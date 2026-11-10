import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationSettings } from './NotificationSettings';
import { pushState, enablePush } from '../lib/push';
vi.mock('../lib/push', () => ({ pushState: vi.fn(), enablePush: vi.fn(), disablePush: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { pushTest: vi.fn() } }));
beforeEach(() => { vi.resetAllMocks(); vi.mocked(pushState).mockResolvedValue('blocked'); });
afterEach(cleanup);
it('keeps an explicit permission request available when the system reports blocked', async () => {
  render(<NotificationSettings installed ios onError={vi.fn()} />);
  const button = await screen.findByRole('button', { name: 'Enable notifications' });
  await act(async () => { fireEvent.click(button); });
  expect(enablePush).toHaveBeenCalledOnce();
});
it('rechecks after returning from system settings and exposes the delivery test', async () => {
  render(<NotificationSettings installed ios onError={vi.fn()} />);
  await screen.findByRole('button', { name: 'Enable notifications' });
  vi.mocked(pushState).mockResolvedValue('on'); fireEvent.focus(window);
  await screen.findByRole('button', { name: 'Send a test notification' });
  expect(screen.getByRole('switch', { name: 'Message and call alerts' })).toBeChecked();
});
it('provides Home Screen and system-settings recovery steps without assuming a declined prompt', async () => {
  render(<NotificationSettings installed ios onError={vi.fn()} />);
  await screen.findByRole('button', { name: 'Enable notifications' });
  fireEvent.click(screen.getByRole('button', { name: 'Notification help' }));
  expect(screen.getByText(/If no prompt appears/)).toHaveTextContent('Settings → Notifications → Ember');
  expect(screen.getByText(/If Ember is not listed/)).toHaveTextContent('does not mean you declined');
});
it('cleans up focus listeners when settings closes', async () => {
  const { unmount } = render(<NotificationSettings installed ios onError={vi.fn()} />);
  await waitFor(() => expect(pushState).toHaveBeenCalledOnce()); unmount();
  fireEvent.focus(window); expect(pushState).toHaveBeenCalledOnce();
});
