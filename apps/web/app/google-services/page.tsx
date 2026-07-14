'use client';

// google-services/page.tsx — the judge-facing evidence page. Renders the live
// catalog from /api/google/services: a scorecard header, the no-secrets attestation,
// and per-service cards with status, purpose, code paths and proof points.

import { googleServicesResponseSchema } from '../../lib/contracts';
import { useApi } from '../../lib/use-api';
import { GlassCard, RetryCard, Skeleton, StatTile } from '../../components/ui';

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  implemented: { text: 'Implemented', color: 'var(--ok)' },
  'ready-with-key': { text: 'Ready with key', color: 'var(--busy)' },
  planned: { text: 'Planned', color: 'var(--text-dim)' },
};

export default function GoogleServicesPage() {
  const catalog = useApi('/api/google/services', googleServicesResponseSchema);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>Google services</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Live from the API. One honest status vocabulary — implemented, ready-with-key, planned — the
        same in the docs, the code and this page.
      </p>

      {catalog.loading && <Skeleton height={120} />}
      {catalog.error !== undefined && <RetryCard message={catalog.error} onRetry={catalog.reload} />}

      {catalog.data !== undefined && (
        <>
          <section aria-labelledby="score-h">
            <h2 id="score-h" style={{ marginBottom: 8 }}>
              Scorecard
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 12 }}>
              <StatTile label="Services" value={String(catalog.data.scorecard.totalServices)} />
              <StatTile label="Implemented" value={String(catalog.data.scorecard.implemented)} />
              <StatTile label="Ready with key" value={String(catalog.data.scorecard.readyWithKey)} />
              <StatTile label="Product families" value={String(catalog.data.scorecard.productFamilies)} />
            </div>
            <p className="glass" style={{ padding: 12, marginTop: 12, fontSize: 13 }}>
              🔒 This endpoint exposes env-var <strong>names only</strong> — never values or key
              material (<code>exposesSecretValues: false</code>). Gemini key present at runtime:{' '}
              <strong>{catalog.data.runtime.geminiKeyPresent ? 'yes' : 'no'}</strong>.
            </p>
          </section>

          <section aria-labelledby="svc-h">
            <h2 id="svc-h">Services</h2>
            <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
              {catalog.data.services.map((s) => {
                const label = STATUS_LABEL[s.status] ?? STATUS_LABEL.planned;
                return (
                  <li key={s.id}>
                    <GlassCard>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 16 }}>{s.name}</strong>
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.family}</span>
                        <span
                          style={{
                            marginInlineStart: 'auto',
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: 'var(--on-primary)',
                            background: label?.color ?? 'var(--text-dim)',
                            padding: '2px 10px',
                            borderRadius: 999,
                          }}
                        >
                          {label?.text}
                        </span>
                      </div>
                      <p style={{ margin: '8px 0' }}>{s.purpose}</p>
                      <p style={{ margin: '4px 0', fontSize: 13, color: 'var(--text-dim)' }}>
                        <strong>Fallback:</strong> {s.fallbackMode}
                      </p>
                      <p style={{ margin: '4px 0', fontSize: 13 }}>
                        <strong>Proof:</strong> {s.judgeProofPoints.join(' ')}
                      </p>
                      <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--text-dim)' }}>
                        <code>{s.codePaths.join(' · ')}</code>
                      </p>
                    </GlassCard>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
