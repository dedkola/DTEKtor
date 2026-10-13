import { chromium } from 'playwright'
import { writeFile, rename, rm } from 'node:fs/promises'

const URL = 'https://www.dtek-kem.com.ua/ua/shutdowns'
const STREET = process.env.STREET || 'Березняківська'
const HOUSE = process.env.HOUSE || '12'
const DEADLINE_MS = Number(process.env.DEADLINE_MS || 45000)
const log = (...a) => console.error(...a)

// DTEK uses MicroModal close buttons, including the initial attention notice.
// Escape alone does not reliably close these, and more can open after selection.
const POPUP_CLOSE = 'button[aria-label="Close modal"]:visible, button.modal__close:visible'
const POPUP_OPEN = '.modal__overlay:visible, [role="dialog"]:visible'
async function dismissPopups(page) {
  for (let attempt = 0; attempt < 12; attempt++) {
    // Resolve without an actionability wait, which would trigger the handler
    // and remove the very control that an outer locator was waiting for.
    const controls = await page.$$(POPUP_CLOSE)
    if (controls.length) {
      try {
        const control = controls.at(-1)
        await control.click({ force: true, timeout: 1500 })
        await control.waitForElementState('hidden', { timeout: 1500 })
      } finally {
        await Promise.all(controls.map(control => control.dispose()))
      }
      continue
    }
    if (!(await page.locator(POPUP_OPEN).count())) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
  }
  throw new Error('DTEK popup remained open; screenshot not replaced')
}

const stateOf = (cls) => {
  const c = String(cls)
  if (c.includes('non-scheduled')) return 'on'
  if (c.includes('second-half')) return 'off-2nd30'
  if (c.includes('first-half')) return 'off-1st30'
  if (c.includes('scheduled')) return 'off'
  return 'unknown'
}

function windows(cells, hours) {
  const out = []
  let cur = null
  const minute = (h) => parseInt(h.slice(0, 2), 10) * 60
  cells.forEach((c, idx) => {
    const h = hours[idx] || ''
    if (c === 'on' || !h) {
      if (cur) out.push(cur)
      cur = null
      return
    }
    const start = minute(h)
    const a = c === 'off-2nd30' ? start + 30 : start
    const b = c === 'off-1st30' ? start + 30 : start + 60
    if (cur && cur.end === a) cur.end = b
    else {
      if (cur) out.push(cur)
      cur = { start: a, end: b }
    }
  })
  if (cur) out.push(cur)
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return out.map((w) => `${fmt(w.start)}-${fmt(w.end)}`)
}

