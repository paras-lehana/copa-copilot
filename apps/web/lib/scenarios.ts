// scenarios.ts — the demo scenarios and match minutes each persona view opens with.
// Centralised so no page carries a bare 'egress-surge' / -30 literal; changing the
// story a view tells is a one-line edit here.

import { type ScenarioId } from '@copa/core';

/** The default view context for a persona surface. */
export interface ViewContext {
  readonly scenario: ScenarioId;
  readonly minute: number;
}

/** Fan dashboard opens on the post-match egress surge (the anti-MetLife story). */
export const FAN_VIEW: ViewContext = { scenario: 'egress-surge', minute: 80 };

/** Ops + volunteer views open on the gate-bottleneck ingress (the Arrowhead replay). */
export const OPS_VIEW: ViewContext = { scenario: 'gate-bottleneck', minute: -30 };
export const VOLUNTEER_VIEW: ViewContext = { scenario: 'gate-bottleneck', minute: -20 };

/** The map/accessibility surfaces show a calm mid-match baseline. */
export const CALM_VIEW: ViewContext = { scenario: 'normal', minute: 30 };

/** Weather preset the dashboard tile queries (the July heat-dome replay). */
export const WEATHER_PRESET = 'heat-dome';

/** The minute the assistant reasons about when opened from a persona surface. */
export const ASSISTANT_MINUTE = 100;
