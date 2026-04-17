import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Wallet,
  Scale,
  TrendingUp,
  TrendingDown,
  Package,
} from 'lucide-react';
import { lexa } from '@/api/lexa';
import { accountDisplayLabel } from '@/components/canvas/kaferLabels';
import type { LedgerAccount, LedgerEntry } from '@/api/types';
import { LedgerDrawer, type LedgerSelection } from '@/components/canvas/LedgerDrawer';

const KAFER_CLASSES: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  '1': { label: 'Actifs',       icon: Wallet,       color: 'text-emerald-400' },
  '2': { label: 'Passifs',      icon: Scale,        color: 'text-orange-400'  },
  '3': { label: 'Produits',     icon: TrendingUp,   color: 'text-accent'      },
  '4': { label: 'Achats',       icon: Package,      color: 'text-red-400'     },
  '5': { label: 'Personnel',    icon: TrendingDown, color: 'text-red-400'     },
  '6': { label: 'Charges exp.', icon: TrendingDown, color: 'text-red-400'     },
  '7': { label: 'Hors exp.',    icon: TrendingUp,   color: 'text-muted'       },
  '8': { label: 'Extra.',       icon: Package,      color: 'text-muted'       },
  '9': { label: 'Clôture',      icon: Package,      color: 'text-muted'       },
};

const fmtCHF = (n: number) =>
  new Intl.NumberFormat('fr-CH', {
    style: 'currency',
    currency: 'CHF',
    maximumFractionDigits: 0,
  }).format(n);

interface Props {
  hasEntries: boolean;
}

export function MobileLedgerList({ hasEntries }: Props) {
  // Données comptes (soldes agrégés)
  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['balance'],
    queryFn: lexa.ledgerBalance,
    staleTime: 30_000,
    enabled: hasEntries,
  });

  // Données entries pour le drawer
  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['ledger', 200],
    queryFn: () => lexa.ledgerList(200),
    staleTime: 30_000,
    enabled: hasEntries,
  });

  const [selection, setSelection] = useState<LedgerSelection>(null);
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(['1', '2', '3', '5', '6']),
  );

  const accounts: LedgerAccount[] = balanceData?.accounts ?? [];
  const entries: LedgerEntry[] = entriesData?.entries ?? [];

  const byClass = useMemo(() => {
    const classes = new Map<string, LedgerAccount[]>();
    for (const a of accounts) {
      const k = a.account.charAt(0);
      if (!classes.has(k)) classes.set(k, []);
      classes.get(k)!.push(a);
    }
    for (const arr of classes.values()) {
      arr.sort((a, b) => a.account.localeCompare(b.account));
    }
    return classes;
  }, [accounts]);

  const isLoading = balanceLoading || entriesLoading;

  if (isLoading) {
    return (
      <div className="md:hidden p-6 text-center text-muted text-sm">
        Chargement…
      </div>
    );
  }

  if (byClass.size === 0) {
    return null; // L'empty state est géré dans Workspace.tsx
  }

  const sortedClasses = Array.from(byClass.keys()).sort();

  return (
    <>
      {/* Liste mobile — md:hidden garanti dans Workspace via le conteneur parent */}
      <div className="flex-1 overflow-y-auto pb-4">
        {sortedClasses.map((k) => {
          const meta = KAFER_CLASSES[k] ?? {
            label: `Classe ${k}`,
            icon: Package,
            color: 'text-muted',
          };
          const Icon = meta.icon;
          const classAccounts = byClass.get(k) ?? [];
          const classTotal = classAccounts.reduce((s, a) => s + a.balance, 0);
          const isOpen = expanded.has(k);

          return (
            <div key={k} className="border-b border-border">
              {/* En-tête de classe — cliquable pour expand/collapse */}
              <button
                type="button"
                onClick={() => {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(k)) next.delete(k);
                    else next.add(k);
                    return next;
                  });
                }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-surface/50 active:bg-surface min-h-[44px]"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
                )}
                <Icon className={`w-4 h-4 flex-shrink-0 ${meta.color}`} />
                <span className="text-sm font-semibold text-ink flex-1 text-left">
                  {meta.label}
                </span>
                <span className="text-2xs text-muted mr-2">
                  {classAccounts.length} cpte{classAccounts.length > 1 ? 's' : ''}
                </span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    classTotal >= 0 ? 'text-ink' : 'text-red-400'
                  }`}
                >
                  {fmtCHF(classTotal)}
                </span>
              </button>

              {/* Comptes de la classe */}
              {isOpen && (
                <ul className="divide-y divide-border">
                  {classAccounts.map((a) => {
                    const code = a.account.match(/^(\d+)/)?.[1] ?? a.account;
                    const rawLabel = a.account.replace(/^\d+\s*-\s*/, '').trim();
                    const label = accountDisplayLabel(code, rawLabel);
                    const txCount = a.debitCount + a.creditCount;

                    return (
                      <li key={a.account}>
                        <button
                          type="button"
                          onClick={() =>
                            setSelection({ kind: 'account', accountId: a.account })
                          }
                          className="w-full flex items-center gap-3 px-6 py-2.5 text-left active:bg-surface/50 min-h-[44px]"
                        >
                          <span className="font-mono text-xs text-muted w-12 flex-shrink-0">
                            {code}
                          </span>
                          <span className="text-sm text-ink flex-1 truncate">
                            {label !== code ? label : ''}
                          </span>
                          <span className="text-2xs text-muted mr-2 flex-shrink-0">
                            {txCount} tx
                          </span>
                          <span
                            className={`text-sm font-semibold tabular-nums flex-shrink-0 ${
                              a.balance >= 0 ? 'text-ink' : 'text-red-400'
                            }`}
                          >
                            {fmtCHF(a.balance)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Drawer mobile — même composant que desktop */}
      <LedgerDrawer
        selection={selection}
        accounts={accounts}
        entries={entries}
        onClose={() => setSelection(null)}
      />
    </>
  );
}
