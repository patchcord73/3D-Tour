import { useEffect, useRef, useState } from 'react'
import './Viewer.css'

function Viewer({ panorama, hotspots, onHotspotClick, infoSpots, autoRotate, autoRotateSpeed, onRotationComplete }) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const pannellumRef = useRef(null)
  const [gyroEnabled, setGyroEnabled] = useState(false)
  const [viewerReady, setViewerReady] = useState(false)
  const destroyingRef = useRef(false)

  useEffect(() => {
    if (!window.pannellum && !document.querySelector('script[src="/pannellum.js"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = '/pannellum.css'
      document.head.appendChild(link)

      const script = document.createElement('script')
      script.src = '/pannellum.js'
      document.body.appendChild(script)
    }
  }, [])

  useEffect(() => {
    if (!panorama || !containerRef.current) {
      setViewerReady(false)
      return
    }

    const initViewer = async () => {
      // Ждем завершения предыдущего уничтожения
      while (destroyingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      if (pannellumRef.current) {
        destroyingRef.current = true
        if (pannellumRef.current._rotationCheckInterval) {
          clearInterval(pannellumRef.current._rotationCheckInterval)
        }
        try {
          pannellumRef.current.destroy()
        } catch (e) {
          console.warn('Error destroying viewer:', e)
        }
        pannellumRef.current = null
        destroyingRef.current = false
      }

      // Очищаем контейнер
      if (containerRef.current) {
        containerRef.current.innerHTML = ''

        // Создаем новый div для viewer
        const newViewerDiv = document.createElement('div')
        newViewerDiv.style.width = '100%'
        newViewerDiv.style.height = '100%'
        containerRef.current.appendChild(newViewerDiv)
        viewerRef.current = newViewerDiv
      }

      if (window.pannellum && viewerRef.current) {
        try {
          const allHotspots = [
            ...(hotspots || []).map(hs => ({
              pitch: hs.pitch,
              yaw: hs.yaw,
              type: 'info',
              text: hs.text,
              clickHandlerFunc: () => onHotspotClick && onHotspotClick(hs)
            })),
            ...(infoSpots || []).map(info => ({
              pitch: info.pitch,
              yaw: info.yaw,
              type: 'info',
              text: info.text,
              URL: info.url || undefined
            }))
          ]

          const multiResConfigUrl = (() => {
            if (typeof panorama !== 'string') return null
            const m = panorama.match(/^\/panoramas\/(.+)\.jpg$/)
            if (!m) return null
            return `/panoramas/multires/${m[1]}/config.json`
          })()

          let viewerConfig = null

          if (multiResConfigUrl) {
            try {
              const resp = await fetch(multiResConfigUrl, { method: 'HEAD' })
              const ct = resp.headers.get('content-type') || ''
              if (resp.ok && ct.includes('json')) {
                viewerConfig = {
                  config: multiResConfigUrl,
                  autoLoad: true,
                  showControls: true,
                  hotSpots: allHotspots,
                  orientationOnByDefault: gyroEnabled
                }
              }
            } catch (e) {
              // ignore - fallback to equirectangular
            }
          }

          if (!viewerConfig) {
            viewerConfig = {
              type: 'equirectangular',
              panorama: panorama,
              autoLoad: true,
              showControls: true,
              hotSpots: allHotspots,
              orientationOnByDefault: gyroEnabled
            }
          }

          if (autoRotate) {
            viewerConfig.autoRotate = -(autoRotateSpeed ?? 2)
          }

          pannellumRef.current = window.pannellum.viewer(viewerRef.current, viewerConfig)

          if (autoRotate) {
            let totalRotated = 0
            let lastYaw = pannellumRef.current.getYaw()

            const rotationCheck = setInterval(() => {
              if (!pannellumRef.current) {
                clearInterval(rotationCheck)
                return
              }
              const currentYaw = pannellumRef.current.getYaw()
              let delta = Math.abs(currentYaw - lastYaw)
              // Обработка перехода через 180/-180
              if (delta > 180) delta = 360 - delta
              totalRotated += delta
              lastYaw = currentYaw

              if (totalRotated >= 360) {
                clearInterval(rotationCheck)
                if (onRotationComplete) onRotationComplete()
              }
            }, 200) // проверка каждые 200мс

            // Сохраняем ссылку для очистки
            pannellumRef.current._rotationCheckInterval = rotationCheck
          }

          setViewerReady(true)
        } catch (e) {
          console.error('Ошибка загрузки панорамы:', e)
          setViewerReady(false)
        }
      }
    }

    let intervalId = null

    const destroyViewer = () => {
      if (pannellumRef.current && !destroyingRef.current) {
        destroyingRef.current = true
        if (pannellumRef.current._rotationCheckInterval) {
          clearInterval(pannellumRef.current._rotationCheckInterval)
        }
        try {
          pannellumRef.current.destroy()
        } catch (e) {
          console.warn('Error destroying viewer:', e)
        }
        pannellumRef.current = null
        destroyingRef.current = false
      }
    }

    if (window.pannellum) {
      initViewer()
    } else {
      let attempts = 0
      intervalId = setInterval(() => {
        attempts++
        if (window.pannellum) {
          clearInterval(intervalId)
          intervalId = null
          initViewer()
        }
        if (attempts > 50) {
          console.error('[Viewer] Pannellum не загрузился за 5 секунд')
          clearInterval(intervalId)
          intervalId = null
        }
      }, 100)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
      destroyViewer()
    }
  }, [panorama, hotspots, infoSpots, gyroEnabled, autoRotate, autoRotateSpeed, onRotationComplete])

  const toggleGyro = () => {
    if (pannellumRef.current) {
      const newState = !gyroEnabled
      setGyroEnabled(newState)
      if (newState) {
        pannellumRef.current.startOrientation()
      } else {
        pannellumRef.current.stopOrientation()
      }
    }
  }

  if (!panorama) {
    return (
      <div className="viewer">
        <div className="viewer-empty">
          <p>Панорама не загружена</p>
          <p>Перейдите в админку для загрузки 360° изображений</p>
        </div>
      </div>
    )
  }

  return (
    <div className="viewer">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {viewerReady && typeof DeviceOrientationEvent !== 'undefined' && (
        <button className="gyro-toggle" onClick={toggleGyro} title={gyroEnabled ? 'Отключить гироскоп' : 'Включить гироскоп'}>
          {gyroEnabled ? '📱' : '🧭'}
        </button>
      )}
    </div>
  )
}

export default Viewer
