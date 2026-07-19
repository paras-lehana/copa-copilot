'use client';

// google-services/page.tsx — the live evidence page. Renders the catalog from
// /api/google/services: a scorecard header, the no-secrets attestation, and
// per-service cards with status, purpose, code paths and proof points.

import { googleServicesResponseSchema } from '../../lib/contracts';
import { useApi } from '../../lib/use-api';
import { GlassCard, RetryCard, Skeleton, Stack, StatTile } from '../../components/ui';

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  implemented: { text: 'Implemented', color: 'var(--ok)' },
  'ready-with-key': { text: 'Ready with key', color: 'var(--busy)' },
  planned: { text: 'Planned', color: 'var(--text-dim)' },
};

export default function GoogleServicesPage() {
  const catalog = useApi('/api/google/services', googleServicesResponseSchema);

  return (
    <Stack>
      <h1 className="mb-0">Google services</h1>
      <p className="text-[var(--text-dim)] mt-0">
        Live from the API. One honest status vocabulary — implemented, ready-with-key, planned — the
        same in the docs, the code and this page.
      </p>

      {catalog.loading && <Skeleton height={120} />}
      {catalog.error !== undefined && <RetryCard message={catalog.error} onRetry={catalog.reload} />}

      {catalog.data !== undefined && (
        <>
          <section aria-labelledby="score-h">
            <h2 id="score-h" className="mb-2">
              Scorecard
            </h2>
            <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
              <StatTile label="Services" value={String(catalog.data.scorecard.totalServices)} />
              <StatTile label="Implemented" value={String(catalog.data.scorecard.implemented)} />
              <StatTile label="Ready with key" value={String(catalog.data.scorecard.readyWithKey)} />
              <StatTile label="Product families" value={String(catalog.data.scorecard.productFamilies)} />
            </div>
            <p className="glass-card p-3 mt-3 text-[13px]">
              🔒 This endpoint exposes env-var <strong>names only</strong> — never values or key
              material (<code>exposesSecretValues: false</code>). Gemini key present at runtime:{' '}
              <strong>{catalog.data.runtime.geminiKeyPresent ? 'yes' : 'no'}</strong>.
            </p>
          </section>

          <section aria-labelledby="svc-h">
            <h2 id="svc-h">Services</h2>
            <ul role="list" className="list-none p-0 m-0 grid gap-3">
              {catalog.data.services.map((s) => {
                const label = STATUS_LABEL[s.status] ?? STATUS_LABEL.planned;
                return (
                  <li key={s.id}>
                    <GlassCard>
                      <div className="flex gap-2 items-baseline flex-wrap">
                        <strong className="text-base">{s.name}</strong>
                        <span className="text-xs text-[var(--text-dim)]">{s.family}</span>
                        <span
                          className="ms-auto text-[12.5px] font-semibold text-[var(--on-primary)] py-0.5 px-2.5 rounded-full"
                          style={{ background: label?.color ?? 'var(--text-dim)' }}
                        >
                          {label?.text}
                        </span>
                      </div>
                      <p className="my-2">{s.purpose}</p>
                      <p className="my-1 text-[13px] text-[var(--text-dim)]">
                        <strong>Fallback:</strong> {s.fallbackMode}
                      </p>
                      <p className="my-1 text-[13px]">
                        <strong>Proof:</strong> {s.proofPoints.join(' ')}
                      </p>
                      <p className="my-1 text-xs text-[var(--text-dim)]">
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
    </Stack>
  );
}
