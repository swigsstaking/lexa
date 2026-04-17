import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Percent, Landmark, TrendingDown } from 'lucide-react';
import { lexa } from '@/api/lexa';

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CH', {
    style: 'currency',
    currency: 'CHF',
    maximumFractionDigits: 0,
  }).format(n);

const fmtPct = (n: number) => `${n.toFixed(0)}%`;

type AccentType = 'positive' | 'negative' | 'neutral';

interface ItemProps {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  accent?: AccentType;
}

function Item({ icon: Icon, label, value, accent }: ItemProps) {
  const valueColor =
    accent === 'positive'
      ? 'text-emerald-400'
      : accent === 'negative'
        ? 'text-red-400'
        : 'text-ink';
  const iconColor =
    accent === 'positive'
      ? 'text-emerald-400'
      : accent === 'negative'
        ? 'text-red-400'
        : 'text-accent';

  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
      <span className="text-2xs uppercase tracking-wider text-muted">{label}</span>
      <span className={`text-sm font-semibold ${valueColor}`}>{value}</span>
    </div>
  );
}

export function WorkspaceRatios() {
  const { data: ledgerData, isLoading } = useQuery({
    queryKey: ['ledger', 500],
    queryFn: () => lexa.ledgerList(500),
    staleTime: 30_000,
  });

  const ratios = useMemo(() => {
    if (!ledgerData?.entries) return null;

    const accounts = new Map<string, number>();
    for (const e of ledgerData.entries) {
      const prev = accounts.get(e.account) ?? 0;
      // Convention partie double : débit = +, crédit = -
      const delta = e.lineType === 'debit' ? e.amount : -e.amount;
      accounts.set(e.account, prev + delta);
    }

    let ca = 0;
    let achats = 0;
    let chargesTotal = 0;
    let treso = 0;

    for (const [acc, bal] of accounts) {
      const c = acc.charAt(0);
      // Classe 3 — Produits d'exploitation (soldes créditeurs → valeur abs)
      if (c === '3') ca += Math.abs(bal);
      // Classe 4 — Achats (inclus dans charges totales)
      else if (c === '4') {
        achats += bal;
        chargesTotal += bal;
      }
      // Classes 5 et 6 — Personnel + Charges d'exploitation
      else if (c === '5' || c === '6') chargesTotal += bal;

      // Trésorerie : Caisse (1000), Banque (1020), Placements CT (1060)
      if (acc === '1000' || acc === '1020' || acc === '1060') treso += bal;
    }

    const margeBrute = ca > 0 ? ((ca - achats) / ca) * 100 : 0;

    return { ca, chargesTotal, margeBrute, treso };
  }, [ledgerData]);

  if (isLoading || !ratios) {
    return (
      <div className="hidden md:flex items-center gap-6 px-6 py-2.5 border-b border-border bg-surface/50 text-xs text-muted flex-shrink-0">
        <span>Chargement des ratios…</span>
      </div>
    );
  }

  return (
    <div className="hidden md:flex items-center gap-8 px-6 py-2.5 border-b border-border bg-surface/50 flex-shrink-0">
      <Item
        icon={TrendingUp}
        label="CA YTD"
        value={fmt(ratios.ca)}
        accent="positive"
      />
      <Item
        icon={Percent}
        label="Marge brute"
        value={fmtPct(ratios.margeBrute)}
        accent={
          ratios.margeBrute >= 30
            ? 'positive'
            : ratios.margeBrute >= 15
              ? 'neutral'
              : 'negative'
        }
      />
      <Item
        icon={Landmark}
        label="Trésorerie"
        value={fmt(ratios.treso)}
        accent={ratios.treso > 0 ? 'positive' : 'negative'}
      />
      <Item
        icon={TrendingDown}
        label="Charges"
        value={fmt(ratios.chargesTotal)}
        accent="neutral"
      />
    </div>
  );
}
