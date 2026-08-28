#include <windows.h>

#include <iostream>
#include <string>

#include "nvapi.h"
#include "NvApiDriverSettings.h"

namespace {

void printStatus(const wchar_t* operation, NvAPI_Status status) {
  NvAPI_ShortString message{};
  NvAPI_GetErrorMessage(status, message);
  std::wcerr << operation << L" failed (" << status << L"): " << message << L"\n";
}

int finish(NvDRSSessionHandle session, int code) {
  if (session) NvAPI_DRS_DestroySession(session);
  NvAPI_Unload();
  return code;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc < 3) {
    std::wcerr << L"Usage: nvidia-fps-helper <query|set|delete> <full-executable-path> [fps]\n";
    return 2;
  }

  const std::wstring command = argv[1];
  const std::wstring executablePath = argv[2];
  NvAPI_Status status = NvAPI_Initialize();
  if (status != NVAPI_OK) {
    printStatus(L"NvAPI_Initialize", status);
    return 3;
  }

  NvDRSSessionHandle session = nullptr;
  status = NvAPI_DRS_CreateSession(&session);
  if (status != NVAPI_OK) {
    printStatus(L"NvAPI_DRS_CreateSession", status);
    return finish(session, 4);
  }
  status = NvAPI_DRS_LoadSettings(session);
  if (status != NVAPI_OK) {
    printStatus(L"NvAPI_DRS_LoadSettings", status);
    return finish(session, 5);
  }

  NvDRSProfileHandle profile = nullptr;
  NVDRS_APPLICATION application{};
  application.version = NVDRS_APPLICATION_VER;
  status = NvAPI_DRS_FindApplicationByName(
      session,
      const_cast<NvU16*>(reinterpret_cast<const NvU16*>(executablePath.c_str())),
      &profile,
      &application);
  if (status != NVAPI_OK) {
    printStatus(L"NvAPI_DRS_FindApplicationByName", status);
    return finish(session, 6);
  }

  NVDRS_PROFILE profileInfo{};
  profileInfo.version = NVDRS_PROFILE_VER;
  status = NvAPI_DRS_GetProfileInfo(session, profile, &profileInfo);
  if (status != NVAPI_OK) {
    printStatus(L"NvAPI_DRS_GetProfileInfo", status);
    return finish(session, 7);
  }

  NVDRS_SETTING existing{};
  existing.version = NVDRS_SETTING_VER;
  const NvAPI_Status getStatus = NvAPI_DRS_GetSetting(session, profile, FRL_FPS_ID, &existing);

  if (command == L"query") {
    std::wcout << L"profile=" << reinterpret_cast<const wchar_t*>(profileInfo.profileName) << L"\n";
    std::wcout << L"application=" << reinterpret_cast<const wchar_t*>(application.appName) << L"\n";
    if (getStatus == NVAPI_OK) {
      std::wcout << L"present=1\nvalue=" << existing.u32CurrentValue << L"\n";
    } else if (getStatus == NVAPI_SETTING_NOT_FOUND) {
      std::wcout << L"present=0\nvalue=0\n";
    } else {
      printStatus(L"NvAPI_DRS_GetSetting", getStatus);
      return finish(session, 8);
    }
    return finish(session, 0);
  }

  if (command == L"set") {
    if (argc < 4) {
      std::wcerr << L"The set command requires an FPS value.\n";
      return finish(session, 2);
    }
    wchar_t* end = nullptr;
    const unsigned long parsed = wcstoul(argv[3], &end, 10);
    if (!end || *end != L'\0' || parsed < 1 || parsed > FRL_FPS_MAX) {
      std::wcerr << L"FPS must be between 1 and " << FRL_FPS_MAX << L".\n";
      return finish(session, 2);
    }

    NVDRS_SETTING setting{};
    setting.version = NVDRS_SETTING_VER;
    setting.settingId = FRL_FPS_ID;
    setting.settingType = NVDRS_DWORD_TYPE;
    setting.u32CurrentValue = static_cast<NvU32>(parsed);
    status = NvAPI_DRS_SetSetting(session, profile, &setting);
    if (status != NVAPI_OK) {
      printStatus(L"NvAPI_DRS_SetSetting", status);
      return finish(session, 9);
    }
  } else if (command == L"delete") {
    if (getStatus == NVAPI_SETTING_NOT_FOUND) {
      std::wcout << L"profile=" << reinterpret_cast<const wchar_t*>(profileInfo.profileName) << L"\npresent=0\n";
      return finish(session, 0);
    }
    status = NvAPI_DRS_DeleteProfileSetting(session, profile, FRL_FPS_ID);
    if (status != NVAPI_OK) {
      printStatus(L"NvAPI_DRS_DeleteProfileSetting", status);
      return finish(session, 10);
    }
  } else {
    std::wcerr << L"Unknown command: " << command << L"\n";
    return finish(session, 2);
  }

  status = NvAPI_DRS_SaveSettings(session);
  if (status != NVAPI_OK) {
    printStatus(L"NvAPI_DRS_SaveSettings", status);
    return finish(session, 11);
  }

  std::wcout << L"profile=" << reinterpret_cast<const wchar_t*>(profileInfo.profileName) << L"\n";
  std::wcout << L"changed=1\n";
  return finish(session, 0);
}
