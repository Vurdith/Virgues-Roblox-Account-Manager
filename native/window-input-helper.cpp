#define NOMINMAX
#include <windows.h>

#include <algorithm>
#include <cwctype>
#include <iostream>
#include <string>

namespace {

constexpr unsigned long kMinimumDurationMs = 40;
constexpr unsigned long kMaximumDurationMs = 1500;

struct KeyDefinition {
  const wchar_t* code;
  WORD virtualKey;
};

constexpr KeyDefinition kAllowedKeys[] = {
    {L"KeyW", 'W'},       {L"KeyA", 'A'},       {L"KeyS", 'S'},
    {L"KeyD", 'D'},       {L"Space", VK_SPACE}, {L"ShiftLeft", VK_LSHIFT},
    {L"KeyE", 'E'},       {L"KeyQ", 'Q'},       {L"KeyR", 'R'},
    {L"KeyF", 'F'},       {L"Digit1", '1'},     {L"Digit2", '2'},
    {L"Digit3", '3'},     {L"Digit4", '4'},     {L"Digit5", '5'},
    {L"Digit6", '6'},     {L"Digit7", '7'},     {L"Digit8", '8'},
    {L"Digit9", '9'},     {L"Digit0", '0'},     {L"ArrowUp", VK_UP},
    {L"ArrowDown", VK_DOWN}, {L"ArrowLeft", VK_LEFT}, {L"ArrowRight", VK_RIGHT},
};

bool parseUnsigned(const wchar_t* value, unsigned long long* parsed) {
  if (!value || !*value) return false;
  wchar_t* end = nullptr;
  const unsigned long long result = std::wcstoull(value, &end, 10);
  if (!end || *end != L'\0' || result == 0) return false;
  *parsed = result;
  return true;
}

const KeyDefinition* findKey(const std::wstring& code) {
  for (const auto& key : kAllowedKeys) {
    if (code == key.code) return &key;
  }
  return nullptr;
}

std::wstring lower(std::wstring value) {
  std::transform(value.begin(), value.end(), value.begin(), [](wchar_t character) {
    return static_cast<wchar_t>(std::towlower(character));
  });
  return value;
}

bool isRobloxPlayerProcess(DWORD processId, DWORD* errorCode) {
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId);
  if (!process) {
    *errorCode = GetLastError();
    return false;
  }

  std::wstring path(32768, L'\0');
  DWORD pathLength = static_cast<DWORD>(path.size());
  const BOOL queried = QueryFullProcessImageNameW(process, 0, path.data(), &pathLength);
  const DWORD queryError = queried ? ERROR_SUCCESS : GetLastError();
  CloseHandle(process);
  if (!queried) {
    *errorCode = queryError;
    return false;
  }

  path.resize(pathLength);
  const std::size_t separator = path.find_last_of(L"\\/");
  const std::wstring executable = lower(separator == std::wstring::npos ? path : path.substr(separator + 1));
  if (executable != L"robloxplayerbeta.exe") {
    *errorCode = ERROR_BAD_EXE_FORMAT;
    return false;
  }
  *errorCode = ERROR_SUCCESS;
  return true;
}

bool activateWindow(HWND window) {
  if (IsIconic(window)) ShowWindowAsync(window, SW_RESTORE);

  const HWND foreground = GetForegroundWindow();
  const DWORD currentThread = GetCurrentThreadId();
  const DWORD targetThread = GetWindowThreadProcessId(window, nullptr);
  const DWORD foregroundThread = foreground ? GetWindowThreadProcessId(foreground, nullptr) : 0;

  const bool attachedTarget = targetThread != 0 && targetThread != currentThread && AttachThreadInput(currentThread, targetThread, TRUE);
  const bool attachedForeground = foregroundThread != 0 && foregroundThread != currentThread && foregroundThread != targetThread && AttachThreadInput(currentThread, foregroundThread, TRUE);

  BringWindowToTop(window);
  SetForegroundWindow(window);
  SetActiveWindow(window);
  SetFocus(window);

  if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, FALSE);
  if (attachedTarget) AttachThreadInput(currentThread, targetThread, FALSE);

  for (int attempt = 0; attempt < 20; ++attempt) {
    const HWND active = GetForegroundWindow();
    if (active == window || GetAncestor(active, GA_ROOT) == window) return true;
    Sleep(25);
  }
  return false;
}

bool sendKey(WORD virtualKey, unsigned long durationMs, DWORD* errorCode) {
  INPUT down{};
  down.type = INPUT_KEYBOARD;
  down.ki.wVk = virtualKey;

  INPUT up = down;
  up.ki.dwFlags = KEYEVENTF_KEYUP;

  if (SendInput(1, &down, sizeof(INPUT)) != 1) {
    *errorCode = GetLastError();
    return false;
  }

  Sleep(durationMs);
  if (SendInput(1, &up, sizeof(INPUT)) != 1) {
    *errorCode = GetLastError();
    return false;
  }

  *errorCode = ERROR_SUCCESS;
  return true;
}

bool isExtendedKey(WORD virtualKey) {
  return virtualKey == VK_UP || virtualKey == VK_DOWN || virtualKey == VK_LEFT || virtualKey == VK_RIGHT;
}

