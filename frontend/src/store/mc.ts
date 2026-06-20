import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface MCScenario {
  id: string
  name: string
  description: string
  params: Record<string, number>
  category: string
}

export interface MCResult {
  scenario: string
  iterations: number
  estimate: number
  trueValue?: number
  error?: number
  samples: number[]
  convergence: number[]
}

export interface HypTestResult {
  testType: string
  statistic: number
  pValue: number
  significant: boolean
  alpha: number
  df?: number
  interpretation?: string
  [key: string]: any
}

export interface SampleStats {
  count: number
  mean: number
  std: number
  min: number
  max: number
  median: number
  skewness: number
  kurtosis: number
  isDiscrete: boolean
  isNormal: boolean
  uniqueRatio: number
}

export interface ImportedSample {
  name: string
  values: number[]
  stats: SampleStats
}

export interface RecommendedItem {
  id: string
  name: string
  reason: string
  matchScore: number
}

export interface RecommendResult {
  samples: ImportedSample[]
  recommendedSimulations: RecommendedItem[]
  recommendedTests: RecommendedItem[]
}

const API_BASE = 'http://localhost:8000'

function normalRandom(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function runMC(scenario: MCScenario, n: number): MCResult {
  const samples: number[] = []
  const convergence: number[] = []

  if (scenario.id === 'pi') {
    let inside = 0
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1, y = Math.random() * 2 - 1
      if (x * x + y * y <= 1) inside++
      samples.push(x * x + y * y <= 1 ? 1 : 0)
      convergence.push((inside / (i + 1)) * 4)
    }
    const estimate = (inside / n) * 4
    return { scenario: 'pi', iterations: n, estimate, trueValue: Math.PI, error: Math.abs(estimate - Math.PI), samples, convergence }
  }
  if (scenario.id === 'brownian') {
    let pos = 0
    const dt = scenario.params.dt || 0.01
    for (let i = 0; i < n; i++) { pos += normalRandom() * Math.sqrt(dt); samples.push(pos) }
    convergence.push(...samples.slice(0, 200))
    return { scenario: 'brownian', iterations: n, estimate: pos, samples, convergence }
  }
  if (scenario.id === 'option') {
    const { S0 = 100, K = 105, r = 0.05, sigma = 0.2, T = 1 } = scenario.params
    let payoffSum = 0
    for (let i = 0; i < n; i++) {
      const ST = S0 * Math.exp((r - 0.5 * sigma * sigma) * T + sigma * Math.sqrt(T) * normalRandom())
      const p = Math.max(ST - K, 0); payoffSum += p; samples.push(p)
      if ((i + 1) % 50 === 0) convergence.push((payoffSum / (i + 1)) * Math.exp(-r * T))
    }
    return { scenario: 'option', iterations: n, estimate: (payoffSum / n) * Math.exp(-r * T), samples, convergence }
  }
  if (scenario.id === 'random_walk') {
    let pos = 0
    for (let i = 0; i < n; i++) { pos += Math.random() > 0.5 ? 1 : -1; samples.push(pos) }
    convergence.push(...samples.slice(0, 200))
    return { scenario: 'random_walk', iterations: n, estimate: pos, samples, convergence }
  }
  if (scenario.id === 'diffusion') {
    const { D = 1, dt = 0.01 } = scenario.params
    let x = 0, y = 0
    for (let i = 0; i < n; i++) {
      x += normalRandom() * Math.sqrt(2 * D * dt); y += normalRandom() * Math.sqrt(2 * D * dt)
      samples.push(Math.sqrt(x * x + y * y))
    }
    convergence.push(...samples.slice(0, 200))
    return { scenario: 'diffusion', iterations: n, estimate: Math.sqrt(x * x + y * y), samples, convergence }
  }
  const { p = 0.45, bankroll = 50, goal = 100 } = scenario.params
  let ruinCount = 0
  for (let i = 0; i < n; i++) {
    let money = bankroll
    let steps = 0
    while (money > 0 && money < goal && steps < 10000) { money += Math.random() < p ? 1 : -1; steps++ }
    if (money <= 0) ruinCount++
    samples.push(money <= 0 ? 0 : 1)
    convergence.push(ruinCount / (i + 1))
  }
  return { scenario: 'gambler', iterations: n, estimate: ruinCount / n, samples, convergence }
}

