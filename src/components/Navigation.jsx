import { useState } from 'react'
import './Navigation.css'

function Navigation({ buildings, currentBuilding, currentFloor, currentRoom, onBuildingChange, onFloorChange, onRoomChange, settings }) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const currentFloorData = buildings.find(b => b.id === currentBuilding)?.floors.find(f => f.id === currentFloor)

  return (
    <>
      <button
        className="nav-toggle"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? 'Показать меню' : 'Скрыть меню'}
      >
        {isCollapsed ? '→' : '←'}
      </button>

      <div className={`navigation ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="nav-header">
          {settings?.logo ? (
            <img src={settings.logo} alt="Logo" className="nav-logo" />
          ) : (
            <h2>{settings?.title || '3D Тур'}</h2>
          )}
        </div>

        <div className="nav-section">
          <h3>Корпуса</h3>
          <div className="nav-buttons">
            {buildings.filter(b => !b.hidden).map(building => (
              <button
                key={building.id}
                className={currentBuilding === building.id ? 'active' : ''}
                onClick={() => onBuildingChange(building.id)}
              >
                {building.name}
              </button>
            ))}
          </div>
        </div>

        <div className="nav-section">
          <h3>Этажи</h3>
          <div className="nav-buttons">
            {buildings.find(b => b.id === currentBuilding)?.floors.filter(f => !f.hidden).map(floor => (
              <button
                key={floor.id}
                className={currentFloor === floor.id ? 'active' : ''}
                onClick={() => {
                  onFloorChange(floor.id)
                  onRoomChange(null)
                }}
              >
                {floor.name}
              </button>
            ))}
          </div>
        </div>

        {currentFloorData?.rooms && currentFloorData.rooms.filter(r => !r.hidden).length > 0 && (
          <div className="nav-section">
            <h3>Кабинеты</h3>
            <div className="nav-buttons">
              <button
                className={currentRoom === null ? 'active' : ''}
                onClick={() => onRoomChange(null)}
              >
                Коридор
              </button>
              {currentFloorData.rooms.filter(r => !r.hidden).map(room => (
                <button
                  key={room.id}
                  className={currentRoom === room.id ? 'active' : ''}
                  onClick={() => onRoomChange(room.id)}
                >
                  {room.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default Navigation
