import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { Section } from '../components/Section';
import { askDestructiveConfirmation, DESTRUCTIVE_CONFIRMATION_PHRASE } from '../utils/destructive';
import { INTERNAL_PERMISSION_KEYS, type InternalPermission, type InternalRole } from '../auth/session';

type ModuleCatalog = {
  id: string;
  code: string;
  category: string;
  name: string;
  description: string | null;
  duration_days: number;
  profile: string | null;
  is_mandatory: number;
  delivery_mode: 'ministrado' | 'entregavel';
  client_hours_policy: 'consome' | 'nao_consume';
  prerequisites: Array<{ id: string; code: string; name: string }>;
};
type AdminModuleSortKey = 'code' | 'name' | 'category' | 'duration_days' | 'is_mandatory';
type InternalUserRow = {
  id: string;
  username: string;
  display_name: string | null;
  role: InternalRole;
  permissions: InternalPermission[];
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};
type InternalAuditRow = {
  id: string;
  internal_user_id: string | null;
  username: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload_json: string;
  created_at: string;
  summary_text: string;
  detail_text: string;
  method: string | null;
  path: string | null;
  status: number | null;
  duration_ms: number | null;
};

const FINANCE_PERMISSION_KEYS = new Set<InternalPermission>([
  'finance.read',
  'finance.write',
  'finance.approve',
  'finance.reconcile',
  'finance.close',
  'finance.billing'
]);

const ROLE_PRESETS: Record<InternalRole, InternalPermission[]> = {
  supremo: [...INTERNAL_PERMISSION_KEYS],
  intermediario: INTERNAL_PERMISSION_KEYS.filter((item) => item !== 'admin' && !FINANCE_PERMISSION_KEYS.has(item)),
  junior: ['calendar', 'cohorts', 'implementation', 'support', 'licenses', 'docs'],
  custom: []
};

const CUSTOM_PERMISSION_KEYS = INTERNAL_PERMISSION_KEYS.filter((permission) => !FINANCE_PERMISSION_KEYS.has(permission));

const CURRENT_CLIENTS = [
  'Krah do Brasil',
  'Magui Dispositivos',
  'Mancal Serviços',
  'Grupo CBM',
  'Caduferr',
  'Herten Ferramentaria',
  'Eletrospark Dispositivos'
];

const CURRENT_MODULES = [
  { code: '020101020', name: "Treinamento TopSolid'Design 7 - Básico", category: 'CAD', duration_days: 3, is_mandatory: 1 },
  { code: '020101030', name: "Treinamento TopSolid'Design 7 - Montagem", category: 'CAD', duration_days: 2, is_mandatory: 1 },
  { code: '020102010', name: "Treinamento TopSolid'Cam 7 - Fresamento 2D", category: 'CAM', duration_days: 3, is_mandatory: 1 },
  { code: '020102020', name: "Treinamento TopSolid'Cam 7 - Fresamento 3D", category: 'CAM', duration_days: 2, is_mandatory: 1 },
  { code: '020102120', name: "Treinamento TopSolid'Cam 7 - Condições de Cortes (interno)", category: 'CAM', duration_days: 1, is_mandatory: 0 },
  { code: '020102070', name: "Treinamento TopSolid'Cam 7 - TopTool (interno)", category: 'CAM', duration_days: 3, is_mandatory: 0 },
  { code: '020102075', name: "Treinamento TopSolid'Cam 7 - Folha de Processos (interno)", category: 'CAM', duration_days: 2, is_mandatory: 0 },
  { code: '020102080', name: "Treinamento TopSolid'Cam 7 - Processos Automáticos", category: 'CAM', duration_days: 3, is_mandatory: 0 },
  { code: 'DT-001', name: 'Digital Twin - Utilização de máquina virtual 3D - Simplificada', category: 'CAM', duration_days: 3, is_mandatory: 0 },
  { code: '020202020', name: "Implantação TopSolid'Cam 7 (interno)", category: 'Automação', duration_days: 2, is_mandatory: 0 },
  { code: '020302050', name: "Acompanhamento TopSolid'Cam (interno)", category: 'Consultoria', duration_days: 2, is_mandatory: 0 },
  { code: '960001010', name: 'Instalação / Configuração', category: 'Instalação', duration_days: 1, is_mandatory: 1 }
];

function roleLabel(role: InternalRole): string {
  if (role === 'supremo') return 'Supremo';
  if (role === 'intermediario') return 'Intermediário';
  if (role === 'junior') return 'Júnior';
  return 'Custom';
}

