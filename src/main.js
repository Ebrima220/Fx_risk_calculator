import './style.css'

function initTheme() {
  const root = document.documentElement
  const btn = document.getElementById('themeToggle')
  const iconSun = btn.querySelector('.icon-sun')
  const iconMoon = btn.querySelector('.icon-moon')

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
    iconSun.classList.toggle('hidden', theme === 'light')
    iconMoon.classList.toggle('hidden', theme === 'dark')
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')
  }

  applyTheme(root.getAttribute('data-theme') || 'dark')

  btn.addEventListener('click', () => {
    applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark')
  })
}

initTheme()

const inputs = ['balance', 'pair', 'entry', 'sl', 'tp', 'lottype']

document.getElementById('calculateBtn').addEventListener('click', calculate)

inputs.forEach((id) => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') calculate()
  })
})

// Numeric-only enforcement for text inputs that represent numbers
const numericFields = ['balance', 'entry', 'sl', 'tp']

numericFields.forEach((id) => {
  const el = document.getElementById(id)

  // Block non-numeric keypresses
  el.addEventListener('keydown', (e) => {
    const allowed = [
      'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Tab', 'Enter', 'Home', 'End',
    ]
    // Allow control combos (Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X)
    if (e.ctrlKey || e.metaKey) return
    // Allow navigation/editing keys
    if (allowed.includes(e.key)) return
    // Allow digits
    if (/^\d$/.test(e.key)) return
    // Allow a single decimal point
    if (e.key === '.' && !el.value.includes('.')) return
    // Block everything else
    e.preventDefault()
  })

  // Strip any non-numeric characters that slip through (e.g. paste)
  el.addEventListener('input', () => {
    const cursor = el.selectionStart
    const cleaned = el.value
      .replace(/[^0-9.]/g, '')           // remove non-digit, non-dot
      .replace(/^(\d*\.?)(.*)$/, (_, a, b) => a + b.replace(/\./g, '')) // keep only first dot
    if (el.value !== cleaned) {
      el.value = cleaned
      el.setSelectionRange(cursor - 1, cursor - 1)
    }
  })
})

const LOTS = 1 // one lot of the selected tier

// Standard MT4/MT5 contract sizes
const FOREX_UNITS = { standard: 100_000, mini: 10_000, micro: 1_000 }
const GOLD_OZ = { standard: 100, mini: 10, micro: 1 }

function pipMultiplier(pair) {
  if (pair === 'usdjpy') return 0.01   // JPY pairs: 2nd decimal = 1 pip
  if (pair === 'xauusd') return 0.10   // Gold: $0.10 price move = 1 pip (standard broker convention)
  return 0.0001                         // Majors: 4th decimal = 1 pip
}

function contractUnits(pair, lotSize) {
  if (pair === 'xauusd') {
    if (lotSize >= FOREX_UNITS.standard) return GOLD_OZ.standard
    if (lotSize >= FOREX_UNITS.mini) return GOLD_OZ.mini
    return GOLD_OZ.micro
  }
  return lotSize // 100000 / 10000 / 1000 units of base currency
}

// Pip value in USD for 1 lot of the selected tier (USD-denominated account)
function pipValuePerLot(pair, price, lotSize) {
  const pip = pipMultiplier(pair)
  const size = contractUnits(pair, lotSize)

  if (pair === 'xauusd') {
    // Gold: pip = $0.10 move per oz. e.g. standard lot = 100 oz → $10/pip
    return pip * size
  }

  if (pair === 'usdjpy') {
    // Quote currency is JPY → pip value in JPY = pip * size, convert to USD by dividing by price
    return (pip * size) / price
  }

  if (pair === 'usdxxx') {
    // USD is base currency, quote is non-USD (e.g. USD/CHF, USD/CAD)
    // Pip value in quote currency = pip * size; convert to USD by dividing by price
    return (pip * size) / price
  }

  // XXX/USD (EUR/USD, GBP/USD, …): quote is already USD → pip value = pip * size
  // e.g. 0.0001 * 100,000 = $10/pip per standard lot
  return pip * size
}

function lotTypeLabel(lotSize) {
  if (lotSize >= 100_000) return 'Standard (1.00)'
  if (lotSize >= 10_000) return 'Mini (0.10)'
  return 'Micro (0.01)'
}

function placeholder(message) {
  return `<div class="placeholder-wrap">
    <svg class="mb-3 opacity-30 mx-auto block w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
    <div>${message}</div>
  </div>`
}

function resultRow(key, val, valClass = 'text-text') {
  return `<div class="result-row">
    <span class="text-xs text-muted tracking-wide">${key}</span>
    <span class="result-val ${valClass}">${val}</span>
  </div>`
}

