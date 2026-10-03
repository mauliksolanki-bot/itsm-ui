import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const AuthContext = createContext(null)

async function readResponse(response) {
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.message || 'Unable to complete your request. Please try again.')
  }
  return body
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch('/api/auth/me', { credentials: 'include' })
      .then(readResponse)
      .then((account) => { if (active) setUser(account) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [])

  async function login(credentials) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    const account = await readResponse(response)
    setUser(account)
    return account
  }

  async function logout() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      await readResponse(response)
    } finally {
      setUser(null)
    }
  }

  function completePasswordChange() {
    setUser((current) => current ? { ...current, mustChangePassword: false } : current)
  }

  const value = useMemo(() => ({ user, isLoading, login, logout, completePasswordChange }), [user, isLoading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
