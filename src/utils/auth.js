const AUTH_KEY = 'tourAuth'
const ADMIN_PASSWORD = 'lehalox@!73' // Измени на свой пароль

export const login = (password) => {
  if (password === ADMIN_PASSWORD) {
    const token = btoa(Date.now().toString())
    sessionStorage.setItem(AUTH_KEY, token)
    return true
  }
  return false
}

export const logout = () => {
  sessionStorage.removeItem(AUTH_KEY)
}

export const isAuthenticated = () => {
  return !!sessionStorage.getItem(AUTH_KEY)
}