export const SCENARIOS: MCScenario[] = [
  { id: 'pi', name: '圆周率π估算', description: '随机投点估算π值，观察收敛过程', params: {}, category: '基础' },
  { id: 'brownian', name: '布朗运动模拟', description: '粒子热运动随机路径模拟', params: { dt: 0.01 }, category: '物理' },
  { id: 'option', name: '欧式期权定价', description: 'Black-Scholes期权价格蒙特卡洛估算', params: { S0: 100, K: 105, r: 0.05, sigma: 0.2, T: 1 }, category: '金融' },
  { id: 'random_walk', name: '随机游走', description: '一维离散随机游走轨迹模拟', params: {}, category: '基础' },
  { id: 'diffusion', name: '粒子扩散', description: '二维粒子随机扩散位移分析', params: { D: 1, dt: 0.01 }, category: '物理' },
  { id: 'gambler', name: '赌徒破产', description: '不利赌局下资金耗尽概率估算', params: { p: 0.45, bankroll: 50, goal: 100 }, category: '概率' }
]

export const useMCStore = defineStore('mc', () => {
  const currentScenario = ref<MCScenario>(SCENARIOS[0])
  const iterations = ref(1000)
  const result = ref<MCResult | null>(null)
  const testResult = ref<HypTestResult | null>(null)
  const isRunning = ref(false)

  const importedSamples = ref<ImportedSample[]>([])
  const recommendResult = ref<RecommendResult | null>(null)
  const batchTestResults = ref<HypTestResult[]>([])
  const importError = ref<string | null>(null)
  const isImporting = ref(false)
  const isRecommending = ref(false)
  const isTesting = ref(false)

  function runSimulation() {
    isRunning.value = true
    setTimeout(() => { result.value = runMC(currentScenario.value, iterations.value); isRunning.value = false }, 10)
  }

  function runTest(g1: number[], g2: number[]) {
    const n1 = g1.length, n2 = g2.length
    const m1 = g1.reduce((a, b) => a + b, 0) / n1
    const m2 = g2.reduce((a, b) => a + b, 0) / n2
    const v1 = g1.reduce((s, x) => s + (x - m1) ** 2, 0) / (n1 - 1)
    const v2 = g2.reduce((s, x) => s + (x - m2) ** 2, 0) / (n2 - 1)
    const se = Math.sqrt(v1 / n1 + v2 / n2)
    const t = (m1 - m2) / se
    const df = Math.round((v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)))
    const pValue = 2 * (1 - Math.min(0.9999, Math.abs(t) / (Math.abs(t) + Math.sqrt(df))))
    testResult.value = { testType: 'Welch T检验', statistic: Math.round(t * 1000) / 1000, pValue: Math.round(pValue * 10000) / 10000, significant: pValue < 0.05, alpha: 0.05, df }
  }

  function setScenario(s: MCScenario) { currentScenario.value = s; result.value = null }

  const convergenceData = computed(() => {
    if (!result.value) return [] as [number, number][]
    return result.value.convergence.slice(0, 200).map((v, i): [number, number] => [i, Math.round(v * 100000) / 100000])
  })

  const histogramData = computed(() => {
    if (!result.value) return { xAxis: [] as number[], data: [] as number[] }
    const s = result.value.samples.slice(0, 1000)
    const mn = Math.min(...s), mx = Math.max(...s)
    const bins = 20, bs = (mx - mn) / bins || 1
    const counts = new Array(bins).fill(0)
    s.forEach(v => { counts[Math.min(bins - 1, Math.floor((v - mn) / bs))]++ })
    return { xAxis: Array.from({ length: bins }, (_, i) => Math.round((mn + i * bs) * 100) / 100), data: counts }
  })

  function parseTextToSamples(text: string): { name: string; values: number[] }[] {
    const samples: { name: string; values: number[] }[] = []
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (!lines.length) return samples

    const firstParts = lines[0].split(/[,;\t]/).map(p => p.trim())
    const firstIsHeader = firstParts.some(p => isNaN(parseFloat(p)))

    if (firstIsHeader && firstParts.length > 1) {
      const cols = firstParts.length
      const colValues: number[][] = Array.from({ length: cols }, () => [])
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/[,;\t]/).map(p => p.trim())
        for (let j = 0; j < cols; j++) {
          if (j < parts.length) {
            const v = parseFloat(parts[j])
            if (!isNaN(v)) colValues[j].push(v)
          }
        }
      }
      for (let j = 0; j < cols; j++) {
        if (colValues[j].length) {
          samples.push({ name: firstParts[j] || `样本${j + 1}`, values: colValues[j] })
        }
      }
    } else {
      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(/[,;\t]/).map(p => p.trim())
        const vals: number[] = []
        for (const p of parts) {
          const v = parseFloat(p)
          if (!isNaN(v)) vals.push(v)
        }
        if (vals.length) {
          samples.push({ name: `样本${i + 1}`, values: vals })
        }
      }
    }
    return samples
  }

  async function importText(text: string) {
    importError.value = null
    isImporting.value = true
    try {
      const parsed = parseTextToSamples(text)
      if (!parsed.length) throw new Error('未解析到有效数值数据')
      const res = await fetch(`${API_BASE}/api/import/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples: parsed }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '导入失败')
      }
      const data = await res.json()
      importedSamples.value = data.samples
      recommendResult.value = null
      batchTestResults.value = []
    } catch (e: any) {
      importError.value = e.message || String(e)
    } finally {
      isImporting.value = false
    }
  }

  async function importFile(file: File) {
    importError.value = null
    isImporting.value = true
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_BASE}/api/import/file`, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '文件解析失败')
      }
      const data = await res.json()
      importedSamples.value = data.samples
      recommendResult.value = null
      batchTestResults.value = []
    } catch (e: any) {
      importError.value = e.message || String(e)
    } finally {
      isImporting.value = false
    }
  }

  async function getRecommendation() {
    if (!importedSamples.value.length) return
    isRecommending.value = true
    try {
      const res = await fetch(`${API_BASE}/api/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          samples: importedSamples.value.map(s => ({ name: s.name, values: s.values })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '推荐失败')
      }
      recommendResult.value = await res.json()
    } catch (e: any) {
      importError.value = e.message || String(e)
    } finally {
      isRecommending.value = false
    }
  }

  async function runBatchTest(testType: string, params?: Record<string, any>) {
    if (!importedSamples.value.length) return
    isTesting.value = true
    try {
      const res = await fetch(`${API_BASE}/api/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testType,
          samples: importedSamples.value.map(s => ({ name: s.name, values: s.values })),
          params,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '检验失败')
      }
      const data: HypTestResult = await res.json()
      const idx = batchTestResults.value.findIndex(r => r.testType === data.testType)
      if (idx >= 0) batchTestResults.value[idx] = data
      else batchTestResults.value.push(data)
    } catch (e: any) {
      importError.value = e.message || String(e)
    } finally {
      isTesting.value = false
    }
  }

  async function runAllRecommendedTests() {
    if (!recommendResult.value) return
    for (const t of recommendResult.value.recommendedTests) {
      await runBatchTest(t.id)
    }
  }

  function clearImported() {
    importedSamples.value = []
    recommendResult.value = null
    batchTestResults.value = []
    importError.value = null
  }

  function removeSample(index: number) {
    importedSamples.value.splice(index, 1)
    recommendResult.value = null
    batchTestResults.value = []
  }

  return {
    currentScenario, iterations, result, testResult, isRunning,
    convergenceData, histogramData, runSimulation, runTest, setScenario,
    importedSamples, recommendResult, batchTestResults, importError,
    isImporting, isRecommending, isTesting,
    importText, importFile, getRecommendation, runBatchTest,
    runAllRecommendedTests, clearImported, removeSample, parseTextToSamples,
  }
})
