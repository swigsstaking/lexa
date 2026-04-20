import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lexa } from '@/api/lexa';
import { PmColumnsA } from './PmColumnsA';
import { PmColumnsB } from './PmColumnsB';
import { PmLedger } from './PmLedger';
import type { V2Account } from './AccountTile';
import { classFromCode, extractCode, extractName } from './soldeDirection';
import { usePeriodStore } from '@/stores/periodStore';
import type { LedgerAccount, LedgerEntry } from '@/api/types';
import { LedgerDrawer } from '@/components/canvas/LedgerDrawer';
import type { LedgerSelection } from '@/components/canvas/LedgerDrawer';
import { LexaCmdK, LexaCmdKTrigger, AgentsPill } from './LexaCmdK';
import { useChatStore } from '@/stores/chatStore';

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

  // CmdK quick-launcher
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const openChat = useChatStore((s) => s.setOpen);
  const chatLoading = useChatStore((s) => s.loading);

  // AgentsPill — visible seulement si l'IA travaille (classification en cours ou chat actif)
  const { data: processingStatus } = useQuery({
    queryKey: ['ledger-processing-status'],
    queryFn: lexa.ledgerProcessingStatus,
    refetchInterval: (q) => ((q.state.data?.pending ?? 0) === 0 ? false : 3000),
  });
  const aiWorking = (processingStatus?.pending ?? 0) > 0 || chatLoading;

  // Vue dropdown discret
  const [vueMenuOpen, setVueMenuOpen] = useState(false);
  const vueMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!vueMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (vueMenuRef.current && !vueMenuRef.current.contains(e.target as Node)) {
        setVueMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [vueMenuOpen]);

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

  const currentViewLabel = PM_VIEW_OPTS.find((o) => o.key === pmView)?.label ?? 'Vue';

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Canvas — flex-1 + min-h-0 pour que le scroll fonctionne */}
      {/* AgentsPill top-left — visible seulement si IA travaille */}
      <AgentsPill visible={aiWorking} />

      {/* Vue dropdown chip — centré top */}
      {/* BUG-3 fix : stopPropagation sur le container pour éviter navigation parasites */}
      <div
        ref={vueMenuRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 15,
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setVueMenuOpen((v) => !v); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: '#0A0A0A',
            color: '#FAFAF7',
            border: 0,
            borderRadius: 999,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            boxShadow: '0 2px 6px rgba(10,10,10,0.18)',
            fontFamily: 'Inter, ui-sans-serif, sans-serif',
            transition: 'opacity 0.15s',
          }}
        >
          {/* Petit point orange actif */}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--lexa)',
              boxShadow: '0 0 0 3px rgba(212,52,44,0.20)',
            }}
          />
          Vue : {currentViewLabel}
          <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
        </button>

        {/* Dropdown */}
        {vueMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#0A0A0A',
              border: '1px solid #25251F',
              borderRadius: 12,
              padding: '4px',
              minWidth: 180,
              boxShadow: '0 8px 32px rgba(10,10,10,0.24)',
              zIndex: 20,
            }}
          >
            {PM_VIEW_OPTS.map((o) => (
              <button
                key={o.key}
                onClick={(e) => { e.stopPropagation(); handleSetView(o.key); setVueMenuOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 500,
                  background: o.key === pmView ? '#161613' : 'transparent',
                  color: o.key === pmView ? '#FAFAF7' : '#A8A8A0',
                  fontFamily: 'Inter, ui-sans-serif, sans-serif',
                  transition: 'background 80ms',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (o.key !== pmView) (e.currentTarget as HTMLButtonElement).style.background = '#161613';
                }}
                onMouseLeave={(e) => {
                  if (o.key !== pmView) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                {o.label}
                {o.key === pmView && (
                  <span style={{ color: 'var(--lexa)', fontSize: 10 }}>✓</span>
                )}
              </button>
            ))}

            {/* Séparateur + toggle flux */}
            {pmView !== 'ledger' && (
              <>
                <div style={{ height: 1, background: '#25251F', margin: '4px 8px' }} />
                <button
                  onClick={(e) => { e.stopPropagation(); setShowFlows((v) => !v); setVueMenuOpen(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 0,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 500,
                    background: 'transparent',
                    color: '#A8A8A0',
                    fontFamily: 'Inter, ui-sans-serif, sans-serif',
                    transition: 'background 80ms',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = '#161613';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  Flux de trésorerie
                  <span
                    style={{
                      width: 28,
                      height: 16,
                      borderRadius: 99,
                      background: showFlows ? 'var(--lexa)' : '#3B3B38',
                      position: 'relative',
                      transition: 'background 0.2s',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: showFlows ? 12 : 2,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: '#FAFAF7',
                        transition: 'left 0.2s',
                      }}
                    />
                  </span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* CmdKTrigger top-right */}
      <LexaCmdKTrigger onOpen={() => setCmdkOpen(true)} />

      {/* CmdK modal */}
      <LexaCmdK
        open={cmdkOpen}
        setOpen={setCmdkOpen}
        accounts={v2Accounts.slice(0, 6).map((a) => ({ code: a.code, name: a.name, balance: a.balance }))}
        onSuggestion={(title) => {
          // Pré-remplit le chat avec la suggestion
          void title;
        }}
        onOpenChat={() => openChat(true)}
      />

      <div style={{ flex: 1, minHeight: 0 }}>
        {pmView === 'colA' && (
          <PmColumnsA
            accounts={v2Accounts}
            showFlows={showFlows}
            focusCode={focusCode}
            setFocusCode={setFocusCode}
            kpiVisibility={kpiVisibility}
            onOpenDrawer={handleOpenDrawer}
            onOpenCmdK={() => setCmdkOpen(true)}
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
            onOpenCmdK={() => setCmdkOpen(true)}
          />
        )}
        {pmView === 'ledger' && (
          <PmLedger
            accounts={v2Accounts}
            focusCode={focusCode}
            setFocusCode={setFocusCode}
            onOpenCmdK={() => setCmdkOpen(true)}
            onOpenDrawer={handleOpenDrawer}
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
