import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, MapPin } from 'lucide-react';
import { lexa } from '@/api/lexa';
import type { CompanyLookupResult } from '@/api/types';

interface Props {
  onSelect: (company: CompanyLookupResult) => void;
  placeholder?: string;
}

export function CompanySearchField({ onSelect, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompanyLookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { results: r } = await lexa.searchCompany(q);
        setResults(r);
        setOpen(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur réseau');
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const handleSelect = (c: CompanyLookupResult) => {
    onSelect(c);
    setQuery(c.name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-lexa-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder ?? 'Nom de votre entreprise ou UID...'}
          className="input pl-10 pr-10"
        />
        {loading && (
          <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-lexa-muted animate-spin" />
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full card max-h-80 overflow-auto">
          {error && <div className="p-3 text-sm text-lexa-danger">{error}</div>}
          {!error && results.length === 0 && !loading && (
            <div className="p-3 text-sm text-lexa-muted">
              Aucun résultat. Vous pouvez saisir manuellement.
            </div>
          )}
          {results.map((r) => (
            <button
              key={r.uid}
              type="button"
              onClick={() => handleSelect(r)}
              className="w-full text-left px-4 py-3 hover:bg-lexa-bg border-b border-lexa-border last:border-0 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{r.name}</div>
                  <div className="text-xs text-lexa-muted mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    {[r.zip, r.city, r.canton].filter(Boolean).join(' ')}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-mono text-lexa-muted">{r.uid}</div>
                  <div className="text-xs text-lexa-muted mt-0.5">{r.legalFormLabel}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
