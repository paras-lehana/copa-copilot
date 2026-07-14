// errors.ts — the AppError taxonomy: every failure the platform can express.
// Boundary: each ErrorCode maps to exactly one HTTP status and one SAFE user message
// (localized). Raw input, upstream payloads and internals never enter these messages;
// server-only diagnostics travel in a field the API layer must never serialize.

import { type LanguageCode, SUPPORTED_LANGUAGES } from './i18n';

/** Every failure category the platform can report. */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UPSTREAM_FAILURE'
  | 'ASSISTANT_UNAVAILABLE'
  | 'ROUTE_UNAVAILABLE'
  | 'MISSION_REJECTED'
  | 'INTERNAL';

/** HTTP status for each code — single source for the API error envelope. */
const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UPSTREAM_FAILURE: 502,
  ASSISTANT_UNAVAILABLE: 503,
  ROUTE_UNAVAILABLE: 409,
  MISSION_REJECTED: 422,
  INTERNAL: 500,
};

/** Safe, human-readable messages per language. No interpolation — nothing can leak. */
const SAFE_MESSAGES: Record<ErrorCode, Record<LanguageCode, string>> = {
  VALIDATION_FAILED: {
    en: 'The request was not valid. Please check the fields and try again.',
    es: 'La solicitud no es válida. Revisa los campos e inténtalo de nuevo.',
    fr: "La requête n'est pas valide. Vérifiez les champs et réessayez.",
    ar: 'الطلب غير صالح. يرجى التحقق من الحقول والمحاولة مرة أخرى.',
    hi: 'अनुरोध मान्य नहीं है। कृपया फ़ील्ड जाँचें और फिर से प्रयास करें।',
    pt: 'A solicitação não é válida. Verifique os campos e tente novamente.',
  },
  NOT_FOUND: {
    en: 'We could not find what you asked for.',
    es: 'No pudimos encontrar lo que pediste.',
    fr: "Nous n'avons pas trouvé ce que vous avez demandé.",
    ar: 'لم نتمكن من العثور على ما طلبته.',
    hi: 'हमें वह नहीं मिला जो आपने माँगा।',
    pt: 'Não encontramos o que você pediu.',
  },
  RATE_LIMITED: {
    en: 'Too many requests. Please wait a moment and try again.',
    es: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    fr: 'Trop de requêtes. Patientez un instant et réessayez.',
    ar: 'طلبات كثيرة جدًا. يرجى الانتظار قليلاً والمحاولة مرة أخرى.',
    hi: 'बहुत अधिक अनुरोध। कृपया थोड़ी देर रुककर फिर प्रयास करें।',
    pt: 'Muitas solicitações. Aguarde um momento e tente novamente.',
  },
  PAYLOAD_TOO_LARGE: {
    en: 'The request is too large.',
    es: 'La solicitud es demasiado grande.',
    fr: 'La requête est trop volumineuse.',
    ar: 'الطلب كبير جدًا.',
    hi: 'अनुरोध बहुत बड़ा है।',
    pt: 'A solicitação é muito grande.',
  },
  UPSTREAM_FAILURE: {
    en: 'A connected service failed. Please try again shortly.',
    es: 'Un servicio conectado falló. Inténtalo de nuevo en breve.',
    fr: 'Un service connecté a échoué. Réessayez sous peu.',
    ar: 'تعطلت خدمة متصلة. يرجى المحاولة مرة أخرى بعد قليل.',
    hi: 'एक जुड़ी हुई सेवा विफल हो गई। कृपया थोड़ी देर में पुनः प्रयास करें।',
    pt: 'Um serviço conectado falhou. Tente novamente em breve.',
  },
  ASSISTANT_UNAVAILABLE: {
    en: 'The assistant is briefly unavailable. Live venue data still works.',
    es: 'El asistente no está disponible por un momento. Los datos del estadio siguen funcionando.',
    fr: "L'assistant est brièvement indisponible. Les données du stade fonctionnent toujours.",
    ar: 'المساعد غير متاح لفترة وجيزة. بيانات الملعب المباشرة لا تزال تعمل.',
    hi: 'सहायक कुछ समय के लिए अनुपलब्ध है। स्टेडियम का लाइव डेटा अब भी काम कर रहा है।',
    pt: 'O assistente está brevemente indisponível. Os dados do estádio continuam funcionando.',
  },
  ROUTE_UNAVAILABLE: {
    en: 'No safe route is available right now. Please ask a steward for help.',
    es: 'No hay una ruta segura disponible ahora. Pide ayuda a un asistente del estadio.',
    fr: "Aucun itinéraire sûr n'est disponible pour le moment. Demandez de l'aide à un agent.",
    ar: 'لا يوجد مسار آمن متاح الآن. يرجى طلب المساعدة من أحد المنظمين.',
    hi: 'अभी कोई सुरक्षित मार्ग उपलब्ध नहीं है। कृपया किसी कर्मचारी से मदद लें।',
    pt: 'Nenhuma rota segura está disponível agora. Peça ajuda a um funcionário.',
  },
  MISSION_REJECTED: {
    en: 'That mission could not be completed. Check its conditions and try again.',
    es: 'Esa misión no se pudo completar. Revisa sus condiciones e inténtalo de nuevo.',
    fr: "Cette mission n'a pas pu être validée. Vérifiez ses conditions et réessayez.",
    ar: 'تعذّر إكمال هذه المهمة. تحقق من شروطها وحاول مرة أخرى.',
    hi: 'यह मिशन पूरा नहीं हो सका। इसकी शर्तें जाँचें और फिर से प्रयास करें।',
    pt: 'Essa missão não pôde ser concluída. Verifique as condições e tente novamente.',
  },
  INTERNAL: {
    en: 'Something went wrong on our side. Please try again.',
    es: 'Algo salió mal de nuestro lado. Inténtalo de nuevo.',
    fr: 'Un problème est survenu de notre côté. Veuillez réessayer.',
    ar: 'حدث خطأ من جانبنا. يرجى المحاولة مرة أخرى.',
    hi: 'हमारी ओर से कुछ गलत हो गया। कृपया पुनः प्रयास करें।',
    pt: 'Algo deu errado do nosso lado. Tente novamente.',
  },
};

