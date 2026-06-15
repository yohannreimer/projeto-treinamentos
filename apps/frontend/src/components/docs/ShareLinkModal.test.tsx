import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ShareLinkModal, type ShareLink } from './ShareLinkModal';

// ────────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────────

const activeLink: ShareLink = {
  id: 'link-1',
  resource_type: 'document',
  resource_id: 'doc-1',
  token: 'abc123',
  allow_download: true,
  expires_at: null,
  created_at: '2026-06-01'
};

// ────────────────────────────────────────────────────────────────────────────
// Testes
// ────────────────────────────────────────────────────────────────────────────

describe('ShareLinkModal', () => {
  test('sem link existente: toggle desligado, botão revogar ausente', () => {
    render(
      <ShareLinkModal
        resourceType="document"
        resourceId="doc-1"
        resourceName="manual.pdf"
        existingLink={null}
        isCreating={false}
        isRevoking={false}
        onCreate={vi.fn()}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const toggle = screen.getByRole('switch', { name: /Compartilhar externamente/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: /Revogar link/i })).not.toBeInTheDocument();
  });

  test('com link existente: toggle ligado, URL exibida, botão revogar presente', () => {
    render(
      <ShareLinkModal
        resourceType="document"
        resourceId="doc-1"
        resourceName="manual.pdf"
        existingLink={activeLink}
        isCreating={false}
        isRevoking={false}
        onCreate={vi.fn()}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const toggle = screen.getByRole('switch', { name: /Compartilhar externamente/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/abc123/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revogar link/i })).toBeInTheDocument();
  });

  test('ativar toggle chama onCreate com os dados corretos', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <ShareLinkModal
        resourceType="page"
        resourceId="page-1"
        resourceName="Procedimento"
        existingLink={null}
        isCreating={false}
        isRevoking={false}
        onCreate={onCreate}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('switch', { name: /Compartilhar externamente/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_type: 'page',
          resource_id: 'page-1',
          allow_download: true
        })
      );
    });
  });

  test('botão revogar pede confirmação antes de chamar onRevoke', async () => {
    const onRevoke = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <ShareLinkModal
        resourceType="document"
        resourceId="doc-1"
        resourceName="manual.pdf"
        existingLink={activeLink}
        isCreating={false}
        isRevoking={false}
        onCreate={vi.fn()}
        onRevoke={onRevoke}
        onClose={vi.fn()}
      />
    );

    // Primeiro clique: pede confirmação
    await user.click(screen.getByRole('button', { name: /Revogar link/i }));
    expect(onRevoke).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Confirmar revogação/i })).toBeInTheDocument();

    // Segundo clique: executa
    await user.click(screen.getByRole('button', { name: /Confirmar revogação/i }));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith('link-1'));
  });

  test('Escape fecha o modal', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <ShareLinkModal
        resourceType="document"
        resourceId="doc-1"
        resourceName="manual.pdf"
        existingLink={null}
        isCreating={false}
        isRevoking={false}
        onCreate={vi.fn()}
        onRevoke={vi.fn()}
        onClose={onClose}
      />
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('título do modal indica o tipo de recurso correto', () => {
    render(
      <ShareLinkModal
        resourceType="page"
        resourceId="page-1"
        resourceName="Guia de uso"
        existingLink={null}
        isCreating={false}
        isRevoking={false}
        onCreate={vi.fn()}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: /Compartilhar página/i })).toBeInTheDocument();
  });
});
