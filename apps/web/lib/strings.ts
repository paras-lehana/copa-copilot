// strings.ts — UI string catalog for the six tournament languages.
// Typed keys; English is complete and the others cover the core journeys. The
// language switcher and <html lang/dir> both read from @copa/core's registry.

import { type LanguageCode } from '@copa/core';

/** The keys every language provides for the primary journeys. */
export interface StringCatalog {
  appName: string;
  tagline: string;
  nav_home: string;
  nav_map: string;
  nav_assistant: string;
  nav_ops: string;
  nav_missions: string;
  skipToContent: string;
  chooseLanguage: string;
  askPlaceholder: string;
  send: string;
  crowdNow: string;
  bestExit: string;
  yourMissions: string;
}

const en: StringCatalog = {
  appName: 'Copa Copilot',
  tagline: 'Your smart stadium copilot for the FIFA World Cup 2026.',
  nav_home: 'Home',
  nav_map: 'Map',
  nav_assistant: 'Assistant',
  nav_ops: 'Operations',
  nav_missions: 'Missions',
  skipToContent: 'Skip to main content',
  chooseLanguage: 'Choose language',
  askPlaceholder: 'Ask about routes, queues, exits, weather or tickets…',
  send: 'Send',
  crowdNow: 'Crowd right now',
  bestExit: 'Best time to leave',
  yourMissions: 'Your missions',
};

const es: StringCatalog = {
  ...en,
  tagline: 'Tu copiloto inteligente del estadio para la Copa Mundial 2026.',
  nav_home: 'Inicio',
  nav_map: 'Mapa',
  nav_assistant: 'Asistente',
  nav_ops: 'Operaciones',
  nav_missions: 'Misiones',
  skipToContent: 'Saltar al contenido principal',
  chooseLanguage: 'Elegir idioma',
  askPlaceholder: 'Pregunta sobre rutas, filas, salidas, clima o boletos…',
  send: 'Enviar',
  crowdNow: 'Multitud ahora',
  bestExit: 'Mejor hora para salir',
  yourMissions: 'Tus misiones',
};

const fr: StringCatalog = {
  ...en,
  tagline: 'Votre copilote de stade pour la Coupe du Monde 2026.',
  nav_home: 'Accueil',
  nav_map: 'Carte',
  nav_assistant: 'Assistant',
  nav_ops: 'Opérations',
  nav_missions: 'Missions',
  skipToContent: 'Aller au contenu principal',
  chooseLanguage: 'Choisir la langue',
  askPlaceholder: 'Demandez itinéraires, files, sorties, météo ou billets…',
  send: 'Envoyer',
  crowdNow: 'Affluence maintenant',
  bestExit: 'Meilleur moment pour partir',
  yourMissions: 'Vos missions',
};

const ar: StringCatalog = {
  ...en,
  tagline: 'مساعدك الذكي في الملعب لكأس العالم 2026.',
  nav_home: 'الرئيسية',
  nav_map: 'الخريطة',
  nav_assistant: 'المساعد',
  nav_ops: 'العمليات',
  nav_missions: 'المهام',
  skipToContent: 'تخطَّ إلى المحتوى الرئيسي',
  chooseLanguage: 'اختر اللغة',
  askPlaceholder: 'اسأل عن المسارات والطوابير والمخارج والطقس والتذاكر…',
  send: 'إرسال',
  crowdNow: 'الازدحام الآن',
  bestExit: 'أفضل وقت للمغادرة',
  yourMissions: 'مهامك',
};

const hi: StringCatalog = {
  ...en,
  tagline: 'फीफा विश्व कप 2026 के लिए आपका स्मार्ट स्टेडियम सहायक।',
  nav_home: 'होम',
  nav_map: 'नक्शा',
  nav_assistant: 'सहायक',
  nav_ops: 'संचालन',
  nav_missions: 'मिशन',
  skipToContent: 'मुख्य सामग्री पर जाएँ',
  chooseLanguage: 'भाषा चुनें',
  askPlaceholder: 'रास्ते, कतार, निकास, मौसम या टिकट के बारे में पूछें…',
  send: 'भेजें',
  crowdNow: 'अभी की भीड़',
  bestExit: 'निकलने का सबसे अच्छा समय',
  yourMissions: 'आपके मिशन',
};

const pt: StringCatalog = {
  ...en,
  tagline: 'Seu copiloto inteligente de estádio para a Copa do Mundo 2026.',
  nav_home: 'Início',
  nav_map: 'Mapa',
  nav_assistant: 'Assistente',
  nav_ops: 'Operações',
  nav_missions: 'Missões',
  skipToContent: 'Ir para o conteúdo principal',
  chooseLanguage: 'Escolher idioma',
  askPlaceholder: 'Pergunte sobre rotas, filas, saídas, clima ou ingressos…',
  send: 'Enviar',
  crowdNow: 'Multidão agora',
  bestExit: 'Melhor hora para sair',
  yourMissions: 'Suas missões',
};

const CATALOGS: Record<LanguageCode, StringCatalog> = { en, es, fr, ar, hi, pt };

/** Get the string catalog for a language (English fallback). */
export function catalog(language: LanguageCode): StringCatalog {
  return CATALOGS[language] ?? en;
}
