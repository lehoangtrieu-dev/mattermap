import React, { createContext, useContext, useState, useCallback } from 'react';

export interface LoadingState {
  isLoading: boolean;
  title?: string;
  message?: string;
  step?: number;
  totalSteps?: number;
}

interface LoadingContextType {
  loadingState: LoadingState;
  showLoading: (title?: string, message?: string, step?: number, totalSteps?: number) => void;
  updateLoadingMessage: (message: string, title?: string, step?: number) => void;
  hideLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType>({
  loadingState: { isLoading: false },
  showLoading: () => {},
  updateLoadingMessage: () => {},
  hideLoading: () => {},
});

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    title: '',
    message: '',
  });

  const showLoading = useCallback(
    (title: string = 'Loading...', message: string = '', step?: number, totalSteps?: number) => {
      setLoadingState({
        isLoading: true,
        title,
        message,
        step,
        totalSteps,
      });
    },
    []
  );

  const updateLoadingMessage = useCallback((message: string, title?: string, step?: number) => {
    setLoadingState((prev) => ({
      ...prev,
      isLoading: true,
      message,
      ...(title ? { title } : {}),
      ...(step !== undefined ? { step } : {}),
    }));
  }, []);

  const hideLoading = useCallback(() => {
    setLoadingState({
      isLoading: false,
      title: '',
      message: '',
    });
  }, []);

  return (
    <LoadingContext.Provider
      value={{
        loadingState,
        showLoading,
        updateLoadingMessage,
        hideLoading,
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => useContext(LoadingContext);
