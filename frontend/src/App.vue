<template>
  <div class="min-h-screen bg-slate-900 text-slate-200">
    <header class="border-b border-slate-700 px-6 py-4">
      <h1 class="text-2xl font-bold text-cyan-400">蒙特卡洛模拟与统计假设检验平台</h1>
      <p class="text-sm text-slate-500 mt-1">随机采样模拟 · 6种MC场景 · 批量数据导入实验 · 智能匹配流程</p>
    </header>

    <div class="border-b border-slate-700 px-4 bg-slate-800/50">
      <div class="flex gap-1">
        <button @click="activeTab = 'simulate'"
          :class="['px-4 py-2.5 text-sm font-bold border-b-2 transition-all', activeTab === 'simulate' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200']">
          模拟与检验
        </button>
        <button @click="activeTab = 'import'"
          :class="['px-4 py-2.5 text-sm font-bold border-b-2 transition-all flex items-center gap-2', activeTab === 'import' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200']">
          <span>📥</span>
          批量数据导入实验
          <span v-if="store.importedSamples.length" class="bg-emerald-500/20 text-emerald-400 text-xs px-1.5 py-0.5 rounded">{{ store.importedSamples.length }}组</span>
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'simulate'" class="flex flex-col lg:flex-row gap-4 p-4">
      <div class="lg:w-1/4 space-y-4">
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">模拟场景</h3>
          <div class="space-y-1">
            <div v-for="s in SCENARIOS" :key="s.id" @click="store.setScenario(s)"
              :class="['cursor-pointer p-2 rounded border text-sm transition-all', store.currentScenario.id === s.id ? 'border-cyan-500 bg-cyan-900/30 text-cyan-400' : 'border-slate-700 text-slate-300 hover:border-slate-500']">
              <div class="font-bold">{{ s.name }}</div>
              <div class="text-xs text-slate-500 mt-0.5">{{ s.description }}</div>
            </div>
          </div>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">参数控制</h3>
          <label class="text-xs text-slate-500">迭代次数: {{ store.iterations }}</label>
          <input type="range" min="100" max="5000" step="100" v-model.number="store.iterations" class="w-full mt-1 mb-3 accent-cyan-500" />
          <button @click="store.runSimulation" :disabled="store.isRunning" class="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-sm font-bold">
            {{ store.isRunning ? '运行中...' : '▶ 开始模拟' }}
          </button>
        </div>
        <div v-if="store.result" class="bg-slate-800 rounded-lg p-4 border border-slate-700 text-sm">
          <h3 class="text-sm font-bold text-slate-400 mb-3">模拟结果</h3>
          <div class="space-y-2">
            <div class="flex justify-between"><span class="text-slate-500">估算值</span><span class="text-cyan-400 font-bold font-mono">{{ store.result.estimate.toFixed(6) }}</span></div>
            <div v-if="store.result.trueValue !== undefined" class="flex justify-between"><span class="text-slate-500">真实值</span><span class="text-green-400 font-mono">{{ store.result.trueValue.toFixed(6) }}</span></div>
            <div v-if="store.result.error !== undefined" class="flex justify-between"><span class="text-slate-500">误差</span><span class="text-orange-400 font-mono">{{ store.result.error.toFixed(6) }}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">样本数</span><span class="text-slate-300">{{ store.result.iterations }}</span></div>
          </div>
        </div>
      </div>
      <div class="lg:w-3/4 space-y-4">
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">收敛过程</h3>
          <div ref="convergenceRef" class="w-full rounded" style="height:240px;background:#0f172a;"></div>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">样本分布直方图</h3>
          <div ref="histogramRef" class="w-full rounded" style="height:220px;background:#0f172a;"></div>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">假设检验 (独立样本 T 检验)</h3>
          <div class="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label class="text-xs text-slate-500">样本组A (逗号分隔)</label>
              <textarea v-model="group1Input" rows="2" class="w-full mt-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-cyan-500 resize-none"></textarea>
            </div>
            <div>
              <label class="text-xs text-slate-500">样本组B (逗号分隔)</label>
              <textarea v-model="group2Input" rows="2" class="w-full mt-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-cyan-500 resize-none"></textarea>
            </div>
          </div>
          <button @click="runTest" class="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-sm">执行T检验</button>
          <div v-if="store.testResult" class="mt-3 grid grid-cols-4 gap-3 text-sm">
            <div class="bg-slate-900 rounded p-2 text-center"><div class="text-xs text-slate-500 mb-1">统计量 t</div><div class="text-cyan-400 font-bold font-mono">{{ store.testResult.statistic }}</div></div>
            <div class="bg-slate-900 rounded p-2 text-center"><div class="text-xs text-slate-500 mb-1">p 值</div><div class="font-bold font-mono" :class="store.testResult.significant ? 'text-red-400' : 'text-green-400'">{{ store.testResult.pValue }}</div></div>
            <div class="bg-slate-900 rounded p-2 text-center"><div class="text-xs text-slate-500 mb-1">自由度 df</div><div class="text-slate-300 font-mono">{{ store.testResult.df }}</div></div>
            <div class="bg-slate-900 rounded p-2 text-center"><div class="text-xs text-slate-500 mb-1">显著性</div><div class="text-xs font-bold" :class="store.testResult.significant ? 'text-red-400' : 'text-green-400'">{{ store.testResult.significant ? '显著(p<0.05)' : '不显著' }}</div></div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'import'" class="p-4">
      <div v-if="store.importError" class="mb-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 text-red-400 text-sm flex justify-between items-center">
        <span>⚠ {{ store.importError }}</span>
        <button @click="store.importError = null" class="text-red-400 hover:text-red-300">×</button>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div class="xl:col-span-1 space-y-4">
          <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h3 class="text-sm font-bold text-emerald-400 mb-3">📥 批量数据导入</h3>

            <div class="mb-4">
              <label class="text-xs text-slate-500 mb-2 block">上传文件 (CSV / JSON / TXT)</label>
              <div class="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center hover:border-emerald-500 transition-colors cursor-pointer"
                @click="$refs.fileInput?.click()"
                @dragover.prevent @drop.prevent="handleDrop">
                <input ref="fileInput" type="file" accept=".csv,.json,.txt" class="hidden" @change="handleFile" />
                <div class="text-3xl mb-2">📁</div>
                <div class="text-sm text-slate-300 mb-1">点击或拖拽文件到此处</div>
                <div class="text-xs text-slate-500">支持 CSV、JSON、TXT 格式</div>
              </div>
            </div>

            <div class="mb-4">
              <label class="text-xs text-slate-500 mb-2 block">或粘贴文本数据</label>
              <textarea v-model="pasteText" rows="6" placeholder="A组,B组&#10;5.1,4.6&#10;4.8,4.2&#10;..."
                class="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500 resize-none"></textarea>
              <div class="text-xs text-slate-500 mt-1 mb-2">支持逗号/分号/制表符分隔，首行可作表头</div>
              <button @click="handleImportText" :disabled="!pasteText.trim() || store.isImporting"
                class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-sm font-bold">
                {{ store.isImporting ? '解析中...' : '📋 解析文本数据' }}
              </button>
            </div>

            <div class="pt-3 border-t border-slate-700">
              <button @click="loadDemo" class="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300">
                🎲 载入示例数据
              </button>
            </div>
          </div>

          <div v-if="store.importedSamples.length" class="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div class="flex justify-between items-center mb-3">
              <h3 class="text-sm font-bold text-slate-400">已导入样本 ({{ store.importedSamples.length }})</h3>
              <button @click="store.clearImported()" class="text-xs text-slate-500 hover:text-red-400">清空</button>
            </div>
            <div class="space-y-2 max-h-96 overflow-y-auto">
              <div v-for="(s, i) in store.importedSamples" :key="i"
                class="bg-slate-900 rounded p-2 border border-slate-700">
                <div class="flex justify-between items-center">
                  <div class="text-sm font-bold text-emerald-400 truncate">{{ s.name }}</div>
                  <button @click="store.removeSample(i)" class="text-slate-500 hover:text-red-400 text-xs">×</button>
                </div>
                <div class="grid grid-cols-3 gap-2 mt-2 text-xs">
                  <div><span class="text-slate-500">n=</span><span class="text-slate-300 font-mono">{{ s.stats.count }}</span></div>
                  <div><span class="text-slate-500">μ=</span><span class="text-cyan-400 font-mono">{{ s.stats.mean.toFixed(3) }}</span></div>
                  <div><span class="text-slate-500">σ=</span><span class="text-cyan-400 font-mono">{{ s.stats.std.toFixed(3) }}</span></div>
                </div>
                <div class="flex gap-1 mt-2">
                  <span v-if="s.stats.isNormal" class="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-400">正态</span>
                  <span v-if="s.stats.isDiscrete" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400">离散</span>
                  <span v-if="!s.stats.isNormal && !s.stats.isDiscrete" class="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">连续</span>
                </div>
              </div>
            </div>

            <button @click="store.getRecommendation()" :disabled="store.isRecommending"
              class="w-full mt-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-sm font-bold">
              {{ store.isRecommending ? '分析中...' : '🔍 智能匹配流程' }}
            </button>
          </div>
        </div>

        <div class="xl:col-span-2 space-y-4">
          <div v-if="store.recommendResult" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <h3 class="text-sm font-bold text-cyan-400 mb-3">🎯 推荐模拟场景</h3>
              <div class="space-y-2">
                <div v-for="(sim, i) in store.recommendResult.recommendedSimulations" :key="sim.id"
                  class="bg-slate-900 rounded p-3 border border-slate-700 hover:border-cyan-600 transition-colors">
                  <div class="flex justify-between items-start">
                    <div>
                      <div class="text-sm font-bold text-slate-200 flex items-center gap-2">
                        {{ sim.name }}
                        <span v-if="i === 0" class="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/50 text-cyan-400">最佳</span>
                      </div>
                      <div class="text-xs text-slate-500 mt-1">{{ sim.reason }}</div>
                    </div>
                    <div class="text-right">
                      <div class="text-xs text-slate-500">匹配度</div>
                      <div class="text-sm font-bold" :class="sim.matchScore >= 0.7 ? 'text-cyan-400' : sim.matchScore >= 0.5 ? 'text-amber-400' : 'text-slate-500'">
                        {{ (sim.matchScore * 100).toFixed(0) }}%
                      </div>
                    </div>
                  </div>
                  <div class="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all"
                      :class="sim.matchScore >= 0.7 ? 'bg-cyan-500' : sim.matchScore >= 0.5 ? 'bg-amber-500' : 'bg-slate-500'"
                      :style="{ width: (sim.matchScore * 100) + '%' }"></div>
                  </div>
                  <button @click="applySimScenario(sim.id)" class="mt-2 text-xs px-3 py-1 bg-cyan-900/50 hover:bg-cyan-800 rounded text-cyan-400">
                    → 应用此场景
                  </button>
                </div>
              </div>
            </div>

            <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div class="flex justify-between items-center mb-3">
                <h3 class="text-sm font-bold text-purple-400">🧪 推荐统计检验</h3>
                <button @click="store.runAllRecommendedTests()" :disabled="store.isTesting"
                  class="text-xs px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded">
                  {{ store.isTesting ? '执行中...' : '一键执行全部' }}
                </button>
              </div>
              <div class="space-y-2">
                <div v-for="(t, i) in store.recommendResult.recommendedTests" :key="t.id"
                  class="bg-slate-900 rounded p-3 border border-slate-700 hover:border-purple-600 transition-colors">
                  <div class="flex justify-between items-start">
                    <div>
                      <div class="text-sm font-bold text-slate-200 flex items-center gap-2">
                        {{ t.name }}
                        <span v-if="i === 0" class="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-400">推荐</span>
                      </div>
                      <div class="text-xs text-slate-500 mt-1">{{ t.reason }}</div>
                    </div>
                    <div class="text-right">
                      <div class="text-xs text-slate-500">匹配度</div>
                      <div class="text-sm font-bold" :class="t.matchScore >= 0.7 ? 'text-purple-400' : t.matchScore >= 0.5 ? 'text-amber-400' : 'text-slate-500'">
                        {{ (t.matchScore * 100).toFixed(0) }}%
                      </div>
                    </div>
                  </div>
                  <div class="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all"
                      :class="t.matchScore >= 0.7 ? 'bg-purple-500' : t.matchScore >= 0.5 ? 'bg-amber-500' : 'bg-slate-500'"
                      :style="{ width: (t.matchScore * 100) + '%' }"></div>
                  </div>
                  <button @click="store.runBatchTest(t.id)" :disabled="store.isTesting"
                    class="mt-2 text-xs px-3 py-1 bg-purple-900/50 hover:bg-purple-800 rounded text-purple-400 disabled:opacity-50">
                    ▶ 执行检验
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="!store.recommendResult && !store.importedSamples.length" class="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center">
            <div class="text-5xl mb-4">📊</div>
            <h3 class="text-lg font-bold text-slate-300 mb-2">批量数据导入实验</h3>
            <p class="text-sm text-slate-500 max-w-md mx-auto">
              通过上传文件或粘贴文本的方式导入外部样本数据，系统将自动分析样本特征，并匹配合适的蒙特卡洛模拟场景与统计检验流程。
            </p>
            <div class="mt-6 grid grid-cols-3 gap-3 max-w-lg mx-auto text-left">
              <div class="bg-slate-900 rounded p-3 border border-slate-700">
                <div class="text-emerald-400 font-bold text-sm mb-1">1. 导入数据</div>
                <div class="text-xs text-slate-500">上传 CSV/JSON/TXT 或粘贴文本</div>
              </div>
              <div class="bg-slate-900 rounded p-3 border border-slate-700">
                <div class="text-cyan-400 font-bold text-sm mb-1">2. 智能匹配</div>
                <div class="text-xs text-slate-500">自动分析样本并推荐流程</div>
              </div>
              <div class="bg-slate-900 rounded p-3 border border-slate-700">
                <div class="text-purple-400 font-bold text-sm mb-1">3. 一键执行</div>
                <div class="text-xs text-slate-500">执行模拟与检验获取结果</div>
              </div>
            </div>
          </div>

          <div v-if="!store.recommendResult && store.importedSamples.length" class="bg-slate-800 rounded-lg p-6 border border-slate-700 text-center">
            <div class="text-4xl mb-3">🔍</div>
            <h3 class="text-base font-bold text-slate-300 mb-1">已导入 {{ store.importedSamples.length }} 组样本</h3>
            <p class="text-sm text-slate-500 mb-4">点击"智能匹配流程"分析样本并推荐合适的模拟与检验</p>
            <button @click="store.getRecommendation()" :disabled="store.isRecommending"
              class="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-sm font-bold">
              {{ store.isRecommending ? '分析中...' : '🔍 开始智能匹配' }}
            </button>
          </div>

          <div v-if="store.batchTestResults.length" class="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h3 class="text-sm font-bold text-slate-400 mb-3">📋 检验结果汇总</h3>
            <div class="space-y-3">
              <div v-for="(r, i) in store.batchTestResults" :key="i"
                class="bg-slate-900 rounded p-4 border"
                :class="r.significant ? 'border-red-800/50' : 'border-green-800/50'">
                <div class="flex justify-between items-center mb-3">
                  <h4 class="text-sm font-bold text-slate-200">{{ r.testType }}</h4>
                  <span class="text-xs px-2 py-0.5 rounded font-bold"
                    :class="r.significant ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'">
                    {{ r.significant ? '显著 (p<0.05)' : '不显著' }}
                  </span>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                  <div class="bg-slate-800 rounded p-2">
                    <div class="text-xs text-slate-500 mb-0.5">统计量</div>
                    <div class="text-cyan-400 font-mono font-bold">{{ typeof r.statistic === 'number' ? r.statistic.toFixed(4) : r.statistic }}</div>
                  </div>
                  <div class="bg-slate-800 rounded p-2">
                    <div class="text-xs text-slate-500 mb-0.5">p 值</div>
                    <div class="font-mono font-bold" :class="r.significant ? 'text-red-400' : 'text-green-400'">{{ typeof r.pValue === 'number' ? r.pValue.toFixed(4) : r.pValue }}</div>
                  </div>
                  <div v-if="r.df !== undefined" class="bg-slate-800 rounded p-2">
                    <div class="text-xs text-slate-500 mb-0.5">自由度</div>
                    <div class="text-slate-300 font-mono">{{ r.df }}</div>
                  </div>
                  <div v-if="r.df1 !== undefined" class="bg-slate-800 rounded p-2">
                    <div class="text-xs text-slate-500 mb-0.5">自由度</div>
                    <div class="text-slate-300 font-mono">{{ r.df1 }}, {{ r.df2 }}</div>
                  </div>
                  <div v-if="r.dfBetween !== undefined" class="bg-slate-800 rounded p-2">
                    <div class="text-xs text-slate-500 mb-0.5">自由度</div>
                    <div class="text-slate-300 font-mono">{{ r.dfBetween }}, {{ r.dfWithin }}</div>
                  </div>
                  <div class="bg-slate-800 rounded p-2">
                    <div class="text-xs text-slate-500 mb-0.5">α 水平</div>
                    <div class="text-slate-300 font-mono">{{ r.alpha }}</div>
                  </div>
                </div>

                <div v-if="r.mean1 !== undefined && r.mean2 !== undefined" class="mb-3 text-xs text-slate-500">
                  均值: <span class="text-cyan-400 font-mono">{{ r.mean1.toFixed(4) }}</span> vs <span class="text-cyan-400 font-mono">{{ r.mean2.toFixed(4) }}</span>
                </div>
                <div v-if="r.var1 !== undefined && r.var2 !== undefined" class="mb-3 text-xs text-slate-500">
                  方差: <span class="text-cyan-400 font-mono">{{ r.var1.toFixed(4) }}</span> vs <span class="text-cyan-400 font-mono">{{ r.var2.toFixed(4) }}</span>
                </div>
                <div v-if="r.groupMeans" class="mb-3 text-xs text-slate-500">
                  各组均值: <span v-for="(m, j) in r.groupMeans" :key="j" class="text-cyan-400 font-mono mr-2">{{ m.toFixed(4) }}</span>
                </div>
                <div v-if="r.popmean !== undefined" class="mb-3 text-xs text-slate-500">
                  理论值: <span class="text-cyan-400 font-mono">{{ r.popmean }}</span>
                </div>

                <div v-if="r.interpretation" class="text-xs px-3 py-2 rounded bg-slate-800 text-slate-300">
                  💡 {{ r.interpretation }}
                </div>
              </div>
            </div>
          </div>

          <div v-if="store.importedSamples.length" class="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h3 class="text-sm font-bold text-slate-400 mb-3">📈 样本分布对比</h3>
            <div ref="sampleChartRef" class="w-full rounded" style="height:300px;background:#0f172a;"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useMCStore, SCENARIOS } from './store/mc'

