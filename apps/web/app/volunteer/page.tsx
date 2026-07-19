'use client';

// volunteer/page.tsx — the volunteer view: assigned-zone status, an AI-assisted
// incident quick-report (free text → structured draft → submit), and copy-ready
// redirect scripts. Focus returns to the form after submission.

import { useRef, useState } from 'react';
import { crowdResponseSchema, incidentCreatedSchema, incidentsResponseSchema } from '../../lib/contracts';
import { apiPost } from '../../lib/api-client';
import { useApi } from '../../lib/use-api';
import { useSession } from '../../lib/session';
import { Button, Muted, Panel, RetryCard, Skeleton, Stack, StatusPill } from '../../components/ui';
import { VOLUNTEER_VIEW } from '../../lib/scenarios';
import { incidentReportSchema } from '@copa/core';

export default function VolunteerPage() {
  const session = useSession();
  const crowd = useApi(
    `/api/crowd/${session.venueId}?scenario=${VOLUNTEER_VIEW.scenario}&minute=${VOLUNTEER_VIEW.minute}`,
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
      minute: VOLUNTEER_VIEW.minute,
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
    <Stack>
      <div>
        <h1 className="mb-1">Volunteer — zone {session.sectionZoneId}</h1>
        <Muted className="mt-0">Live context and a fast way to report and redirect.</Muted>
      </div>

      <Panel id="zone-h" title="Congested zones near you" icon="👥">
        {crowd.loading && <Skeleton height={60} />}
        {crowd.error !== undefined && <RetryCard message={crowd.error} onRetry={crowd.reload} />}
        {crowd.data !== undefined && congested.length === 0 && <p>All calm right now.</p>}
        <ul role="list" className="list-none p-0 m-0 grid gap-1.5">
          {congested.slice(0, 6).map((z) => (
            <li key={z.zoneId} className="flex items-center gap-2">
              <StatusPill status={z.status} /> {z.name} — {z.densityPct}%
            </li>
          ))}
        </ul>
      </Panel>

      <Panel id="script-h" title="Redirect scripts" icon="🗣️">
        <ul role="list" className="ps-5 list-disc">
          <li>&ldquo;Gate A is very busy — please follow the blue signs to Gate E, about 3 minutes.&rdquo;</li>
          <li>&ldquo;For step-free access, take the lift on your left to the concourse ring.&rdquo;</li>
          <li>&ldquo;Trains are crowded now; the 82nd-minute departure is much faster.&rdquo;</li>
        </ul>
      </Panel>

      <Panel id="report-h" title="Quick incident report" icon="📝">
        <label htmlFor="report" className="text-[13px] text-[var(--text-dim)]">
          Describe what you see (we structure it for the ops queue)
        </label>
        <textarea
          id="report"
          ref={textRef}
          value={report}
          onChange={(e) => setReport(e.target.value)}
          rows={3}
          maxLength={240}
          className="w-full rounded-[10px] p-2.5 mt-1.5 bg-[var(--bg-1)] text-[var(--text)] border border-[var(--surface-edge)]"
        />
        {error !== undefined && (
          <p role="alert" className="text-[var(--danger)]">
            {error}
          </p>
        )}
        <Button onClick={() => void submitReport()} className="mt-2">
          File report
        </Button>
        {submitted !== undefined && (
          <p role="status" className="text-[var(--ok)] font-semibold">
            {submitted}
          </p>
        )}
      </Panel>

      <Panel id="q-h" title="Current ops queue" icon="📋">
        {incidents.data?.incidents.slice(0, 4).map((inc) => (
          <p key={inc.id} className="my-1">
            <StatusPill status={inc.severity === 'critical' || inc.severity === 'high' ? 'critical' : 'busy'} /> {inc.summary}
          </p>
        ))}
      </Panel>
    </Stack>
  );
}
