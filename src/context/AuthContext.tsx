import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AppProfile } from '../types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: AppProfile | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type SupabaseAuthClientWithRemoveSession = {
  _removeSession?: () => Promise<void>;
};

function getSupabaseAuthStorageKey() {
  try {
    const url = new URL(import.meta.env.VITE_SUPABASE_URL || 'https://invalid.supabase.co');
    return `sb-${url.hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'supabase.auth.token';
  }
}

async function clearLocalSupabaseSession() {
  const authClient = supabase.auth as unknown as SupabaseAuthClientWithRemoveSession;

  if (typeof authClient._removeSession === 'function') {
    try {
      await authClient._removeSession();
      return;
    } catch {
      // Fall back to direct storage cleanup if the internal helper is unavailable.
    }
  }

  if (typeof window === 'undefined') return;

  const storageKey = getSupabaseAuthStorageKey();
  const storageKeys = [storageKey, `${storageKey}-code-verifier`, `${storageKey}-user`];

  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of storageKeys) {
      try {
        storage.removeItem(key);
      } catch {
        // Ignore storage cleanup issues and continue clearing the rest.
      }
    }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileLoadedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let requestId = 0;

    function applySession(nextSession: Session | null) {
      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setUser(prev => {
        if (!prev || !nextUser) return nextUser;
        if (prev.id === nextUser.id && prev.email === nextUser.email) return prev;
        return nextUser;
      });
    }

    async function loadProfile(
      nextSession: Session | null,
      options: {
        blockUi?: boolean;
        force?: boolean;
      } = {}
    ) {
      const { blockUi = false, force = false } = options;
      const currentRequestId = ++requestId;
      const nextUserId = nextSession?.user?.id ?? null;

      applySession(nextSession);

      if (!nextUserId) {
        profileLoadedUserIdRef.current = null;
        if (!mounted || currentRequestId !== requestId) return;
        setProfile(null);
        setLoading(false);
        return;
      }

      if (!force && profileLoadedUserIdRef.current === nextUserId) {
        if (blockUi) setLoading(false);
        return;
      }

      if (blockUi) setLoading(true);
      try {
        const { data, error } = await supabase
          .from('app_profiles')
          .select('*')
          .eq('user_id', nextUserId)
          .maybeSingle();

        if (!mounted || currentRequestId !== requestId) return;

        if (error) {
          if (profileLoadedUserIdRef.current !== nextUserId) {
            profileLoadedUserIdRef.current = null;
            setProfile(null);
          }
          return;
        }

        const nextProfile = (data as AppProfile | null) || null;
        profileLoadedUserIdRef.current = nextUserId;
        setProfile(nextProfile);

        if (nextProfile && !nextProfile.is_active) {
          await clearLocalSupabaseSession();
          applySession(null);
          profileLoadedUserIdRef.current = null;
          setProfile(null);
          return;
        }
      } catch {
        if (!mounted || currentRequestId !== requestId) return;
        if (profileLoadedUserIdRef.current !== nextUserId) {
          profileLoadedUserIdRef.current = null;
          setProfile(null);
        }
      } finally {
        if (mounted && currentRequestId === requestId && blockUi) {
          setLoading(false);
        }
      }
    }

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          applySession(null);
          profileLoadedUserIdRef.current = null;
          setProfile(null);
          return;
        }

        await loadProfile(data.session, { blockUi: true, force: true });
      } catch {
        if (!mounted) return;
        applySession(null);
        profileLoadedUserIdRef.current = null;
        setProfile(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user?.id ?? null;
      const shouldForceProfileReload =
        event === 'USER_UPDATED' ||
        (nextUserId !== null && nextUserId !== profileLoadedUserIdRef.current);

      void loadProfile(nextSession, { force: shouldForceProfileReload });
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    await clearLocalSupabaseSession();
    profileLoadedUserIdRef.current = null;
    setSession(null);
    setUser(null);
    setProfile(null);
    setLoading(false);
  }

  async function refreshProfile() {
    if (!session?.user) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('app_profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!error) {
      profileLoadedUserIdRef.current = session.user.id;
      setProfile((data as AppProfile | null) || null);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isAdmin: profile?.role === 'admin',
        loading,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
