import { useState, useEffect, useRef } from 'react'
import './Admin.css'
import { initDB, loadData, saveData } from './utils/db'
import { isAuthenticated, logout } from './utils/auth'
import { loadSettings, saveSettings, applyTheme } from './utils/settings'
import { getStats, clearStats } from './utils/stats'
import Login from './components/Login'

function Admin() {
  const [authenticated, setAuthenticated] = useState(false)
  const [buildings, setBuildings] = useState([])
  const [selectedBuilding, setSelectedBuilding] = useState(1)
  const [selectedFloor, setSelectedFloor] = useState(1)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [tempPanorama, setTempPanorama] = useState(null)
  const [newRoomName, setNewRoomName] = useState('')
  const [loading, setLoading] = useState(true)
  const [hotspotMode, setHotspotMode] = useState(false)
  const [activeTab, setActiveTab] = useState('panoramas')
  const [settings, setSettings] = useState(null)
  const [infoSpotMode, setInfoSpotMode] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeResult, setOptimizeResult] = useState(null)
  const viewerRef = useRef(null)
  const pannellumRef = useRef(null)

  useEffect(() => {
    setAuthenticated(isAuthenticated())
  }, [])

  useEffect(() => {
    if (!authenticated) return

    const loadAdminData = async () => {
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
            hotspots: [],
            infoSpots: []
          }))
        }))
        await saveData(defaultData)
        setBuildings(defaultData)
      } else {
        // Добавляем hotspots, infoSpots и hidden если их нет
        const migratedData = data.map(b => ({
          ...b,
          hidden: b.hidden || false,
          floors: (b.floors || []).map(f => ({
            ...f,
            hidden: f.hidden || false,
            hotspots: f.hotspots || [],
            infoSpots: f.infoSpots || [],
            rooms: (f.rooms || []).map(r => ({
              ...r,
              hidden: r.hidden || false,
              hotspots: r.hotspots || [],
              infoSpots: r.infoSpots || []
            }))
          }))
        }))
        setBuildings(migratedData)
      }

      const appSettings = await loadSettings()
      setSettings(appSettings)
      applyTheme(appSettings)

      setLoading(false)
    }

    loadAdminData()
  }, [authenticated])

  useEffect(() => {
    // Сбрасываем временную панораму при переключении локации
    setTempPanorama(null)

    const currentFloor = buildings.find(b => b.id === selectedBuilding)?.floors.find(f => f.id === selectedFloor)
    const currentPanorama = selectedRoom
      ? currentFloor?.rooms.find(r => r.id === selectedRoom)?.panorama
      : currentFloor?.panorama

    if (currentPanorama && viewerRef.current) {
      loadPannellum(currentPanorama)
    }
  }, [selectedBuilding, selectedFloor, selectedRoom, buildings, hotspotMode, infoSpotMode])

  useEffect(() => {
    if (tempPanorama && viewerRef.current) {
      loadPannellum(tempPanorama)
    }
  }, [tempPanorama, hotspotMode, infoSpotMode])

  const loadPannellum = (panorama) => {
    if (pannellumRef.current) {
      pannellumRef.current.destroy()
    }

    if (!window.pannellum) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = '/pannellum.css'
      document.head.appendChild(link)

      const script = document.createElement('script')
      script.src = '/pannellum.js'
      script.async = true
      document.body.appendChild(script)

      script.onload = () => {
        initPannellum(panorama)
      }
    } else {
      initPannellum(panorama)
    }
  }

  const initPannellum = (panorama) => {
    if (window.pannellum && viewerRef.current) {
      const currentFloor = buildings.find(b => b.id === selectedBuilding)?.floors.find(f => f.id === selectedFloor)
      const hotspots = selectedRoom
        ? currentFloor?.rooms.find(r => r.id === selectedRoom)?.hotspots || []
        : currentFloor?.hotspots || []

      const infoSpots = selectedRoom
        ? currentFloor?.rooms.find(r => r.id === selectedRoom)?.infoSpots || []
        : currentFloor?.infoSpots || []

      const allHotspots = [
        ...hotspots.map(hs => ({
          pitch: hs.pitch,
          yaw: hs.yaw,
          type: 'info',
          text: hs.text,
          clickHandlerFunc: hotspotMode ? () => handleDeleteHotspot(hs.id) : undefined
        })),
        ...infoSpots.map(info => ({
          pitch: info.pitch,
          yaw: info.yaw,
          type: 'info',
          text: info.text,
          clickHandlerFunc: infoSpotMode ? () => handleDeleteInfoSpot(info.id) : undefined
        }))
      ]

      pannellumRef.current = window.pannellum.viewer(viewerRef.current, {
        type: 'equirectangular',
        panorama: panorama,
        autoLoad: true,
        showControls: true,
        hotSpots: allHotspots
      })

      if (hotspotMode) {
        pannellumRef.current.on('mousedown', handlePanoramaClick)
      }

      if (infoSpotMode) {
        pannellumRef.current.on('mousedown', handleInfoSpotClick)
      }
    }
  }

  const handlePanoramaClick = (event) => {
    if (!hotspotMode) return

    const coords = pannellumRef.current.mouseEventToCoords(event)

    // Создаем модальное окно для выбора локации
    const modal = document.createElement('div')
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `

    const content = document.createElement('div')
    content.style.cssText = `
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      padding: 30px;
      border-radius: 15px;
      min-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    `

    content.innerHTML = `
      <h3 style="margin-bottom: 20px; color: #fff;">Выберите локацию перехода</h3>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 8px; color: rgba(255,255,255,0.9);">Корпус:</label>
        <select id="hotspot-building" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; color: #fff; font-size: 14px;">
          ${buildings.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 8px; color: rgba(255,255,255,0.9);">Этаж:</label>
        <select id="hotspot-floor" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; color: #fff; font-size: 14px;">
          ${buildings[0].floors.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; color: rgba(255,255,255,0.9);">Кабинет (опционально):</label>
        <select id="hotspot-room" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; color: #fff; font-size: 14px;">
          <option value="">Коридор</option>
        </select>
      </div>
      <div style="display: flex; gap: 10px;">
        <button id="hotspot-save" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 8px; color: #fff; font-weight: 600; cursor: pointer;">Сохранить</button>
        <button id="hotspot-cancel" style="flex: 1; padding: 12px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; color: #fff; font-weight: 600; cursor: pointer;">Отмена</button>
      </div>
    `

    modal.appendChild(content)
    document.body.appendChild(modal)

    const buildingSelect = document.getElementById('hotspot-building')
    const floorSelect = document.getElementById('hotspot-floor')
    const roomSelect = document.getElementById('hotspot-room')

    // Обновление списка этажей при смене корпуса
    buildingSelect.addEventListener('change', () => {
      const selectedBuildingId = Number(buildingSelect.value)
      const building = buildings.find(b => b.id === selectedBuildingId)
      floorSelect.innerHTML = building.floors.map(f => `<option value="${f.id}">${f.name}</option>`).join('')
      updateRoomsList()
    })

    // Обновление списка кабинетов при смене этажа
    floorSelect.addEventListener('change', updateRoomsList)

    function updateRoomsList() {
      const selectedBuildingId = Number(buildingSelect.value)
      const selectedFloorId = Number(floorSelect.value)
      const building = buildings.find(b => b.id === selectedBuildingId)
      const floor = building?.floors.find(f => f.id === selectedFloorId)

      roomSelect.innerHTML = '<option value="">Коридор</option>' +
        (floor?.rooms || []).map(r => `<option value="${r.id}">${r.name}</option>`).join('')
    }

    updateRoomsList()

    document.getElementById('hotspot-save').addEventListener('click', async () => {
      const targetBuilding = Number(buildingSelect.value)
      const targetFloor = Number(floorSelect.value)
      const targetRoom = roomSelect.value ? Number(roomSelect.value) : null

      const buildingName = buildings.find(b => b.id === targetBuilding)?.name
      const floorName = buildings.find(b => b.id === targetBuilding)?.floors.find(f => f.id === targetFloor)?.name
      const roomName = targetRoom ? buildings.find(b => b.id === targetBuilding)?.floors.find(f => f.id === targetFloor)?.rooms.find(r => r.id === targetRoom)?.name : null

      const text = roomName ? `${buildingName}, ${floorName}, ${roomName}` : `${buildingName}, ${floorName}`

      const newHotspot = {
        id: Date.now(),
        pitch: coords[0],
        yaw: coords[1],
        text: text,
        targetBuilding,
        targetFloor,
        targetRoom
      }

      const updated = buildings.map(b => {
        if (b.id === selectedBuilding) {
          return {
            ...b,
            floors: b.floors.map(f => {
              if (f.id === selectedFloor) {
                if (selectedRoom) {
                  return {
                    ...f,
                    rooms: f.rooms.map(r =>
                      r.id === selectedRoom ? { ...r, hotspots: [...(r.hotspots || []), newHotspot] } : r
                    )
                  }
                } else {
                  return { ...f, hotspots: [...(f.hotspots || []), newHotspot] }
                }
              }
              return f
            })
          }
        }
        return b
      })

      setBuildings(updated)
      await saveData(updated)
      window.dispatchEvent(new Event('tourDataUpdated'))

      document.body.removeChild(modal)

      // Перезагружаем viewer
      const currentPanorama = tempPanorama || (selectedRoom
        ? updated.find(b => b.id === selectedBuilding)?.floors.find(f => f.id === selectedFloor)?.rooms.find(r => r.id === selectedRoom)?.panorama
        : updated.find(b => b.id === selectedBuilding)?.floors.find(f => f.id === selectedFloor)?.panorama)

      if (currentPanorama) {
        loadPannellum(currentPanorama)
      }
    })

    document.getElementById('hotspot-cancel').addEventListener('click', () => {
      document.body.removeChild(modal)
    })
  }

  const handleDeleteHotspot = async (hotspotId) => {
    if (!confirm('Удалить эту точку перехода?')) return

    const updated = buildings.map(b => {
      if (b.id === selectedBuilding) {
        return {
          ...b,
          floors: b.floors.map(f => {
            if (f.id === selectedFloor) {
              if (selectedRoom) {
                return {
                  ...f,
                  rooms: f.rooms.map(r =>
                    r.id === selectedRoom ? { ...r, hotspots: (r.hotspots || []).filter(hs => hs.id !== hotspotId) } : r
                  )
                }
              } else {
                return { ...f, hotspots: (f.hotspots || []).filter(hs => hs.id !== hotspotId) }
              }
            }
            return f
          })
        }
      }
      return b
    })

    setBuildings(updated)
    await saveData(updated)

    const currentPanorama = tempPanorama || (selectedRoom
      ? updated.find(b => b.id === selectedBuilding)?.floors.find(f => f.id === selectedFloor)?.rooms.find(r => r.id === selectedRoom)?.panorama
      : updated.find(b => b.id === selectedBuilding)?.floors.find(f => f.id === selectedFloor)?.panorama)

    if (currentPanorama) {
      loadPannellum(currentPanorama)
    }
  }

  const handleInfoSpotClick = async (event) => {
    if (!infoSpotMode) return

    const coords = pannellumRef.current.mouseEventToCoords(event)
    const text = prompt('Введите текст информационной метки:')
    const url = prompt('Введите URL (опционально, оставьте пустым если не нужно):')

    if (!text) return

    const newInfoSpot = {
      id: Date.now(),
      pitch: coords[0],
      yaw: coords[1],
      text: text,
      url: url || null
    }

    const updated = buildings.map(b => {
      if (b.id === selectedBuilding) {
        return {
          ...b,
          floors: b.floors.map(f => {
            if (f.id === selectedFloor) {
              if (selectedRoom) {
                return {
                  ...f,
                  rooms: f.rooms.map(r =>
                    r.id === selectedRoom ? { ...r, infoSpots: [...(r.infoSpots || []), newInfoSpot] } : r
                  )
                }
              } else {
                return { ...f, infoSpots: [...(f.infoSpots || []), newInfoSpot] }
              }
            }
            return f
          })
        }
      }
      return b
    })

    setBuildings(updated)
    await saveData(updated)
    window.dispatchEvent(new Event('tourDataUpdated'))

    const currentPanorama = tempPanorama || (selectedRoom
      ? updated.find(b => b.id === selectedBuilding)?.floors.find(f => f.id === selectedFloor)?.rooms.find(r => r.id === selectedRoom)?.panorama
      : updated.find(b => b.id === selectedBuilding)?.floors.find(f => f.id === selectedFloor)?.panorama)

    if (currentPanorama) {
      loadPannellum(currentPanorama)
    }
  }

  const handleDeleteInfoSpot = async (infoSpotId) => {
    if (!confirm('Удалить эту информационную метку?')) return

    const updated = buildings.map(b => {
      if (b.id === selectedBuilding) {
        return {
          ...b,
          floors: b.floors.map(f => {
            if (f.id === selectedFloor) {
              if (selectedRoom) {
                return {
                  ...f,
                  rooms: f.rooms.map(r =>
                    r.id === selectedRoom ? { ...r, infoSpots: (r.infoSpots || []).filter(info => info.id !== infoSpotId) } : r
                  )
                }
              } else {
                return { ...f, infoSpots: (f.infoSpots || []).filter(info => info.id !== infoSpotId) }
              }
            }
            return f
          })
        }
      }
      return b
    })

    setBuildings(updated)
    await saveData(updated)
    window.dispatchEvent(new Event('tourDataUpdated'))

    const currentPanorama = tempPanorama || (selectedRoom
      ? updated.find(b => b.id === selectedBuilding)?.floors.find(f => f.id === selectedFloor)?.rooms.find(r => r.id === selectedRoom)?.panorama
      : updated.find(b => b.id === selectedBuilding)?.floors.find(f => f.id === selectedFloor)?.panorama)

    if (currentPanorama) {
      loadPannellum(currentPanorama)
    }
  }

  const handlePanoramaUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      setTempPanorama(event.target.result)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!tempPanorama) {
      alert('Сначала загрузите изображение')
      return
    }

    const currentLocation = selectedRoom
      ? `кабинет "${currentFloorData?.rooms.find(r => r.id === selectedRoom)?.name}"`
      : `коридор этажа "${currentFloorData?.name}"`

    if (!confirm(`Сохранить панораму для локации: ${currentLocation}?`)) {
      return
    }

    // Generate filename
    const filename = selectedRoom
      ? `building${selectedBuilding}_floor${selectedFloor}_room${selectedRoom}.jpg`
      : `building${selectedBuilding}_floor${selectedFloor}.jpg`

    // Upload file to server
    try {
      const base64Data = tempPanorama.split(',')[1]
      const response = await fetch('/api/upload-panorama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, data: base64Data })
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const { path: panoramaPath } = await response.json()

      const updated = buildings.map(b => {
        if (b.id === selectedBuilding) {
          return {
            ...b,
            floors: b.floors.map(f => {
              if (f.id === selectedFloor) {
                if (selectedRoom) {
                  return {
                    ...f,
                    rooms: f.rooms.map(r =>
                      r.id === selectedRoom ? { ...r, panorama: panoramaPath } : r
                    )
                  }
                } else {
                  return { ...f, panorama: panoramaPath }
                }
              }
              return f
            })
          }
        }
        return b
      })
      setBuildings(updated)
      await saveData(updated)
      window.dispatchEvent(new Event('tourDataUpdated'))
      setTempPanorama(null)
      alert('Панорама успешно сохранена!')
    } catch (error) {
      console.error('Error saving panorama:', error)
      alert('Ошибка при сохранении панорамы')
    }
  }

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) {
      alert('Введите название кабинета')
      return
    }

    const updated = buildings.map(b => {
      if (b.id === selectedBuilding) {
        return {
          ...b,
          floors: b.floors.map(f => {
            if (f.id === selectedFloor) {
              const newId = f.rooms.length > 0 ? Math.max(...f.rooms.map(r => r.id)) + 1 : 1
              return {
                ...f,
                rooms: [...f.rooms, { id: newId, name: newRoomName, panorama: '', hidden: false }]
              }
            }
            return f
          })
        }
      }
      return b
    })
    setBuildings(updated)
    await saveData(updated)
    window.dispatchEvent(new Event('tourDataUpdated'))
    setNewRoomName('')
    alert('Кабинет добавлен!')
  }

  const handleToggleBuildingVisibility = async (buildingId) => {
    const updated = buildings.map(b =>
      b.id === buildingId ? { ...b, hidden: !b.hidden } : b
    )
    setBuildings(updated)
    await saveData(updated)
    window.dispatchEvent(new Event('tourDataUpdated'))
  }

  const handleToggleFloorVisibility = async (floorId) => {
    const updated = buildings.map(b => {
      if (b.id === selectedBuilding) {
        return {
          ...b,
          floors: b.floors.map(f =>
            f.id === floorId ? { ...f, hidden: !f.hidden } : f
          )
        }
      }
      return b
    })
    setBuildings(updated)
    await saveData(updated)
    window.dispatchEvent(new Event('tourDataUpdated'))
  }

  const handleToggleRoomVisibility = async (roomId) => {
    const updated = buildings.map(b => {
      if (b.id === selectedBuilding) {
        return {
          ...b,
          floors: b.floors.map(f => {
            if (f.id === selectedFloor) {
              return {
                ...f,
                rooms: f.rooms.map(r =>
                  r.id === roomId ? { ...r, hidden: !r.hidden } : r
                )
              }
            }
            return f
          })
        }
      }
      return b
    })
    setBuildings(updated)
    await saveData(updated)
    window.dispatchEvent(new Event('tourDataUpdated'))
  }

  const handleRenameRoom = async (newName) => {
    if (!selectedRoom || !newName.trim()) return

    const updated = buildings.map(b => {
      if (b.id === selectedBuilding) {
        return {
          ...b,
          floors: b.floors.map(f => {
            if (f.id === selectedFloor) {
              return {
                ...f,
                rooms: f.rooms.map(r =>
                  r.id === selectedRoom ? { ...r, name: newName.trim() } : r
                )
              }
            }
            return f
          })
        }
      }
      return b
    })
    setBuildings(updated)
    await saveData(updated)
    window.dispatchEvent(new Event('tourDataUpdated'))
    alert('Название кабинета изменено!')
  }

  const handleDeleteRoom = async () => {
    if (!selectedRoom) return
    if (!confirm('Удалить этот кабинет?')) return

    const updated = buildings.map(b => {
      if (b.id === selectedBuilding) {
        return {
          ...b,
          floors: b.floors.map(f => {
            if (f.id === selectedFloor) {
              return {
                ...f,
                rooms: f.rooms.filter(r => r.id !== selectedRoom)
              }
            }
            return f
          })
        }
      }
      return b
    })
    setBuildings(updated)
    await saveData(updated)
    window.dispatchEvent(new Event('tourDataUpdated'))
    setSelectedRoom(null)
    alert('Кабинет удален!')
  }

  const handleOptimizePanoramas = async () => {
    if (!confirm('Конвертировать все JPG/PNG панорамы в WebP? Исходные файлы будут удалены, пути в данных тура обновятся автоматически.')) return
    setOptimizing(true)
    setOptimizeResult(null)
    try {
      const response = await fetch('/api/optimize-panoramas', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setOptimizeResult(result)
      if (result.results.length > 0) {
        const data = await fetch('/api/data').then(r => r.json())
        setBuildings(data)
        window.dispatchEvent(new Event('tourDataUpdated'))
      }
    } catch (e) {
      alert('Ошибка оптимизации: ' + e.message)
    } finally {
      setOptimizing(false)
    }
  }

  const currentFloorData = buildings.find(b => b.id === selectedBuilding)?.floors.find(f => f.id === selectedFloor)
  const currentPanorama = selectedRoom
    ? currentFloorData?.rooms.find(r => r.id === selectedRoom)?.panorama
    : currentFloorData?.panorama

  const handleLogout = () => {
    logout()
    setAuthenticated(false)
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const updated = { ...settings, logo: event.target.result }
      setSettings(updated)
      await saveSettings(updated)
      applyTheme(updated)
    }
    reader.readAsDataURL(file)
  }

  const handleSettingChange = async (key, value) => {
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    await saveSettings(updated)
    applyTheme(updated)
  }

  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>Загрузка...</div>
  }

  return (
    <div className="admin">
      <div className="admin-header">
        <h1>Админка 3D Тура</h1>
        <div className="admin-header-actions">
          <a href="/">← К туру</a>
          <button onClick={handleLogout}>Выйти</button>
        </div>
      </div>

      <div className="admin-tabs">
        <button
          className={activeTab === 'panoramas' ? 'active' : ''}
          onClick={() => setActiveTab('panoramas')}
        >
          Панорамы
        </button>
        <button
          className={activeTab === 'customization' ? 'active' : ''}
          onClick={() => setActiveTab('customization')}
        >
          Кастомизация
        </button>
        <button
          className={activeTab === 'optimize' ? 'active' : ''}
          onClick={() => setActiveTab('optimize')}
        >
          Оптимизация
        </button>
        <button
          className={activeTab === 'statistics' ? 'active' : ''}
          onClick={() => setActiveTab('statistics')}
        >
          Статистика
        </button>
      </div>

      {activeTab === 'panoramas' && (
        <div className="admin-content">
          <div className="admin-controls">
            <div className="control-group">
              <label>Корпус:</label>
              <select value={selectedBuilding} onChange={(e) => {
                setSelectedBuilding(Number(e.target.value))
                setSelectedRoom(null)
              }}>
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label>Этаж:</label>
              <select value={selectedFloor} onChange={(e) => {
                setSelectedFloor(Number(e.target.value))
                setSelectedRoom(null)
              }}>
                {buildings.find(b => b.id === selectedBuilding)?.floors.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label>Локация:</label>
              <select value={selectedRoom || ''} onChange={(e) => setSelectedRoom(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Коридор (этаж)</option>
                {currentFloorData?.rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div style={{
              padding: '15px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '2px solid rgba(255,255,255,0.2)'
            }}>
              <strong style={{ color: '#4a9eff' }}>Текущая локация:</strong>
              <div style={{ marginTop: '8px', fontSize: '16px' }}>
                {buildings.find(b => b.id === selectedBuilding)?.name} → {' '}
                {currentFloorData?.name}
                {selectedRoom && ` → ${currentFloorData?.rooms.find(r => r.id === selectedRoom)?.name}`}
              </div>
              {currentPanorama && (
                <div style={{ marginTop: '8px', color: '#4ade80' }}>
                  ✓ Панорама загружена
                </div>
              )}
              {!currentPanorama && (
                <div style={{ marginTop: '8px', color: '#fbbf24' }}>
                  ⚠ Панорама не загружена
                </div>
              )}
            </div>

            <div className="control-group">
              <label>Загрузить панораму (360° изображение):</label>
              <input type="file" accept="image/*" onChange={handlePanoramaUpload} />
            </div>

            <button className="save-btn" onClick={handleSave} disabled={!tempPanorama}>
              Сохранить панораму
            </button>

            <div className="hotspot-mode">
              <h4>Точки перехода</h4>
              <p>Кликните на панораму чтобы добавить переход</p>
              <button
                className={`hotspot-toggle ${hotspotMode ? 'active' : ''}`}
                onClick={() => {
                  setHotspotMode(!hotspotMode)
                  if (infoSpotMode) setInfoSpotMode(false)
                }}
              >
                {hotspotMode ? 'Режим редактирования активен' : 'Включить режим редактирования'}
              </button>
            </div>

            <div className="hotspot-mode">
              <h4>Информационные метки</h4>
              <p>Кликните на панораму чтобы добавить метку</p>
              <button
                className={`hotspot-toggle ${infoSpotMode ? 'active' : ''}`}
                onClick={() => {
                  setInfoSpotMode(!infoSpotMode)
                  if (hotspotMode) setHotspotMode(false)
                }}
              >
                {infoSpotMode ? 'Режим редактирования активен' : 'Включить режим редактирования'}
              </button>
            </div>

            <div className="room-management">
              <h4>Управление кабинетами</h4>
              <div className="control-group">
                <input
                  type="text"
                  placeholder="Название нового кабинета"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                />
              </div>
              <button className="add-room-btn" onClick={handleAddRoom}>
                Добавить кабинет
              </button>
              {selectedRoom && (
                <>
                  <div className="control-group" style={{ marginTop: '15px' }}>
                    <label>Переименовать текущий кабинет:</label>
                    <input
                      type="text"
                      placeholder="Новое название"
                      defaultValue={currentFloorData?.rooms.find(r => r.id === selectedRoom)?.name}
                      onBlur={(e) => handleRenameRoom(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleRenameRoom(e.target.value)
                        }
                      }}
                    />
                  </div>
                  <button className="delete-room-btn" onClick={handleDeleteRoom}>
                    Удалить текущий кабинет
                  </button>
                </>
              )}
            </div>

            <div className="visibility-management">
              <h4>Видимость элементов</h4>

              <div className="visibility-section">
                <h5>Корпуса:</h5>
                {buildings.map(building => (
                  <div key={building.id} className="visibility-item">
                    <span>{building.name}</span>
                    <button
                      className={`visibility-toggle ${building.hidden ? 'hidden' : 'visible'}`}
                      onClick={() => handleToggleBuildingVisibility(building.id)}
                    >
                      {building.hidden ? '👁️ Показать' : '🚫 Скрыть'}
                    </button>
                  </div>
                ))}
              </div>

              <div className="visibility-section">
                <h5>Этажи ({buildings.find(b => b.id === selectedBuilding)?.name}):</h5>
                {buildings.find(b => b.id === selectedBuilding)?.floors.map(floor => (
                  <div key={floor.id} className="visibility-item">
                    <span>{floor.name}</span>
                    <button
                      className={`visibility-toggle ${floor.hidden ? 'hidden' : 'visible'}`}
                      onClick={() => handleToggleFloorVisibility(floor.id)}
                    >
                      {floor.hidden ? '👁️ Показать' : '🚫 Скрыть'}
                    </button>
                  </div>
                ))}
              </div>

              {currentFloorData?.rooms && currentFloorData.rooms.length > 0 && (
                <div className="visibility-section">
                  <h5>Кабинеты ({currentFloorData.name}):</h5>
                  {currentFloorData.rooms.map(room => (
                    <div key={room.id} className="visibility-item">
                      <span>{room.name}</span>
                      <button
                        className={`visibility-toggle ${room.hidden ? 'hidden' : 'visible'}`}
                        onClick={() => handleToggleRoomVisibility(room.id)}
                      >
                        {room.hidden ? '👁️ Показать' : '🚫 Скрыть'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="admin-preview">
            <h3>Превью панорамы:</h3>
            {(tempPanorama || currentPanorama) ? (
              <div ref={viewerRef} style={{ width: '100%', height: '600px', background: '#000', borderRadius: '10px' }} />
            ) : (
              <p>Панорама не загружена</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'customization' && settings && (
        <div className="admin-content">
          <div className="customization-panel">
            <h2>Настройки интерфейса</h2>

            <div className="custom-section">
              <h3>Логотип и название</h3>
              <div className="control-group">
                <label>Логотип:</label>
                <input type="file" accept="image/*" onChange={handleLogoUpload} />
                {settings.logo && (
                  <div style={{ marginTop: '10px' }}>
                    <img src={settings.logo} alt="Logo" style={{ maxWidth: '200px', maxHeight: '80px', objectFit: 'contain' }} />
                    <button
                      onClick={() => handleSettingChange('logo', '')}
                      style={{ marginLeft: '10px', padding: '5px 10px', background: '#e74c3c', border: 'none', borderRadius: '5px', color: '#fff', cursor: 'pointer' }}
                    >
                      Удалить
                    </button>
                  </div>
                )}
              </div>

              <div className="control-group">
                <label>Название тура:</label>
                <input
                  type="text"
                  value={settings.title}
                  onChange={(e) => handleSettingChange('title', e.target.value)}
                  placeholder="3D Тур"
                />
              </div>
            </div>

            <div className="custom-section">
              <h3>Автотур</h3>
              <div className="control-group">
                <label>Скорость автотура: <strong>{settings.autoTourSpeed ?? 2} °/сек</strong></label>
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={settings.autoTourSpeed ?? 2}
                  onChange={(e) => handleSettingChange('autoTourSpeed', Number(e.target.value))}
                  style={{ width: '100%', marginTop: '8px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', opacity: 0.7 }}>
                  <span>0.5 (медленно)</span>
                  <span>10 (быстро)</span>
                </div>
              </div>
            </div>

            <div className="custom-section">
              <h3>Цветовая схема</h3>
              <div className="color-grid">
                <div className="control-group">
                  <label>Основной цвет:</label>
                  <input
                    type="color"
                    value={settings.primaryColor}
                    onChange={(e) => handleSettingChange('primaryColor', e.target.value)}
                  />
                  <span>{settings.primaryColor}</span>
                </div>

                <div className="control-group">
                  <label>Вторичный цвет:</label>
                  <input
                    type="color"
                    value={settings.secondaryColor}
                    onChange={(e) => handleSettingChange('secondaryColor', e.target.value)}
                  />
                  <span>{settings.secondaryColor}</span>
                </div>

                <div className="control-group">
                  <label>Цвет фона:</label>
                  <input
                    type="color"
                    value={settings.backgroundColor}
                    onChange={(e) => handleSettingChange('backgroundColor', e.target.value)}
                  />
                  <span>{settings.backgroundColor}</span>
                </div>

                <div className="control-group">
                  <label>Цвет текста:</label>
                  <input
                    type="color"
                    value={settings.textColor}
                    onChange={(e) => handleSettingChange('textColor', e.target.value)}
                  />
                  <span>{settings.textColor}</span>
                </div>

                <div className="control-group">
                  <label>Акцентный цвет:</label>
                  <input
                    type="color"
                    value={settings.accentColor}
                    onChange={(e) => handleSettingChange('accentColor', e.target.value)}
                  />
                  <span>{settings.accentColor}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'optimize' && (
        <div className="admin-content">
          <div className="customization-panel">
            <h2>Оптимизация панорам</h2>

            <div className="custom-section">
              <h3>Конвертация в WebP</h3>
              <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '16px', lineHeight: 1.6 }}>
                WebP даёт на 30–50% меньший размер файла при том же визуальном качестве.<br />
                Новые панорамы конвертируются автоматически при загрузке.<br />
                Для старых JPG/PNG — используйте кнопку ниже.
              </p>

              <button
                onClick={handleOptimizePanoramas}
                disabled={optimizing}
                style={{
                  padding: '14px 28px',
                  background: optimizing
                    ? 'rgba(255,255,255,0.1)'
                    : 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: optimizing ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s'
                }}
              >
                {optimizing ? '⏳ Конвертация...' : '⚡ Конвертировать JPG/PNG → WebP'}
              </button>

              {optimizing && (
                <p style={{ marginTop: '16px', color: '#38ef7d' }}>
                  Обработка панорам, это может занять несколько минут...
                </p>
              )}

              {optimizeResult && (
                <div style={{ marginTop: '24px' }}>
                  {optimizeResult.results.length === 0 ? (
                    <div style={{ padding: '16px', background: 'rgba(56,239,125,0.1)', borderRadius: '10px', border: '1px solid rgba(56,239,125,0.3)', color: '#38ef7d' }}>
                      Все панорамы уже в формате WebP
                    </div>
                  ) : (
                    <>
                      <div style={{ padding: '16px', background: 'rgba(56,239,125,0.1)', borderRadius: '10px', border: '1px solid rgba(56,239,125,0.3)', marginBottom: '16px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#38ef7d' }}>
                          Сэкономлено: {(optimizeResult.totalSaved / 1024 / 1024).toFixed(1)} MB
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                          Конвертировано файлов: {optimizeResult.results.length}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {optimizeResult.results.map((r, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '13px' }}>
                            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{r.file} → {r.webpFilename}</span>
                            <span style={{ color: '#38ef7d', fontWeight: 600, whiteSpace: 'nowrap', marginLeft: '16px' }}>
                              {(r.originalSize / 1024 / 1024).toFixed(1)} MB → {(r.newSize / 1024 / 1024).toFixed(1)} MB
                              &nbsp;(-{Math.round(r.saved / r.originalSize * 100)}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="custom-section">
              <h3>Как это работает</h3>
              <ul style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 2, paddingLeft: '20px' }}>
                <li>Максимальное разрешение: 8192px по ширине</li>
                <li>Качество WebP: 82% (оптимальный баланс)</li>
                <li>EXIF-ориентация исправляется автоматически</li>
                <li>Пути в данных тура обновляются автоматически</li>
                <li>Исходные JPG/PNG удаляются после конвертации</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'statistics' && (
        <div className="admin-content">
          <div className="customization-panel">
            <h2>Статистика посещений</h2>

            <div className="custom-section">
              <h3>Общая статистика</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{getStats().totalVisits || 0}</div>
                  <div className="stat-label">Всего посещений</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{Object.keys(getStats().locations || {}).length}</div>
                  <div className="stat-label">Уникальных локаций</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{(getStats().sessions || []).length}</div>
                  <div className="stat-label">Сессий</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {Math.round((getStats().sessions || []).reduce((sum, s) => sum + (s.duration || 0), 0) / 1000 / 60)} мин
                  </div>
                  <div className="stat-label">Общее время</div>
                </div>
              </div>
            </div>

            <div className="custom-section">
              <h3>Популярные локации</h3>
              <div className="locations-table">
                {Object.entries(getStats().locations || {})
                  .sort((a, b) => b[1].visits - a[1].visits)
                  .slice(0, 10)
                  .map(([key, data]) => {
                    const building = buildings.find(b => b.id === data.building)
                    const floor = building?.floors.find(f => f.id === data.floor)
                    const room = data.room ? floor?.rooms.find(r => r.id === data.room) : null
                    const locationName = room
                      ? `${building?.name}, ${floor?.name}, ${room.name}`
                      : `${building?.name}, ${floor?.name}`

                    return (
                      <div key={key} className="location-row">
                        <div className="location-name">{locationName}</div>
                        <div className="location-visits">{data.visits} посещений</div>
                      </div>
                    )
                  })}
              </div>
            </div>

            <div className="custom-section">
              <button
                onClick={() => {
                  if (confirm('Очистить всю статистику?')) {
                    clearStats()
                    window.location.reload()
                  }
                }}
                style={{
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Очистить статистику
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Admin