// Kyiv wall-clock minutes now, and a filter that drops outage windows which have already ENDED.
const kyivNowMinutes = () => {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
const upcomingOnly = (list) => {
  const now = kyivNowMinutes()
  return (list || []).filter((w) => {
    const end = String(w).split('-')[1] || ''
    const [h, m] = end.split(':').map(Number)
    if (Number.isNaN(h)) return true
    return h * 60 + (m || 0) > now
  })
}


// Activate a field even when a WAF/consent overlay intercepts pointer events.
const activate = async (loc) => {
  await loc.click({ timeout: 4000 }).catch(() => {})
  await loc.focus().catch(() => {})
}


// Pick the first autocomplete suggestion even when an overlay intercepts clicks.
const pickFirst = async (page) => {
  const item = page.locator('.autocomplete-items > *').first()
  await item.waitFor({ timeout: 9000 })
  try {
    await item.click({ timeout: 3000 })
  } catch {
    await page.keyboard.press('ArrowDown').catch(() => {})
    await page.keyboard.press('Enter').catch(() => {})
  }
}

const started = Date.now()
const left = () => DEADLINE_MS - (Date.now() - started)
const checkpoint = () => {
  if (left() < 2500) throw new Error('deadline')
}

const browser = await chromium.launch({ headless: true })
let out = { ok: false, address: `${STREET} ${HOUSE}`, error: 'unknown' }
try {
  const ctx = await browser.newContext({
    locale: 'uk-UA',
    timezoneId: 'Europe/Kyiv',
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 1000 },
  })
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}))
  page.on('popup', popup => popup.close().catch(() => {}))
  await page.addLocatorHandler(page.locator(POPUP_CLOSE).first(), () =>
    dismissPopups(page).catch(error => log('popup dismissal failed:', String(error).slice(0, 160))),
  )

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(400)
  await dismissPopups(page)

  // The DTEK page sits behind a WAF and sometimes serves a slow/challenge load.
  // Retry the street field a few times before giving up.
  const street = page.getByPlaceholder(/Почніть вводити/i).first()
  let streetReady = false
  for (let attempt = 0; attempt < 3 && !streetReady; attempt++) {
    try {
      await street.waitFor({ state: 'visible', timeout: 15000 })
      streetReady = true
    } catch {
      await page.keyboard.press('Escape').catch(() => {})
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(1500)
    }
  }
  if (!streetReady) throw new Error('street field not found after retries')
  checkpoint()

  await activate(street)
  await street.pressSequentially(STREET, { delay: 25 })
  await pickFirst(page)
  checkpoint()

  await page
    .waitForFunction(
      () => {
        const h = [...document.querySelectorAll('input')].find((i) => /Номер будинку|Почніть вводити номер/i.test(i.placeholder || ''))
        return h && !h.disabled
      },
      null,
      { timeout: Math.min(9000, left()) },
    )
    .catch(() => log('house enable wait timed out'))
  checkpoint()

  const house = page.getByPlaceholder(/Номер будинку|Почніть вводити номер/i).first()
  await activate(house)
  await house.pressSequentially(HOUSE, { delay: 60 })
  await pickFirst(page)
  checkpoint()

  await page.waitForSelector('table', { timeout: Math.min(9000, left()) })
  await page.waitForTimeout(600)

  // Best-effort: capture just the graph area (heading + day tabs + table + legend),
  // cropped to the top of the page so we don't keep the empty space below.
  try {
    const grid = page.locator('table').first()
    await dismissPopups(page)
    await grid.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    const shot = process.env.SHOT ?? '/home/ded/projects/shutdown/shot.png'
    let image
    for (let attempt = 0; attempt < 3; attempt++) {
      await dismissPopups(page)
      const box = await grid.boundingBox()
      const vw = page.viewportSize()?.width ?? 1366
      const options = box
        ? { clip: { x: 0, y: 0, width: vw, height: Math.min(Math.ceil(box.y + box.height + 90), 1400) } }
        : { fullPage: true }
      const candidate = await page.screenshot({ ...options, animations: 'disabled' })
      // Catch popups that opened while the screenshot was being rendered.
      if (!(await page.locator(POPUP_OPEN).count()) && !(await page.locator(POPUP_CLOSE).count())) {
        image = candidate
        break
      }
    }
    if (!image) throw new Error('DTEK popup interrupted capture; screenshot not replaced')
    const temporary = `${shot}.${process.pid}.tmp`
    try {
      await writeFile(temporary, image)
      await rename(temporary, shot)
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
    log('shot saved')
  } catch (e) {
    log('screenshot failed:', String(e).slice(0, 120))
  }

  const data = await page.evaluate(() => {
    const cls = (td) => String(td.className).replace('cell-', '')
    const body = (document.body.innerText || '').replace(/\s+/g, ' ')
    const dates = [...body.matchAll(/(на сьогодні|на завтра)\s*(\d{2}\.\d{2}\.\d{2})/g)].map((x) => ({ which: x[1], date: x[2] }))
    const tables = [...document.querySelectorAll('table')].map((t) => ({
      hours: [...t.rows[0].cells].slice(1).map((c) => (c.innerText || '').replace(/\s+/g, '').trim()),
      classes: [...t.rows[1].cells].slice(1).map(cls),
    }))
    const upd = (body.match(/Дата оновлення інформації[^0-9]{0,6}([\d.: ]{6,20})/) || [])[1] || null
    const graphUpd = (body.match(/на графіку:?\s*([\d.]+ [\d:]+)/) || [])[1] || null
    return { dates, upd: upd && upd.trim(), graphUpd, tables }
  })

  const todayT = data.tables[0] || { hours: [], classes: [] }
  const tomorrowT = data.tables[1] || { hours: [], classes: [] }
  out = {
    ok: true,
    address: `${STREET} ${HOUSE}`,
    checkedAt: new Date().toISOString(),
    updated: data.upd,
    graphUpdated: data.graphUpd,
    dayLabels: data.dates,
    today: { offWindows: windows(todayT.classes.map(stateOf), todayT.hours), classes: todayT.classes },
    tomorrow: { offWindows: windows(tomorrowT.classes.map(stateOf), tomorrowT.hours), classes: tomorrowT.classes },
  }
  out.today.upcoming = upcomingOnly(out.today.offWindows)
  // Tomorrow is entirely in the future — never filter it by today's clock.
  out.tomorrow.upcoming = out.tomorrow.offWindows
  log('ok in', Date.now() - started, 'ms')
} catch (e) {
  out = { ...out, ok: false, error: String(e).slice(0, 200), ms: Date.now() - started }
  log('FAILED in', Date.now() - started, 'ms:', String(e).slice(0, 160))
} finally {
  await browser.close().catch(() => {})
}
process.stdout.write(JSON.stringify(out))
