import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lexa } from '@/api/lexa';

/**
 * Mode expert : vue tabulaire classique du grand livre.
 * Réservé au toggle depuis Workspace — pas une route.
 * Whitepaper §5 l'appelle le "fallback livres".
 */
export function LedgerPanel() {
  const { t } = useTranslation();
  const entries = useQuery({ queryKey: ['ledger', 100], queryFn: () => lexa.ledgerList(100) });
  const balance = useQuery({ queryKey: ['balance'], queryFn: lexa.ledgerBalance });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl mb-1 font-semibold tracking-tight">{t('ledger.title')}</h1>
        <p className="text-muted text-sm">{t('ledger.sub')}</p>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="text-base mb-4 font-medium">{t('ledger.balance_by_account')}</h2>
        {balance.isLoading && <div className="text-sm text-muted">{t('common.loading')}</div>}
        {balance.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-2xs text-muted uppercase tracking-wider">
                  <th className="pb-2">{t('ledger.account')}</th>
                  <th className="pb-2 text-right">{t('ledger.debit')}</th>
                  <th className="pb-2 text-right">{t('ledger.credit')}</th>
                  <th className="pb-2 text-right">{t('ledger.balance_col')}</th>
                </tr>
              </thead>
              <tbody>
                {balance.data.accounts.map((a) => (
                  <tr key={a.account} className="border-t border-border">
                    <td className="py-2.5 text-ink">{a.account}</td>
                    <td className="py-2.5 text-right mono-num">
                      {a.totalDebit.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 text-right mono-num">
                      {a.totalCredit.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`py-2.5 text-right mono-num ${
                        a.balance < 0 ? 'text-danger' : 'text-ink'
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
        <h2 className="text-base mb-4 font-medium">{t('ledger.detailed')}</h2>
        {entries.data && (
          <div className="space-y-1 max-h-[50vh] overflow-auto">
            {entries.data.entries.map((e, i) => (
              <div
                key={`${e.eventId}-${i}`}
                className="grid grid-cols-12 gap-2 py-2 text-sm border-b border-border last:border-0 items-start"
              >
                <div className="col-span-2 text-2xs text-muted mono-num">
                  {new Date(e.date).toLocaleDateString('fr-CH')}
                </div>
                <div className="col-span-5 min-w-0">
                  <div className="truncate text-ink">{e.description}</div>
                  <div className="text-2xs text-muted truncate">{e.account}</div>
                </div>
                <div className="col-span-2 text-2xs text-muted">
                  {e.tvaCode && <span className="chip">{e.tvaCode}</span>}
                </div>
                <div
                  className={`col-span-3 text-right mono-num ${
                    e.lineType === 'debit' ? 'text-success' : 'text-danger'
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