function adviceItem(level, text) {
  return `<li class="advice-item advice-item--${level}">${text}</li>`
}

function riskLevel(pct) {
  if (pct > 3) return 'bad'
  if (pct > 2) return 'warn'
  if (pct > 1) return 'warn'
  return 'good'
}

function riskVerdict(pct) {
  if (pct > 5) return 'Dangerously high — reduce lot size or widen is not the fix; trade smaller.'
  if (pct > 3) return 'Above the 2% rule most pros follow — consider a smaller lot tier.'
  if (pct > 2) return 'Slightly elevated — acceptable for experienced traders, not ideal for beginners.'
  if (pct > 1) return 'Within a reasonable range for active trading.'
  if (pct > 0.5) return 'Conservative and capital-friendly — good for consistency.'
  return 'Very low risk — room to size up if the setup is high quality.'
}

function generateAdvice(ctx) {
  const {
    slPips, tpPips, rr, beRate, riskPct, lotLabel,
    pipVal, slAmount, tpAmount, balance, isLong, isValid,
  } = ctx

  if (!isValid) {
    return ['<p class="advice-empty">Check your prices — stop loss and take profit must match your trade direction.</p>']
  }

  const tips = []
  const dir = isLong ? 'buy (long)' : 'sell (short)'
  const rl = riskLevel(riskPct)
  const riskClass = rl === 'good' ? 'text-green' : rl === 'warn' ? 'text-amber' : 'text-red'

  tips.push(`<div class="risk-badge risk-badge--${rl}">
    <span class="risk-badge-label">Account risk</span>
    <span class="risk-badge-value ${riskClass}">${riskPct.toFixed(2)}%</span>
    <span class="risk-badge-sub">1 × ${lotLabel} · $${slAmount.toFixed(2)} at risk</span>
  </div>`)

  tips.push(adviceItem('info', `Direction: <strong class="text-text">${dir}</strong> · ${Math.round(slPips)} pip stop · ${Math.round(tpPips)} pip target · $${(pipVal * LOTS).toFixed(2)}/pip`))

  tips.push(adviceItem(rl, riskVerdict(riskPct)))

  if (rr >= 2) {
    tips.push(adviceItem('good', `Strong ${rr.toFixed(1)}:1 reward-to-risk. Break-even win rate: ${beRate.toFixed(0)}%.`))
  } else if (rr >= 1) {
    tips.push(adviceItem('warn', `Acceptable ${rr.toFixed(1)}:1 R:R — aim for 1.5:1 or better. Break-even win rate: ${beRate.toFixed(0)}%.`))
  } else {
    tips.push(adviceItem('bad', `Weak ${rr.toFixed(1)}:1 R:R — reward is smaller than risk. Reconsider TP or SL placement.`))
  }

  if (slPips > 80) {
    tips.push(adviceItem('warn', `Wide stop (${Math.round(slPips)} pips) — same lot size carries more dollar risk.`))
  } else if (slPips < 8) {
    tips.push(adviceItem('warn', `Tight stop (${Math.round(slPips)} pips) — watch spread and slippage on ${lotLabel}.`))
  }

  if (tpAmount < slAmount * 1.5 && rr < 1.5) {
    tips.push(adviceItem('warn', `Profit target ($${tpAmount.toFixed(2)}) is modest vs loss ($${slAmount.toFixed(2)}).`))
  }

  if (rr >= 2 && riskPct <= 2 && slPips <= 50) {
    tips.push(adviceItem('good', 'Favourable profile: solid R:R with controlled account risk. Wait for your trigger.'))
  }

  return [`<ul class="advice-list">${tips.join('')}</ul>`]
}

function renderAdvice(htmlParts) {
  document.getElementById('advice').innerHTML = `
    <div class="advice-panel">
      <div class="advice-header">&#9670; Trading Advice</div>
      ${htmlParts.join('')}
    </div>
  `
}

function renderAdviceWaiting() {
  renderAdvice(['<p class="advice-empty">Press Calculate after filling in your trade details to see risk % and advice.</p>'])
}

