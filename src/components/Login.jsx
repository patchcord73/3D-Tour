import { useState } from 'react'
import { login } from '../utils/auth'
import './Login.css'

function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (login(password)) {
      onLogin()
    } else {
      setError('Неверный пароль')
      setPassword('')
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Вход в админку</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <button type="submit">Войти</button>
        </form>
      </div>
    </div>
  )
}

export default Login
