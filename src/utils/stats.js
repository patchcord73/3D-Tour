const STATS_KEY = 'tourStats'

const safeLocalStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key)
    } catch (e) {
      console.warn('localStorage blocked:', e)
      return null
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch (e) {
      console.warn('localStorage blocked:', e)
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key)
    } catch (e) {
      console.warn('localStorage blocked:', e)
    }
  }
}

export const initStats = () => {
  const stats = safeLocalStorage.getItem(STATS_KEY)
  if (!stats) {
    safeLocalStorage.setItem(STATS_KEY, JSON.stringify({
      totalVisits: 0,
      locations: {},
      sessions: []
    }))
  }
}

export const trackVisit = () => {
  const stats = JSON.parse(safeLocalStorage.getItem(STATS_KEY) || '{}')
  stats.totalVisits = (stats.totalVisits || 0) + 1
  stats.sessions = stats.sessions || []
  stats.sessions.push({
    timestamp: new Date().toISOString(),
    duration: 0,
    startTime: Date.now()
  })
  safeLocalStorage.setItem(STATS_KEY, JSON.stringify(stats))
  return stats.sessions.length - 1
}

export const trackLocation = (building, floor, room = null) => {
  const stats = JSON.parse(safeLocalStorage.getItem(STATS_KEY) || '{}')
  stats.locations = stats.locations || {}

  const key = room ? `${building}-${floor}-${room}` : `${building}-${floor}`

  if (!stats.locations[key]) {
    stats.locations[key] = {
      building,
      floor,
      room,
      visits: 0,
      totalTime: 0,
      lastVisit: null
    }
  }

  stats.locations[key].visits++
  stats.locations[key].lastVisit = new Date().toISOString()

  safeLocalStorage.setItem(STATS_KEY, JSON.stringify(stats))
}

export const updateSessionDuration = (sessionIndex) => {
  const stats = JSON.parse(safeLocalStorage.getItem(STATS_KEY) || '{}')
  if (stats.sessions && stats.sessions[sessionIndex]) {
    const session = stats.sessions[sessionIndex]
    session.duration = Date.now() - session.startTime
    safeLocalStorage.setItem(STATS_KEY, JSON.stringify(stats))
  }
}

export const getStats = () => {
  return JSON.parse(safeLocalStorage.getItem(STATS_KEY) || '{}')
}

export const clearStats = () => {
  safeLocalStorage.removeItem(STATS_KEY)
  initStats()
}
