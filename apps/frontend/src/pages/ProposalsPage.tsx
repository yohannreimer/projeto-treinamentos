import { useMemo, useState } from "react";

import holandLogo from "../assets/holand-horizontal.svg";
import {
  DEFAULT_OBSERVATIONS,
  DEFAULT_TAX_PERCENT,
  DEFAULT_VALIDITY_DAYS,
  PROPOSAL_SERVICES,
  SNAP_TOTAL_TARGET,
  type ProposalService,
} from "../proposals/proposalData";
import { addDays, calculateProposalTotals, formatCurrency, formatLongDate } from "../proposals/proposalMath";
import {
  loadProposalConfig,
  loadProposalCustomServices,
  loadProposalObservations,
  loadProposalServiceEdits,
  saveProposalConfig,
  saveProposalCustomServices,
  saveProposalObservations,
  saveProposalServiceEdits,
  type ProposalServiceEdits,
} from "../proposals/proposalStorage";

type ClientFields = {
  companyName: string;
  address: string;
  cep: string;
  cnpj: string;
  contact: string;
  email: string;
};

type ProposalFields = {
  number: string;
  date: string;
  validityDays: string;
  modality: string;
};

type CustomModuleDraft = {
  code: string;
  name: string;
  valuePerDay: string;
  days: string;
  description: string;
};

type EditableProposalService = ProposalService & {
  displayName: string;
  durationDays: number;
  displayDescription: string;
};

type TotalsSummaryProps = {
  subtotal: number;
  totalDays: number;
  discountValue: number;
  taxPercent: number;
  taxValue: number;
  finalTotalDisplay: string;
};

type ServiceCardProps = {
  service: EditableProposalService;
  selected: boolean;
  editing: boolean;
  onToggleSelected: (id: string) => void;
  onToggleEditing: (id: string) => void;
  onEdit: (id: string, field: "name" | "durationDays" | "valuePerDay" | "description", value: string) => void;
  onReset: (id: string) => void;
  onDeleteCustom: (id: string) => void;
};

type ProposalPreviewProps = {
  client: ClientFields;
  proposal: ProposalFields;
  selectedServices: EditableProposalService[];
  observations: string;
  taxPercent: number;
  discountPercent: number;
  totals: ReturnType<typeof calculateProposalTotals>;
};

const EMPTY_CLIENT: ClientFields = {
  companyName: "",
  address: "",
  cep: "",
  cnpj: "",
  contact: "",
  email: "",
};

const EMPTY_CUSTOM_MODULE: CustomModuleDraft = {
  code: "",
  name: "",
  valuePerDay: "",
  days: "1",
  description: "",
};

function todayInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numericValue(value: string, fallback = 0): number {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveIntegerValue(value: string, fallback = 1): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function taxLabel(value: number): string {
  return Number.isInteger(value) ? `${value},00` : value.toFixed(2).replace(".", ",");
}

function displayCodeAndName(service: EditableProposalService): string {
  return service.code ? `${service.code} - ${service.displayName}` : service.displayName;
}

function buildEditableServices(customServices: ProposalService[], serviceEdits: ProposalServiceEdits): EditableProposalService[] {
  return [...PROPOSAL_SERVICES, ...customServices].map((service) => {
    const edit = serviceEdits[service.id];
    return {
      ...service,
      displayName: edit?.name ?? service.name,
      valuePerDay: edit?.valuePerDay ?? service.valuePerDay,
      durationDays: edit?.durationDays ?? service.defaultDurationDays,
      displayDescription: edit?.description ?? service.description,
    };
  });
}

function updateServiceEditValue(
  previous: ProposalServiceEdits,
  service: EditableProposalService,
  field: "name" | "durationDays" | "valuePerDay" | "description",
  rawValue: string,
): ProposalServiceEdits {
  const current = previous[service.id] ?? {
    name: service.displayName,
    valuePerDay: service.valuePerDay,
    durationDays: service.durationDays,
    description: service.displayDescription,
  };
  const nextEdit = { ...current };

  if (field === "durationDays") {
    nextEdit.durationDays = rawValue === "" ? 0 : positiveIntegerValue(rawValue, 1);
  } else if (field === "valuePerDay") {
    nextEdit.valuePerDay = rawValue === "" ? 0 : Math.max(0, numericValue(rawValue, 0));
  } else if (field === "name") {
    nextEdit.name = rawValue;
  } else {
    nextEdit.description = rawValue;
  }

  return { ...previous, [service.id]: nextEdit };
}

function TotalsSummary({
  subtotal,
  totalDays,
  discountValue,
  taxPercent,
  taxValue,
  finalTotalDisplay,
}: TotalsSummaryProps) {
  return (
    <section className="proposal-totals" aria-label="Totais da proposta">
      <div className="proposal-totals-row">
        <span>Subtotal</span>
        <strong>R$ {formatCurrency(subtotal)}</strong>
      </div>
      <div className="proposal-totals-row">
        <span>Total de Diárias</span>
        <strong>{totalDays} dia(s)</strong>
      </div>
      {discountValue > 0 ? (
        <div className="proposal-totals-row">
          <span>Desconto</span>
          <strong>- R$ {formatCurrency(discountValue)}</strong>
        </div>
      ) : null}
      <div className="proposal-totals-row">
        <span>Impostos ({taxLabel(taxPercent)}%)</span>
        <strong>R$ {formatCurrency(taxValue)}</strong>
      </div>
      <div className="proposal-totals-row proposal-totals-row-main">
        <span>Total c/ Impostos</span>
        <strong>R$ {finalTotalDisplay}</strong>
      </div>
    </section>
  );
}

function ServiceCard({
  service,
  selected,
  editing,
  onToggleSelected,
  onToggleEditing,
  onEdit,
  onReset,
  onDeleteCustom,
}: ServiceCardProps) {
  const label = service.displayName || service.name;

  return (
    <article className={`proposal-service-card${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}`}>
      <div className="proposal-service-card-header">
        <label className="proposal-service-check">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(service.id)}
            aria-label={`Selecionar ${label}`}
          />
          <span>
            <span className="proposal-service-name">
              {service.code ? `${service.code} - ` : ""}
              {label}
              {service.custom ? <small>CUSTOM</small> : null}
            </span>
            <span className="proposal-service-price">
              R$ {formatCurrency(service.valuePerDay)} / dia · {service.durationDays} dia(s)
            </span>
          </span>
        </label>
        <button type="button" className="proposal-service-edit" onClick={() => onToggleEditing(service.id)} aria-label={`Editar ${label}`}>
          {editing ? "Fechar" : "Editar"}
        </button>
        {service.custom ? (
          <button
            type="button"
            className="proposal-service-delete"
            onClick={() => onDeleteCustom(service.id)}
            aria-label={`Excluir ${label}`}
            title="Excluir módulo"
          >
            ×
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="proposal-service-controls">
          <label>
            Nome do serviço
            <input
              aria-label={`Nome de ${label}`}
              value={service.displayName}
              onChange={(event) => onEdit(service.id, "name", event.target.value)}
            />
          </label>
          <div className="proposal-service-control-grid">
            <label>
              Duração
              <input
                aria-label={`Duração de ${label}`}
                type="number"
                min="1"
                max="30"
                value={service.durationDays}
                onChange={(event) => onEdit(service.id, "durationDays", event.target.value)}
              />
            </label>
            <label>
              Valor/dia
              <input
                aria-label={`Valor por dia de ${label}`}
                type="number"
                min="0"
                step="0.01"
                value={service.valuePerDay}
                onChange={(event) => onEdit(service.id, "valuePerDay", event.target.value)}
              />
            </label>
          </div>
          <label>
            Descrição
            <textarea
              aria-label={`Descrição de ${label}`}
              value={service.displayDescription}
              onChange={(event) => onEdit(service.id, "description", event.target.value)}
            />
          </label>
          {!service.custom ? (
            <button type="button" className="proposal-reset-service" onClick={() => onReset(service.id)}>
              Restaurar padrão
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ProposalPreview({ client, proposal, selectedServices, observations, taxPercent, discountPercent, totals }: ProposalPreviewProps) {
  const clientName = client.companyName || "[Razão Social]";
  const contactName = client.contact || "[Contato]";
  const validityDate = addDays(proposal.date, positiveIntegerValue(proposal.validityDays, DEFAULT_VALIDITY_DAYS));
  const modalityText = proposal.modality.toLocaleLowerCase("pt-BR");

  return (
    <section className="proposal-document" aria-label="Prévia da proposta">
      <div className="proposal-document-header">
        <img src={holandLogo} alt="Holand" />
      </div>

      <div className="proposal-number">{proposal.number || "P00000_OS"}</div>
      <div className="proposal-date">Joinville, {formatLongDate(proposal.date)}</div>

      <div className="proposal-client-box">
        <strong>{clientName}</strong>
        <span>{client.address || "[Endereço]"}</span>
        <span>CEP: {client.cep || "[CEP]"}</span>
        <span>
          <strong>CNPJ:</strong> {client.cnpj || "[CNPJ]"}
        </span>
        <span>
          <strong>Contato:</strong> {contactName}
        </span>
        <span>
          <strong>E-mail:</strong> {client.email || "[E-mail]"}
        </span>
      </div>

      <p className="proposal-greeting">
        <strong>Prezado(a) Sr(a). {contactName}</strong>
        Agradecemos seu interesse pelos serviços de consultoria, suporte técnico e treinamentos em sistemas PDM/CAD/CAM oferecidos pela HOLAND.
      </p>

      <h2>I - Objeto</h2>
      <p>Serviços de Treinamento, Implantação e Consultoria.</p>

      <h2>II - Especificações</h2>
      <p>
        Os treinamentos abaixo orçados serão ministrados na modalidade <strong>{modalityText}</strong>.
        <br />
        Os serviços serão executados pela HOLAND, representante exclusiva da TopSolid em SC.
      </p>

      {selectedServices.length === 0 ? (
        <p className="proposal-empty">Selecione os serviços no painel ao lado.</p>
      ) : (
        <table className="proposal-services-table">
          <thead>
            <tr>
              <th>Serviços / Descrição</th>
              <th>Valor Unit.</th>
              <th>Duração</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {selectedServices.map((service) => (
              <tr key={service.id}>
                <td>
                  <strong>{displayCodeAndName(service)}</strong>
                  <span>{service.displayDescription}</span>
                </td>
                <td>R$ {formatCurrency(service.valuePerDay)}</td>
                <td>{service.durationDays}</td>
                <td>R$ {formatCurrency(service.valuePerDay * service.durationDays)}</td>
              </tr>
            ))}
            <tr className="proposal-days-row">
              <td colSpan={2}>Total de diárias</td>
              <td>
                <strong>{totals.totalDays} Diárias</strong>
              </td>
              <td />
            </tr>
            {totals.discountValue > 0 ? (
              <tr className="proposal-discount-row">
                <td colSpan={3}>Desconto ({formatCurrency(discountPercent)}%)</td>
                <td>- R$ {formatCurrency(totals.discountValue)}</td>
              </tr>
            ) : null}
            <tr className="proposal-total-row">
              <td colSpan={3}>Valor Total</td>
              <td>R$ {formatCurrency(totals.subtotalAfterDiscount)}</td>
            </tr>
            <tr className="proposal-tax-row">
              <td colSpan={3}>Valor total c/ Impostos ({taxLabel(taxPercent)}%)</td>
              <td>R$ {totals.finalTotalDisplay}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="proposal-notes">
        {(observations || DEFAULT_OBSERVATIONS).split("\n").map((line, index) =>
          line ? <p key={`${line}-${index}`}>{line}</p> : <br key={`blank-${index}`} />,
        )}
      </div>

      <div className="proposal-commercial">
        <strong>IV - Condições Comerciais</strong>
        <p>
          <strong>Treinamento, Implantação, Consultoria e Acompanhamento.</strong>
        </p>
        <p>Modalidade {proposal.modality}:</p>
        <p>( &nbsp;) À vista &nbsp; R$ {totals.finalTotalDisplay}</p>
      </div>

      <div className="proposal-tax-copy">
        <strong>VIII - Impostos</strong>
        <br />
        Composição dos impostos para serviços: {taxLabel(taxPercent)}%
      </div>

      <div className="proposal-validity">
        <strong>IX - Considerações Finais</strong>
        <br />
        Esta proposta tem validade até <strong>{validityDate}</strong>.
        <br />
        <br />
        Na ausência de um pedido de compra, o mesmo reconhece que sua assinatura nesta proposta autoriza o início do faturamento e que esta proposta terá validade como Ordem de Compra.
        <br />
        Todas as páginas desta proposta deverão ser rubricadas.
      </div>

      <p className="proposal-kind-regards">Cordialmente,</p>

      <div className="proposal-acceptance">Data do Aceite: _____ / _____ / _____</div>

      <div className="proposal-signatures">
        <div>
          <strong>Assinatura 1: Responsável Legal {clientName}</strong>
          <span>Nome: ________________________________</span>
          <span>Cargo: ________________________________</span>
          <i>{clientName}</i>
        </div>
        <div>
          <strong>Assinatura 2: Testemunha</strong>
          <span>Nome: ________________________________</span>
          <span>Cargo: ________________________________</span>
          <i>{clientName}</i>
        </div>
        <div className="proposal-holand-signature">
          <strong>Assinatura 3: Representante Legal Holand</strong>
          <span>Leonardo Holand</span>
          <i>Diretor Comercial da Holand Automação de Engenharias Ltda</i>
        </div>
      </div>

      <footer>
        Holand Automação de Engenharias Ltda | Av. Juscelino Kubitscheck, 350 - Centro, Joinville - SC, 89201-100
        <br />
        Fone: (47) 98859-3553 | www.holand.com.br | leonardo@holand.com.br
      </footer>
    </section>
  );
}

export function ProposalsPage() {
  const [client, setClient] = useState<ClientFields>(EMPTY_CLIENT);
  const [proposal, setProposal] = useState<ProposalFields>(() => ({
    number: "P23005_OS",
    date: todayInputValue(),
    validityDays: String(DEFAULT_VALIDITY_DAYS),
    modality: "Presencial e Online",
  }));
  const [customServices, setCustomServices] = useState<ProposalService[]>(() => loadProposalCustomServices());
  const [serviceEdits, setServiceEdits] = useState<ProposalServiceEdits>(() => loadProposalServiceEdits());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [editingIds, setEditingIds] = useState<Set<string>>(() => new Set());
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState<CustomModuleDraft>(EMPTY_CUSTOM_MODULE);
  const [taxPercent, setTaxPercent] = useState(() => loadProposalConfig().taxPercent ?? String(DEFAULT_TAX_PERCENT));
  const [discountPercent, setDiscountPercent] = useState("0");
  const [snapToTarget, setSnapToTarget] = useState(false);
  const [snapMessage, setSnapMessage] = useState("");
  const [observations, setObservations] = useState(() => loadProposalObservations());

  const services = useMemo(() => buildEditableServices(customServices, serviceEdits), [customServices, serviceEdits]);
  const selectedServices = useMemo(() => services.filter((service) => selectedIds.has(service.id)), [selectedIds, services]);
  const totals = calculateProposalTotals({
    selectedServices: selectedServices.map((service) => ({
      id: service.id,
      valuePerDay: service.valuePerDay,
      durationDays: service.durationDays,
    })),
    discountPercent: numericValue(discountPercent, 0),
    taxPercent: numericValue(taxPercent, DEFAULT_TAX_PERCENT),
    snapTo54000: snapToTarget,
  });

  function setClientField(field: keyof ClientFields, value: string) {
    setClient((previous) => ({ ...previous, [field]: value }));
  }

  function setProposalField(field: keyof ProposalFields, value: string) {
    setProposal((previous) => ({ ...previous, [field]: value }));
  }

  function toggleSelected(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleEditing(id: string) {
    setEditingIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function editService(id: string, field: "name" | "durationDays" | "valuePerDay" | "description", value: string) {
    const service = services.find((item) => item.id === id);
    if (!service) return;

    setServiceEdits((previous) => {
      const next = updateServiceEditValue(previous, service, field, value);
      saveProposalServiceEdits(next);
      return next;
    });
  }

  function resetService(id: string) {
    setServiceEdits((previous) => {
      const next = { ...previous };
      delete next[id];
      saveProposalServiceEdits(next);
      return next;
    });
  }

  function saveCustomModule() {
    const name = customDraft.name.trim();
    if (!name) return;

    const valuePerDay = numericValue(customDraft.valuePerDay, 1000);
    const durationDays = positiveIntegerValue(customDraft.days, 1);
    const service: ProposalService = {
      id: `custom_${Date.now()}`,
      code: customDraft.code.trim(),
      name,
      valuePerDay,
      defaultDurationDays: durationDays,
      description: customDraft.description.trim(),
      custom: true,
    };

    setCustomServices((previous) => {
      const next = [...previous, service];
      saveProposalCustomServices(next);
      return next;
    });
    setCustomDraft(EMPTY_CUSTOM_MODULE);
    setIsAddingCustom(false);
  }

  function deleteCustomService(id: string) {
    if (!window.confirm("Excluir este módulo permanentemente?")) return;

    setCustomServices((previous) => {
      const next = previous.filter((service) => service.id !== id);
      saveProposalCustomServices(next);
      return next;
    });
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setServiceEdits((previous) => {
      const next = { ...previous };
      delete next[id];
      saveProposalServiceEdits(next);
      return next;
    });
  }

  function cancelCustomModule() {
    setCustomDraft(EMPTY_CUSTOM_MODULE);
    setIsAddingCustom(false);
  }

  function handleTaxChange(value: string) {
    setTaxPercent(value);
    saveProposalConfig({ taxPercent: value });
    setSnapToTarget(false);
    setSnapMessage("");
  }

  function handleDiscountChange(value: string) {
    setDiscountPercent(value);
    setSnapToTarget(false);
    setSnapMessage("");
  }

  function applyTargetDiscount() {
    if (totals.subtotal === 0) {
      setSnapToTarget(false);
      setSnapMessage("Selecione os serviços primeiro.");
      return;
    }

    const tax = numericValue(taxPercent, DEFAULT_TAX_PERCENT);
    const targetBeforeTax = SNAP_TOTAL_TARGET / (1 + tax / 100);

    if (totals.subtotal <= targetBeforeTax) {
      setDiscountPercent("0");
      setSnapToTarget(false);
      setSnapMessage("Total já está abaixo de R$ 54.000,00 — nenhum desconto necessário.");
      return;
    }

    const discountValue = totals.subtotal - targetBeforeTax;
    const discount = (discountValue / totals.subtotal) * 100;
    setDiscountPercent(discount.toFixed(8));
    setSnapToTarget(true);
    setSnapMessage(`Desconto de ${discount.toFixed(2)}% aplicado.`);
  }

  function updateObservations(value: string) {
    setObservations(value);
    saveProposalObservations(value);
  }

  return (
    <div className="proposals-page">
      <aside className="proposals-sidebar">
        <header>
          <span>Holand Automação</span>
          <h1>Gerador de Propostas</h1>
        </header>

        <section className="proposal-panel">
          <h2>Dados do Cliente</h2>
          <label>
            Razão Social
            <input value={client.companyName} onChange={(event) => setClientField("companyName", event.target.value)} placeholder="Ex: Krah Industria e Comercio..." />
          </label>
          <label>
            Endereço
            <input value={client.address} onChange={(event) => setClientField("address", event.target.value)} placeholder="Rua, nº - Bairro, Cidade - UF" />
          </label>
          <label>
            CEP
            <input value={client.cep} onChange={(event) => setClientField("cep", event.target.value)} placeholder="00000-000" />
          </label>
          <label>
            CNPJ
            <input value={client.cnpj} onChange={(event) => setClientField("cnpj", event.target.value)} placeholder="00.000.000/0001-00" />
          </label>
          <label>
            Contato
            <input value={client.contact} onChange={(event) => setClientField("contact", event.target.value)} placeholder="Nome do responsável" />
          </label>
          <label>
            E-mail
            <input value={client.email} onChange={(event) => setClientField("email", event.target.value)} placeholder="email@empresa.com.br" />
          </label>
        </section>

        <section className="proposal-panel">
          <h2>Proposta</h2>
          <label>
            Número da Proposta
            <input value={proposal.number} onChange={(event) => setProposalField("number", event.target.value)} />
          </label>
          <label>
            Data
            <input type="date" value={proposal.date} onChange={(event) => setProposalField("date", event.target.value)} />
          </label>
          <label>
            Validade
            <input type="number" min="1" value={proposal.validityDays} onChange={(event) => setProposalField("validityDays", event.target.value)} />
          </label>
          <label>
            Modalidade
            <select value={proposal.modality} onChange={(event) => setProposalField("modality", event.target.value)}>
              <option>Presencial</option>
              <option>Remoto / Online</option>
              <option>Presencial e Online</option>
            </select>
          </label>
        </section>

        <section className="proposal-panel proposal-services-panel">
          <div className="proposal-panel-title-row">
            <h2>Serviços</h2>
            <div>
              <button type="button" onClick={() => setSelectedIds(new Set(services.map((service) => service.id)))}>
                Todos
              </button>
              <button type="button" onClick={() => setSelectedIds(new Set())}>
                Nenhum
              </button>
            </div>
          </div>

          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              selected={selectedIds.has(service.id)}
              editing={editingIds.has(service.id)}
              onToggleSelected={toggleSelected}
              onToggleEditing={toggleEditing}
              onEdit={editService}
              onReset={resetService}
              onDeleteCustom={deleteCustomService}
            />
          ))}

          <button type="button" className="proposal-add-module" onClick={() => setIsAddingCustom(true)}>
            Adicionar módulo personalizado
          </button>

          {isAddingCustom ? (
            <div className="proposal-custom-form">
              <h3>Novo Módulo</h3>
              <label>
                Código
                <input
                  aria-label="Código do módulo personalizado"
                  value={customDraft.code}
                  onChange={(event) => setCustomDraft((previous) => ({ ...previous, code: event.target.value }))}
                />
              </label>
              <label>
                Nome
                <input
                  aria-label="Nome do módulo personalizado"
                  value={customDraft.name}
                  onChange={(event) => setCustomDraft((previous) => ({ ...previous, name: event.target.value }))}
                />
              </label>
              <div className="proposal-custom-grid">
                <label>
                  Valor/dia
                  <input
                    aria-label="Valor por dia do módulo personalizado"
                    type="number"
                    min="0"
                    step="0.01"
                    value={customDraft.valuePerDay}
                    onChange={(event) => setCustomDraft((previous) => ({ ...previous, valuePerDay: event.target.value }))}
                  />
                </label>
                <label>
                  Dias padrão
                  <input
                    aria-label="Dias padrão do módulo personalizado"
                    type="number"
                    min="1"
                    value={customDraft.days}
                    onChange={(event) => setCustomDraft((previous) => ({ ...previous, days: event.target.value }))}
                  />
                </label>
              </div>
              <label>
                Descrição
                <textarea
                  aria-label="Descrição do módulo personalizado"
                  value={customDraft.description}
                  onChange={(event) => setCustomDraft((previous) => ({ ...previous, description: event.target.value }))}
                />
              </label>
              <div className="proposal-custom-actions">
                <button type="button" onClick={saveCustomModule}>
                  Salvar módulo
                </button>
                <button type="button" onClick={cancelCustomModule}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="proposal-panel">
          <h2>Desconto & Observações</h2>
          <div className="proposal-money-row">
            <label htmlFor="proposal-tax">Imposto</label>
            <input id="proposal-tax" type="number" min="0" max="100" step="0.01" value={taxPercent} onChange={(event) => handleTaxChange(event.target.value)} />
            <span>%</span>
          </div>
          <div className="proposal-money-row">
            <label htmlFor="proposal-discount">Desconto</label>
            <input id="proposal-discount" type="number" min="0" max="100" step="0.5" value={discountPercent} onChange={(event) => handleDiscountChange(event.target.value)} />
            <span>%</span>
          </div>
          <button type="button" className="proposal-target-discount" onClick={applyTargetDiscount}>
            Desconto para R$ 54.000
          </button>
          {snapMessage ? <p className="proposal-snap-message">{snapMessage}</p> : null}
          <label>
            Observações
            <textarea value={observations} onChange={(event) => updateObservations(event.target.value)} />
          </label>
        </section>

        <TotalsSummary
          subtotal={totals.subtotal}
          totalDays={totals.totalDays}
          discountValue={totals.discountValue}
          taxPercent={numericValue(taxPercent, DEFAULT_TAX_PERCENT)}
          taxValue={totals.taxValue}
          finalTotalDisplay={totals.finalTotalDisplay}
        />

        <button type="button" className="proposal-print" onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </button>
      </aside>

      <main className="proposals-preview-wrap">
        <ProposalPreview
          client={client}
          proposal={proposal}
          selectedServices={selectedServices}
          observations={observations}
          taxPercent={numericValue(taxPercent, DEFAULT_TAX_PERCENT)}
          discountPercent={numericValue(discountPercent, 0)}
          totals={totals}
        />
      </main>
    </div>
  );
}
