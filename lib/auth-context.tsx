import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";

import { supabase, isSupabaseConfigured } from "./supabase";
import { clearSessionScopedClientState } from "./session-data-reset";

type ProfileRow = {
  id: string;
  full_name: string | null;
  base_currency_code: string;
  timezone: string;
};

export type AppProfile = {
  id: string;
  email: string;
  fullName: string;
  initials: string;
  baseCurrencyCode: string;
  timezone: string;
};

type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
};

type SaveProfileInput = {
  fullName: string;
  baseCurrencyCode: string;
  timezone: string;
};

type AuthContextValue = {
  isConfigured: boolean;
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  profile: AppProfile | null;
  /**
   * true si al arrancar la app `getSession()` ya devolvió sesión (usuario vuelve con sesión guardada).
   * false si arrancó sin sesión (p. ej. acaba de iniciar sesión con email/contraseña).
   * Lo usa BiometricLock para no hacer signOut tras un login nuevo cuando no hay timestamp de background.
   */
  hadSessionAtLaunchRef: MutableRefObject<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<{ needsEmailConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (input: SaveProfileInput) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getDefaultTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Lima";
}

function getUserMetadata(user: User) {
  return (user.user_metadata ?? {}) as { full_name?: string };
}

function buildProfile(row: ProfileRow, user: User): AppProfile {
  const metadata = getUserMetadata(user);
  const fullName =
    row.full_name?.trim() ||
    metadata.full_name ||
    user.email?.split("@")[0] ||
    "Usuario";
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");

  return {
    id: row.id,
    email: user.email ?? "",
    fullName,
    initials: initials || "DM",
    baseCurrencyCode: row.base_currency_code,
    timezone: row.timezone,
  };
}

function buildFallbackProfile(user: User): AppProfile {
  const metadata = getUserMetadata(user);
  const fullName =
    metadata.full_name || user.email?.split("@")[0] || "Usuario";
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");

  return {
    id: user.id,
    email: user.email ?? "",
    fullName,
    initials: initials || "DM",
    baseCurrencyCode: "PEN",
    timezone: getDefaultTimezone(),
  };
}

const AUTH_BOOT_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms = AUTH_BOOT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Tiempo de espera agotado.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function ensureProfile(user: User): Promise<AppProfile> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { data: existingProfile, error: fetchError } = await supabase
    .from("profiles")
    .select("id, full_name, base_currency_code, timezone")
    .eq("id", user.id)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existingProfile) {
    return buildProfile(existingProfile as ProfileRow, user);
  }

  const payload = {
    id: user.id,
    full_name: getUserMetadata(user).full_name ?? null,
    base_currency_code: "PEN",
    timezone: getDefaultTimezone(),
  };

  const { data: insertedProfile, error: insertError } = await supabase
    .from("profiles")
    .insert(payload)
    .select("id, full_name, base_currency_code, timezone")
    .single();

  if (insertError) throw insertError;

  return buildProfile(insertedProfile as ProfileRow, user);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const hasResolvedInitialSession = useRef(false);
  const hadSessionAtLaunchRef = useRef(false);
  /** Login/registro antes de que resuelva el primer `getSession()` (evita marcar "sesión al arranque" por carrera). */
  const authBeforeInitialGetSessionRef = useRef(false);
  const resumeSessionSyncInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function syncSession(
      nextSession: Session | null,
      options: { blockUi?: boolean } = {},
    ) {
      if (cancelled) return;
      if (options.blockUi) setIsLoading(true);

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setProfile(null);
        clearSessionScopedClientState();
        setIsLoading(false);
        return;
      }

      try {
        const nextProfile = await withTimeout(ensureProfile(nextSession.user));
        if (!cancelled) setProfile(nextProfile);
      } catch {
        if (!cancelled) setProfile(buildFallbackProfile(nextSession.user));
      } finally {
        if (!cancelled && options.blockUi) setIsLoading(false);
      }
    }

    async function reconcileSessionOnForeground() {
      if (!supabase || cancelled || resumeSessionSyncInFlightRef.current) return;
      resumeSessionSyncInFlightRef.current = true;
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), 5_000);
        if (cancelled) return;
        await syncSession(data.session, { blockUi: true });
      } catch {
        if (!cancelled) {
          clearSessionScopedClientState();
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsLoading(false);
        }
      } finally {
        resumeSessionSyncInFlightRef.current = false;
      }
    }

    if (!supabase) {
      setIsLoading(false);
      return () => { cancelled = true; };
    }

    void withTimeout(supabase.auth.getSession())
      .then(async ({ data }) => {
        if (cancelled) return;

        hasResolvedInitialSession.current = true;

        // Carrera típica en primer login: el usuario entra antes de que termine este getSession.
        // El resultado puede llegar como null y syncSession(null) borraría la sesión recién creada.
        let nextSession = data.session;
        if (!nextSession && authBeforeInitialGetSessionRef.current) {
          const { data: fresh } = await withTimeout(supabase!.auth.getSession());
          nextSession = fresh.session;
        }

        hadSessionAtLaunchRef.current = authBeforeInitialGetSessionRef.current
          ? false
          : Boolean(nextSession);

        await syncSession(nextSession, { blockUi: true });
        authBeforeInitialGetSessionRef.current = false;
      })
      .catch(() => {
        if (!cancelled) {
          hasResolvedInitialSession.current = true;
          authBeforeInitialGetSessionRef.current = false;
          setIsLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!hasResolvedInitialSession.current) return;
      void syncSession(nextSession);
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !hasResolvedInitialSession.current) return;
      void reconcileSessionOnForeground();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  async function signIn(email: string, password: string) {
    if (!supabase) throw new Error("Supabase no está configurado.");
    if (!hasResolvedInitialSession.current) {
      authBeforeInitialGetSessionRef.current = true;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setSession(data.session);
    setUser(data.user);
    // Cargar perfil aquí: si SIGNED_IN llegó antes de hasResolvedInitialSession, onAuthStateChange no hizo syncSession.
    if (data.session?.user) {
      try {
        const nextProfile = await withTimeout(ensureProfile(data.session.user));
        setProfile(nextProfile);
      } catch {
        setProfile(buildFallbackProfile(data.session.user));
      }
    }
  }

  async function signUp(input: SignUpInput) {
    if (!supabase) throw new Error("Supabase no está configurado.");
    if (!hasResolvedInitialSession.current) {
      authBeforeInitialGetSessionRef.current = true;
    }

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        // Deep link para confirmar email desde móvil
        emailRedirectTo: "darkmoney://login",
        data: { full_name: input.fullName },
      },
    });

    if (error) throw error;

    if (data.session && data.user) {
      setSession(data.session);
      setUser(data.user);
      try {
        const nextProfile = await withTimeout(ensureProfile(data.user));
        setProfile(nextProfile);
      } catch {
        setProfile(buildFallbackProfile(data.user));
      }
    }

    return { needsEmailConfirmation: !data.session };
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    clearSessionScopedClientState();
    setSession(null);
    setUser(null);
    setProfile(null);
  }

  async function resetPassword(email: string) {
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "darkmoney://reset-password",
    });
    if (error) throw error;
  }

  async function updatePassword(password: string) {
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    if (data.user) setUser(data.user);
  }

  async function saveProfile(input: SaveProfileInput) {
    if (!supabase || !user) throw new Error("No hay sesión activa.");

    const normalizedFullName = input.fullName.trim();
    const normalizedBaseCurrencyCode = input.baseCurrencyCode.trim().toUpperCase();
    const normalizedTimezone = input.timezone.trim();

    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: normalizedFullName,
        base_currency_code: normalizedBaseCurrencyCode,
        timezone: normalizedTimezone,
      })
      .select("id, full_name, base_currency_code, timezone")
      .single();

    if (error) throw error;

    // Sync base currency to personal workspaces
    const { data: defaultMemberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("is_default_workspace", true);

    const defaultWorkspaceIds = Array.from(
      new Set((defaultMemberships ?? []).map((m) => m.workspace_id as number)),
    );

    if (defaultWorkspaceIds.length > 0) {
      await supabase
        .from("workspaces")
        .update({ base_currency_code: normalizedBaseCurrencyCode })
        .in("id", defaultWorkspaceIds)
        .eq("owner_user_id", user.id)
        .eq("kind", "personal");
    }

    setProfile(buildProfile(data as ProfileRow, user));
  }

  const value: AuthContextValue = {
    isConfigured: isSupabaseConfigured,
    isLoading,
    session,
    user,
    profile,
    hadSessionAtLaunchRef,
    signIn,
    signUp,
    resetPassword,
    updatePassword,
    signOut,
    saveProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider.");
  return context;
}
