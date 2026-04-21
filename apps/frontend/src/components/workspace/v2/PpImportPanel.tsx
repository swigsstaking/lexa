import { usePpImports } from '@/api/ppImport';
import type { PpImportRow } from '@/api/ppImport';

const STATUS_LABEL: Record<string, string> = {
  pending:    'En attente',
  processing: 'Traitement…',
  extracted:  'Extrait — validation prête',
  validated:  'Validé',
  committed:  'Importé',
  failed:     'Erreur',
};

const STATUS_COLOR: Record<string, string> = {
  pending:    'rgb(var(--subtle, 154 154 147))',
  processing: 'oklch(0.55 0.18 220)',
  extracted:  'oklch(0.42 0.14 155)',
  validated:  'oklch(0.42 0.14 155)',
  committed:  'oklch(0.42 0.14 155)',
  failed:     'var(--neg, #d4342c)',
};

const CATEGORY_LABEL: Record<string, string> = {
  salary:     'Certificat de salaire',
  wealth:     'Fortune bancaire',
  investment: 'Placements',
  expense:    'Frais déductibles',
  insurance:  'Assurances',
  crypto:     'Crypto',
  auto:       'Document',
};

function ImportRow({ item }: { item: PpImportRow }) {
  const label = CATEGORY_LABEL[item.category] ?? item.category;
  const statusLabel = STATUS_LABEL[item.status] ?? item.status;
  const color = STATUS_COLOR[item.status] ?? 'rgb(var(--muted))';
  const isLowConf = item.confidence !== null && item.confidence < 0.7;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 0',
        borderBottom: '1px solid rgb(var(--border, 229 229 222))',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'rgb(var(--ink, 10 10 10))',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 11, color }}>
            {statusLabel}
          </span>
          {isLowConf && (
            <span style={{ fontSize: 10, color: 'oklch(0.65 0.18 50)' }}>
              ⚠ Faible confiance
            </span>
          )}
          {item.confidence !== null && (
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10,
                color: 'rgb(var(--subtle, 154 154 147))',
              }}
            >
              {Math.round(item.confidence * 100)}%
            </span>
          )}
        </div>
      </div>
      {(item.status === 'pending' || item.status === 'processing') && (
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid rgb(var(--border))',
            borderTopColor: 'var(--lexa, #d4342c)',
            animation: 'ppSpinner 0.8s linear infinite',
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );
}

export function PpImportPanel() {
  const { data, isLoading } = usePpImports();

  if (isLoading) {
    return (
      <div style={{ padding: '12px 0', fontSize: 12, color: 'rgb(var(--muted))' }}>
        Chargement…
      </div>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: '12px 0',
          fontSize: 12,
          color: 'rgb(var(--subtle, 154 154 147))',
          textAlign: 'center',
        }}
      >
        Aucun import en cours
      </div>
    );
  }

  return (
    <>
      <div style={{ borderTop: '1px solid rgb(var(--border, 229 229 222))' }}>
        {items.map((item) => (
          <ImportRow key={item.id} item={item} />
        ))}
      </div>
      <style>{`
        @keyframes ppSpinner {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
