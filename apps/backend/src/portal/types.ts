export type PortalPasswordHash = `scrypt:${string}:${string}`;

export type PortalClientRow = {
  id: string;
  company_id: string;
  slug: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type PortalUserRow = {
  id: string;
  portal_client_id: string;
  username: string;
  password_hash: PortalPasswordHash;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PortalSessionRow = {
  id: string;
  portal_user_id: string;
  portal_client_id: string;
  company_id: string;
  token_hash: string;
  is_internal: number;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
};

export type PortalAuthContext = {
  company_id: string;
  portal_client_id: string;
  portal_user_id: string;
  slug: string;
  username: string;
  is_internal: boolean;
};
