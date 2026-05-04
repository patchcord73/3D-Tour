const defaultSettings = {
  logo: '',
  title: '3D Тур',
  primaryColor: '#667eea',
  secondaryColor: '#764ba2',
  backgroundColor: '#1e3c72',
  textColor: '#ffffff',
  accentColor: '#4a9eff',
  autoTourSpeed: 2
}

export const saveSettings = async (settings) => {
  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    })
    if (response.ok) {
      window.dispatchEvent(new Event('tourSettingsUpdated'))
    }
  } catch (e) {
    console.error('Failed to save settings:', e)
  }
}

export const loadSettings = async () => {
  try {
    const response = await fetch('/api/settings')
    if (response.ok) {
      return await response.json()
    }
  } catch (e) {
    console.error('Failed to load settings:', e)
  }
  return defaultSettings
}

export const applyTheme = (settings) => {
  document.documentElement.style.setProperty('--primary-color', settings.primaryColor)
  document.documentElement.style.setProperty('--secondary-color', settings.secondaryColor)
  document.documentElement.style.setProperty('--background-color', settings.backgroundColor)
  document.documentElement.style.setProperty('--text-color', settings.textColor)
  document.documentElement.style.setProperty('--accent-color', settings.accentColor)
}
