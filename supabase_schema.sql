-- Orquestrador de Jornadas de Treinamento
-- Schema base para Supabase/Postgres

begin;

create extension if not exists pgcrypto;

create type status_company as enum ('Ativo', 'Inativo');
create type status_module_progress as enum ('Nao_iniciado', 'Planejado', 'Em_execucao', 'Concluido');
create type status_optional_progress as enum ('Planejado', 'Em_execucao', 'Concluido');
create type status_cohort as enum ('Planejada', 'Aguardando_quorum', 'Confirmada', 'Concluida', 'Cancelada');
create type status_allocation as enum ('Previsto', 'Confirmado', 'Executado', 'Cancelado');

create table if not exists journey_template (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists module_template (
  id uuid primary key default gen_random_uuid(),
  journey_template_id uuid not null references journey_template(id) on delete cascade,
  code text not null unique,
  item_code text,
  category text not null,
  name text not null,
  description text,
  duration_days int not null check (duration_days > 0),
  profile text,
  is_mandatory boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists module_prerequisite (
  module_id uuid not null references module_template(id) on delete cascade,
  prerequisite_module_id uuid not null references module_template(id) on delete cascade,
  primary key (module_id, prerequisite_module_id),
  check (module_id <> prerequisite_module_id)
);

create table if not exists optional_module (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category text,
  name text not null,
  duration_days int not null check (duration_days > 0),
  profile text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status status_company not null default 'Ativo',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_module_progress (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  module_id uuid not null references module_template(id) on delete cascade,
  status status_module_progress not null default 'Nao_iniciado',
  notes text,
  completed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, module_id)
);

create table if not exists company_optional_progress (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  optional_module_id uuid not null references optional_module(id) on delete cascade,
  status status_optional_progress not null default 'Planejado',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, optional_module_id)
);

create table if not exists technician (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  availability_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists technician_skill (
  technician_id uuid not null references technician(id) on delete cascade,
  module_id uuid not null references module_template(id) on delete cascade,
  primary key (technician_id, module_id)
);

create table if not exists cohort (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  start_date date not null,
  technician_id uuid references technician(id) on delete set null,
  status status_cohort not null default 'Planejada',
  capacity_companies int not null check (capacity_companies > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cohort_module_block (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references cohort(id) on delete cascade,
  module_id uuid not null references module_template(id) on delete restrict,
  order_in_cohort int not null check (order_in_cohort > 0),
  start_day_offset int not null check (start_day_offset > 0),
  duration_days int not null check (duration_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_id, order_in_cohort),
  unique (cohort_id, module_id)
);

create table if not exists cohort_allocation (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references cohort(id) on delete cascade,
  company_id uuid not null references company(id) on delete cascade,
  module_id uuid not null references module_template(id) on delete restrict,
  entry_day int not null check (entry_day > 0),
  status status_allocation not null default 'Previsto',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_id, company_id, module_id)
);

create table if not exists app_config (
  key text primary key,
  value_json jsonb not null,
  updated_at timestamptz not null default now()
);

-- Flag global de pré-requisito (Instalação)
insert into app_config (key, value_json)
values ('global_rules', '{"installation_module_code":"MOD-01","enforce_global_installation_prereq":true}'::jsonb)
on conflict (key) do nothing;

create index if not exists idx_cmb_cohort on cohort_module_block(cohort_id);
create index if not exists idx_alloc_cohort on cohort_allocation(cohort_id);
create index if not exists idx_alloc_company on cohort_allocation(company_id);
create index if not exists idx_cmp_company on company_module_progress(company_id);
create index if not exists idx_cmp_module on company_module_progress(module_id);

-- Trigger para updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_set_updated_at_journey_template
before update on journey_template
for each row execute function set_updated_at();

create trigger trg_set_updated_at_module_template
before update on module_template
for each row execute function set_updated_at();

create trigger trg_set_updated_at_optional_module
before update on optional_module
for each row execute function set_updated_at();

create trigger trg_set_updated_at_company
before update on company
for each row execute function set_updated_at();

create trigger trg_set_updated_at_company_module_progress
before update on company_module_progress
for each row execute function set_updated_at();

create trigger trg_set_updated_at_company_optional_progress
before update on company_optional_progress
for each row execute function set_updated_at();

create trigger trg_set_updated_at_technician
before update on technician
for each row execute function set_updated_at();

create trigger trg_set_updated_at_cohort
before update on cohort
for each row execute function set_updated_at();

create trigger trg_set_updated_at_cohort_module_block
before update on cohort_module_block
for each row execute function set_updated_at();

create trigger trg_set_updated_at_cohort_allocation
before update on cohort_allocation
for each row execute function set_updated_at();

-- Regra 1: alocação deve existir como bloco da turma
create or replace function validate_allocation_module_in_cohort()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from cohort_module_block cmb
    where cmb.cohort_id = new.cohort_id
      and cmb.module_id = new.module_id
  ) then
    raise exception 'Modulo alocado nao existe na turma';
  end if;

  return new;
end;
$$;

create trigger trg_validate_allocation_module_in_cohort
before insert or update on cohort_allocation
for each row execute function validate_allocation_module_in_cohort();

-- Regra 2: entry_day deve respeitar start_day_offset do bloco
create or replace function validate_entry_day()
returns trigger language plpgsql as $$
declare
  v_start_day int;
begin
  select start_day_offset into v_start_day
  from cohort_module_block
  where cohort_id = new.cohort_id and module_id = new.module_id;

  if v_start_day is null then
    raise exception 'Bloco do modulo nao encontrado na turma';
  end if;

  if new.entry_day < v_start_day then
    raise exception 'entry_day (%) nao pode ser menor que start_day_offset (%)', new.entry_day, v_start_day;
  end if;

  return new;
end;
$$;

create trigger trg_validate_entry_day
before insert or update on cohort_allocation
for each row execute function validate_entry_day();

-- Regra 3: ao executar alocacao, concluir progresso do cliente no modulo
create or replace function sync_progress_on_allocation_executed()
returns trigger language plpgsql as $$
begin
  if new.status = 'Executado' and (old.status is distinct from new.status) then
    insert into company_module_progress (company_id, module_id, status, completed_at)
    values (new.company_id, new.module_id, 'Concluido', current_date)
    on conflict (company_id, module_id)
    do update set
      status = 'Concluido',
      completed_at = excluded.completed_at,
      updated_at = now();
  end if;

  return new;
end;
$$;

create trigger trg_sync_progress_on_allocation_executed
after update on cohort_allocation
for each row execute function sync_progress_on_allocation_executed();

-- Regra 4: pré-requisito global de MOD-01 para execução de outros módulos
create or replace function enforce_global_installation_prereq()
returns trigger language plpgsql as $$
declare
  v_installation_module_id uuid;
  v_installation_code text;
  v_enforce boolean;
  v_completed boolean;
begin
  if new.status <> 'Executado' then
    return new;
  end if;

  select
    coalesce((value_json->>'installation_module_code')::text, 'MOD-01'),
    coalesce((value_json->>'enforce_global_installation_prereq')::boolean, true)
  into v_installation_code, v_enforce
  from app_config
  where key = 'global_rules';

  if not v_enforce then
    return new;
  end if;

  select id into v_installation_module_id
  from module_template
  where code = v_installation_code
  limit 1;

  if v_installation_module_id is null then
    return new;
  end if;

  if new.module_id = v_installation_module_id then
    return new;
  end if;

  select exists (
    select 1
    from company_module_progress cmp
    where cmp.company_id = new.company_id
      and cmp.module_id = v_installation_module_id
      and cmp.status = 'Concluido'
  ) into v_completed;

  if not v_completed then
    raise exception 'Empresa precisa concluir MOD-01 (Instalacao) antes de executar este modulo';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_global_installation_prereq
before update on cohort_allocation
for each row execute function enforce_global_installation_prereq();

-- View auxiliar: progresso consolidado por empresa
create or replace view vw_company_journey_progress as
select
  c.id as company_id,
  c.name as company_name,
  count(mt.id) filter (where cmp.status = 'Concluido')::int as modules_completed,
  count(mt.id)::int as modules_total,
  case
    when count(mt.id) = 0 then 0
    else round((count(mt.id) filter (where cmp.status = 'Concluido')::numeric / count(mt.id)::numeric) * 100, 2)
  end as completion_percent
from company c
cross join module_template mt
left join company_module_progress cmp
  on cmp.company_id = c.id
 and cmp.module_id = mt.id
group by c.id, c.name;

commit;
