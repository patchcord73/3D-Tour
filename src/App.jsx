import { useState, useEffect, useRef, useCallback } from 'react'
import Viewer from './components/Viewer'
import Navigation from './components/Navigation'
import Onboarding from './components/Onboarding'
import { initDB, loadData } from './utils/db'
import { loadSettings, applyTheme } from './utils/settings'
import { initStats, trackVisit, trackLocation, updateSessionDuration } from './utils/stats'

function App() {
  const [buildings, setBuildings] = useState([])
  const [currentBuilding, setCurrentBuilding] = useState(1)
  const [currentFloor, setCurrentFloor] = useState(1)
  const [currentRoom, setCurrentRoom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState(null)
  const [autoTourActive, setAutoTourActive] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const sessionIndexRef = useRef(null)
  const autoTourIndexRef = useRef(0)

  useEffect(() => {
    const loadAppData = async () => {
      await initDB()
      const data = await loadData()

      if (!data || !Array.isArray(data) || data.length === 0) {
        const defaultData = Array.from({ length: 2 }, (_, i) => ({
          id: i + 1,
          name: `Корпус ${i + 1}`,
          hidden: false,
          floors: Array.from({ length: 4 }, (_, j) => ({
            id: j + 1,
            name: `Этаж ${j + 1}`,
            panorama: '',
            hidden: false,
            rooms: [],
            infoSpots: []
          }))
        }))
        setBuildings(defaultData)
      } else {
        // Добавляем infoSpots и hidden если их нет
        const migratedData = data.map(b => ({
          ...b,
          hidden: b.hidden || false,
          floors: (b.floors || []).map(f => ({
            ...f,
            hidden: f.hidden || false,
            infoSpots: f.infoSpots || [],
            rooms: (f.rooms || []).map(r => ({
              ...r,
              hidden: r.hidden || false,
              infoSpots: r.infoSpots || []
            }))
          }))
        }))
        setBuildings(migratedData)
      }

      const appSettings = await loadSettings()
      setSettings(appSettings)
      applyTheme(appSettings)

      initStats()
      sessionIndexRef.current = trackVisit()

      if (!sessionStorage.getItem('tourOnboardingSeen')) {
        setShowOnboarding(true)
      }

      setLoading(false)
    }

    loadAppData()

    const handleDataUpdate = async () => {
      const data = await loadData()
      if (data) setBuildings(data)
    }

    const handleSettingsUpdate = async () => {
      const appSettings = await loadSettings()
      setSettings(appSettings)
      applyTheme(appSettings)
    }

    window.addEventListener('tourDataUpdated', handleDataUpdate)
    window.addEventListener('tourSettingsUpdated', handleSettingsUpdate)

    // Обновление длительности сессии каждые 10 секунд
    const statsInterval = setInterval(() => {
      if (sessionIndexRef.current !== null) {
        updateSessionDuration(sessionIndexRef.current)
      }
    }, 10000)

    return () => {
      window.removeEventListener('tourDataUpdated', handleDataUpdate)
      window.removeEventListener('tourSettingsUpdated', handleSettingsUpdate)
      clearInterval(statsInterval)
      if (sessionIndexRef.current !== null) {
        updateSessionDuration(sessionIndexRef.current)
      }
    }
  }, [])

  const getAllLocations = useCallback(() => {
    const locations = []
    buildings.forEach(building => {
      building.floors.forEach(floor => {
        if (floor.panorama) {
          locations.push({ building: building.id, floor: floor.id, room: null })
        }
        floor.rooms?.forEach(room => {
          if (room.panorama) {
            locations.push({ building: building.id, floor: floor.id, room: room.id })
          }
        })
      })
    })
    return locations
  }, [buildings])

  const handleHotspotClick = useCallback((hotspot) => {
    if (hotspot.targetBuilding) setCurrentBuilding(hotspot.targetBuilding)
    if (hotspot.targetFloor) setCurrentFloor(hotspot.targetFloor)
    if (hotspot.targetRoom) {
      setCurrentRoom(hotspot.targetRoom)
    } else {
      setCurrentRoom(null)
    }
  }, [])

  const handleRotationComplete = useCallback(() => {
    if (!autoTourActive) return
    const locations = getAllLocations()
    if (locations.length === 0) return
    autoTourIndexRef.current = (autoTourIndexRef.current + 1) % locations.length
    const loc = locations[autoTourIndexRef.current]
    setCurrentBuilding(loc.building)
    setCurrentFloor(loc.floor)
    setCurrentRoom(loc.room)
  }, [autoTourActive, getAllLocations])

  const startAutoTour = () => {
    if (autoTourActive) {
      setAutoTourActive(false)
      return
    }
    const locations = getAllLocations()
    if (locations.length === 0) return
    const currentIdx = locations.findIndex(
      loc => loc.building === currentBuilding && loc.floor === currentFloor && loc.room === currentRoom
    )
    autoTourIndexRef.current = currentIdx >= 0 ? currentIdx : 0
    setAutoTourActive(true)
  }

  useEffect(() => {
    trackLocation(currentBuilding, currentFloor, currentRoom)
  }, [currentBuilding, currentFloor, currentRoom])

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>Загрузка...</div>
  }

  const currentFloorData = buildings.find(b => b.id === currentBuilding)?.floors.find(f => f.id === currentFloor)
  const currentPanorama = currentRoom
    ? currentFloorData?.rooms.find(r => r.id === currentRoom)?.panorama
    : currentFloorData?.panorama

  const currentHotspots = currentRoom
    ? currentFloorData?.rooms.find(r => r.id === currentRoom)?.hotspots || []
    : currentFloorData?.hotspots || []

  const currentInfoSpots = currentRoom
    ? currentFloorData?.rooms.find(r => r.id === currentRoom)?.infoSpots || []
    : currentFloorData?.infoSpots || []

  const handleCloseOnboarding = () => {
    sessionStorage.setItem('tourOnboardingSeen', '1')
    setShowOnboarding(false)
  }

  const currentRoomName = currentRoom
    ? currentFloorData?.rooms.find(r => r.id === currentRoom)?.name
    : 'Коридор'

  const locationLabel = [
    buildings.find(b => b.id === currentBuilding)?.name,
    currentFloorData?.name,
    currentRoomName
  ].filter(Boolean).join(' → ')

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden' }}>
      {showOnboarding && <Onboarding onClose={handleCloseOnboarding} />}

      <Navigation
        buildings={buildings}
        currentBuilding={currentBuilding}
        currentFloor={currentFloor}
        currentRoom={currentRoom}
        onBuildingChange={setCurrentBuilding}
        onFloorChange={setCurrentFloor}
        onRoomChange={setCurrentRoom}
        settings={settings}
      />
      <div style={{ flex: 1, position: 'relative' }}>
        <div className="location-label">{locationLabel}</div>
        <div className="auto-tour-controls">
          <button
            className={`auto-tour-btn ${autoTourActive ? 'active' : ''}`}
            onClick={startAutoTour}
          >
            {autoTourActive ? '⏸ Остановить автотур' : '▶ Запустить автотур'}
          </button>
          <button
            className="auto-tour-btn help-btn"
            onClick={() => setShowOnboarding(true)}
            title="Инструкция"
          >
            ? Инструкция
          </button>
        </div>
        <Viewer
          panorama={currentPanorama}
          hotspots={currentHotspots}
          infoSpots={currentInfoSpots}
          onHotspotClick={handleHotspotClick}
          autoRotate={autoTourActive}
          autoRotateSpeed={settings?.autoTourSpeed ?? 2}
          onRotationComplete={handleRotationComplete}
        />
      </div>
    </div>
  )
}

export default App
