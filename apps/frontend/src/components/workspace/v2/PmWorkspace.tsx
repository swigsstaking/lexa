import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lexa } from '@/api/lexa';
import { ViewSwitcher } from './ViewSwitcher';
import { PmColumnsA } from './PmColumnsA';
import { PmColumnsB } from './PmColumnsB';
import { PmLedger } from './PmLedger';
import type { V2Account } from './AccountTile';
import { classFromCode, extractCode, extractName } from './soldeDirection';
import { usePeriodStore } from '@/stores/periodStore';
import type { LedgerAccount, LedgerEntry } from '@/api/types';
import { LedgerDrawer } from '@/components/canvas/LedgerDrawer';
import type { LedgerSelection } from '@/components/canvas/LedgerDrawer';

type PmView = 'colA' | 'colB' | 'ledger';

const PM_VIEW_OPTS = [
  { key: 'colA',   label: 'Colonnes A' },
  { key: 'colB',   label: 'Colonnes B' },
  { key: 'ledger', label: 'Ledger' },
];

/** Recompute balances from filtered entries (same logic as LedgerCanvas) */
function recomputeBalances(
  accounts: LedgerAccount[],
  entries: LedgerEntry[],
): LedgerAccount[] {
  const sums = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) {
    const cur = sums.get(e.account) ?? { debit: 0, credit: 0 };
    if (e.lineType === 'debit') cur.debit += e.amount;
    else cur.credit += e.amount;
    sums.set(e.account, cur);
  }
  return accounts.map((a) => {
    const s = sums.get(a.account);
    if (!s) return { ...a, balance: 0, totalDebit: 0, totalCredit: 0 };
    const code = a.account.match(/^\d+/)?.[0] ?? '';
    const first = code[0] ?? '0';
    const isDebitNormal = first === '1' || (first >= '4' && first <= '9');
    return {
      ...a,
      balance: isDebitNormal ? s.debit - s.credit : s.credit - s.debit,
      totalDebit: s.debit,
      totalCredit: s.credit,
    };
  });
}

/** Mappe LedgerAccount → V2Account */
function toV2Account(a: LedgerAccount): V2Account {
  const code = extractCode(a.account);
  const cls  = classFromCode(a.account);
  const name = extractName(a.account);
  return {
    code,
    name,
    class: cls,
    balance: a.balance,
    totalDebit: a.totalDebit,
    totalCredit: a.totalCredit,
    movements: a.debitCount + a.creditCount,
  };
}

export function PmWorkspace() {
  const [pmView, setPmView] = useState<PmView>(() => {
    try { return (localStorage.getItem('lexa:pmView') as PmView) || 'colA'; } catch { return 'colA'; }
  });
  const [showFlows, setShowFlows] = useState(true);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [kpiVisibility] = useState({
    tresorerie: true, resultat: true, tva: true, anomalies: true,
  });
  const [drawerSelection, setDrawerSelection] = useState<LedgerSelection>(null);

  const handleOpenDrawer = (accountCode: string) => {
    setDrawerSelection({ kind: 'account', accountId: accountCode });
  };

  // Persister pmView
  const handleSetView = (v: string) => {
    const view = v as PmView;
    setPmView(view);
    try { localStorage.setItem('lexa:pmView', view); } catch { /* ignore */ }
  };

  // Données réelles
  const balance = useQuery({ queryKey: ['balance'], queryFn: lexa.ledgerBalance });
  const entries = useQuery({ queryKey: ['ledger', 200], queryFn: () => lexa.ledgerList(200) });
  const period = usePeriodStore((s) => s.period);

  const filteredEntries = useMemo(() => {
    const all = entries.data?.entries ?? [];
    return all.filter((e) => {
      if (!e.occurredAt) return true;
      const d = e.occurredAt.slice(0, 10);
      return d >= period.start && d <= period.end;
    });
  }, [entries.data, period]);

  const accountsForPeriod = useMemo(() => {
    if (!balance.data?.accounts) return [];
    if (period.key === 'all') return balance.data.accounts;
    return recomputeBalances(balance.data.accounts, filteredEntries);
  }, [balance.data, filteredEntries, period.key]);

  const v2Accounts = useMemo(
    () => accountsForPeriod.map(toV2Account),
    [accountsForPeriod],
  );

  const isLoading = balance.isLoading || entries.isLoading;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted text-sm">
          <div className="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin" />
          Chargement du grand livre…
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar PM — intégré dans le flux (pas absolut) pour éviter le chevauchement */}
      {/* On laisse 8px top padding pour respirer sous le bord */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          flexShrink: 0,
          borderBottom: '1px solid var(--chrome-line)',
          background: 'var(--chrome-bg-2)',
        }}
      >
        <ViewSwitcher options={PM_VIEW_OPTS} active={pmView} onChange={handleSetView} />

        {/* Toggle flux (sauf Ledger) */}
        {pmView !== 'ledger' && (
          <button
            onClick={() => setShowFlows((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 8,
              border: '1px solid var(--chrome-line)',
              background: showFlows ? 'var(--chrome-bg-2)' : 'var(--chrome-bg)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: showFlows ? 'var(--chrome-ink-1)' : 'var(--chrome-ink-3)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
              transition: 'all 120ms',
            }}
            title="Afficher / masquer les flux"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 4c3 0 4 8 7 8s4-8 5-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Flux
          </button>
        )}
      </div>

      {/* Canvas — flex-1 + min-h-0 pour que le scroll fonctionne */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {pmView === 'colA' && (
          <PmColumnsA
            accounts={v2Accounts}
            showFlows={showFlows}
            focusCode={focusCode}
            setFocusCode={setFocusCode}
            kpiVisibility={kpiVisibility}
            onOpenDrawer={handleOpenDrawer}
          />
        )}
        {pmView === 'colB' && (
          <PmColumnsB
            accounts={v2Accounts}
            showFlows={showFlows}
            focusCode={focusCode}
            setFocusCode={setFocusCode}
            kpiVisibility={kpiVisibility}
            onOpenDrawer={handleOpenDrawer}
          />
        )}
        {pmView === 'ledger' && (
          <PmLedger
            accounts={v2Accounts}
            focusCode={focusCode}
            setFocusCode={setFocusCode}
          />
        )}
      </div>

      {/* LedgerDrawer V2 — même composant que V1, déclenché par click sur AccountTile */}
      <LedgerDrawer
        selection={drawerSelection}
        accounts={balance.data?.accounts ?? []}
        entries={entries.data?.entries ?? []}
        onClose={() => setDrawerSelection(null)}
      />
    </div>
  );
}
