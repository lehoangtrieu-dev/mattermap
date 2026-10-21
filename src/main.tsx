import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.tsx';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { LoadingProvider } from './context/LoadingContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <LanguageProvider>
        <LoadingProvider>
          <App />
        </LoadingProvider>
      </LanguageProvider>
    </AuthProvider>
  </StrictMode>,
);