const store = useMCStore()
const activeTab = ref<'simulate' | 'import'>('import')
const convergenceRef = ref<HTMLDivElement | null>(null)
const histogramRef = ref<HTMLDivElement | null>(null)
const sampleChartRef = ref<HTMLDivElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const pasteText = ref('')
const group1Input = ref('5.1,4.8,5.3,4.9,5.2,5.0,4.7,5.1,5.4,4.8')
const group2Input = ref('4.6,4.2,4.9,4.3,4.5,4.7,4.4,4.8,4.1,4.6')
let convChart: echarts.ECharts | null = null
let histChart: echarts.ECharts | null = null
let sampleChart: echarts.ECharts | null = null

function initCharts() {
  if (convergenceRef.value) convChart = echarts.init(convergenceRef.value, 'dark')
  if (histogramRef.value) histChart = echarts.init(histogramRef.value, 'dark')
}

function updateCharts() {
  if (convChart && store.convergenceData.length > 0) {
    convChart.setOption({
      backgroundColor: '#0f172a',
      grid: { top: 20, bottom: 35, left: 65, right: 20 },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [{ type: 'line', data: store.convergenceData, smooth: true, lineStyle: { color: '#06b6d4', width: 2 }, areaStyle: { color: 'rgba(6,182,212,0.1)' }, symbol: 'none' }],
      tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#475569' }
    })
  }
  if (histChart && store.histogramData.xAxis.length > 0) {
    histChart.setOption({
      backgroundColor: '#0f172a',
      grid: { top: 15, bottom: 40, left: 55, right: 15 },
      xAxis: { type: 'category', data: store.histogramData.xAxis, axisLabel: { color: '#94a3b8', fontSize: 9, rotate: 30 } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [{ type: 'bar', data: store.histogramData.data, itemStyle: { color: '#8b5cf6' } }],
      tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#475569' }
    })
  }
}

function updateSampleChart() {
  if (!sampleChartRef.value || !store.importedSamples.length) return
  if (!sampleChart) sampleChart = echarts.init(sampleChartRef.value, 'dark')

  const colors = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6']
  const series: any[] = store.importedSamples.map((s, i) => {
    const vals = s.values.slice(0, 200)
    const mn = Math.min(...vals), mx = Math.max(...vals)
    const bins = 30, bs = (mx - mn) / bins || 1
    const counts = new Array(bins).fill(0)
    vals.forEach(v => { counts[Math.min(bins - 1, Math.floor((v - mn) / bs))]++ })
    const data = counts.map((c, j) => [mn + j * bs + bs / 2, c])
    return {
      name: s.name,
      type: 'line',
      smooth: true,
      data,
      lineStyle: { color: colors[i % colors.length], width: 2 },
      areaStyle: { color: colors[i % colors.length] + '30' },
      symbol: 'none',
    }
  })

  sampleChart.setOption({
    backgroundColor: '#0f172a',
    grid: { top: 40, bottom: 40, left: 55, right: 20 },
    legend: { top: 5, textStyle: { color: '#94a3b8', fontSize: 11 } },
    xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 } },
    yAxis: { type: 'value', name: '频数', axisLabel: { color: '#94a3b8', fontSize: 10 }, nameTextStyle: { color: '#94a3b8' } },
    series,
    tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#475569' }
  })
}

