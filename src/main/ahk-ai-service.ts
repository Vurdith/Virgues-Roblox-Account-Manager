import { createHash } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { constants as osConstants, cpus, setPriority, totalmem } from 'node:os'
import { access, mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { AhkAiGenerationResult, AhkAiModelTier, AhkAiStatus } from '../shared/types'
import { AHK_DOCUMENTATION_ATTRIBUTION, retrieveAhkKnowledge } from './ahk-v2-knowledge'

const GIB = 1024 ** 3
const MAX_REQUEST_LENGTH = 4_000
const MAX_WORKER_OUTPUT = 2 * 1024 * 1024

interface ModelDefinition {
  tier: AhkAiModelTier
  name: string
  filename: string
  url: string
  bytes: number
  sha256: string
  contextSize: number
  maxTokens: number
}

const MODELS: Record<AhkAiModelTier, ModelDefinition> = {
  'low-memory': {
    tier: 'low-memory',
    name: 'Qwen2.5-Coder 0.5B · Low-memory',
    filename: 'qwen2.5-coder-0.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf',
    bytes: 491_400_064,
    sha256: '1d9614638d18024d0fbb36575a15f1302a3adf044df10345688ec4f6e1c4ff32',
    contextSize: 2_048,
    maxTokens: 900,
  },
  standard: {
    tier: 'standard',
    name: 'Qwen2.5-Coder 1.5B · Standard',
    filename: 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    bytes: 1_117_320_768,
    sha256: 'cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046',
    contextSize: 4_096,
    maxTokens: 1_400,
  },
}

interface WorkerResult { ok: boolean; response?: string; error?: string; generationTrace?: string[] }

interface NormalizedAhkScript {
  script: string
  changed: boolean
}

function splitLegacyArguments(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote = ''
  let depth = 0
  for (const character of value) {
    if (quote) {
      current += character
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
    } else if (character === '(') {
      depth += 1
      current += character
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
      current += character
    } else if (character === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += character
  }
  parts.push(current.trim())
  return parts.filter(Boolean)
}

function ahkString(value: string): string {
  const trimmed = value.trim()
  if (/^"[\s\S]*"$/.test(trimmed)) return trimmed
  return JSON.stringify(trimmed)
}

function ahkExpression(value: string): string {
  const trimmed = value.trim()
  if (/^(?:-?\d+(?:\.\d+)?|true|false|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)$/i.test(trimmed)) return trimmed
  return ahkString(trimmed)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface FencedResponseBlock {
  raw: string
  language: string
  body: string
}

function extractFencedResponseBlocks(response: string): FencedResponseBlock[] {
  return [...response.matchAll(/```([^\r\n`]*)\r?\n([\s\S]*?)```/g)].map((match) => ({
    raw: match[0],
    language: match[1]?.trim() ?? '',
    body: match[2] ?? '',
  }))
}

function hasAhkHeader(value: string): boolean {
  return /^\s*#Requires\s+AutoHotkey\s+v2\b/im.test(value)
}

function looksLikeAhkSourceLine(value: string): boolean {
  return /^(?:#|[A-Za-z_]\w*\s*\([^)]*\)\s*\{|(?:if|else|return|while|loop|for|try|catch|finally)\b|[A-Za-z_]\w*\s*:?=|[{}]|(?:SetTimer|Send|Sleep|WinActive|WinExist|WinActivate|MsgBox|ToolTip|Hotkey)\b)/i.test(value)
}

function cleanGeneratedAhkSource(source: string): string {
  let script = source.trim()
  const headerStart = script.search(/^\s*#Requires\s+AutoHotkey\s+v2\b/im)
  if (headerStart >= 0) script = script.slice(headerStart)

  const cleaned: string[] = []
  let skippingProse = false
  let bodyStarted = false
  for (const line of script.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (!skippingProse) cleaned.push(line)
      continue
    }
    if (/^```/.test(trimmed)) continue

    const sectionHeading = /^(?:Brief|Plan|Implementation plan|Request summary|Explanation)\s*:/i.test(trimmed)
    if (sectionHeading) {
      if (bodyStarted || /^Explanation\s*:/i.test(trimmed)) break
      skippingProse = true
      continue
    }

    // Small local models sometimes put their planning bullets inside the code
    // fence. They are never valid AHK source, so discard them before validation.
    if (/^(?:[-*•]|\d+[.)])\s+/.test(trimmed)) {
      if (bodyStarted) break
      continue
    }

    if (skippingProse && !looksLikeAhkSourceLine(trimmed)) continue
    skippingProse = false
    cleaned.push(line)
    if (!/^#(?:Requires|SingleInstance)\b/i.test(trimmed) && looksLikeAhkSourceLine(trimmed)) bodyStarted = true
  }

  return cleaned.join('\n').trim()
}

function normalizeAhkV2Script(script: string): NormalizedAhkScript {
  const lines = script.replace(/\r\n/g, '\n').split('\n')
  const normalized: string[] = []
  let changed = false
  let braceDepth = 0
  let topLevelGuard: string | null = null

  for (const line of lines) {
    if (/^\s*#Warn\b/i.test(line)) {
      // #Warn can open a modal warning window during /Validate. The generated
      // script is already reviewed by our own checks, so keep validation
      // non-interactive and let the app surface actionable failures instead.
      changed = true
      continue
    }

    const screenActiveCheck = line.match(/^(\s*)if\s+(not\s+|!)?A_ScreenActive\s*$/i)
    if (screenActiveCheck) {
      const negated = Boolean(screenActiveCheck[2])
      normalized.push(`${screenActiveCheck[1]}if ${negated ? '!' : ''}WinActive("A")`)
      changed = true
      continue
    }

    if (/\bA_ScreenActive\b/.test(line)) {
      normalized.push(line.replace(/\bA_ScreenActive\b/g, 'WinActive("A")'))
      changed = true
      continue
    }

    const redundantWindowCondition = line.match(/^\s*if\s+Win(?:Active|Exist)\(([^)]*)\)\s+(?:or|\|\|)\s+Win(?:Exist|Active)\(\1\)\s*$/i)
    if (redundantWindowCondition) {
      const indent = line.match(/^\s*/)?.[0] ?? ''
      normalized.push(`${indent}if WinActive(${redundantWindowCondition[1]})`)
      changed = true
      continue
    }

    const guard = line.match(/^(\s*)(Win(?:Exist|Active)\([^)]*\))\s+(?:or|&&)\s+return\s*$/i)
    if (guard && braceDepth === 0) {
      topLevelGuard = guard[2]!.replace(/^WinExist/i, 'WinActive')
      changed = true
      continue
    }

    const inlineGuard = line.match(/^(\s*)if\s+(!?Win(?:Exist|Active)\([^)]*\))\s+return\s*$/i)
    if (inlineGuard) {
      normalized.push(`${inlineGuard[1]}if ${inlineGuard[2]}`, `${inlineGuard[1]}    return`)
      changed = true
      continue
    }

    const hotIf = line.match(/^(\s*)#IfWin(Not)?Active\s*,\s*(.*)$/i)
    if (hotIf) {
      const condition = `${hotIf[2] ? '!' : ''}WinActive(${ahkString(hotIf[3]!)})`
      normalized.push(`${hotIf[1]!}#HotIf ${condition}`)
      changed = true
      continue
    }

    const legacyTitle = line.match(/^(\s*)WinGetActiveTitle\s*,\s*([A-Za-z_]\w*)\s*$/i)
    if (legacyTitle) {
      normalized.push(`${legacyTitle[1]!}${legacyTitle[2]!} := WinGetTitle("A")`)
      changed = true
      continue
    }

    const legacy = line.match(/^(\s*)(SendInput|Send|Sleep|MsgBox|ToolTip|WinActivate|WinWait|WinWaitActive|SetTitleMatchMode|SetTimer|CoordMode|Click|MouseMove)\s*,\s*(.*)$/i)
    if (legacy) {
      const indent = legacy[1]!
      const name = legacy[2]!.toLowerCase()
      const args = splitLegacyArguments(legacy[3]!)
      let replacement = line
      if (name === 'settimer' && args.length >= 2) {
        const period = /^(?:off|false)$/i.test(args[1]!) ? '0' : ahkExpression(args[1]!)
        replacement = `${indent}SetTimer(${ahkExpression(args[0]!)}, ${period})`
      } else if (name === 'send' || name === 'sendinput') {
        replacement = `${indent}Send(${ahkString(args.join(', '))})`
      } else if (name === 'sleep' || name === 'settitlematchmode') {
        replacement = `${indent}${name === 'sleep' ? 'Sleep' : 'SetTitleMatchMode'}(${ahkExpression(args.join(', '))})`
      } else if (name === 'coordmode') {
        replacement = `${indent}CoordMode(${args.map(ahkString).join(', ')})`
      } else if (name === 'click' || name === 'mousemove') {
        replacement = `${indent}${name === 'click' ? 'Click' : 'MouseMove'}(${args.map(ahkExpression).join(', ')})`
      } else {
        const canonical = name === 'msgbox' ? 'MsgBox' : name === 'winwaitactive' ? 'WinWaitActive' : name === 'winwait' ? 'WinWait' : name === 'winactivate' ? 'WinActivate' : name === 'tooltip' ? 'ToolTip' : 'MsgBox'
        replacement = `${indent}${canonical}(${ahkString(args.join(', '))})`
      }
      normalized.push(replacement)
      changed = true
      continue
    }

    normalized.push(line)
    braceDepth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length
  }

  let result = normalized.join('\n')
  if (topLevelGuard) {
    const timer = result.match(/SetTimer\(\s*([A-Za-z_]\w*)\s*,/i)
    const callback = timer?.[1]
    if (callback) {
      const callbackPattern = new RegExp(`(^\\s*${escapeRegExp(callback)}\\s*\\([^\\n]*\\)\\s*\\{)`, 'im')
      if (callbackPattern.test(result)) {
        result = result.replace(callbackPattern, `$1\n    if !${topLevelGuard}\n        return`)
      } else {
        result = `if !${topLevelGuard}\n    return\n\n${result}`
      }
    } else {
      result = `if !${topLevelGuard}\n    return\n\n${result}`
    }
  }

  return { script: result, changed }
}

