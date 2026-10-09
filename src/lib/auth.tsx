import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { backend } from './backend';
import type { Profile } from './types';

const AuthContext = createContext<{ profile: Profile | null; loading: boolean }>({ profile: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    backend.getProfile().then((p) => {
      setProfile(p);
      setLoading(false);
    });
    return backend.onAuthChange(setProfile);
  }, []);

  return <AuthContext.Provider value={{ profile, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
