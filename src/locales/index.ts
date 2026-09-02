import { en, Translations } from './en';
import { vi } from './vi';

export type Language = 'en' | 'vi';

export const translations: Record<Language, Translations> = {
  en,
  vi,
};

export { en, vi };
export type { Translations };
