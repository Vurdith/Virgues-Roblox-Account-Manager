'use strict'

const { pathToFileURL } = require('node:url')

async function readInput() {
  let value = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) value += chunk
  return JSON.parse(value)
}

function compactNote(value, maxLength = 320) {
  return String(value || '').replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function formatNote(prefix, value) {
  const note = compactNote(value)
  return note ? `${prefix} ${note}` : ''
}

function extractTag(value, tag) {
  const match = String(value || '').match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i'))
  return match?.[1]?.trim() || ''
}

function extractLabeledSections(value) {
  const sections = { brief: [], plan: [] }
  let active = ''
  for (const line of String(value || '').split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      active = ''
      continue
    }
    if (active && /^\s*(?:fenced\s+)?(?:autoHotkey\s+)?(?:code|script)\s*(?:block)?\s*:/i.test(line)) {
      active = ''
      continue
    }
    const heading = line.match(/^\s*\*{0,2}(brief(?: requirements)?|plan|explanation)\*{0,2}\s*:?\s*(.*)$/i)
    if (heading) {
      const name = heading[1].toLowerCase().startsWith('brief') ? 'brief' : heading[1].toLowerCase()
      active = name === 'brief' || name === 'plan' ? name : ''
      if (active && heading[2]) sections[active].push(heading[2])
      continue
    }
    if (active) sections[active].push(line)
  }
  return {
    brief: sections.brief.join('\n').trim(),
    plan: sections.plan.join('\n').trim(),
  }
}

async function main() {
  const input = await readInput()
  const moduleUrl = pathToFileURL(input.modulePath).href
  process.stderr.write('VIRGUE_STAGE:loading-model\n')
  const { getLlama, LlamaChatSession, LlamaLogLevel } = await import(moduleUrl)
  let llama
  let model
  let context
  try {
    llama = await getLlama({
      gpu: false,
      build: 'never',
      skipDownload: true,
      progressLogs: false,
      logLevel: LlamaLogLevel.error,
      maxThreads: input.threads,
    })
    model = await llama.loadModel({ modelPath: input.modelPath })
    context = await model.createContext({ contextSize: input.contextSize, threads: input.threads })
    const session = new LlamaChatSession({ contextSequence: context.getSequence() })
    const trace = []
    let streamed = ''
    let writingStarted = false
    process.stderr.write('VIRGUE_STAGE:reading-request\n')
    // Prompt evaluation is the local planning phase. This transition is
    // immediate by design: never add a cosmetic wait just to animate a stage.
    process.stderr.write('VIRGUE_STAGE:planning-script\n')

    const response = await session.prompt(input.prompt, {
      maxTokens: input.maxTokens,
      temperature: 0.15,
      topP: 0.9,
      repeatPenalty: { penalty: 1.08 },
      onTextChunk: (chunk) => {
        streamed += chunk
        if (!writingStarted && /```(?:ahk|autohotkey)?\s*/i.test(streamed)) {
          process.stderr.write('VIRGUE_STAGE:writing-script\n')
          writingStarted = true
        }
      },
    })
    const labeledSections = extractLabeledSections(response)
    const brief = extractTag(response, 'brief') || labeledSections.brief
    const plan = extractTag(response, 'plan') || labeledSections.plan
    const briefNote = formatNote('Request summary ·', brief)
    const planNote = formatNote('Implementation plan ·', plan)
    if (briefNote && !trace.includes(briefNote)) trace.push(briefNote)
    if (planNote && !trace.includes(planNote)) trace.push(planNote)
    if (!writingStarted) process.stderr.write('VIRGUE_STAGE:writing-script\n')
    if (trace.length === 0) trace.push('No separate planning note was returned; review the generated script and explanation.')
    process.stdout.write(JSON.stringify({ ok: true, response, generationTrace: trace }))
  } finally {
    process.stderr.write('VIRGUE_STAGE:unloading\n')
    if (context) await context.dispose().catch(() => undefined)
    if (model) await model.dispose().catch(() => undefined)
    if (llama) await llama.dispose().catch(() => undefined)
  }
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
  process.exitCode = 1
})
