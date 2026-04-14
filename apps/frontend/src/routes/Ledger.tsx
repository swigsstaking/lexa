import { useQuery } from '@tanstack/react-query';
import { lexa } from '@/api/lexa';

export function Ledger() {
  const entries = useQuery({ queryKey: ['ledger', 100], queryFn: () => lexa.ledgerList(100) });
  const balance = useQuery({ queryKey: ['balance'], queryFn: lexa.ledgerBalance });

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl mb-1">Grand livre</h1>
        <p className="text-lexa-muted text-sm">Écritures event-sourced, balance par compte</p>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="text-lg mb-4">Balance par compte</h2>
        {balance.isLoading && <div className="text-sm text-lexa-muted">Chargement...</div>}
        {balance.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-lexa-muted uppercase tracking-wider">
                  <th className="pb-2">Compte</th>
                  <th className="pb-2 text-right">Débit</th>
                  <th className="pb-2 text-right">Crédit</th>
                  <th className="pb-2 text-right">Solde</th>
                </tr>
              </thead>
              <tbody>
                {balance.data.accounts.map((a) => (
                  <tr key={a.account} className="border-t border-lexa-border">
                    <td className="py-2.5">{a.account}</td>
                    <td className="py-2.5 text-right font-mono">
                      {a.totalDebit.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 text-right font-mono">
                      {a.totalCredit.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`py-2.5 text-right font-mono ${
                        a.balance < 0 ? 'text-lexa-danger' : 'text-lexa-ink'
                      }`}
                    >
                      {a.balance.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="text-lg mb-4">Écritures détaillées</h2>
        {entries.data && (
          <div className="space-y-1 max-h-[60vh] overflow-auto">
            {entries.data.entries.map((e, i) => (
              <div
                key={`${e.eventId}-${i}`}
                className="grid grid-cols-12 gap-2 py-2 text-sm border-b border-lexa-border last:border-0 items-start"
              >
                <div className="col-span-2 text-xs text-lexa-muted font-mono">
                  {new Date(e.date).toLocaleDateString('fr-CH')}
                </div>
                <div className="col-span-5 min-w-0">
                  <div className="truncate">{e.description}</div>
                  <div className="text-xs text-lexa-muted truncate">{e.account}</div>
                </div>
                <div className="col-span-2 text-xs text-lexa-muted">
                  {e.tvaCode && <span className="chip">{e.tvaCode}</span>}
                </div>
                <div
                  className={`col-span-3 text-right font-mono ${
                    e.lineType === 'debit' ? 'text-lexa-success' : 'text-lexa-danger'
                  }`}
                >
                  {e.lineType === 'debit' ? '+' : '−'}
                  {e.amount.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}{' '}
                  {e.currency}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
