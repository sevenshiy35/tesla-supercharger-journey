import { US_STATES } from "@/data/us-states";
import { useLanguage } from "@/i18n/LanguageProvider";
import { getLocalizedStateName } from "@/i18n/state-names";
import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

interface StateSelectorProps {
  selectedState: string;
  onChange: (stateCode: string) => void;
}

const STATE_REGIONS = [
  {
    id: "west",
    codes: ["AZ", "CA", "CO", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"],
    label: { en: "West", zh: "西部" },
    color: "var(--color-region-west)",
  },
  {
    id: "midwest",
    codes: ["IA", "IL", "IN", "KS", "MI", "MN", "MO", "ND", "NE", "OH", "SD", "WI"],
    label: { en: "Midwest", zh: "中西部" },
    color: "var(--color-region-midwest)",
  },
  {
    id: "south",
    codes: ["AL", "AR", "DC", "DE", "FL", "GA", "KY", "LA", "MD", "MS", "NC", "OK", "SC", "TN", "TX", "VA", "WV"],
    label: { en: "South", zh: "南部" },
    color: "var(--color-region-south)",
  },
  {
    id: "northeast",
    codes: ["CT", "MA", "ME", "NH", "NJ", "NY", "PA", "RI", "VT"],
    label: { en: "Northeast", zh: "东北部" },
    color: "var(--color-region-northeast)",
  },
] as const;

export function StateSelector({ selectedState, onChange }: StateSelectorProps) {
  const { copy, language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const buttonId = useId();
  const listboxId = useId();
  const searchLabel = language === "zh" ? "搜索州名" : "Search states";
  const noMatchesLabel = language === "zh" ? "没有匹配的州" : "No matching states";
  const selectedStateName = selectedState
    ? getLocalizedStateName(selectedState, language)
    : copy.map.allStates;
  const normalizedQuery = query.trim().toLowerCase();
  const statesByCode = useMemo(
    () => new Map(US_STATES.map((state) => [state.code, state])),
    [],
  );
  const filteredRegions = STATE_REGIONS.map((region) => ({
    ...region,
    states: region.codes
      .map((code) => statesByCode.get(code))
      .filter((state): state is (typeof US_STATES)[number] => {
        if (!state) {
          return false;
        }

        const localizedName = getLocalizedStateName(state.code, language).toLowerCase();
        return (
          normalizedQuery.length === 0 ||
          localizedName.includes(normalizedQuery) ||
          state.name.toLowerCase().includes(normalizedQuery) ||
          state.code.toLowerCase().includes(normalizedQuery)
        );
      }),
  })).filter((region) => region.states.length > 0);
  const hasMatches = filteredRegions.length > 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (stateCode: string) => {
    onChange(stateCode);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div ref={selectorRef} className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor={buttonId}>
        {copy.map.filterLabel}
      </label>
      <button
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((current) => !current)}
        className="min-h-14 w-full rounded-full border border-white/85 bg-canvas px-3 text-left text-[14px] font-black uppercase text-ink shadow-[0_16px_40px_rgba(12,48,45,0.18)] transition hover:bg-white sm:w-[min(920px,calc(100vw-2.5rem))] sm:flex-none sm:px-4"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-[0_10px_20px_rgba(52,144,139,0.25)]">
              <MapPin size={16} />
            </span>
            <span className="min-w-0 truncate">{selectedStateName}</span>
          </span>
          <ChevronDown
            aria-hidden
            size={18}
            className={`shrink-0 text-ink transition ${isOpen ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      <button
        type="button"
        onClick={() => handleSelect("")}
        disabled={!selectedState}
        aria-hidden={!selectedState}
        tabIndex={selectedState ? 0 : -1}
        className={`min-h-14 rounded-full border border-white/35 bg-white/8 px-5 text-[13px] font-black uppercase text-[#fdf4af] transition hover:bg-white/12 ${
          selectedState ? "" : "pointer-events-none invisible"
        }`}
      >
        {copy.map.backToUnitedStates}
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.9rem)] z-20 overflow-hidden rounded-[36px] border border-white/85 bg-white text-ink shadow-[0_32px_90px_rgba(7,33,31,0.3)] sm:right-auto sm:w-[min(920px,calc(100vw-2.5rem))]">
          <div className="flex flex-col gap-4 border-b border-border bg-surface-muted px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <button
              type="button"
              role="option"
              aria-selected={!selectedState}
              onClick={() => handleSelect("")}
              className="flex min-h-11 items-center justify-between rounded-full bg-white px-4 text-left text-[13px] font-black uppercase text-ink shadow-[inset_0_0_0_1px_rgba(190,219,213,0.9)] transition hover:bg-brand-soft"
            >
              <span>{copy.map.allStates}</span>
              {!selectedState ? <Check aria-hidden size={16} className="text-brand" /> : null}
            </button>
            <div className="flex min-h-11 flex-1 items-center gap-3 rounded-full border border-border bg-white px-4 text-[15px] text-ink-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] sm:max-w-[320px]">
              <Search aria-hidden size={16} className="shrink-0 text-brand" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchLabel}
                aria-label={searchLabel}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-subtle/70"
              />
            </div>
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={buttonId}
            className="max-h-[min(520px,52vh)] overflow-y-auto px-5 py-6 sm:px-8 sm:py-7"
          >
            {hasMatches ? (
              <div className="grid gap-8 md:grid-cols-4">
                {filteredRegions.map((region) => (
                  <section key={region.id} className="min-w-0">
                    <div className="mb-5 flex flex-col gap-3">
                      <span
                        aria-hidden
                        className="flex h-16 w-16 shrink-0 rotate-[-8deg] items-center justify-center rounded-[26px] text-white shadow-[0_14px_28px_rgba(23,63,60,0.16)]"
                        style={{ backgroundColor: region.color }}
                      >
                        <MapPin size={24} />
                      </span>
                      <h3 className="text-[12px] font-black uppercase text-ink">
                        {region.label[language]}
                      </h3>
                    </div>
                    <div className="grid gap-1">
                      {region.states.map((state) => {
                        const stateName = getLocalizedStateName(state.code, language);
                        const isSelected = selectedState === state.code;

                        return (
                          <button
                            key={state.code}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => handleSelect(state.code)}
                            className={`flex min-h-9 items-center justify-between gap-2 rounded-full px-3 text-left text-[13px] font-bold leading-none transition ${
                              isSelected
                                ? "bg-ink text-white"
                                : "text-ink-muted hover:bg-brand-soft/55 hover:text-ink"
                            }`}
                          >
                            <span className="truncate">{stateName}</span>
                            {isSelected ? <Check aria-hidden size={14} className="shrink-0" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-[15px] text-ink-muted">{noMatchesLabel}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