LPARAM keyMessageData(WORD virtualKey, bool released) {
  const UINT scanCode = MapVirtualKeyW(virtualKey, MAPVK_VK_TO_VSC);
  LPARAM data = 1 | (static_cast<LPARAM>(scanCode & 0xff) << 16);
  if (isExtendedKey(virtualKey)) data |= static_cast<LPARAM>(1) << 24;
  if (released) data |= (static_cast<LPARAM>(1) << 30) | (static_cast<LPARAM>(1) << 31);
  return data;
}

HWND messageTargetForWindow(HWND rootWindow) {
  const DWORD targetThread = GetWindowThreadProcessId(rootWindow, nullptr);
  GUITHREADINFO info{};
  info.cbSize = sizeof(info);
  if (targetThread && GetGUIThreadInfo(targetThread, &info) && info.hwndFocus) {
    const HWND focusedRoot = GetAncestor(info.hwndFocus, GA_ROOT);
    if (focusedRoot == rootWindow) return info.hwndFocus;
  }
  return rootWindow;
}

bool postBackgroundKey(HWND rootWindow, WORD virtualKey, unsigned long durationMs, DWORD* errorCode) {
  const HWND target = messageTargetForWindow(rootWindow);
  if (!PostMessageW(target, WM_KEYDOWN, virtualKey, keyMessageData(virtualKey, false))) {
    *errorCode = GetLastError();
    return false;
  }

  Sleep(durationMs);
  if (!PostMessageW(target, WM_KEYUP, virtualKey, keyMessageData(virtualKey, true))) {
    *errorCode = GetLastError();
    return false;
  }

  *errorCode = ERROR_SUCCESS;
  return true;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  const std::wstring command = argc > 1 ? argv[1] : L"";
  if (argc != 6 || (command != L"send" && command != L"background-send")) {
    std::wcerr << L"Usage: window-input-helper <send|background-send> <process-id> <window-handle> <key-code> <duration-ms>\n";
    return 2;
  }

  unsigned long long rawProcessId = 0;
  unsigned long long rawWindowHandle = 0;
  unsigned long long rawDuration = 0;
  if (!parseUnsigned(argv[2], &rawProcessId) || rawProcessId > MAXDWORD ||
      !parseUnsigned(argv[3], &rawWindowHandle) ||
      !parseUnsigned(argv[5], &rawDuration) || rawDuration < kMinimumDurationMs || rawDuration > kMaximumDurationMs) {
    std::wcerr << L"The target or duration is invalid. Duration must be between 40 and 1500 milliseconds.\n";
    return 2;
  }

  const std::wstring keyCode = argv[4];
  const KeyDefinition* key = findKey(keyCode);
  if (!key) {
    std::wcerr << L"That key is not in the window-control allowlist.\n";
    return 2;
  }

  const DWORD processId = static_cast<DWORD>(rawProcessId);
  const HWND window = reinterpret_cast<HWND>(static_cast<UINT_PTR>(rawWindowHandle));
  if (!IsWindow(window) || GetAncestor(window, GA_ROOT) != window) {
    std::wcerr << L"The recorded Roblox window no longer exists.\n";
    return 3;
  }

  DWORD windowProcessId = 0;
  GetWindowThreadProcessId(window, &windowProcessId);
  if (windowProcessId != processId) {
    std::wcerr << L"The window no longer belongs to the recorded Roblox process.\n";
    return 3;
  }

  DWORD processError = ERROR_SUCCESS;
  if (!isRobloxPlayerProcess(processId, &processError)) {
    std::wcerr << L"The target is not a verified RobloxPlayerBeta.exe process (error " << processError << L").\n";
    return 3;
  }

  const HWND previousWindow = GetForegroundWindow();
  if (command == L"background-send") {
    if (previousWindow && (previousWindow == window || GetAncestor(previousWindow, GA_ROOT) == window)) {
      std::wcerr << L"Virgue blocked background input to the foreground Roblox window.\n";
      return 4;
    }
    if (IsIconic(window)) {
      std::wcerr << L"Restore the selected Roblox window before using background controls.\n";
      return 4;
    }

    DWORD inputError = ERROR_SUCCESS;
    if (!postBackgroundKey(window, key->virtualKey, static_cast<unsigned long>(rawDuration), &inputError)) {
      std::wcerr << L"Windows could not post the background input (error " << inputError << L").\n";
      return 5;
    }
    const HWND currentWindow = GetForegroundWindow();
    const bool foregroundUnchanged = currentWindow == previousWindow;
    std::wcout << L"{\"ok\":true,\"transport\":\"background-message\",\"key\":\"" << key->code
               << L"\",\"durationMs\":" << rawDuration << L",\"foregroundUnchanged\":"
               << (foregroundUnchanged ? L"true" : L"false") << L"}\n";
    return 0;
  }

  if (!activateWindow(window)) {
    std::wcerr << L"Windows did not grant foreground focus to the selected Roblox window.\n";
    return 4;
  }

  DWORD inputError = ERROR_SUCCESS;
  const bool sent = sendKey(key->virtualKey, static_cast<unsigned long>(rawDuration), &inputError);
  bool restored = false;
  if (previousWindow && previousWindow != window && IsWindow(previousWindow)) restored = activateWindow(previousWindow);
  if (!sent) {
    std::wcerr << L"Windows could not send the bounded input (error " << inputError << L").\n";
    return 5;
  }

  std::wcout << L"{\"ok\":true,\"transport\":\"foreground-input\",\"key\":\"" << key->code
             << L"\",\"durationMs\":" << rawDuration << L",\"restoredPreviousWindow\":"
             << (restored ? L"true" : L"false") << L"}\n";
  return 0;
}
