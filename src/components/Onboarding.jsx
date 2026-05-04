import './Onboarding.css'

const STEPS = [
  {
    icon: '🖱️',
    title: 'Осмотр',
    text: 'Перетащите мышью или проведите пальцем чтобы осмотреться вокруг'
  },
  {
    icon: '📍',
    title: 'Переходы',
    text: 'Нажимайте на метки на панораме для перехода между помещениями'
  },
  {
    icon: '☰',
    title: 'Навигация',
    text: 'Используйте меню слева для выбора корпуса, этажа и кабинета'
  },
  {
    icon: '▶',
    title: 'Автотур',
    text: 'Кнопка «Запустить автотур» автоматически обойдёт все помещения'
  }
]

function Onboarding({ onClose }) {
  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-header">
          <h2>Добро пожаловать в 3D‑тур</h2>
          <p>Несколько подсказок перед началом</p>
        </div>

        <div className="onboarding-steps">
          {STEPS.map((step, i) => (
            <div className="onboarding-step" key={i}>
              <div className="step-icon">{step.icon}</div>
              <div className="step-body">
                <strong>{step.title}</strong>
                <span>{step.text}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="onboarding-actions">
          <button className="onboarding-start" onClick={onClose}>
            Начать тур
          </button>
          <button className="onboarding-skip" onClick={onClose}>
            Пропустить
          </button>
        </div>
      </div>
    </div>
  )
}

export default Onboarding