function runTest() {
  const g1 = group1Input.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
  const g2 = group2Input.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
  if (g1.length > 1 && g2.length > 1) store.runTest(g1, g2)
}

function handleFile(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files[0]) store.importFile(input.files[0])
}

function handleDrop(e: DragEvent) {
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) store.importFile(e.dataTransfer.files[0])
}

function handleImportText() {
  store.importText(pasteText.value)
}

function loadDemo() {
  const demo = `组A,组B,组C
5.1,4.6,5.8
4.8,4.2,5.5
5.3,4.9,6.1
4.9,4.3,5.7
5.2,4.5,5.9
5.0,4.7,5.6
4.7,4.4,5.4
5.1,4.8,6.0
5.4,4.1,5.7
4.8,4.6,5.8
5.0,4.3,5.6
4.9,4.5,5.9`
  pasteText.value = demo
  store.importText(demo)
}

function applySimScenario(id: string) {
  const s = SCENARIOS.find(x => x.id === id)
  if (s) {
    store.setScenario(s)
    activeTab.value = 'simulate'
    nextTick(() => {
      store.runSimulation()
    })
  }
}

onMounted(() => {
  initCharts()
  store.runSimulation()
})

watch(() => store.result, () => updateCharts(), { deep: true })

watch(() => activeTab.value, async (v) => {
  if (v === 'import') {
    await nextTick()
    updateSampleChart()
  } else {
    await nextTick()
    if (!convChart && convergenceRef.value) convChart = echarts.init(convergenceRef.value, 'dark')
    if (!histChart && histogramRef.value) histChart = echarts.init(histogramRef.value, 'dark')
    updateCharts()
  }
})

watch(() => store.importedSamples, () => {
  if (activeTab.value === 'import') nextTick(() => updateSampleChart())
}, { deep: true })
</script>