function calculate() {
  const balance = parseFloat(document.getElementById('balance').value)
  const pair = document.getElementById('pair').value
  const entry = parseFloat(document.getElementById('entry').value)
  const sl = parseFloat(document.getElementById('sl').value)
  const tp = parseFloat(document.getElementById('tp').value)
  const lotSize = parseFloat(document.getElementById('lottype').value)

  const out = document.getElementById('output')
  const lotLabel = lotTypeLabel(lotSize)

  if (!balance || !entry || !sl || !tp || !pair) {
    out.innerHTML = placeholder('Enter account balance, select a currency pair, and fill in entry, SL and TP')
    renderAdviceWaiting()
    return
  }

  const isLong = sl < entry && tp > entry
  const isShort = sl > entry && tp < entry
  const isValid = isLong || isShort

  const pip = pipMultiplier(pair)
  const slPips = Math.abs(entry - sl) / pip
  const tpPips = Math.abs(tp - entry) / pip

  if (!isValid || slPips === 0) {
    out.innerHTML = placeholder('Check SL and TP — they must match trade direction')
    renderAdvice(generateAdvice({
      slPips, tpPips, rr: 0, beRate: 0, riskPct: 0, lotLabel,
      pipVal: 0, slAmount: 0, tpAmount: 0, balance, isLong, isValid: false,
    }))
    return
  }

  const pipVal = pipValuePerLot(pair, entry, lotSize)
  const slAmount = slPips * pipVal * LOTS
  const tpAmount = tpPips * pipVal * LOTS
  const rr = tpPips / slPips
  const riskPct = (slAmount / balance) * 100
  const beRate = (1 / (1 + rr)) * 100

  renderAdvice(generateAdvice({
    slPips, tpPips, rr, beRate, riskPct, lotLabel,
    pipVal, slAmount, tpAmount, balance, isLong, isValid: true,
  }))

  const rrClass = rr >= 2 ? 'text-green' : rr >= 1 ? 'text-amber' : 'text-red'
  const rrLabel = rr >= 2 ? 'Good R:R' : rr >= 1 ? 'Acceptable R:R' : 'Poor R:R — review trade'
  const riskPctClass = riskPct > 3 ? 'text-red' : riskPct > 1.5 ? 'text-amber' : 'text-green'

  out.innerHTML = `
    <div class="metrics-grid">
      <div class="metric-card bg-red-dim border-[rgba(255,94,108,0.25)]">
        <div class="font-syne text-[10px] font-bold tracking-[0.15em] uppercase mb-2 text-red">&#9660; Risk (SL)</div>
        <div class="metric-pips text-red">${Math.round(slPips)}<span class="text-sm sm:text-base font-normal"> pips</span></div>
        <div class="text-[11px] text-muted">Loss if SL hit</div>
      </div>
      <div class="metric-card bg-green-dim border-[rgba(0,212,170,0.25)]">
        <div class="font-syne text-[10px] font-bold tracking-[0.15em] uppercase mb-2 text-green">&#9650; Reward (TP)</div>
        <div class="metric-pips text-green">${Math.round(tpPips)}<span class="text-sm sm:text-base font-normal"> pips</span></div>
        <div class="text-[11px] text-muted">Gain if TP hit</div>
      </div>
    </div>

    <div class="rr-panel">
      <div>
        <div class="text-xs text-muted">Risk : Reward</div>
        <div class="text-xs text-muted">Break-even win rate: ${beRate.toFixed(1)}%</div>
      </div>
      <div class="sm:text-right">
        <div class="font-syne text-base sm:text-lg font-bold ${rrClass}">1 : ${rr.toFixed(2)}</div>
        <div class="text-[11px] mt-0.5 text-muted sm:text-right">${rrLabel}</div>
      </div>
    </div>

    <div class="results-box border-border rounded-xl sm:rounded-2xl overflow-hidden">
      <div class="results-box-header bg-accent-dim border-[rgba(0,212,170,0.2)] px-4 py-3 sm:px-6 sm:py-4 font-syne text-[10px] font-bold tracking-[0.15em] uppercase text-accent">&#9632; Trade Breakdown</div>
      <div class="bg-card p-4 sm:p-5 md:p-6">
        ${resultRow('Position size', `1 × ${lotLabel}`)}
        ${resultRow('Risk % of account', `${riskPct.toFixed(2)}%`, riskPctClass)}
        ${resultRow('SL amount (loss if hit)', `-$${slAmount.toFixed(2)}`, 'text-red')}
        ${resultRow('TP amount (profit if hit)', `+$${tpAmount.toFixed(2)}`, 'text-green')}
        ${resultRow('Pip value (per lot tier)', `$${pipVal.toFixed(4)}`)}
        ${resultRow('Pip value (your position)', `$${(pipVal * LOTS).toFixed(4)}`)}
        ${resultRow('Account after loss', `$${(balance - slAmount).toFixed(2)}`)}
        <div class="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span class="text-xs text-muted tracking-wide">Account after profit</span>
          <span class="result-val text-green">$${(balance + tpAmount).toFixed(2)}</span>
        </div>
      </div>
    </div>
  `
}

renderAdviceWaiting()