/** A typed application error: safe for users, diagnosable for operators. */
export interface AppError {
  readonly code: ErrorCode;
  /** Server-only context (never serialized to clients — enforced by API tests). */
  readonly diagnostics?: string;
}

/**
 * Create an AppError.
 *
 * @example
 * const e = appError('NOT_FOUND', 'venue id "xx" not in registry');
 * httpStatusFor(e.code); // 404
 */
export function appError(code: ErrorCode, diagnostics?: string): AppError {
  return diagnostics === undefined ? { code } : { code, diagnostics };
}

/**
 * HTTP status for an error code.
 *
 * @example
 * httpStatusFor('RATE_LIMITED'); // 429
 */
export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code];
}

/**
 * Localized safe message for an error code. Falls back to English for safety.
 *
 * @example
 * safeMessageFor('NOT_FOUND', 'es'); // Spanish copy, no internals leaked
 */
export function safeMessageFor(code: ErrorCode, language: LanguageCode = 'en'): string {
  return SAFE_MESSAGES[code][language] ?? SAFE_MESSAGES[code].en;
}

/** All error codes, exported so tests can assert exhaustiveness. */
export const ALL_ERROR_CODES: readonly ErrorCode[] = Object.keys(HTTP_STATUS) as ErrorCode[];

/** All languages a safe message exists for — kept in lockstep with i18n. */
export const ERROR_MESSAGE_LANGUAGES: readonly LanguageCode[] = SUPPORTED_LANGUAGES.map(
  (l) => l.code,
);
