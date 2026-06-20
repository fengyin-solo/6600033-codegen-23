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

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1))
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function skewness(arr: number[]): number {
  if (arr.length < 3) return 0
  const m = mean(arr)
  const s = std(arr)
  if (s === 0) return 0
  return arr.reduce((sum, x) => sum + ((x - m) / s) ** 3, 0) / arr.length
}

function kurtosis(arr: number[]): number {
  if (arr.length < 4) return 0
  const m = mean(arr)
  const s = std(arr)
  if (s === 0) return 0
  return arr.reduce((sum, x) => sum + ((x - m) / s) ** 4, 0) / arr.length - 3
}

function uniqueCount(arr: number[]): number {
  return new Set(arr).size
}

function normalGammaPdf(x: number, shape: number, scale: number): number {
  if (x <= 0) return 0
  return Math.exp((shape - 1) * Math.log(x) - x / scale - Math.log(scale) * shape - lnGamma(shape))
}

function lnGamma(xx: number): number {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = xx
  let tmp = xx + 5.5
  tmp -= (xx + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y
  return -tmp + Math.log(2.5066282746310005 * ser / xx)
}

function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x)
  const t = 1.0 / (1.0 + p * absX)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX)
  return sign * y
}

function normalCdf(x: number, mu = 0, sigma = 1): number {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.sqrt(2))))
}

function tCdf(t: number, df: number): number {
  if (df <= 0) return 0.5
  const x = df / (df + t * t)
  const a = df / 2
  const b = 0.5
  let bt = 0
  if (x > 0 && x < 1) {
    bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  }
  let p = 0
  if (x < (a + 1) / (a + b + 2)) {
    p = bt * betacf(x, a, b) / a
  } else {
    p = 1 - bt * betacf(1 - x, b, a) / b
  }
  if (t > 0) p = 1 - p
  return 0.5 + Math.abs(p - 0.5) * (t > 0 ? 1 : -1)
}

function betacf(x: number, a: number, b: number): number {
  const fpmin = 1e-30
  let m = 1, m2, aa, c = 1, d = 1 - (a + b) * x / (a + 1), h
  if (Math.abs(d) < fpmin) d = fpmin
  d = 1 / d
  h = d
  while (m <= 100) {
    m2 = 2 * m
    aa = m * (b - m) * x / ((a - 1 + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < fpmin) d = fpmin
    c = 1 + aa / c
    if (Math.abs(c) < fpmin) c = fpmin
    d = 1 / d
    h *= d * c
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2))
    d = 1 + aa * d
    if (Math.abs(d) < fpmin) d = fpmin
    c = 1 + aa / c
    if (Math.abs(c) < fpmin) c = fpmin
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 3e-7) break
    m++
  }
  return h
}

function fCdf(f: number, df1: number, df2: number): number {
  if (f <= 0) return 0
  const x = df1 * f / (df2 + df1 * f)
  const a = df1 / 2
  const b = df2 / 2
  let bt = 0
  if (x > 0 && x < 1) {
    bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  }
  let p = 0
  if (x < (a + 1) / (a + b + 2)) {
    p = bt * betacf(x, a, b) / a
  } else {
    p = 1 - bt * betacf(1 - x, b, a) / b
  }
  return p
}

function chi2Cdf(x: number, df: number): number {
  if (x <= 0 || df <= 0) return 0
  const a = df / 2
  let sum = 0
  let term = 1
  let k = 0
  const maxIter = 100
  while (k < maxIter && term > 1e-15) {
    if (k > 0) term *= (x / 2) / (a + k - 1)
    sum += term / (a + k)
    k++
  }
  return Math.exp(-x / 2 + (a - 1) * Math.log(x / 2) - lnGamma(a)) * sum
}

function analyzeSampleLocal(values: number[]): SampleStats {
  const n = values.length
  const m = mean(values)
  const s = std(values)
  const mn = Math.min(...values)
  const mx = Math.max(...values)
  const med = median(values)
  const skew = skewness(values)
  const kurt = kurtosis(values)
  const uniqueRatio = n > 0 ? uniqueCount(values) / n : 0
  const isDiscrete = uniqueRatio < 0.3 || values.slice(0, Math.min(n, 50)).every(v => Number.isInteger(v))

  let isNormal = true
  if (n >= 8) {
    try {
      const s2 = s * s
      const n1 = n - 1
      const g1 = skew * Math.sqrt(n * n1) / (n - 2)
      const g2 = kurt * (n * n - 1) / ((n - 2) * (n - 3))
      const k2 = g1 * g1 + g2 * g2 * n / (n + 1)
      const p = 1 - chi2Cdf(k2, 2)
      isNormal = p > 0.05
    } catch {
      isNormal = true
    }
  }

  return {
    count: n, mean: m, std: s, min: mn, max: mx, median: med,
    skewness: skew, kurtosis: kurt, isDiscrete, isNormal, uniqueRatio,
  }
}

