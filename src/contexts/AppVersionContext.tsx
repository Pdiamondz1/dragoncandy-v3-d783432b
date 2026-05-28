import { createContext, useContext } from 'react';
import { useAppVersion } from '@/hooks/useAppVersion';

interface AppVersionContextValue {
  updateAvailable: boolean;
}

const AppVersionContext = createContext<AppVersionContextValue>({ updateAvailable: false });

export function AppVersionProvider({ children }: { children: React.ReactNode }) {
  const version = useAppVersion();
  return (
    <AppVersionContext.Provider value={version}>
      {children}
    </AppVersionContext.Provider>
  );
}

export function useAppVersionContext(): AppVersionContextValue {
  return useContext(AppVersionContext);
}
