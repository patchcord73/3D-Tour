import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { logger, requestLogger } from './logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3001

app.use(express.json({ limit: '500mb' }))
app.use(express.urlencoded({ limit: '500mb', extended: true }))

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.use(requestLogger)

const SETTINGS_FILE = path.join(__dirname, 'public', 'settings.json')
const DATA_FILE     = path.join(__dirname, 'public', 'data.json')
const PANORAMAS_DIR = path.join(__dirname, 'public', 'panoramas')

app.use('/panoramas', express.static(PANORAMAS_DIR))

app.get('/api/settings', async (req, res) => {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8')
    res.json(JSON.parse(data))
  } catch (e) {
    logger.error('Не удалось загрузить настройки:', e.message)
    res.status(500).json({ error: 'Failed to load settings' })
  }
})

app.post('/api/settings', async (req, res) => {
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(req.body, null, 2))
    res.json({ success: true })
  } catch (e) {
    logger.error('Не удалось сохранить настройки:', e.message)
    res.status(500).json({ error: 'Failed to save settings' })
  }
})

app.post('/api/upload-panorama', async (req, res) => {
  try {
    const { filename, data } = req.body
    if (!filename || !data) {
      logger.warn('Загрузка панорамы: отсутствует filename или data')
      return res.status(400).json({ error: 'filename and data are required' })
    }

    const baseName = path.parse(filename).name
    const webpFilename = `${baseName}.webp`
    const filepath = path.join(PANORAMAS_DIR, webpFilename)
    logger.info(`Загрузка панорамы: ${filename} → ${webpFilename}`)

    const rawBuffer = Buffer.from(data, 'base64')
    const info = await sharp(rawBuffer).metadata()
    logger.info(`  исходный: ${info.width}×${info.height} (${(rawBuffer.length / 1024 / 1024).toFixed(1)} MB)`)

    const processedBuffer = await sharp(rawBuffer)
      .rotate()
      .resize({ width: 8192, withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer()

    await fs.writeFile(filepath, processedBuffer)
    logger.ok(`  сохранено: ${webpFilename} (${(processedBuffer.length / 1024 / 1024).toFixed(1)} MB, -${Math.round((1 - processedBuffer.length / rawBuffer.length) * 100)}%)`)

    res.json({ success: true, path: `/panoramas/${webpFilename}`, filename: webpFilename })
  } catch (e) {
    logger.error('Ошибка загрузки панорамы:', e.message)
    res.status(500).json({ error: 'Failed to upload panorama' })
  }
})

app.post('/api/optimize-panoramas', async (req, res) => {
  try {
    const files = await fs.readdir(PANORAMAS_DIR)
    const toConvert = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f))

    if (toConvert.length === 0) {
      return res.json({ success: true, results: [], message: 'Все панорамы уже в формате WebP' })
    }

    let dataRaw = await fs.readFile(DATA_FILE, 'utf-8')
    let dataChanged = false
    const results = []

    for (const file of toConvert) {
      const srcPath = path.join(PANORAMAS_DIR, file)
      const baseName = path.parse(file).name
      const webpFilename = `${baseName}.webp`
      const destPath = path.join(PANORAMAS_DIR, webpFilename)

      const srcBuffer = await fs.readFile(srcPath)
      const srcSize = srcBuffer.length

      const webpBuffer = await sharp(srcBuffer)
        .rotate()
        .resize({ width: 8192, withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer()

      await fs.writeFile(destPath, webpBuffer)
      await fs.unlink(srcPath)

      const oldPath = `/panoramas/${file}`
      const newPath = `/panoramas/${webpFilename}`
      if (dataRaw.includes(oldPath)) {
        dataRaw = dataRaw.replaceAll(oldPath, newPath)
        dataChanged = true
      }

      const saved = srcSize - webpBuffer.length
      logger.ok(`Оптимизировано: ${file} → ${webpFilename} (${(srcSize / 1024 / 1024).toFixed(1)} MB → ${(webpBuffer.length / 1024 / 1024).toFixed(1)} MB, -${Math.round(saved / srcSize * 100)}%)`)
      results.push({ file, webpFilename, originalSize: srcSize, newSize: webpBuffer.length, saved })
    }

    if (dataChanged) {
      await fs.writeFile(DATA_FILE, JSON.stringify(JSON.parse(dataRaw), null, 2))
      logger.ok('data.json обновлён с новыми путями WebP')
    }

    const totalSaved = results.reduce((sum, r) => sum + r.saved, 0)
    logger.ok(`Оптимизация завершена: ${results.length} файлов, сэкономлено ${(totalSaved / 1024 / 1024).toFixed(1)} MB`)

    res.json({ success: true, results, totalSaved })
  } catch (e) {
    logger.error('Ошибка оптимизации панорам:', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/data', async (req, res) => {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8')
    res.json(JSON.parse(data))
  } catch (e) {
    logger.error('Не удалось загрузить данные тура:', e.message)
    res.status(500).json({ error: 'Failed to load data' })
  }
})

app.post('/api/data', async (req, res) => {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(req.body, null, 2))
    res.json({ success: true })
  } catch (e) {
    logger.error('Не удалось сохранить данные тура:', e.message)
    res.status(500).json({ error: 'Failed to save data' })
  }
})

app.listen(PORT, () => {
  logger.ok(`API-сервер запущен на порту ${PORT}`)
})
