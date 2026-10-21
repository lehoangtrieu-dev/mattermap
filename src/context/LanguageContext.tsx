import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Language, translations, Translations } from '../locales';
import { useAuth } from './AuthContext';
import { saveUserLanguageToCloud, fetchUserLanguageFromCloud } from '../lib/firebase';

interface LanguageContextType {
  language: Language;
  t: Translations;
  setLanguage: (lang: Language) => Promise<void>;
  isLanguageModalOpen: boolean;
  setIsLanguageModalOpen: (open: boolean) => void;
  hasSelectedLanguage: boolean;
}

const STORAGE_KEY = 'mattermap_language';

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  t: translations.en,
  setLanguage: async () => {},
  isLanguageModalOpen: false,
  setIsLanguageModalOpen: () => {},
  hasSelectedLanguage: true,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();

  // Clean up legacy flag if present
  useEffect(() => {
    try {
      localStorage.removeItem('mattermap_language_selected');
    } catch {
      // ignore
    }
  }, []);

  // 1. Initialize language from localStorage or default to 'en'
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'vi' || saved === 'en') {
      return saved;
    }
    // Browser language detection (fallback if navigator matches vi)
    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('vi')) {
      return 'vi';
    }
    return 'en';
  });

  // 2. Track whether the user has previously selected their language preference
  const [hasSelectedLanguage, setHasSelectedLanguage] = useState<boolean>(true);

  // 3. Modal open state: appears every time the app is opened, unless user is signed in
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!authLoading) {
      const shouldOpen = !user;
      console.log(
        `[LanguageContext] Auth resolved (authLoading: false). Current user: ${
          user ? user.email : 'null (unauthenticated)'
        }. Setting isLanguageModalOpen = ${shouldOpen}`
      );
      setIsLanguageModalOpen(shouldOpen);
    }
  }, [authLoading, user]);

  // 4. Sync language from / to Firestore when user logs in
  useEffect(() => {
    let isMounted = true;
    const syncWithUserCloudProfile = async () => {
      if (!user) return;

      try {
        const cloudLanguage = await fetchUserLanguageFromCloud();
        if (!isMounted) return;

        if (cloudLanguage === 'vi' || cloudLanguage === 'en') {
          setLanguageState(cloudLanguage);
          localStorage.setItem(STORAGE_KEY, cloudLanguage);
          setHasSelectedLanguage(true);
          setIsLanguageModalOpen(false);
        } else {
          // Sync current local language up to user profile
          await saveUserLanguageToCloud(language);
        }
      } catch (error) {
        console.warn('Language cloud sync notice:', error);
      }
    };

    syncWithUserCloudProfile();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // 5. Update language with multi-layer persistence (State + localStorage + Firestore)
  const handleSetLanguage = useCallback(
    async (newLang: Language) => {
      setLanguageState(newLang);
      localStorage.setItem(STORAGE_KEY, newLang);
      setHasSelectedLanguage(true);
      setIsLanguageModalOpen(false);

      if (user) {
        try {
          await saveUserLanguageToCloud(newLang);
        } catch (err) {
          console.warn('Failed to sync language to Firestore:', err);
        }
      }
    },
    [user]
  );

  const t = translations[language] || translations.en;

  return (
    <LanguageContext.Provider
      value={{
        language,
        t,
        setLanguage: handleSetLanguage,
        isLanguageModalOpen,
        setIsLanguageModalOpen,
        hasSelectedLanguage,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
