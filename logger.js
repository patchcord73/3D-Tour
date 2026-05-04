const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  cyan:    '\x1b[36m',
  gray:    '\x1b[90m',
  white:   '\x1b[97m',
}

const ts = () => {
  const d = new Date()
  const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('ru-RU')
  return `${date} ${time}`
}

const prefix = (level, color) =>
  `${c.gray}[${ts()}]${c.reset} ${color}${c.bold}${level}${c.reset}`

export const logger = {
  info:  (...a) => console.log(prefix('INFO ', c.cyan),   ...a),
  ok:    (...a) => console.log(prefix('OK   ', c.green),  ...a),
  warn:  (...a) => console.warn(prefix('WARN ', c.yellow), ...a),
  error: (...a) => console.error(prefix('ERROR', c.red),  ...a),
}

const METHOD_COLOR = { GET: c.green, POST: c.blue, PUT: c.yellow, DELETE: c.red, OPTIONS: c.gray }

export const requestLogger = (req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const ms    = Date.now() - start
    const mc    = METHOD_COLOR[req.method] ?? c.white
    const sc    = res.statusCode >= 500 ? c.red : res.statusCode >= 400 ? c.yellow : c.green
    const msCol = ms > 1000 ? c.yellow : c.gray
    console.log(
      `${c.gray}[${ts()}]${c.reset}`,
      `${mc}${c.bold}${req.method.padEnd(7)}${c.reset}`,
      `${c.white}${req.path}${c.reset}`,
      `${sc}${c.bold}${res.statusCode}${c.reset}`,
      `${msCol}${ms}ms${c.reset}`
    )
  })
  next()
}
