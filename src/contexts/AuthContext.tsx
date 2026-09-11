import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Clear any Supabase session tokens left in localStorage.
 * Used to recover from stale/invalid JWTs (e.g. after a key rotation) that
 * would otherwise trap the user on a permanent 403 loop.
 */
function purgeSupabaseAuthStorage() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("sb-") || k.includes("supabase.auth"))) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

function isBadJwtError(err: unknown): boolean {
  const msg = getErrorMessage(err);
  return (
    msg.includes("bad_jwt") ||
    msg.includes("invalid claim") ||
    msg.includes("missing sub") ||
    msg.includes("jwt expired") ||
    msg.includes("invalid jwt")
  );
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.toLowerCase();
  if (typeof err === "string") return err.toLowerCase();
  if (typeof err === "object" && err !== null && "message" in err) {
    return String(err.message).toLowerCase();
  }
  return "";
}

function isRecoverableSessionError(err: unknown): boolean {
  const msg = getErrorMessage(err);
  return (
    isBadJwtError(err) ||
    msg.includes("failed to fetch") ||
    msg.includes("upstream request timeout") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("gateway timeout")
  );
}

async function clearBrokenSession() {
  purgeSupabaseAuthStorage();
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  purgeSupabaseAuthStorage();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // If a refresh cleared the session, wipe any stale token so we don't
      // keep re-hydrating a bad JWT on the next page load.
      if (event === "TOKEN_REFRESHED" && !session) {
        purgeSupabaseAuthStorage();
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Validate the session against the auth server. If it's a bad JWT
          // (key rotation, malformed token) sign out locally so the user can
          // reach /login instead of being stuck.
          const { error: userErr } = await supabase.auth.getUser();
          if (userErr && isRecoverableSessionError(userErr)) {
            await clearBrokenSession();
            setSession(null);
            setUser(null);
            setLoading(false);
            return;
          }
        }
        setSession(session);
        setUser(session?.user ?? null);
      } catch (e) {
        if (isRecoverableSessionError(e)) await clearBrokenSession();
        setSession(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    try {
      const firstAttempt = await supabase.auth.signInWithPassword({ email, password });
      if (!firstAttempt.error || !isRecoverableSessionError(firstAttempt.error)) {
        return { error: firstAttempt.error as Error | null };
      }

      await clearBrokenSession();
      const retry = await supabase.auth.signInWithPassword({ email, password });
      return { error: retry.error as Error | null };
    } catch (error) {
      if (!isRecoverableSessionError(error)) {
        return { error: error instanceof Error ? error : new Error("Unable to sign in") };
      }

      await clearBrokenSession();
      try {
        const retry = await supabase.auth.signInWithPassword({ email, password });
        return { error: retry.error as Error | null };
      } catch (retryError) {
        return {
          error: retryError instanceof Error
            ? retryError
            : new Error("Unable to reach the sign-in service. Please try again."),
        };
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
