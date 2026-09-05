interface AhkKnowledgeSection {
  id: string
  keywords: string[]
  text: string
}

// A compact, locally bundled reference distilled from the AutoHotkey v2
// documentation. It is retrieval context, not a library of script templates.
// Source index: https://www.autohotkey.com/docs/v2/
const SECTIONS: AhkKnowledgeSection[] = [
  {
    id: 'v2-syntax',
    keywords: ['syntax', 'function', 'variable', 'expression', 'v2', 'script'],
    text: `AHK v2 fundamentals: Require v2 with '#Requires AutoHotkey v2.0'. Function calls use parentheses: Send("{e}"), Sleep(500), Click(100, 200). Strings are quoted. Blocks use braces. Assignment uses :=. Avoid v1 command syntax, legacy percent dereferencing, labels used as subroutines, and deprecated commands. Use functions or fat-arrow callbacks for timers and hotkeys.`,
  },
  {
    id: 'send-keys',
    keywords: ['press', 'key', 'keyboard', 'send', 'type', 'hold', 'release', 'wasd', 'space', 'shift'],
    text: `Keyboard: Send("e") sends text/key input. Named keys use braces, such as Send("{Space}"), Send("{Enter}"), Send("{Left}"). Modifiers are ! Alt, ^ Ctrl, + Shift, # Win. For an explicit hold use Send("{w down}"), Sleep(durationMs), then Send("{w up}"). Prefer try/finally when holding a key so key-up is guaranteed. SendMode("Input") selects the normal fast send mode.`,
  },
  {
    id: 'timers',
    keywords: ['every', 'repeat', 'timer', 'interval', 'seconds', 'minutes', 'loop', 'periodic'],
    text: `Timers: SetTimer(callback, periodMs) calls a function repeatedly. Example semantics: SetTimer(KeepAlive, 52500). A negative period runs once. SetTimer(callback, 0) disables it. Timer callbacks must be function objects, not v1 labels. Keep callbacks short and use global only when shared state is required.`,
  },
  {
    id: 'windows',
    keywords: ['window', 'roblox', 'target', 'activate', 'focus', 'title', 'process', 'exe'],
    text: `Window targeting: WinExist("ahk_exe RobloxPlayerBeta.exe") returns a matching HWND. WinActive checks the active window. WinActivate activates a window. WinWait and WinWaitActive can wait for one. Use ahk_pid when a specific process ID is known. SetTitleMatchMode controls title matching. In Valdor Protected Session the script already runs on the alt desktop, but it should still constrain actions to Roblox windows.`,
  },
  {
    id: 'mouse',
    keywords: ['mouse', 'click', 'cursor', 'coordinate', 'drag', 'pixel', 'image'],
    text: `Mouse: Click() clicks the current position; Click(x, y) clicks coordinates. MouseMove(x, y, speed) moves the pointer. CoordMode("Mouse", "Client") makes coordinates relative to the active client area; Screen and Window modes are also available. PixelSearch and ImageSearch can locate visual elements but require carefully defined regions and image assets.`,
  },
  {
    id: 'hotkeys',
    keywords: ['hotkey', 'shortcut', 'toggle', 'pause', 'resume', 'manual', 'control'],
    text: `Hotkeys: F8::Pause(-1) toggles script pause. Multi-line hotkey bodies use braces. HotIf can conditionally enable hotkeys. Pause affects the current underlying thread; a state variable checked by timer callbacks is often clearer for pausing automation. Do not bind destructive system-wide shortcuts unless explicitly requested.`,
  },
  {
    id: 'control-flow',
    keywords: ['if', 'when', 'until', 'random', 'condition', 'state', 'count'],
    text: `Control flow: use if expressions and brace blocks. Loop count { ... } repeats a fixed number of times. while condition { ... } repeats conditionally. Random(min, max) returns a random number. Use try/catch/finally for operations that can fail and to guarantee cleanup such as releasing held keys.`,
  },
  {
    id: 'lifecycle',
    keywords: ['start', 'stop', 'exit', 'persistent', 'single', 'tray'],
    text: `Lifecycle: '#SingleInstance Force' prevents duplicate copies. Scripts with timers or hotkeys remain persistent automatically; Persistent(true) can be explicit. ExitApp() exits. OnExit(callback) can release held keys or perform cleanup. Valdor itself starts and stops the script process, so do not add self-relaunch loops.`,
  },
  {
    id: 'safety',
    keywords: ['file', 'download', 'network', 'registry', 'run', 'admin', 'shutdown', 'delete'],
    text: `Safety: Run/RunWait can launch programs or URLs. FileDelete, DirDelete, RegWrite, RegDelete, Shutdown, DllCall, ComObject and network clients have effects beyond input automation. Do not generate these unless the user explicitly asks and the result clearly warns them. Never request elevation, disable security software, alter Windows logon/RDP configuration, or download/execute remote code.`,
  },
]

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9_]+/g) ?? [])
}

export function retrieveAhkKnowledge(request: string, limit = 6): string {
  const words = tokenize(request)
  const ranked = SECTIONS.map((section) => ({
    section,
    score: section.keywords.reduce((score, keyword) => score + (words.has(keyword) ? 3 : 0), section.id === 'v2-syntax' || section.id === 'safety' ? 1 : 0),
  })).sort((a, b) => b.score - a.score)
  return ranked.slice(0, limit).map(({ section }) => `[${section.id}] ${section.text}`).join('\n\n')
}

export const AHK_DOCUMENTATION_ATTRIBUTION = 'AutoHotkey v2 documentation: https://www.autohotkey.com/docs/v2/'