function getRecommendationLocal(samples: ImportedSample[]): RecommendResult {
  const nSamples = samples.length
  const analyzed = samples.map(s => ({ ...s }))

  const sims: RecommendedItem[] = []
  const tests: RecommendedItem[] = []

  if (nSamples === 1) {
    const st = analyzed[0].stats
    if (st.count >= 30 && st.isNormal) {
      sims.push({
        id: 'brownian', name: '布朗运动模拟', matchScore: 0.85,
        reason: `样本量 ${st.count}，近似正态分布 (mean=${st.mean.toFixed(3)}, std=${st.std.toFixed(3)})`,
      })
    }
    if (st.isDiscrete && st.uniqueRatio < 0.15) {
      sims.push({
        id: 'random_walk', name: '随机游走', matchScore: 0.75,
        reason: `数据呈离散特征，唯一值占比 ${st.uniqueRatio.toFixed(2)}`,
      })
    }
    if (st.std > 0 && st.count >= 20) {
      sims.push({
        id: 'diffusion', name: '粒子扩散', matchScore: 0.6,
        reason: `样本有变异，可用于扩散位移分析 (std=${st.std.toFixed(3)})`,
      })
    }
    tests.push({ id: 'normality', name: '正态性检验', matchScore: 0.9, reason: '单样本推荐先验证分布假设' })
    tests.push({ id: 'one_sample_t', name: '单样本 T 检验', matchScore: 0.8, reason: `可检验样本均值是否等于理论值 (mean=${st.mean.toFixed(3)})` })
  } else if (nSamples === 2) {
    const st1 = analyzed[0].stats, st2 = analyzed[1].stats
    tests.push({
      id: 'two_sample_t', name: '独立样本 T 检验', matchScore: 0.95,
      reason: `两组样本 (n1=${st1.count}, n2=${st2.count})，推荐比较均值差异`,
    })
    if (st1.isNormal && st2.isNormal) {
      tests.push({ id: 'f_test', name: '方差齐性 F 检验', matchScore: 0.7, reason: '两组均近似正态分布，可检验方差齐性' })
    }
    if (st1.isDiscrete && st2.isDiscrete) {
      tests.push({ id: 'chi_square', name: '卡方检验', matchScore: 0.75, reason: '两组离散数据，可检验分布独立性' })
    }
    sims.push({ id: 'option', name: '欧式期权定价', matchScore: 0.4, reason: '可比较两组作为不同参数下的定价基准' })
  } else {
    const allNormal = analyzed.every(a => a.stats.isNormal)
    const allDiscrete = analyzed.every(a => a.stats.isDiscrete)
    tests.push({
      id: 'anova', name: '单因素方差分析 (ANOVA)', matchScore: 0.95,
      reason: `${nSamples} 组样本，推荐检验多组均值差异`,
    })
    if (allNormal) tests.push({ id: 'bartlett', name: 'Bartlett 方差齐性检验', matchScore: 0.7, reason: '多组近似正态分布，可检验方差齐性' })
    if (allDiscrete) tests.push({ id: 'chi_square', name: '卡方检验', matchScore: 0.65, reason: '多组离散数据，可检验分布独立性' })
    sims.push({ id: 'gambler', name: '赌徒破产', matchScore: 0.4, reason: '多组样本可模拟不同破产概率场景' })
  }

  sims.push({ id: 'pi', name: '圆周率π估算', matchScore: 0.3, reason: '基础蒙特卡洛场景，可用于对比方法准确性' })
  sims.sort((a, b) => b.matchScore - a.matchScore)
  tests.sort((a, b) => b.matchScore - a.matchScore)
  return { samples: analyzed, recommendedSimulations: sims, recommendedTests: tests }
}

