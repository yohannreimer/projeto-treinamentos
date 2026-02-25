import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { Section } from '../components/Section';
import { askDestructiveConfirmation, DESTRUCTIVE_CONFIRMATION_PHRASE } from '../utils/destructive';

type ModuleCatalog = {
  id: string;
  code: string;
  category: string;
  name: string;
  description: string | null;
  duration_days: number;
  profile: string | null;
  is_mandatory: number;
  prerequisites: Array<{ id: string; code: string; name: string }>;
};
type AdminModuleSortKey = 'code' | 'name' | 'category' | 'duration_days' | 'is_mandatory';

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
  const [prereqIds, setPrereqIds] = useState<string[]>([]);

  const [newCode, setNewCode] = useState('');
  const [newCategory, setNewCategory] = useState('Geral');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDuration, setNewDuration] = useState(1);
  const [newProfile, setNewProfile] = useState('');
  const [newMandatory, setNewMandatory] = useState(0);

  const [loadingBootstrap, setLoadingBootstrap] = useState(false);
  const [loadingRealScenario, setLoadingRealScenario] = useState(false);

  function loadCatalog() {
    api.catalog().then((response: any) => {
      setData(response);
      const modules = (response.modules ?? []) as ModuleCatalog[];
      if (modules.length > 0) {
        setSelectedModuleId((prev) => modules.some((module) => module.id === prev) ? prev : modules[0].id);
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
    setPrereqIds((selectedModule.prerequisites ?? []).map((item) => item.id));
  }, [selectedModuleId, selectedModule]);

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
        is_mandatory: editMandatory
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
        is_mandatory: newMandatory
      });
      setMessage('Módulo criado com sucesso.');
      setNewCode('');
      setNewName('');
      setNewDescription('');
      setNewDuration(1);
      setNewProfile('');
      setNewMandatory(0);
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

      <div className="two-col">
        <Section title="Módulos da jornada">
          <div className="form admin-search-row">
            <input
              placeholder="Buscar módulo por código, nome ou categoria"
              value={moduleQuery}
              onChange={(e) => setModuleQuery(e.target.value)}
            />
          </div>
          <table className="table table-hover">
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
        </Section>

        <Section title="Editor do módulo selecionado">
          {!selectedModule ? <p>Selecione um módulo na lista para editar.</p> : null}
          {selectedModule ? (
            <div className="form form-spacious">
              <div className="three-col">
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

              <div className="two-col">
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
              </div>

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

              <div className="actions">
                <button type="button" onClick={saveModule}>Salvar módulo</button>
                <button type="button" onClick={deleteSelectedModule}>Excluir módulo</button>
              </div>
            </div>
          ) : null}
        </Section>
      </div>

      <Section title="Criar novo módulo">
        <div className="form form-spacious">
          <div className="three-col">
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

          <div className="two-col">
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
          </div>

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