export class AhkAiService {
  private readonly modelDirectory = join(app.getPath('userData'), 'AHK Assistant', 'models')
  private operation: 'download' | 'generate' | null = null
  private downloadedBytes = 0
  private downloadAbort: AbortController | null = null
  private activeWorker: ChildProcessWithoutNullStreams | null = null
  private generationStage: AhkAiStatus['generationStage']
  private generationDetail: string | undefined
  private generationTrace: string[] = []

  async getStatus(): Promise<AhkAiStatus> {
    const model = this.selectedModel()
    const modelPath = join(this.modelDirectory, model.filename)
    let bytes = 0
    try { bytes = (await stat(modelPath)).size } catch { /* Not downloaded yet. */ }
    const installed = bytes === model.bytes
    const downloadedBytes = this.operation === 'download' ? this.downloadedBytes : Math.min(bytes, model.bytes)
    return {
      modelTier: model.tier,
      modelName: model.name,
      totalRamGb: Math.round((totalmem() / GIB) * 10) / 10,
      modelSizeBytes: model.bytes,
      downloadedBytes,
      installed,
      downloading: this.operation === 'download',
      generating: this.operation === 'generate',
      runtimeActive: this.activeWorker !== null,
      generationStage: this.generationStage,
      generationDetail: this.generationDetail,
      generationTrace: [...this.generationTrace],
      progressPercent: model.bytes ? Math.min(100, Math.round((downloadedBytes / model.bytes) * 1000) / 10) : 0,
    }
  }

