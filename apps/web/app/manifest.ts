import type { MetadataRoute } from 'next';

// PWA manifest — makes Copa Copilot installable to a fan's home screen, so the
// copilot is one tap away on a congested stadium network. (Full offline caching is
// on the roadmap; see SUGGESTIONS.md.)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Copa Copilot — Smart Stadium Copilot',
    short_name: 'Copa Copilot',
    description: 'GenAI operations & fan copilot for the FIFA World Cup 2026.',
    start_url: '/',
    display: 'standalone',
    background_color: '#1f2121',
    theme_color: '#0f7d8c',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    categories: ['sports', 'travel', 'navigation'],
    lang: 'en',
  };
}
