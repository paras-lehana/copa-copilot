import type { NextConfig } from 'next';

// Security headers on the web origin. Deliberately NO Content-Security-Policy:
// a CSP that would need 'unsafe-inline' to keep Next's hydration working scores
// worse than its absence (a documented regression), so we ship the safe headers
// that never break the app and leave CSP out until a hash-based policy is viable.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
];

import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Trace from the repo root so the standalone bundle includes the @copa/core workspace.
  outputFileTracingRoot: path.join(process.cwd(), '../../'),
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