  async downloadModel(): Promise<AhkAiStatus> {
    if (this.operation) throw new Error(this.operation === 'download' ? 'The AI model is already downloading.' : 'Wait for the current generation to finish.')
    const model = this.selectedModel()
    const target = join(this.modelDirectory, model.filename)
    if (await this.isExpectedFile(target, model.bytes)) return this.getStatus()
    this.operation = 'download'
    this.downloadedBytes = 0
    this.downloadAbort = new AbortController()
    const temporary = `${target}.download`
    await mkdir(this.modelDirectory, { recursive: true })
    await rm(temporary, { force: true })
    let completed = false
    try {
      const response = await fetch(model.url, {
        signal: this.downloadAbort.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Virgue-AHK-Assistant/1.0' },
      })
      if (!response.ok || !response.body) throw new Error(`The model host returned HTTP ${response.status}.`)
      const file = await open(temporary, 'w')
      const hash = createHash('sha256')
      try {
        const reader = response.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          await file.write(value)
          hash.update(value)
          this.downloadedBytes += value.byteLength
        }
      } finally { await file.close() }
      if (this.downloadedBytes !== model.bytes) throw new Error(`The model download was incomplete (${this.downloadedBytes} of ${model.bytes} bytes).`)
      const digest = hash.digest('hex')
      if (digest !== model.sha256) throw new Error('The downloaded model failed its security checksum and was discarded.')
      await rm(target, { force: true })
      await rename(temporary, target)
      completed = true
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      if (this.downloadAbort?.signal.aborted) throw new Error('The model download was cancelled.')
      throw error
    } finally {
      this.operation = null
      this.downloadAbort = null
      this.downloadedBytes = 0
    }
    if (!completed) throw new Error('The model download did not complete.')
    return this.getStatus()
  }

  async generate(request: string): Promise<AhkAiGenerationResult> {
    const normalized = request.trim()
    if (!normalized) throw new Error('Describe the AutoHotkey script you want Virgue to write.')
    if (normalized.length > MAX_REQUEST_LENGTH) throw new Error('Keep the request under 4,000 characters.')
    if (this.operation) throw new Error(this.operation === 'generate' ? 'The AHK Assistant is already writing a script.' : 'Wait for the model download to finish.')
    const model = this.selectedModel()
    const modelPath = join(this.modelDirectory, model.filename)
    if (!await this.isExpectedFile(modelPath, model.bytes)) throw new Error(`Download ${model.name} before generating a script.`)
    this.operation = 'generate'
    this.generationStage = 'loading-model'
    this.generationDetail = 'Loading the model for this request only.'
    this.generationTrace = []
    try {
      const prompt = this.buildPrompt(normalized)
      const workerResult = await this.runWorker(model, modelPath, prompt, normalized)
      this.generationStage = 'validating'
      this.generationDetail = 'Running local syntax and safety checks.'
      const parsed = this.parseResponse(workerResult.response)
      const normalizedScript = normalizeAhkV2Script(parsed.script)
      const warnings = this.scanWarnings(normalizedScript.script)
      const validationMessage = await this.validateScript(normalizedScript.script, normalizedScript.changed)
      return { ...parsed, script: normalizedScript.script, warnings, validationMessage, modelTier: model.tier, modelName: model.name, generationTrace: workerResult.generationTrace }
    } finally {
      this.operation = null
      this.generationStage = undefined
      this.generationDetail = undefined
      this.activeWorker = null
    }
  }

  async cancel(): Promise<AhkAiStatus> {
    this.downloadAbort?.abort()
    if (this.activeWorker && !this.activeWorker.killed) this.activeWorker.kill()
    this.activeWorker = null
    return this.getStatus()
  }

  async removeModel(): Promise<AhkAiStatus> {
    if (this.operation) throw new Error('Cancel the current AI operation before removing its model.')
    const model = this.selectedModel()
    await rm(join(this.modelDirectory, model.filename), { force: true })
    return this.getStatus()
  }

  dispose(): void {
    this.downloadAbort?.abort()
    if (this.activeWorker && !this.activeWorker.killed) this.activeWorker.kill()
    this.activeWorker = null
  }

  private selectedModel(): ModelDefinition {
    return totalmem() < 8 * GIB ? MODELS['low-memory'] : MODELS.standard
  }

  private async isExpectedFile(path: string, bytes: number): Promise<boolean> {
    try { return (await stat(path)).size === bytes } catch { return false }
  }

  private workerPath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'native', 'ahk-ai-worker.cjs')
      : join(app.getAppPath(), 'native', 'ahk-ai-worker.cjs')
  }

  private async runWorker(model: ModelDefinition, modelPath: string, prompt: string, request: string): Promise<{ response: string; generationTrace: string[] }> {
    const require = createRequire(import.meta.url)
    const modulePath = require.resolve('node-llama-cpp')
    await access(this.workerPath())
    // Use up to half of the logical CPUs, capped at eight, so generation is
    // responsive without taking every core away from Roblox and the desktop.
    const threads = Math.max(1, Math.min(8, Math.floor(cpus().length / 2)))
    return new Promise<{ response: string; generationTrace: string[] }>((resolve, reject) => {
      const worker = spawn(process.execPath, [this.workerPath()], {
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_LLAMA_CPP_SKIP_DOWNLOAD: 'true' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      this.activeWorker = worker
      if (worker.pid) {
        try { setPriority(worker.pid, osConstants.priority.PRIORITY_BELOW_NORMAL) } catch { /* Best effort. */ }
      }
      let stdout = ''
      let stderr = ''
      const timeout = setTimeout(() => worker.kill(), 10 * 60_000)
      const stageDetails: Record<NonNullable<AhkAiStatus['generationStage']>, string> = {
        'loading-model': 'Loading the model for this request only.',
        'reading-request': 'Extracting the action, trigger, target, and timing from your request.',
        'planning-script': 'Turning those requirements into a small AutoHotkey v2 plan.',
        'writing-script': 'Writing the script from the local plan and the AHK v2 reference.',
        validating: 'Running local syntax and safety checks.',
        unloading: 'Releasing the local model from memory.',
      }
      worker.stdout.setEncoding('utf8')
      worker.stderr.setEncoding('utf8')
      worker.stdout.on('data', (chunk: string) => {
        stdout = `${stdout}${chunk}`
        if (stdout.length > MAX_WORKER_OUTPUT) worker.kill()
      })
      worker.stderr.on('data', (chunk: string) => {
        for (const match of chunk.matchAll(/VIRGUE_STAGE:(loading-model|reading-request|planning-script|writing-script|unloading)/g)) {
          const stage = match[1] as NonNullable<AhkAiStatus['generationStage']>
          this.generationStage = stage
          this.generationDetail = stageDetails[stage]
        }
        for (const match of chunk.matchAll(/VIRGUE_NOTE:([^\r\n]*)/g)) {
          const detail = match[1]?.trim()
          if (!detail) continue
          this.generationDetail = detail
          this.generationTrace = [...this.generationTrace.filter((note) => note !== detail), detail].slice(-6)
        }
        stderr = `${stderr}${chunk.replace(/VIRGUE_STAGE:[^\r\n]+/g, '').replace(/VIRGUE_NOTE:[^\r\n]*/g, '')}`.slice(-8_192)
      })
      worker.once('error', (error) => { clearTimeout(timeout); reject(error) })
      worker.once('exit', (code) => {
        clearTimeout(timeout)
        if (this.activeWorker === worker) this.activeWorker = null
        try {
          const result = JSON.parse(stdout) as WorkerResult
          if (!result.ok || !result.response) reject(new Error(result.error || stderr.trim() || `Local AI exited with code ${code ?? 'unknown'}.`))
          else {
            const generationTrace = Array.isArray(result.generationTrace)
              ? result.generationTrace.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
              : this.generationTrace
            resolve({ response: result.response, generationTrace })
          }
        } catch {
          reject(new Error(stderr.trim() || (worker.killed ? 'Local AI generation was cancelled or timed out.' : 'Local AI returned an unreadable response.')))
        }
      })
      worker.stdin.end(JSON.stringify({ modulePath, modelPath, prompt, request, threads, contextSize: model.contextSize, maxTokens: model.maxTokens }))
    })
  }

  private buildPrompt(request: string): string {
    return `You are Virgue's local AutoHotkey v2 script writer. Write a complete, practical script satisfying the request. Use ONLY AutoHotkey v2 syntax. Never use v1 command syntax or comma commands. Every function call must use parentheses: SetTimer(PressE, 10000), Send("e"), WinExist("ahk_exe RobloxPlayerBeta.exe"), WinActivate("ahk_exe RobloxPlayerBeta.exe"), and MsgBox("message"). A line beginning with Send,, SendInput,, Sleep,, SetTimer,, MsgBox,, WinActivate,, WinWait,, or any other command followed by a comma is invalid and must never appear. Do not use pseudo-code such as "WinExist(...) or return"; use a real v2 if block with a separate return line. Do not invent AutoHotkey built-in variables: in particular, never write A_ScreenActive or any other A_ variable unless it is in the reference below. Use WinActive("ahk_exe RobloxPlayerBeta.exe") for Roblox foreground checks. Do not combine WinActive(...) and WinExist(...) with "or"; use WinActive(...) when the requirement is that Roblox is active, and use WinExist(...) only when you need to locate an existing window. For a repeated "while Roblox is active" action, put the WinActive guard inside the timer callback immediately before the action, then set the timer at top level; do not put a one-time Roblox check at top level and do not use a busy Loop, Continue, or Exit to keep the script alive. Timers and hotkeys already keep an AutoHotkey v2 script persistent. Constrain automation to RobloxPlayerBeta.exe unless the user explicitly names another application. Do not add file deletion, registry changes, downloads, shell commands, privilege elevation, security changes, shutdown, or arbitrary DllCall. If the request would require one of those capabilities, omit it and explain the limitation. The script must start with #Requires AutoHotkey v2.0 and #SingleInstance Force. Strict output format: put any Brief, Plan, or explanation prose outside the code fence. Return exactly one fenced ahk code block whose first nonblank line is #Requires AutoHotkey v2.0 and whose every line is valid executable AutoHotkey v2 source; never put planning bullets, headings, or plain-English sentences inside that fence. After the fence, add a short plain-English explanation. Do not claim the script was run or tested.

TARGET WINDOW RULE: Roblox being closed is a runtime condition, not a generation prerequisite. If the request says to act while Roblox is active, check WinActive("ahk_exe RobloxPlayerBeta.exe") inside the action and quietly skip that tick when the window is unavailable. Do not show an error or ask the user to launch Roblox just to generate or validate the script, and do not put Roblox-dependent work in the auto-execute section.

RELEVANT AUTOHOTKEY V2 REFERENCE:
${retrieveAhkKnowledge(request)}

${AHK_DOCUMENTATION_ATTRIBUTION}

USER REQUEST:
${request}`
  }

  private parseResponse(response: string): { script: string; explanation: string } {
    const blocks = extractFencedResponseBlocks(response)
    const ahkBlock = blocks.find(({ language, body }) => /(?:ahk|autohotkey)/i.test(language) && hasAhkHeader(body))
      ?? blocks.find(({ body }) => hasAhkHeader(body))
      ?? blocks.find(({ language, body }) => /(?:ahk|autohotkey)/i.test(language) && looksLikeAhkSourceLine(body.trim()))
      ?? blocks.find(({ body }) => looksLikeAhkSourceLine(body.trim()))
    const fallbackHeaderStart = response.search(/^\s*#Requires\s+AutoHotkey\s+v2\b/im)
    const source = ahkBlock?.body ?? (fallbackHeaderStart >= 0 ? response.slice(fallbackHeaderStart) : blocks[0]?.body ?? '')
    const sourceRaw = ahkBlock?.raw ?? (fallbackHeaderStart >= 0 ? source : '')
    let script = cleanGeneratedAhkSource(source)
    if (!script) throw new Error('The local model did not return a usable AutoHotkey script. Refine the request and try again.')
    if (!/^#Requires\s+AutoHotkey\s+v2/im.test(script)) script = `#Requires AutoHotkey v2.0\n${script}`
    if (!/^#SingleInstance\s+Force/im.test(script)) script = script.replace(/^(#Requires[^\n]*\n)/i, '$1#SingleInstance Force\n')
    const responseNotesRemoved = response.replace(sourceRaw, '').replace(/<brief>[\s\S]*?<\/brief>/gi, '').replace(/<plan>[\s\S]*?<\/plan>/gi, '').replace(/<\/?explanation>/gi, '')
    const explanationMarker = responseNotesRemoved.match(/\bExplanation\s*:\s*/i)
    let explanation = explanationMarker?.index !== undefined
      ? responseNotesRemoved.slice(explanationMarker.index + explanationMarker[0].length)
      : responseNotesRemoved
        .replace(/^\s*(?:Brief|Request summary)\s*:[\s\S]*?(?=\b(?:Plan|Implementation plan)\s*:)/i, '')
        .replace(/^\s*(?:Plan|Implementation plan)\s*:[\s\S]*$/i, '')
    explanation = explanation.replace(/\bFenced\s+AutoHotkey\s+Code\s+Block\s*:\s*/gi, '').replace(/\s+/g, ' ').trim() || 'Generated locally from your request and the bundled AutoHotkey v2 reference.'
    return { script: `${script}\n`, explanation }
  }

  private scanWarnings(script: string): string[] {
    const checks: Array<[RegExp, string]> = [
      [/\b(?:FileDelete|DirDelete)\s*\(/i, 'This script can delete files or folders.'],
      [/\b(?:RegWrite|RegDelete)\s*\(/i, 'This script can change the Windows registry.'],
      [/\b(?:Download|ComObject|WinHttpRequest)\b/i, 'This script may access the network or external components.'],
      [/\b(?:Run|RunWait)\s*\(/i, 'This script can launch another program or URL.'],
      [/\b(?:Shutdown|DllCall)\s*\(/i, 'This script contains advanced system-level functionality.'],
    ]
    return checks.filter(([pattern]) => pattern.test(script)).map(([, warning]) => warning)
  }

  private async validateScript(script: string, normalized = false): Promise<string> {
    const executable = await this.resolveAutoHotkeyExecutable()
    if (!executable) return 'AutoHotkey v2 is not installed, so syntax validation was skipped.'
    const directory = join(app.getPath('temp'), 'Virgue', 'AHK Assistant')
    const path = join(directory, `validate-${Date.now()}.ahk`)
    await mkdir(directory, { recursive: true })
    await writeFile(path, script, 'utf8')
    try {
      const validationError = await new Promise<string | null>((resolve, reject) => {
        const child = spawn(executable, ['/ErrorStdOut=UTF-8', '/Validate', path], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (chunk: string) => { output = `${output}${chunk}`.slice(-8_192) })
        child.stderr.on('data', (chunk: string) => { output = `${output}${chunk}`.slice(-8_192) })
        child.once('error', reject)
        child.once('exit', (code) => {
          if (code === 0) resolve(null)
          else resolve(`AutoHotkey v2 validation failed${normalized ? ' after local compatibility cleanup' : ''}: ${output.trim() || 'AutoHotkey rejected the generated script.'}`)
        })
      })
      if (validationError) return validationError
      return normalized ? 'AutoHotkey v2 syntax validation passed after local compatibility cleanup.' : 'AutoHotkey v2 syntax validation passed.'
    } finally { await rm(path, { force: true }).catch(() => undefined) }
  }

  private async resolveAutoHotkeyExecutable(): Promise<string | null> {
    const candidates = [
      join(process.env.ProgramFiles || 'C:\\Program Files', 'AutoHotkey', 'v2', 'AutoHotkey64.exe'),
      join(process.env.ProgramFiles || 'C:\\Program Files', 'AutoHotkey', 'AutoHotkey.exe'),
      join(process.env.LOCALAPPDATA || '', 'Programs', 'AutoHotkey', 'v2', 'AutoHotkey64.exe'),
      join(process.env.LOCALAPPDATA || '', 'Programs', 'AutoHotkey', 'AutoHotkey.exe'),
    ]
    for (const candidate of candidates) {
      try { await access(candidate); return candidate } catch { /* Keep looking. */ }
    }
    return null
  }
}