function runTestLocal(testType: string, samples: number[][], params?: Record<string, any>): HypTestResult {
  if (testType === 'normality') {
    const arr = samples[0]
    const n = arr.length
    if (n < 8) return { testType: '正态性检验 (近似)', statistic: 0, pValue: 0.5, significant: false, alpha: 0.05, interpretation: '样本量不足8，无法进行正态性检验' }
    const m = mean(arr), s = std(arr)
    const g1 = skewness(arr)
    const g2 = kurtosis(arr)
    const k2 = g1 * g1 + g2 * g2 * n / (n + 1)
    const pValue = Math.max(0.0001, Math.min(0.9999, 1 - chi2Cdf(k2, 2)))
    return {
      testType: '正态性检验 (D\'Agostino-Pearson, 本地)', statistic: Number(k2.toFixed(4)),
      pValue: Number(pValue.toFixed(4)), significant: pValue < 0.05, alpha: 0.05,
      interpretation: pValue < 0.05 ? '显著(p<0.05)则拒绝正态假设' : '不显著，不能拒绝正态假设',
    }
  }

  if (testType === 'one_sample_t') {
    const arr = samples[0]
    const popmean = (params || {}).popmean ?? 0
    const n = arr.length
    const m = mean(arr), s = std(arr)
    const t = (m - popmean) / (s / Math.sqrt(n))
    const df = n - 1
    const p = 2 * (1 - tCdf(Math.abs(t), df))
    const pValue = Math.max(0.0001, Math.min(0.9999, p))
    return {
      testType: '单样本 T 检验 (本地)', statistic: Number(t.toFixed(4)), pValue: Number(pValue.toFixed(4)),
      df, significant: pValue < 0.05, alpha: 0.05, popmean,
      interpretation: pValue < 0.05 ? '显著(p<0.05)则样本均值与理论值有显著差异' : '无显著差异',
    }
  }

  if (testType === 'two_sample_t') {
    const g1 = samples[0], g2 = samples[1]
    const n1 = g1.length, n2 = g2.length
    const m1 = mean(g1), m2 = mean(g2)
    const v1 = std(g1) ** 2, v2 = std(g2) ** 2
    const equalVar = (params || {}).equalVar ?? false
    let t: number, df: number
    if (equalVar) {
      const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2)
      t = (m1 - m2) / Math.sqrt(sp2 * (1 / n1 + 1 / n2))
      df = n1 + n2 - 2
    } else {
      const se = Math.sqrt(v1 / n1 + v2 / n2)
      t = (m1 - m2) / se
      df = Math.round((v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)))
    }
    const p = 2 * (1 - tCdf(Math.abs(t), df))
    const pValue = Math.max(0.0001, Math.min(0.9999, p))
    return {
      testType: '独立样本 T 检验' + (equalVar ? ' (假设方差相等, 本地)' : ' (Welch, 不等方差, 本地)'),
      statistic: Number(t.toFixed(4)), pValue: Number(pValue.toFixed(4)), df,
      significant: pValue < 0.05, alpha: 0.05, mean1: Number(m1.toFixed(4)), mean2: Number(m2.toFixed(4)),
      interpretation: pValue < 0.05 ? '显著(p<0.05)则两组均值有显著差异' : '两组均值无显著差异',
    }
  }

  if (testType === 'f_test') {
    const g1 = samples[0], g2 = samples[1]
    const v1 = std(g1) ** 2, v2 = std(g2) ** 2
    const f = v2 > 0 ? v1 / v2 : 1e9
    const df1 = g1.length - 1, df2 = g2.length - 1
    const p = 2 * Math.min(fCdf(f, df1, df2), 1 - fCdf(f, df1, df2))
    const pValue = Math.max(0.0001, Math.min(0.9999, p))
    return {
      testType: '方差齐性 F 检验 (本地)', statistic: Number(f.toFixed(4)), pValue: Number(pValue.toFixed(4)),
      df1, df2, var1: Number(v1.toFixed(4)), var2: Number(v2.toFixed(4)),
      significant: pValue < 0.05, alpha: 0.05,
      interpretation: pValue < 0.05 ? '显著(p<0.05)则两组方差有显著差异' : '两组方差无显著差异（方差齐）',
    }
  }

  if (testType === 'anova') {
    const k = samples.length
    const N = samples.reduce((s, g) => s + g.length, 0)
    const grandMean = mean(samples.flat())
    let ssBetween = 0, ssWithin = 0
    const groupMeans: number[] = []
    for (const g of samples) {
      const gm = mean(g)
      groupMeans.push(Number(gm.toFixed(4)))
      ssBetween += g.length * (gm - grandMean) ** 2
      ssWithin += g.reduce((s, x) => s + (x - gm) ** 2, 0)
    }
    const dfBetween = k - 1, dfWithin = N - k
    const msBetween = ssBetween / dfBetween
    const msWithin = ssWithin / dfWithin
    const f = msWithin > 0 ? msBetween / msWithin : 0
    const p = 1 - fCdf(f, dfBetween, dfWithin)
    const pValue = Math.max(0.0001, Math.min(0.9999, p))
    return {
      testType: '单因素方差分析 (ANOVA, 本地)', statistic: Number(f.toFixed(4)), pValue: Number(pValue.toFixed(4)),
      dfBetween, dfWithin, significant: pValue < 0.05, alpha: 0.05, groupMeans,
      interpretation: pValue < 0.05 ? '显著(p<0.05)则至少有一组均值与其他组有显著差异' : '各组均值无显著差异',
    }
  }

  if (testType === 'mann_whitney') {
    const g1 = samples[0], g2 = samples[1]
    const n1 = g1.length, n2 = g2.length
    const combined = [...g1, ...g2]
    const ranks = combined.map((v, i) => ({ v, i, isG1: i < n1 }))
      .sort((a, b) => a.v - b.v)
      .map((item, idx) => ({ ...item, rank: idx + 1 }))
    const rankSum1 = ranks.filter(r => r.isG1).reduce((s, r) => s + r.rank, 0)
    const u1 = rankSum1 - n1 * (n1 + 1) / 2
    const u2 = n1 * n2 - u1
    const u = Math.min(u1, u2)
    const mu = n1 * n2 / 2
    const sigma = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12)
    const z = (u - mu) / sigma
    const p = 2 * (1 - normalCdf(Math.abs(z)))
    const pValue = Math.max(0.0001, Math.min(0.9999, p))
    return {
      testType: 'Mann-Whitney U 检验 (非参数, 本地)', statistic: Number(u.toFixed(4)), pValue: Number(pValue.toFixed(4)),
      significant: pValue < 0.05, alpha: 0.05,
      interpretation: pValue < 0.05 ? '显著(p<0.05)则两组分布有显著差异' : '两组分布无显著差异',
    }
  }

  if (testType === 'chi_square') {
    const observed = samples.map(g => g.length)
    const total = observed.reduce((a, b) => a + b, 0)
    const k = observed.length
    const expected = total / k
    let chi2 = 0
    for (const o of observed) chi2 += (o - expected) ** 2 / expected
    const df = k - 1
    const p = 1 - chi2Cdf(chi2, df)
    const pValue = Math.max(0.0001, Math.min(0.9999, p))
    return {
      testType: '卡方拟合优度检验 (本地)', statistic: Number(chi2.toFixed(4)), pValue: Number(pValue.toFixed(4)),
      df, observed, expected: Array(k).fill(expected),
      significant: pValue < 0.05, alpha: 0.05,
      interpretation: pValue < 0.05 ? '显著(p<0.05)则观测分布与期望分布有显著差异' : '观测分布与期望无显著差异',
    }
  }

  if (testType === 'bartlett') {
    const k = samples.length
    const N = samples.reduce((s, g) => s + g.length, 0)
    const vars = samples.map(g => std(g) ** 2)
    const sp2 = samples.reduce((s, g, i) => s + (g.length - 1) * vars[i], 0) / (N - k)
    let numerator = 0, denominator = 0
    for (let i = 0; i < k; i++) {
      const ni = samples[i].length
      numerator += (ni - 1) * Math.log(vars[i] > 0 ? vars[i] : 1e-10)
      denominator += 1 / (ni - 1)
    }
    const bartlett = ((N - k) * Math.log(sp2 > 0 ? sp2 : 1e-10) - numerator) / (1 + (denominator - 1 / (N - k)) / (3 * (k - 1)))
    const df = k - 1
    const p = 1 - chi2Cdf(bartlett, df)
    const pValue = Math.max(0.0001, Math.min(0.9999, p))
    return {
      testType: 'Bartlett 方差齐性检验 (本地)', statistic: Number(bartlett.toFixed(4)), pValue: Number(pValue.toFixed(4)),
      significant: pValue < 0.05, alpha: 0.05,
      interpretation: pValue < 0.05 ? '显著(p<0.05)则各组方差有显著差异' : '各组方差无显著差异（方差齐）',
    }
  }

  return { testType: '未知检验', statistic: 0, pValue: 1, significant: false, alpha: 0.05, interpretation: '未知检验类型' }
}

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
  const backendAvailable = ref(true)
  const usingFallback = ref(false)

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

  async function checkBackend(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1500)
      const res = await fetch(`${API_BASE}/`, { method: 'GET', signal: controller.signal })
      clearTimeout(timeoutId)
      return res.ok
    } catch {
      return false
    }
  }

  async function importText(text: string) {
    importError.value = null
    isImporting.value = true
    try {
      const parsed = parseTextToSamples(text)
      if (!parsed.length) throw new Error('未解析到有效数值数据')

      const available = await checkBackend()
      backendAvailable.value = available

      if (available) {
        try {
          const res = await fetch(`${API_BASE}/api/import/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ samples: parsed }),
          })
          if (!res.ok) throw new Error('后端返回错误')
          const data = await res.json()
          importedSamples.value = data.samples
          usingFallback.value = false
        } catch {
          importedSamples.value = parsed.map(p => ({ ...p, stats: analyzeSampleLocal(p.values) }))
          usingFallback.value = true
          importError.value = '后端不可用，已使用本地解析（结果仅供参考）'
        }
      } else {
        importedSamples.value = parsed.map(p => ({ ...p, stats: analyzeSampleLocal(p.values) }))
        usingFallback.value = true
        importError.value = '后端不可用，已使用本地解析（结果仅供参考）'
      }

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
      const available = await checkBackend()
      backendAvailable.value = available

      if (available) {
        try {
          const form = new FormData()
          form.append('file', file)
          const res = await fetch(`${API_BASE}/api/import/file`, { method: 'POST', body: form })
          if (!res.ok) throw new Error('后端返回错误')
          const data = await res.json()
          importedSamples.value = data.samples
          usingFallback.value = false
        } catch (err) {
          const text = await file.text()
          const parsed = parseTextToSamples(text)
          if (!parsed.length) throw new Error('未解析到有效数值数据')
          importedSamples.value = parsed.map(p => ({ ...p, stats: analyzeSampleLocal(p.values) }))
          usingFallback.value = true
          importError.value = '后端不可用，已使用本地解析（结果仅供参考）'
        }
      } else {
        const text = await file.text()
        const parsed = parseTextToSamples(text)
        if (!parsed.length) throw new Error('未解析到有效数值数据')
        importedSamples.value = parsed.map(p => ({ ...p, stats: analyzeSampleLocal(p.values) }))
        usingFallback.value = true
        importError.value = '后端不可用，已使用本地解析（结果仅供参考）'
      }

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
      const available = backendAvailable.value && (await checkBackend())

      if (available) {
        try {
          const res = await fetch(`${API_BASE}/api/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              samples: importedSamples.value.map(s => ({ name: s.name, values: s.values })),
            }),
          })
          if (!res.ok) throw new Error('后端返回错误')
          recommendResult.value = await res.json()
          usingFallback.value = false
        } catch {
          recommendResult.value = getRecommendationLocal(importedSamples.value)
          usingFallback.value = true
          importError.value = '后端不可用，已使用本地推荐（结果仅供参考）'
        }
      } else {
        recommendResult.value = getRecommendationLocal(importedSamples.value)
        usingFallback.value = true
        importError.value = '后端不可用，已使用本地推荐（结果仅供参考）'
      }
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
      const available = backendAvailable.value && (await checkBackend())
      let data: HypTestResult

      if (available) {
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
          if (!res.ok) throw new Error('后端返回错误')
          data = await res.json()
        } catch {
          data = runTestLocal(testType, importedSamples.value.map(s => s.values), params)
          data.interpretation = (data.interpretation || '') + ' [本地计算]'
        }
      } else {
        data = runTestLocal(testType, importedSamples.value.map(s => s.values), params)
        data.interpretation = (data.interpretation || '') + ' [本地计算]'
      }

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
    usingFallback.value = false
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
    isImporting, isRecommending, isTesting, usingFallback, backendAvailable,
    importText, importFile, getRecommendation, runBatchTest,
    runAllRecommendedTests, clearImported, removeSample, parseTextToSamples,
  }
})
