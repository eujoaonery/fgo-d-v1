import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { fetchApiMe, reportAuthEvent, type ApiMeResponse } from '@/lib/api'
import { getApiAccessToken, setApiAccessToken } from '@/lib/apiAccessToken'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { isClientBffAuth } from '@/lib/authMode'
import { bffLogin, bffLogout, bffSession, fetchAuthConfig, type AuthConfigResponse } from '@/lib/authBff'
import {
  markSessionCleared,
  currentAuthEpoch,
  markSessionEstablished,
  markSessionExpired,
  onSessionExpired,
} from '@/lib/sessionExpiry'

const requireAuth = import.meta.env.VITE_REQUIRE_AUTH !== 'false'

type BffSession = { user: { id: string; email?: string | null } }

interface CcoAuthContextValue {
  loading: boolean
  profileLoading: boolean
  accessDenied: boolean
  session: Session | BffSession | null
  profile: ApiMeResponse | null
  requireAuth: boolean
  authConfigured: boolean
  authConfig: AuthConfigResponse | null
  signIn: (email: string, password: string, turnstileToken?: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const CcoAuthContext = createContext<CcoAuthContextValue | null>(null)

export function CcoAuthProvider({ children }: { children: React.ReactNode }) {
  const bff = isClientBffAuth()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | BffSession | null>(null)
  const [profile, setProfile] = useState<ApiMeResponse | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null)

  const authConfigured = bff ? true : !!supabaseBrowser

  const refreshProfile = useCallback(async () => {
    if (bff) {
      setProfileLoading(true)
      try {
        setProfile(await fetchApiMe())
        setAccessDenied(false)
      } catch (e) {
        setProfile(null)
        const msg = e instanceof Error ? e.message : ''
        setAccessDenied(
          msg.includes('organização') ||
            msg.includes('Autenticação') ||
            msg.includes('cidade') ||
            msg.includes('Cidade'),
        )
      } finally {
        setProfileLoading(false)
      }
      return
    }
    if (!getApiAccessToken()) {
      setProfile(null)
      setAccessDenied(false)
      return
    }
    setProfileLoading(true)
    try {
      setProfile(await fetchApiMe())
      setAccessDenied(false)
    } catch (e) {
      setProfile(null)
      const msg = e instanceof Error ? e.message : ''
      setAccessDenied(
        msg.includes('organização') ||
          msg.includes('Autenticação') ||
          msg.includes('cidade') ||
          msg.includes('Cidade'),
      )
    } finally {
      setProfileLoading(false)
    }
  }, [bff])

  useEffect(() => {
    void fetchAuthConfig().then(setAuthConfig)
  }, [])

  useEffect(() => {
    return onSessionExpired(() => {
      setSession(null)
      setProfile(null)
      setApiAccessToken(null)
    })
  }, [])

  useEffect(() => {
    if (bff) {
      const started = currentAuthEpoch()
      void bffSession().then((s) => {
        if (started !== currentAuthEpoch()) {
          setLoading(false)
          return
        }
        if (s) markSessionEstablished()
        setSession(s)
        setLoading(false)
      })
      return
    }
    if (!supabaseBrowser) {
      setApiAccessToken(null)
      setLoading(false)
      return
    }
    const started = currentAuthEpoch()
    void supabaseBrowser.auth.getSession().then(({ data }) => {
      if (started !== currentAuthEpoch()) {
        setLoading(false)
        return
      }
      if (data.session) markSessionEstablished()
      setSession(data.session)
      setApiAccessToken(data.session?.access_token ?? null)
      setLoading(false)
    })
    const sawSession = { current: false }
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((event, s) => {
      if (s) {
        sawSession.current = true
        markSessionEstablished()
      } else if (event === 'SIGNED_OUT' && sawSession.current) {
        sawSession.current = false
        markSessionExpired()
      }
      setSession(s)
      setApiAccessToken(s?.access_token ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [bff])

  useEffect(() => {
    if (bff) {
      if (!session) {
        setProfile(null)
        return
      }
      void refreshProfile()
      return
    }
    if (!(session as Session | null)?.access_token) {
      setProfile(null)
      return
    }
    void refreshProfile()
  }, [bff, session, refreshProfile])

  useEffect(() => {
    if (!bff || !session) return
    const id = window.setInterval(() => {
      const startedEpoch = currentAuthEpoch()
      void bffSession().then((s) => {
        if (!s && startedEpoch === currentAuthEpoch()) markSessionExpired()
      })
    }, 45_000)
    return () => window.clearInterval(id)
  }, [bff, session])

  const signIn = useCallback(
    async (email: string, password: string, turnstileToken?: string) => {
      if (bff) {
        await bffLogin(email, password, turnstileToken)
        markSessionEstablished()
        const s = await bffSession()
        setSession(s)
        await refreshProfile()
        void reportAuthEvent({ type: 'login', email: email.trim() })
        return
      }
      if (!supabaseBrowser) throw new Error('Autenticação não configurada neste ambiente')
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email, password })
      if (error) throw error
      markSessionEstablished()
      setSession(data.session)
      setApiAccessToken(data.session?.access_token ?? null)
      await refreshProfile()
      void reportAuthEvent({ type: 'login', email: email.trim() })
    },
    [bff, refreshProfile],
  )

  const signOut = useCallback(async () => {
    void reportAuthEvent({ type: 'logout' })
    markSessionCleared()
    if (bff) {
      await bffLogout()
      setSession(null)
      setProfile(null)
      setApiAccessToken(null)
      return
    }
    if (supabaseBrowser) await supabaseBrowser.auth.signOut()
    setSession(null)
    setProfile(null)
    setApiAccessToken(null)
  }, [bff])

  const value = useMemo(
    () => ({
      loading,
      profileLoading,
      accessDenied,
      session,
      profile,
      requireAuth,
      authConfigured,
      authConfig,
      signIn,
      signOut,
      refreshProfile,
    }),
    [loading, profileLoading, accessDenied, session, profile, authConfig, signIn, signOut, refreshProfile],
  )

  return <CcoAuthContext.Provider value={value}>{children}</CcoAuthContext.Provider>
}

export function useCcoAuth() {
  const ctx = useContext(CcoAuthContext)
  if (!ctx) throw new Error('useCcoAuth must be used within CcoAuthProvider')
  return ctx
}
