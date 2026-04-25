import { useEffect, useRef, useState } from 'react';
import type { FinanceEntity } from '../api';

export function FinanceEntityCombobox({
  entities,
  value,
  inputValue,
  onSelect,
  onInputChange,
  disabled,
  ariaLabel,
  placeholder = 'Buscar ou digitar entidade'
}: {
  entities: FinanceEntity[];
  value: string;
  inputValue: string;
  onSelect: (entity: FinanceEntity) => void;
  onInputChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const matches = inputValue.trim().length > 0
    ? entities
      .filter((entity) => `${entity.trade_name ?? ''} ${entity.legal_name}`.toLowerCase().includes(inputValue.toLowerCase()))
      .slice(0, 5)
    : [];

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  function closeSoon() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  function selectEntity(entity: FinanceEntity) {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    onSelect(entity);
    setOpen(false);
  }

  return (
    <div className="finance-entity-combobox">
      <input
        aria-label={ariaLabel}
        value={inputValue}
        onFocus={() => setOpen(true)}
        onBlur={closeSoon}
        onChange={(event) => {
          setOpen(true);
          onInputChange(event.target.value);
        }}
        disabled={disabled}
        placeholder={placeholder}
      />
      <input type="hidden" value={value} readOnly />
      {open && matches.length > 0 ? (
        <div className="finance-entity-combobox__list">
          {matches.map((entity) => (
            <button
              key={entity.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectEntity(entity)}
            >
              {entity.trade_name || entity.legal_name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
