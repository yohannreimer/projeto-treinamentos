import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect } from 'vitest';
import { PortalLoginPage } from '../pages/PortalLoginPage';

test('submits username and password', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue(true);

  render(<PortalLoginPage slug="grupo-cbm" onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText(/login/i), 'cliente');
  await user.type(screen.getByLabelText(/senha/i), '123456');
  await user.click(screen.getByRole('button', { name: /entrar/i }));

  expect(onSubmit).toHaveBeenCalledWith({ username: 'cliente', password: '123456', is_internal: false });
});