function formatDateTime(dateIso: string | null): string {
  if (!dateIso) return '-';
  const value = new Date(dateIso);
  if (Number.isNaN(value.getTime())) return dateIso;
  return value.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function AdminPage() {
  const [data, setData] = useState<any>(null);
  const [moduleQuery, setModuleQuery] = useState('');
  const [sortKey, setSortKey] = useState<AdminModuleSortKey>('code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filePath, setFilePath] = useState('/Users/yohannreimer/Downloads/Planejamento_Jornada_Treinamentos_v3.xlsx');
  const [resetData, setResetData] = useState(false);
  const [message, setMessage] = useState('');
  const [loadingImport, setLoadingImport] = useState(false);

  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDuration, setEditDuration] = useState(1);
  const [editProfile, setEditProfile] = useState('');
  const [editMandatory, setEditMandatory] = useState(1);
  const [editDeliveryMode, setEditDeliveryMode] = useState<'ministrado' | 'entregavel'>('ministrado');
  const [editHoursPolicy, setEditHoursPolicy] = useState<'consome' | 'nao_consume'>('consome');
  const [prereqIds, setPrereqIds] = useState<string[]>([]);

  const [newCode, setNewCode] = useState('');
  const [newCategory, setNewCategory] = useState('Geral');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDuration, setNewDuration] = useState(1);
  const [newProfile, setNewProfile] = useState('');
  const [newMandatory, setNewMandatory] = useState(0);
  const [newDeliveryMode, setNewDeliveryMode] = useState<'ministrado' | 'entregavel'>('ministrado');
  const [newHoursPolicy, setNewHoursPolicy] = useState<'consome' | 'nao_consume'>('consome');
  const [newApplyToExistingClients, setNewApplyToExistingClients] = useState(false);

  const [loadingBootstrap, setLoadingBootstrap] = useState(false);
  const [loadingRealScenario, setLoadingRealScenario] = useState(false);
  const [portalOperatorUsername, setPortalOperatorUsername] = useState('');
  const [portalOperatorPassword, setPortalOperatorPassword] = useState('');
  const [portalOperatorConfigured, setPortalOperatorConfigured] = useState(false);
  const [savingPortalOperatorAccess, setSavingPortalOperatorAccess] = useState(false);
  const [internalUsers, setInternalUsers] = useState<InternalUserRow[]>([]);
  const [auditRows, setAuditRows] = useState<InternalAuditRow[]>([]);
  const [showAuditSection, setShowAuditSection] = useState(false);
  const [selectedInternalUserId, setSelectedInternalUserId] = useState('');
  const [newInternalUsername, setNewInternalUsername] = useState('');
  const [newInternalDisplayName, setNewInternalDisplayName] = useState('');
  const [newInternalPassword, setNewInternalPassword] = useState('');
  const [newInternalRole, setNewInternalRole] = useState<InternalRole>('junior');
  const [newInternalPermissions, setNewInternalPermissions] = useState<InternalPermission[]>(ROLE_PRESETS.junior);
  const [creatingInternalUser, setCreatingInternalUser] = useState(false);
  const [editInternalDisplayName, setEditInternalDisplayName] = useState('');
  const [editInternalPassword, setEditInternalPassword] = useState('');
  const [editInternalRole, setEditInternalRole] = useState<InternalRole>('junior');
  const [editInternalPermissions, setEditInternalPermissions] = useState<InternalPermission[]>([]);
  const [editInternalActive, setEditInternalActive] = useState(true);
  const [savingInternalUser, setSavingInternalUser] = useState(false);

  function loadCatalog() {
    Promise.all([
      api.catalog(),
      api.portalOperatorAccess(),
      api.adminInternalUsers(),
      api.adminInternalAuditLogs({ limit: 120 })
    ]).then(([response, operatorAccess, usersResponse, auditResponse]) => {
      setData(response);
      setPortalOperatorUsername(operatorAccess.username ?? '');
      setPortalOperatorConfigured(Boolean(operatorAccess.is_configured));
      const users = usersResponse.items ?? [];
      setInternalUsers(users);
      setAuditRows(auditResponse.items ?? []);
      const modules = (response.modules ?? []) as ModuleCatalog[];
      if (modules.length > 0) {
        setSelectedModuleId((prev) => modules.some((module) => module.id === prev) ? prev : modules[0].id);
      }
      if (users.length > 0) {
        setSelectedInternalUserId((prev) => users.some((item) => item.id === prev) ? prev : users[0].id);
      } else {
        setSelectedInternalUserId('');
      }
    }).catch(() => setData(null));
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  const modules = (data?.modules ?? []) as ModuleCatalog[];
  const selectedModule = useMemo(
    () => modules.find((module) => module.id === selectedModuleId) ?? null,
    [modules, selectedModuleId]
  );
  const selectedInternalUser = useMemo(
    () => internalUsers.find((user) => user.id === selectedInternalUserId) ?? null,
    [internalUsers, selectedInternalUserId]
  );

  const filteredModules = useMemo(() => {
    if (!moduleQuery.trim()) return modules;
    const normalized = moduleQuery.toLowerCase();
    return modules.filter((module) =>
      `${module.code} ${module.name} ${module.category}`.toLowerCase().includes(normalized)
    );
  }, [modules, moduleQuery]);

  const orderedModules = useMemo(() => {
    const list = [...filteredModules];
    list.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortKey === 'duration_days' || sortKey === 'is_mandatory') {
        return ((Number((a as any)[sortKey] ?? 0) - Number((b as any)[sortKey] ?? 0)) * direction);
      }
      return String((a as any)[sortKey] ?? '').localeCompare(String((b as any)[sortKey] ?? '')) * direction;
    });
    return list;
  }, [filteredModules, sortKey, sortDirection]);

  function toggleSort(nextKey: AdminModuleSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'code' || nextKey === 'name' || nextKey === 'category' ? 'asc' : 'desc');
  }

  function sortIndicator(nextKey: AdminModuleSortKey) {
    if (sortKey !== nextKey) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  function exportInternalAuditCsv() {
    if (auditRows.length === 0) {
      setMessage('Sem auditoria para exportar.');
      return;
    }

    const header = [
      'Data',
      'Usuario',
      'Resumo',
      'Detalhe',
      'Metodo',
      'Rota',
      'Status HTTP',
      'Duracao ms',
      'Recurso',
      'Recurso ID',
      'Acao tecnica',
      'Payload tecnico'
    ];

    const lines = [
      header.map(csvEscape).join(';'),
      ...auditRows.map((row) => ([
        formatDateTime(row.created_at),
        row.username,
        row.summary_text,
        row.detail_text,
        row.method ?? '',
        row.path ?? '',
        row.status ?? '',
        row.duration_ms ?? '',
        row.resource_type,
        row.resource_id ?? '',
        row.action,
        row.payload_json
      ].map(csvEscape).join(';')))
    ];

    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `auditoria-interna-${today}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    setMessage('CSV da auditoria exportado com sucesso.');
  }

  const stats = useMemo(() => {
    const total = modules.length;
    const mandatory = modules.filter((module) => module.is_mandatory).length;
    const optional = total - mandatory;
    return { total, mandatory, optional };
  }, [modules]);

  useEffect(() => {
    if (!selectedModule) return;
    setEditCode(selectedModule.code);
    setEditCategory(selectedModule.category);
    setEditName(selectedModule.name);
    setEditDescription(selectedModule.description ?? '');
    setEditDuration(selectedModule.duration_days);
    setEditProfile(selectedModule.profile ?? '');
    setEditMandatory(selectedModule.is_mandatory ? 1 : 0);
    setEditDeliveryMode(selectedModule.delivery_mode ?? 'ministrado');
    setEditHoursPolicy(selectedModule.client_hours_policy ?? 'consome');
    setPrereqIds((selectedModule.prerequisites ?? []).map((item) => item.id));
  }, [selectedModuleId, selectedModule]);

  useEffect(() => {
    if (!selectedInternalUser) return;
    setEditInternalDisplayName(selectedInternalUser.display_name ?? '');
    setEditInternalPassword('');
    setEditInternalRole(selectedInternalUser.role);
    setEditInternalPermissions(selectedInternalUser.permissions ?? []);
    setEditInternalActive(Boolean(selectedInternalUser.is_active));
  }, [selectedInternalUser]);

  async function handleImport() {
    setLoadingImport(true);
    setMessage('');
    try {
      const confirmationPhrase = resetData
        ? askDestructiveConfirmation('Limpar toda a base antes da importação')
        : null;
      if (resetData && !confirmationPhrase) {
        setMessage('Ação cancelada.');
        return;
      }

      const response = await api.importWorkbook({
        file_path: filePath,
        reset_data: resetData,
        confirmation_phrase: confirmationPhrase ?? undefined
      }) as any;
      setMessage(`Importação concluída: ${JSON.stringify(response.summary)}`);
      loadCatalog();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoadingImport(false);
    }
  }

  function togglePrereq(moduleId: string) {
    setPrereqIds((prev) => prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId]);
  }

  async function saveModule() {
    if (!selectedModuleId) return;

    setMessage('');
    try {
      await api.updateAdminModule(selectedModuleId, {
        code: editCode,
        category: editCategory,
        name: editName,
        description: editDescription || null,
        duration_days: Math.max(1, Number(editDuration) || 1),
        profile: editProfile || null,
        is_mandatory: editMandatory,
        delivery_mode: editDeliveryMode,
        client_hours_policy: editHoursPolicy
      });
      await api.updateAdminModulePrerequisites(selectedModuleId, {
        prerequisite_module_ids: prereqIds
      });
      setMessage('Módulo e pré-requisitos atualizados.');
      loadCatalog();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function createModule() {
    setMessage('');
    try {
      await api.createAdminModule({
        code: newCode,
        category: newCategory,
        name: newName,
        description: newDescription || null,
        duration_days: Math.max(1, Number(newDuration) || 1),
        profile: newProfile || null,
        is_mandatory: newMandatory,
        delivery_mode: newDeliveryMode,
        client_hours_policy: newHoursPolicy,
        apply_to_existing_clients: newApplyToExistingClients
      });
      setMessage(newApplyToExistingClients
        ? 'Módulo criado e aplicado aos clientes existentes.'
        : 'Módulo criado com sucesso. Ele ficará disponível para novas turmas e novas configurações.');
      setNewCode('');
      setNewName('');
      setNewDescription('');
      setNewDuration(1);
      setNewProfile('');
      setNewMandatory(0);
      setNewDeliveryMode('ministrado');
      setNewHoursPolicy('consome');
      setNewApplyToExistingClients(false);
      loadCatalog();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function bootstrapCurrentData() {
    setLoadingBootstrap(true);
    setMessage('');
    try {
      const confirmationPhrase = askDestructiveConfirmation('Aplicar base atual (upsert de clientes e módulos)');
      if (!confirmationPhrase) {
        setMessage('Ação cancelada.');
        return;
      }

      const response = await api.bootstrapCurrentData({
        confirmation_phrase: confirmationPhrase,
        clients: CURRENT_CLIENTS,
        modules: CURRENT_MODULES
      }) as any;
      setMessage(`Base atual aplicada: ${JSON.stringify(response.summary)}`);
      loadCatalog();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoadingBootstrap(false);
    }
  }

  async function bootstrapRealScenario() {
    setLoadingRealScenario(true);
    setMessage('');
    try {
      const confirmationPhrase = askDestructiveConfirmation('Aplicar cenário real (substitui toda a base atual)');
      if (!confirmationPhrase) {
        setMessage('Ação cancelada.');
        return;
      }

      const response = await api.bootstrapRealScenario({
        confirmation_phrase: confirmationPhrase
      }) as any;
      setMessage(`Cenário real aplicado: ${JSON.stringify(response.summary)}`);
      loadCatalog();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoadingRealScenario(false);
    }
  }

  async function savePortalOperatorAccess() {
    if (!portalOperatorUsername.trim()) {
      setMessage('Informe o login global de operador do portal.');
      return;
    }
    if (!portalOperatorPassword.trim()) {
      setMessage('Informe a senha global de operador do portal.');
      return;
    }

    setSavingPortalOperatorAccess(true);
    setMessage('');
    try {
      const response = await api.upsertPortalOperatorAccess({
        username: portalOperatorUsername.trim(),
        password: portalOperatorPassword
      }) as { username: string };
      setPortalOperatorPassword('');
      setPortalOperatorConfigured(true);
      setPortalOperatorUsername(response.username);
      setMessage('Credenciais globais do portal atualizadas.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSavingPortalOperatorAccess(false);
    }
  }

  function applyRolePresetToNew(role: InternalRole) {
    setNewInternalRole(role);
    if (role === 'custom') {
      setNewInternalPermissions([]);
      return;
    }
    setNewInternalPermissions(ROLE_PRESETS[role]);
  }

  function applyRolePresetToEdit(role: InternalRole) {
    setEditInternalRole(role);
    if (role === 'custom') {
      setEditInternalPermissions([]);
      return;
    }
    setEditInternalPermissions(ROLE_PRESETS[role]);
  }

  function toggleNewPermission(permission: InternalPermission) {
    setNewInternalPermissions((prev) => (
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission]
    ));
  }

  function toggleEditPermission(permission: InternalPermission) {
    setEditInternalPermissions((prev) => (
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission]
    ));
  }

  function customPermissionsOnly(permissions: InternalPermission[]) {
    return permissions.filter((permission) => !FINANCE_PERMISSION_KEYS.has(permission));
  }

  async function createInternalUserAction() {
    if (!newInternalUsername.trim()) {
      setMessage('Informe o login do usuário interno.');
      return;
    }
    if (!newInternalPassword.trim()) {
      setMessage('Informe a senha inicial do usuário interno.');
      return;
    }
    const permissions = newInternalRole === 'custom' ? customPermissionsOnly(newInternalPermissions) : ROLE_PRESETS[newInternalRole];

    setCreatingInternalUser(true);
    setMessage('');
    try {
      await api.createAdminInternalUser({
        username: newInternalUsername.trim(),
        display_name: newInternalDisplayName.trim() || null,
        password: newInternalPassword,
        role: newInternalRole,
        permissions,
        is_active: true
      });
      setNewInternalUsername('');
      setNewInternalDisplayName('');
      setNewInternalPassword('');
      applyRolePresetToNew('junior');
      setMessage('Usuário interno criado com sucesso.');
      loadCatalog();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setCreatingInternalUser(false);
    }
  }

  async function saveInternalUserAction() {
    if (!selectedInternalUser) return;
    const permissions = editInternalRole === 'custom' ? customPermissionsOnly(editInternalPermissions) : ROLE_PRESETS[editInternalRole];

    setSavingInternalUser(true);
    setMessage('');
    try {
      await api.updateAdminInternalUser(selectedInternalUser.id, {
        display_name: editInternalDisplayName.trim() || null,
        password: editInternalPassword.trim() || undefined,
        role: editInternalRole,
        permissions,
        is_active: editInternalActive
      });
      setEditInternalPassword('');
      setMessage('Usuário interno atualizado.');
      loadCatalog();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSavingInternalUser(false);
    }
  }

  async function deleteSelectedModule() {
    if (!selectedModule) return;
    const confirmationPhrase = askDestructiveConfirmation(`Excluir módulo ${selectedModule.code} - ${selectedModule.name}`);
    if (!confirmationPhrase) {
      setMessage('Ação cancelada.');
      return;
    }

    setMessage('');
    try {
      await api.deleteAdminModule(selectedModule.id, confirmationPhrase);
      setMessage('Módulo excluído com sucesso.');
      loadCatalog();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  if (!data) return <p>Carregando catálogo...</p>;

  return (
    <div className="page admin-page">
      <header className="page-header">
        <h1>Administração da Jornada</h1>
        <p>Gestão completa do catálogo de módulos, regras e base inicial da operação.</p>
      </header>

      {message ? <p className="info">{message}</p> : null}

      <div className="stats-grid">
        <article className="mini-stat">
          <span>Módulos no catálogo</span>
          <strong>{stats.total}</strong>
        </article>
        <article className="mini-stat">
          <span>Obrigatórios</span>
          <strong>{stats.mandatory}</strong>
        </article>
        <article className="mini-stat">
          <span>Opcionais</span>
          <strong>{stats.optional}</strong>
        </article>
        <article className="mini-stat">
          <span>Pré-requisito global</span>
          <strong>{data.global_rules.installation_prerequisite}</strong>
        </article>
      </div>

      <Section title="Carga de base e importação">
        <p className="form-hint">Use estas ações com cuidado. Operações de carga e bootstrap podem sobrescrever dados operacionais atuais.</p>
        <div className="three-col">
          <button type="button" onClick={bootstrapCurrentData} disabled={loadingBootstrap}>
            {loadingBootstrap ? 'Aplicando base...' : 'Aplicar clientes + módulos atuais'}
          </button>
          <button type="button" onClick={bootstrapRealScenario} disabled={loadingRealScenario}>
            {loadingRealScenario ? 'Aplicando cenário...' : 'Aplicar cenário real (turmas + participantes)'}
          </button>
          <div className="form-subcard">
            <strong>Importação por planilha</strong>
            <div className="form admin-import-form">
              <input value={filePath} onChange={(e) => setFilePath(e.target.value)} />
              <label>
                <input type="checkbox" checked={resetData} onChange={(e) => setResetData(e.target.checked)} />
                Limpar dados antes de importar
              </label>
              {resetData ? (
                <p className="warn-text admin-warning-note">
                  Confirmação forte obrigatória: digite {DESTRUCTIVE_CONFIRMATION_PHRASE}.
                </p>
              ) : null}
              <button type="button" onClick={handleImport} disabled={loadingImport}>
                {loadingImport ? 'Importando...' : 'Importar planilha'}
              </button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Acesso global do Portal do Cliente">
        <p className="form-hint">
          Esta credencial interna permite entrar em qualquer <code>/portal/:slug</code> no modo operador Holand, sem usar login do cliente.
        </p>
        <div className="three-col">
          <label>
            Login global
            <input
              value={portalOperatorUsername}
              onChange={(event) => setPortalOperatorUsername(event.target.value)}
              placeholder="ex: operador.holand"
            />
          </label>
          <label>
            Senha global
            <input
              type="password"
              value={portalOperatorPassword}
              onChange={(event) => setPortalOperatorPassword(event.target.value)}
              placeholder={portalOperatorConfigured ? 'Digite para trocar a senha' : 'Defina a senha inicial'}
            />
          </label>
          <label>
            Status
            <input value={portalOperatorConfigured ? 'Configurado' : 'Não configurado'} disabled />
          </label>
        </div>
        <div className="actions actions-compact">
          <button type="button" onClick={savePortalOperatorAccess} disabled={savingPortalOperatorAccess}>
            {savingPortalOperatorAccess ? 'Salvando...' : 'Salvar acesso global do portal'}
          </button>
        </div>
      </Section>

      <Section title="Usuários internos e permissões">
        <p className="form-hint">
          Perfis recomendados: <strong>Supremo</strong> (tudo), <strong>Intermediário</strong> (tudo menos Administração) e <strong>Júnior</strong> (Calendário, Turmas, Implementação, Suporte, Licenças e Documentação).
        </p>
        <div className="two-col admin-security-grid">
          <div className="form-subcard">
            <strong>Criar usuário interno</strong>
            <div className="form form-spacious">
              <div className="three-col admin-module-grid">
                <label>
                  Login
                  <input
                    value={newInternalUsername}
                    onChange={(event) => setNewInternalUsername(event.target.value)}
                    placeholder="ex: tecnico.junior"
                  />
                </label>
                <label>
                  Nome de exibição
                  <input
                    value={newInternalDisplayName}
                    onChange={(event) => setNewInternalDisplayName(event.target.value)}
                    placeholder="ex: João Técnico"
                  />
                </label>
                <label>
                  Perfil
                  <select value={newInternalRole} onChange={(event) => applyRolePresetToNew(event.target.value as InternalRole)}>
                    <option value="supremo">Supremo</option>
                    <option value="intermediario">Intermediário</option>
                    <option value="junior">Júnior</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
              </div>
              <label>
                Senha inicial
                <input
                  type="password"
                  value={newInternalPassword}
                  onChange={(event) => setNewInternalPassword(event.target.value)}
                  placeholder="mínimo 8 caracteres"
                />
              </label>
              {newInternalRole === 'custom' ? (
                <div className="check-grid admin-permission-grid">
                  {CUSTOM_PERMISSION_KEYS.map((permission) => (
                    <label key={permission}>
                      <input
                        type="checkbox"
                        checked={newInternalPermissions.includes(permission)}
                        onChange={() => toggleNewPermission(permission)}
                      />
                      {permission}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="form-hint">Permissões automáticas do perfil selecionado serão aplicadas.</p>
              )}
              <div className="actions actions-compact">
                <button type="button" onClick={createInternalUserAction} disabled={creatingInternalUser}>
                  {creatingInternalUser ? 'Criando...' : 'Criar usuário'}
                </button>
              </div>
            </div>
          </div>
          <div className="form-subcard">
            <strong>Editar usuário interno</strong>
            <div className="form form-spacious">
              <label>
                Usuário
                <select
                  value={selectedInternalUserId}
                  onChange={(event) => setSelectedInternalUserId(event.target.value)}
                >
                  {internalUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username} ({roleLabel(user.role)})
                    </option>
                  ))}
                </select>
              </label>
              {selectedInternalUser ? (
                <>
                  <div className="three-col admin-module-grid">
                    <label>
                      Nome de exibição
                      <input
                        value={editInternalDisplayName}
                        onChange={(event) => setEditInternalDisplayName(event.target.value)}
                      />
                    </label>
                    <label>
                      Perfil
                      <select value={editInternalRole} onChange={(event) => applyRolePresetToEdit(event.target.value as InternalRole)}>
                        <option value="supremo">Supremo</option>
                        <option value="intermediario">Intermediário</option>
                        <option value="junior">Júnior</option>
                        <option value="custom">Custom</option>
                      </select>
                    </label>
                    <label>
                      Status
                      <select value={editInternalActive ? 'active' : 'inactive'} onChange={(event) => setEditInternalActive(event.target.value === 'active')}>
                        <option value="active">Ativo</option>
                        <option value="inactive">Inativo</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Nova senha (opcional)
                    <input
                      type="password"
                      value={editInternalPassword}
                      onChange={(event) => setEditInternalPassword(event.target.value)}
                      placeholder="Preencha apenas para trocar"
                    />
                  </label>
                  {editInternalRole === 'custom' ? (
                    <div className="check-grid admin-permission-grid">
                      {CUSTOM_PERMISSION_KEYS.map((permission) => (
                        <label key={permission}>
                          <input
                            type="checkbox"
                            checked={editInternalPermissions.includes(permission)}
                            onChange={() => toggleEditPermission(permission)}
                          />
                          {permission}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="form-hint">Permissões serão recalculadas pelo perfil selecionado.</p>
                  )}
                  <div className="actions actions-compact">
                    <button type="button" onClick={saveInternalUserAction} disabled={savingInternalUser}>
                      {savingInternalUser ? 'Salvando...' : 'Salvar usuário'}
                    </button>
                  </div>
                </>
              ) : (
                <p className="form-hint">Nenhum usuário interno cadastrado.</p>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Auditoria interna"
        className={showAuditSection ? '' : 'is-collapsed'}
        action={(
          <button
            type="button"
            className="section-collapse-btn"
            onClick={() => setShowAuditSection((prev) => !prev)}
            aria-expanded={showAuditSection}
            aria-label={showAuditSection ? 'Minimizar auditoria interna' : 'Expandir auditoria interna'}
          >
            {showAuditSection ? '−' : '+'}
          </button>
        )}
      >
        {showAuditSection ? (
          <>
            <div className="admin-audit-toolbar">
              <p className="form-hint">Retenção automática: últimos 30 dias. Linguagem natural para leitura rápida e exportação em CSV.</p>
              <button type="button" className="secondary" onClick={exportInternalAuditCsv}>
                Exportar CSV
              </button>
            </div>
            <div className="table-wrap">
              <table className="table table-tight table-hover">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Usuário</th>
                    <th>Resumo</th>
                    <th>Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Sem ações registradas.</td>
                    </tr>
                  ) : auditRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.created_at)}</td>
                      <td>{row.username}</td>
                      <td className="cell-wrap">{row.summary_text}</td>
                      <td className="cell-wrap">{row.detail_text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Section>

      <div className="two-col">
        <Section title="Módulos da jornada">
          <div className="form admin-search-row">
            <input
              placeholder="Buscar módulo por código, nome ou categoria"
              value={moduleQuery}
              onChange={(e) => setModuleQuery(e.target.value)}
            />
          </div>
          <div className="table-wrap">
          <table className="table table-hover table-tight">
            <thead>
              <tr>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('code')}>Código{sortIndicator('code')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('name')}>Nome{sortIndicator('name')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('category')}>Categoria{sortIndicator('category')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('duration_days')}>Duração{sortIndicator('duration_days')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('is_mandatory')}>Obrigatório{sortIndicator('is_mandatory')}</button></th>
              </tr>
            </thead>
            <tbody>
              {orderedModules.map((module) => (
                <tr
                  key={module.id}
                  onClick={() => setSelectedModuleId(module.id)}
                  className={selectedModuleId === module.id ? 'row-selected' : ''}
                >
                  <td>{module.code}</td>
                  <td>{module.name}</td>
                  <td>{module.category}</td>
                  <td>{module.duration_days}d</td>
                  <td>{module.is_mandatory ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Section>

        <Section title="Editor do módulo selecionado">
          {!selectedModule ? <p>Selecione um módulo na lista para editar.</p> : null}
          {selectedModule ? (
            <div className="form form-spacious">
              <p className="form-hint">O valor de diárias aqui vira padrão para novos blocos de turma e pode ser sobrescrito na turma.</p>
              <div className="three-col admin-module-grid">
                <label>
                  Código
                  <input value={editCode} onChange={(e) => setEditCode(e.target.value.toUpperCase())} />
                </label>
                <label>
                  Categoria
                  <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
                </label>
                <label>
                  Duração (diárias)
                  <input
                    type="number"
                    min={1}
                    value={editDuration}
                    onChange={(e) => setEditDuration(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
              </div>

              <label>
                Nome do módulo
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>

              <div className="three-col admin-module-grid">
                <label>
                  Perfil
                  <input value={editProfile} onChange={(e) => setEditProfile(e.target.value)} />
                </label>
                <label>
                  Obrigatório
                  <select value={editMandatory} onChange={(e) => setEditMandatory(Number(e.target.value))}>
                    <option value={1}>Sim</option>
                    <option value={0}>Não</option>
                  </select>
                </label>
                <label>
                  Tipo de entrega
                  <select
                    value={editDeliveryMode}
                    onChange={(e) => {
                      const mode = e.target.value as 'ministrado' | 'entregavel';
                      setEditDeliveryMode(mode);
                      setEditHoursPolicy(mode === 'entregavel' ? 'nao_consume' : 'consome');
                    }}
                  >
                    <option value="ministrado">Treinamento ministrado</option>
                    <option value="entregavel">Entregável interno</option>
                  </select>
                </label>
              </div>

              <label>
                Política de horas para cliente
                <select value={editHoursPolicy} onChange={(e) => setEditHoursPolicy(e.target.value as 'consome' | 'nao_consume')}>
                  <option value="consome">Consome banco de horas do cliente</option>
                  <option value="nao_consume">Não consome banco de horas do cliente</option>
                </select>
              </label>

              <label>
                Descrição
                <textarea rows={2} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </label>

              <div className="form-subcard">
                <strong>Pré-requisitos</strong>
                <div className="check-grid admin-prereq-grid">
                  {modules
                    .filter((module) => module.id !== selectedModule.id)
                    .map((module) => (
                      <label key={module.id}>
                        <input
                          type="checkbox"
                          checked={prereqIds.includes(module.id)}
                          onChange={() => togglePrereq(module.id)}
                        />
                        {module.code} - {module.name}
                      </label>
                    ))}
                </div>
              </div>

              <div className="actions actions-compact">
                <button type="button" onClick={saveModule}>Salvar módulo</button>
                <button type="button" onClick={deleteSelectedModule}>Excluir módulo</button>
              </div>
            </div>
          ) : null}
        </Section>
      </div>

      <Section title="Criar novo módulo">
        <div className="form form-spacious">
          <p className="form-hint">Novos módulos entram no catálogo e ficam disponíveis em Administração, Turmas e Licenças.</p>
          <div className="module-rollout-card">
            <div>
              <strong>Aplicar aos clientes existentes?</strong>
              <p>
                Escolha “Não” para criar só o catálogo. Assim o módulo não aparece automaticamente na jornada dos clientes que já existem.
              </p>
            </div>
            <div className="module-rollout-actions" role="group" aria-label="Aplicação do novo módulo">
              <button
                type="button"
                className={!newApplyToExistingClients ? 'is-selected' : ''}
                onClick={() => setNewApplyToExistingClients(false)}
              >
                Não, só daqui para frente
              </button>
              <button
                type="button"
                className={newApplyToExistingClients ? 'is-selected' : ''}
                onClick={() => setNewApplyToExistingClients(true)}
              >
                Sim, aplicar a todos
              </button>
            </div>
          </div>
          <div className="three-col admin-module-grid">
            <label>
              Código
              <input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} />
            </label>
            <label>
              Categoria
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
            </label>
            <label>
              Duração (diárias)
              <input
                type="number"
                min={1}
                value={newDuration}
                onChange={(e) => setNewDuration(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
          </div>

          <label>
            Nome
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>

          <div className="three-col admin-module-grid">
            <label>
              Perfil
              <input value={newProfile} onChange={(e) => setNewProfile(e.target.value)} />
            </label>
            <label>
              Obrigatório
              <select value={newMandatory} onChange={(e) => setNewMandatory(Number(e.target.value))}>
                <option value={1}>Sim</option>
                <option value={0}>Não</option>
              </select>
            </label>
            <label>
              Tipo de entrega
              <select
                value={newDeliveryMode}
                onChange={(e) => {
                  const mode = e.target.value as 'ministrado' | 'entregavel';
                  setNewDeliveryMode(mode);
                  setNewHoursPolicy(mode === 'entregavel' ? 'nao_consume' : 'consome');
                }}
              >
                <option value="ministrado">Treinamento ministrado</option>
                <option value="entregavel">Entregável interno</option>
              </select>
            </label>
          </div>

          <label>
            Política de horas para cliente
            <select value={newHoursPolicy} onChange={(e) => setNewHoursPolicy(e.target.value as 'consome' | 'nao_consume')}>
              <option value="consome">Consome banco de horas do cliente</option>
              <option value="nao_consume">Não consome banco de horas do cliente</option>
            </select>
          </label>

          <label>
            Descrição
            <textarea rows={2} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          </label>

          <button type="button" onClick={createModule}>Criar módulo</button>
        </div>
      </Section>
    </div>
  );
}
