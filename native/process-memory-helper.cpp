#define NOMINMAX
#include <windows.h>
#include <psapi.h>

#include <cstdlib>
#include <iostream>

int wmain(int argc, wchar_t** argv) {
  if (argc != 3 || std::wstring(argv[1]) != L"apply") {
    std::wcerr << L"Usage: process-memory-helper apply <process-id>\n";
    return 2;
  }

  wchar_t* end = nullptr;
  const unsigned long rawPid = std::wcstoul(argv[2], &end, 10);
  if (!end || *end != L'\0' || rawPid == 0) {
    std::wcerr << L"The process ID is invalid.\n";
    return 2;
  }

  constexpr DWORD access = PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_INFORMATION | PROCESS_SET_QUOTA;
  HANDLE process = OpenProcess(access, FALSE, static_cast<DWORD>(rawPid));
  if (!process) {
    std::wcerr << L"Could not open the Roblox process (error " << GetLastError() << L").\n";
    return 3;
  }

  MEMORY_PRIORITY_INFORMATION priority{};
  priority.MemoryPriority = MEMORY_PRIORITY_LOW;
  if (!SetProcessInformation(process, ProcessMemoryPriority, &priority, sizeof(priority))) {
    std::wcerr << L"Could not set the Roblox process memory priority (error " << GetLastError() << L").\n";
    CloseHandle(process);
    return 4;
  }

  // This only trims pages currently resident in RAM. Roblox may fault pages
  // back in later; the low priority hint remains active for the process.
  const BOOL trimmed = K32EmptyWorkingSet(process);
  std::wcout << L"memory_priority=low\ntrimmed=" << (trimmed ? 1 : 0) << L"\n";
  CloseHandle(process);
  return 0;
}
