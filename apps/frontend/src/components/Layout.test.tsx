import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';

import { Layout } from './Layout';

describe('Layout', () => {
  test('opens planning route in focus mode with collapsible navigation', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/planejar']}>
        <Layout loggedUser="Equipe Holand" navItems={[{ to: '/planejar', label: 'Planejar', permissions: ['calendar'] }]}>
          <div>Planejar conteúdo</div>
        </Layout>
      </MemoryRouter>
    );

    expect(container.querySelector('.app-shell')).toHaveClass('is-planning-focus', 'is-nav-collapsed');
    expect(screen.getByRole('button', { name: 'Expandir navegação' })).toBeInTheDocument();
  });

  test('shows license alert badge detail in navigation', () => {
    render(
      <MemoryRouter initialEntries={['/licencas']}>
        <Layout
          loggedUser="Equipe Holand"
          navItems={[{
            to: '/licencas',
            label: 'Licenças',
            permissions: ['licenses'],
            badgeCount: 8,
            badgeDetail: '2 vencida(s) - 6 até 15 dias'
          }]}
        >
          <div>Licenças conteúdo</div>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByText('Licenças')).toBeInTheDocument();
    expect(screen.getByText('2 vencida(s) - 6 até 15 dias')).toBeInTheDocument();
    expect(screen.getByLabelText('8 pendência(s)')).toBeInTheDocument();
  });
});
