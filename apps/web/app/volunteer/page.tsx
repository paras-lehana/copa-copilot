'use client';

// volunteer/page.tsx — the volunteer view: assigned-zone status, an AI-assisted
// incident quick-report (free text → structured draft → submit), and copy-ready
// redirect scripts. Focus returns to the form after submission.

import { useRef, useState } from 'react';
import { crowdResponseSchema, incidentCreatedSchema, incidentsResponseSchema } from '../../lib/contracts';
import { apiPost } from '../../lib/api-client';
import { useApi } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { RetryCard, Skeleton, StatusPill } from '../../components/ui';
import { incidentReportSchema } from '@copa/core';

export default function VolunteerPage() {
  const session = useSession();
  const crowd = useApi(
    `/api/crowd/${session.venueId}?scenario=gate-bottleneck&minute=-20`,
    crowdResponseSchema,
    [session.venueId],
  );
  const incidents = useApi(`/api/incidents/${session.venueId}`, incidentsResponseSchema, [session.venueId]);
  const [report, setReport] = useState('');
  const [submitted, setSubmitted] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function submitReport() {
    setError(undefined);
    // Client mirrors the SAME core schema the server enforces (no hand-copied bounds).
    const draft = {
      venueId: session.venueId,
      zoneId: 'concourse-s',
      category: 'crowd' as const,
      severity: 'high' as const,
      summary: report.slice(0, 240),
      minute: -20,
    };
    const parsed = incidentReportSchema.safeParse(draft);
    if (!parsed.success) {
      setError('Please describe the incident in a short line (no angle brackets).');
      return;
    }
    const result = await apiPost('/api/incidents', draft, incidentCreatedSchema);
    setSubmitted(result.ok ? 'Report filed and added to the ops queue.' : 'Could not file the report.');
    setReport('');
    incidents.reload();
    textRef.current?.focus();
  }

  const congested = crowd.data?.snapshot.zones.filter((z) => z.status !== 'comfortable') ?? [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>Volunteer — zone {session.sectionZoneId}</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>Live context and a fast way to report and redirect.</p>

      <section aria-labelledby="zone-h" className="glass" style={{ padding: 20 }}>
        <h2 id="zone-h" style={{ marginTop: 0 }}>
          Congested zones near you
        </h2>
        {crowd.loading && <Skeleton height={60} />}
        {crowd.error !== undefined && <RetryCard message={crowd.error} onRetry={crowd.reload} />}
        {crowd.data !== undefined && congested.length === 0 && <p>All calm right now.</p>}
        <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {congested.slice(0, 6).map((z) => (
            <li key={z.zoneId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusPill status={z.status} /> {z.name} — {z.densityPct}%
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="script-h" className="glass" style={{ padding: 20 }}>
        <h2 id="script-h" style={{ marginTop: 0 }}>
          Redirect scripts
        </h2>
        <ul role="list" style={{ paddingInlineStart: 20 }}>
          <li>&ldquo;Gate A is very busy — please follow the blue signs to Gate E, about 3 minutes.&rdquo;</li>
          <li>&ldquo;For step-free access, take the lift on your left to the concourse ring.&rdquo;</li>
          <li>&ldquo;Trains are crowded now; the 82nd-minute departure is much faster.&rdquo;</li>
        </ul>
      </section>

      <section aria-labelledby="report-h" className="glass" style={{ padding: 20 }}>
        <h2 id="report-h" style={{ marginTop: 0 }}>
          Quick incident report
        </h2>
        <label htmlFor="report" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          Describe what you see (we structure it for the ops queue)
        </label>
        <textarea
          id="report"
          ref={textRef}
          value={report}
          onChange={(e) => setReport(e.target.value)}
          rows={3}
          maxLength={240}
          style={{ width: '100%', borderRadius: 10, padding: 10, background: 'var(--bg-1)', color: 'var(--text)', border: '1px solid var(--surface-edge)', marginTop: 6 }}
        />
        {error !== undefined && (
          <p role="alert" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button
          onClick={() => void submitReport()}
          style={{ minHeight: 44, padding: '10px 18px', borderRadius: 10, background: 'var(--primary)', color: 'var(--on-primary)', border: 'none', fontWeight: 600, cursor: 'pointer', marginTop: 8 }}
        >
          File report
        </button>
        {submitted !== undefined && (
          <p role="status" style={{ color: 'var(--ok)', fontWeight: 600 }}>
            {submitted}
          </p>
        )}
      </section>

      <section aria-labelledby="q-h" className="glass" style={{ padding: 20 }}>
        <h2 id="q-h" style={{ marginTop: 0 }}>
          Current ops queue
        </h2>
        {incidents.data?.incidents.slice(0, 4).map((inc) => (
          <p key={inc.id} style={{ margin: '4px 0' }}>
            <StatusPill status={inc.severity === 'critical' || inc.severity === 'high' ? 'critical' : 'busy'} /> {inc.summary}
          </p>
        ))}
      </section>
    </div>
  );
}
