const DB_NAME = 'TourDB'
const DB_VERSION = 1
const STORE_NAME = 'panoramas'

let db = null

export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export const saveData = async (data) => {
  try {
    const response = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (response.ok) {
      window.dispatchEvent(new Event('tourDataUpdated'))
    }
  } catch (e) {
    console.error('Failed to save data:', e)
  }
}

export const loadData = async () => {
  try {
    const response = await fetch('/api/data')
    if (response.ok) {
      return await response.json()
    }
  } catch (e) {
    console.error('Failed to load data:', e)
  }
  return null
}
