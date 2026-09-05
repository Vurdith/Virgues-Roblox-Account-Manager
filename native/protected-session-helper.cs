using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;
using System.ServiceProcess;

namespace Valdor.ProtectedSession
{
    [ComImport]
    [Guid("302D8188-0052-4807-806A-362B628F9AC5")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMsRdpExtendedSettings
    {
        void set_Property(
            [In, MarshalAs(UnmanagedType.BStr)] string propertyName,
            [In, MarshalAs(UnmanagedType.Struct)] ref object value);

        [return: MarshalAs(UnmanagedType.Struct)]
        object get_Property([In, MarshalAs(UnmanagedType.BStr)] string propertyName);
    }

    internal sealed class RdpHostControl : AxHost
    {
        private const string MsRdpClient10NotSafeForScripting =
            "A0C63C30-F08D-4AB4-907C-34905D770C7D";

        internal RdpHostControl() : base(MsRdpClient10NotSafeForScripting)
        {
        }

        internal object ControlObject
        {
            get { return GetOcx(); }
        }
    }

    internal static class NativeMethods
    {
        internal const uint NoChildSession = 0xFFFFFFFF;
        internal const uint MapVkToVsc = 0;
        internal const uint InputKeyboard = 1;
        internal const uint KeyEventKeyUp = 0x0002;
        internal const uint KeyEventExtendedKey = 0x0001;
        internal const int SwRestore = 9;
        internal const int SwShow = 5;
        internal const uint GaRoot = 2;
        internal const uint ProcessQueryLimitedInformation = 0x1000;
        internal const uint ScManagerConnect = 0x0001;
        internal const uint ScManagerCreateService = 0x0002;
        internal const uint ServiceQueryStatus = 0x0004;
        internal const uint ServiceStart = 0x0010;
        internal const uint ServiceStop = 0x0020;
        internal const uint ServiceDelete = 0x00010000;
        internal const uint ServiceChangeConfig = 0x0002;
        internal const uint ServiceWin32OwnProcess = 0x00000010;
        internal const uint ServiceAutoStart = 0x00000002;
        internal const uint ServiceErrorNormal = 0x00000001;
        internal const uint ServiceAllAccess = 0x000F01FF;
        internal const uint TokenAssignPrimary = 0x0001;
        internal const uint TokenDuplicate = 0x0002;
        internal const uint TokenQuery = 0x0008;
        internal const uint TokenAdjustDefault = 0x0080;
        internal const uint TokenAdjustSessionId = 0x0100;
        internal const uint TokenMaximumAllowed = 0x02000000;
        internal const int SecurityImpersonation = 2;
        internal const int TokenPrimary = 1;
        internal const uint CreateUnicodeEnvironment = 0x00000400;
        internal const uint ExecutionStateContinuous = 0x80000000;
        internal const uint ExecutionStateSystemRequired = 0x00000001;
        internal const uint ExecutionStateDisplayRequired = 0x00000002;
        internal const int ErrorServiceDoesNotExist = 1060;

        internal delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

        [StructLayout(LayoutKind.Explicit)]
        internal struct Input
        {
            [FieldOffset(0)] internal uint type;
            // INPUT's union is pointer-aligned. Valdor ships this helper as
            // x64, so the native offset is 8 and the total size is 32 bytes.
            [FieldOffset(8)] internal InputUnion union;
        }

        [StructLayout(LayoutKind.Explicit, Size = 32)]
        internal struct InputUnion
        {
            [FieldOffset(0)] internal KeyboardInput keyboard;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct KeyboardInput
        {
            internal ushort virtualKey;
            internal ushort scanCode;
            internal uint flags;
            internal uint time;
            internal UIntPtr extraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct GuiThreadInfo
        {
            internal int size;
            internal uint flags;
            internal IntPtr active;
            internal IntPtr focus;
            internal IntPtr capture;
            internal IntPtr menuOwner;
            internal IntPtr moveSize;
            internal IntPtr caret;
            internal Rectangle caretRectangle;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct Rectangle
        {
            internal int left;
            internal int top;
            internal int right;
            internal int bottom;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        internal struct StartupInfo
        {
            internal int cb;
            [MarshalAs(UnmanagedType.LPWStr)] internal string reserved;
            [MarshalAs(UnmanagedType.LPWStr)] internal string desktop;
            [MarshalAs(UnmanagedType.LPWStr)] internal string title;
            internal int x;
            internal int y;
            internal int xSize;
            internal int ySize;
            internal int xCountChars;
            internal int yCountChars;
            internal int fillAttribute;
            internal int flags;
            internal short showWindow;
            internal short reserved2;
            internal IntPtr reserved2Data;
            internal IntPtr standardInput;
            internal IntPtr standardOutput;
            internal IntPtr standardError;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct ProcessInformation
        {
            internal IntPtr process;
            internal IntPtr thread;
            internal uint processId;
            internal uint threadId;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct ServiceStatus
        {
            internal uint serviceType;
            internal uint currentState;
            internal uint controlsAccepted;
            internal uint win32ExitCode;
            internal uint serviceSpecificExitCode;
            internal uint checkPoint;
            internal uint waitHint;
        }

        [DllImport("wtsapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool WTSIsChildSessionsEnabled(
            [MarshalAs(UnmanagedType.Bool)] out bool enabled);

        [DllImport("wtsapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool WTSEnableChildSessions(
            [MarshalAs(UnmanagedType.Bool)] bool enable);

        [DllImport("wtsapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool WTSGetChildSessionId(out uint sessionId);

        [DllImport("wtsapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool WTSQueryUserToken(uint sessionId, out IntPtr token);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool IsWindow(IntPtr window);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool IsWindowVisible(IntPtr window);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool IsIconic(IntPtr window);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool ShowWindowAsync(IntPtr window, int command);

        [DllImport("user32.dll")]
        internal static extern IntPtr GetAncestor(IntPtr window, uint flags);

        [DllImport("user32.dll")]
        internal static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

        [DllImport("user32.dll")]
        internal static extern int GetWindowTextLengthW(IntPtr window);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        internal static extern int GetWindowTextW(IntPtr window, StringBuilder value, int maximum);

        [DllImport("user32.dll")]
        internal static extern IntPtr GetForegroundWindow();

        [DllImport("kernel32.dll")]
        internal static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool AttachThreadInput(uint first, uint second, bool attach);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool BringWindowToTop(IntPtr window);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool SetForegroundWindow(IntPtr window);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        [DllImport("user32.dll")]
        internal static extern IntPtr SetActiveWindow(IntPtr window);

        [DllImport("user32.dll")]
        internal static extern IntPtr SetFocus(IntPtr window);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool GetGUIThreadInfo(uint threadId, ref GuiThreadInfo info);

        [DllImport("user32.dll")]
        internal static extern uint MapVirtualKeyW(uint code, uint mapType);

        [DllImport("user32.dll", SetLastError = true)]
        internal static extern uint SendInput(uint count, Input[] inputs, int inputSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool ProcessIdToSessionId(uint processId, out uint sessionId);

        [DllImport("kernel32.dll", SetLastError = true)]
        internal static extern IntPtr OpenProcess(uint access, bool inheritHandle, uint processId);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool QueryFullProcessImageNameW(
            IntPtr process,
            uint flags,
            StringBuilder path,
            ref uint pathLength);

        [DllImport("kernel32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool CloseHandle(IntPtr handle);

        [DllImport("kernel32.dll")]
        internal static extern uint SetThreadExecutionState(uint flags);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool DuplicateTokenEx(
            IntPtr existingToken,
            uint desiredAccess,
            IntPtr tokenAttributes,
            int impersonationLevel,
            int tokenType,
            out IntPtr primaryToken);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool CredDeleteW(string targetName, uint type, uint flags);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool CreateProcessAsUserW(
            IntPtr token,
            string applicationName,
            [In, Out] StringBuilder commandLine,
            IntPtr processAttributes,
            IntPtr threadAttributes,
            [MarshalAs(UnmanagedType.Bool)] bool inheritHandles,
            uint creationFlags,
            IntPtr environment,
            string currentDirectory,
            ref StartupInfo startupInfo,
            out ProcessInformation processInformation);

        [DllImport("userenv.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool CreateEnvironmentBlock(out IntPtr environment, IntPtr token, bool inherit);

        [DllImport("userenv.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool DestroyEnvironmentBlock(IntPtr environment);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern IntPtr OpenSCManagerW(string machineName, string databaseName, uint desiredAccess);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern IntPtr CreateServiceW(
            IntPtr manager,
            string serviceName,
            string displayName,
            uint desiredAccess,
            uint serviceType,
            uint startType,
            uint errorControl,
            string binaryPathName,
            string loadOrderGroup,
            IntPtr tagId,
            string dependencies,
            string serviceStartName,
            string password);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern IntPtr OpenServiceW(IntPtr manager, string serviceName, uint desiredAccess);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool ChangeServiceConfigW(
            IntPtr service,
            uint serviceType,
            uint startType,
            uint errorControl,
            string binaryPathName,
            string loadOrderGroup,
            IntPtr tagId,
            string dependencies,
            string serviceStartName,
            string password,
            string displayName);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool DeleteService(IntPtr service);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool CloseServiceHandle(IntPtr handle);
    }

    internal sealed class RobloxWindow
    {
        internal uint ProcessId;
        internal long WindowHandle;
        internal string WindowTitle;
        internal string AccountId;
    }

    internal static class Protocol
    {
        private static readonly object OutputLock = new object();

        internal static void Write(params string[] values)
        {
            lock (OutputLock)
            {
                Console.Out.WriteLine(string.Join("\t", values));
                Console.Out.Flush();
            }
        }

        internal static string Encode(string value)
        {
            return Convert.ToBase64String(Encoding.UTF8.GetBytes(value ?? string.Empty));
        }

        internal static string Decode(string value)
        {
            return Encoding.UTF8.GetString(Convert.FromBase64String(value));
        }

        internal static string JsonString(string value)
        {
            if (value == null) return "null";
            var result = new StringBuilder(value.Length + 2);
            result.Append('"');
            foreach (var character in value)
            {
                switch (character)
                {
                    case '"': result.Append("\\\""); break;
                    case '\\': result.Append("\\\\"); break;
                    case '\b': result.Append("\\b"); break;
                    case '\f': result.Append("\\f"); break;
                    case '\n': result.Append("\\n"); break;
                    case '\r': result.Append("\\r"); break;
                    case '\t': result.Append("\\t"); break;
                    default:
                        if (character < 32)
                            result.Append("\\u" + ((int)character).ToString("x4", CultureInfo.InvariantCulture));
                        else
                            result.Append(character);
                        break;
                }
            }
            result.Append('"');
            return result.ToString();
        }

        internal static void Result(string requestId, string payload)
        {
            Write("RESULT", requestId, "OK", Encode(payload));
        }

        internal static void Error(string requestId, string message)
        {
            Write("RESULT", requestId, "ERROR", Encode(message));
        }
    }

    internal sealed class HostBridge : IDisposable
    {
        private readonly string pipeName;
        private readonly string token;
        private readonly int parentSessionId;
        private readonly object pipeLock = new object();
        private readonly object serviceLock = new object();
        private NamedPipeServerStream pipe;
        private StreamWriter writer;
        private NamedPipeClientStream servicePipe;
        private StreamWriter serviceWriter;
        private volatile bool disposed;

        internal HostBridge(string pipeName, string token, int parentSessionId)
        {
            this.pipeName = pipeName;
            this.token = token;
            this.parentSessionId = parentSessionId;
        }

        internal void Start()
        {
            ConnectToAgentService();
            var thread = new Thread(Run) { IsBackground = true, Name = "Valdor protected-session pipe" };
            thread.Start();
        }

        private void ConnectToAgentService()
        {
            var client = new NamedPipeClientStream(".", Program.AgentControlPipeName, PipeDirection.Out, PipeOptions.None);
            try
            {
                client.Connect(10000);
                var candidateWriter = new StreamWriter(client, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
                lock (serviceLock)
                {
                    servicePipe = client;
                    serviceWriter = candidateWriter;
                }
                SendServiceConfig(-1);
            }
            catch
            {
                client.Dispose();
                throw new InvalidOperationException("The protected-session Windows service is not ready. Run the one-time setup again and try again.");
            }
        }

        internal void UpdateChildSession(int childSessionId)
        {
            SendServiceConfig(childSessionId);
        }

        private void SendServiceConfig(int childSessionId)
        {
            lock (serviceLock)
            {
                if (disposed || serviceWriter == null) throw new InvalidOperationException("The protected-session Windows service is not connected.");
                serviceWriter.WriteLine(
                    "CONFIG\t" + pipeName + "\t" + token + "\t" +
                    parentSessionId.ToString(CultureInfo.InvariantCulture) + "\t" +
                    childSessionId.ToString(CultureInfo.InvariantCulture));
            }
        }

        private void Run()
        {
            try
            {
                pipe = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1,
                    PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 16384, 16384);
                pipe.WaitForConnection();
                if (disposed) return;

                var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, true);
                var candidateWriter = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
                var hello = reader.ReadLine();
                var parts = (hello ?? string.Empty).Split('\t');
                int agentSessionId;
                if (parts.Length != 3 || parts[0] != "HELLO" || parts[1] != token ||
                    !int.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out agentSessionId) ||
                    agentSessionId == parentSessionId)
                {
                    candidateWriter.WriteLine("REJECT");
                    Protocol.Write("EVENT", "AGENT_REJECTED", Protocol.Encode("The protected-session agent handshake was rejected."));
                    return;
                }

                lock (pipeLock) writer = candidateWriter;
                Protocol.Write("EVENT", "AGENT_READY", agentSessionId.ToString(CultureInfo.InvariantCulture));

                string line;
                while (!disposed && (line = reader.ReadLine()) != null)
                {
                    Protocol.Write(line.Split('\t'));
                }
            }
            catch (Exception exception)
            {
                if (!disposed) Protocol.Write("EVENT", "AGENT_ERROR", Protocol.Encode(exception.Message));
            }
            finally
            {
                lock (pipeLock) writer = null;
            }
        }

        internal void Send(string line)
        {
            StreamWriter current;
            lock (pipeLock) current = writer;
            if (current == null)
            {
                var parts = line.Split('\t');
                Protocol.Error(parts.Length > 1 ? parts[1] : "unknown", "The protected session is still starting.");
                return;
            }

            lock (pipeLock)
            {
                try { current.WriteLine(line); }
                catch (Exception exception)
                {
                    var parts = line.Split('\t');
                    Protocol.Error(parts.Length > 1 ? parts[1] : "unknown", exception.Message);
                }
            }
        }

        public void Dispose()
        {
            disposed = true;
            lock (serviceLock)
            {
                try { if (serviceWriter != null) serviceWriter.WriteLine("STOP"); } catch { }
                try { if (servicePipe != null) servicePipe.Dispose(); } catch { }
                serviceWriter = null;
                servicePipe = null;
            }
            lock (pipeLock)
            {
                try { if (writer != null) writer.WriteLine("STOP"); } catch { }
                try { if (pipe != null) pipe.Dispose(); } catch { }
                writer = null;
            }
        }

        internal static readonly string AgentConfigPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Valdor", "ProtectedSession", "agent.txt");

        internal static void SetServiceConfigPath()
        {
            using (var key = Registry.LocalMachine.CreateSubKey(Program.BackupKeyPath))
            {
                if (key == null) throw new InvalidOperationException("Windows could not prepare the protected-session agent.");
                key.SetValue("AgentConfigPath", AgentConfigPath, RegistryValueKind.String);
            }
        }

        internal static void SetAgentConfig(string pipeName, string token, int parentSessionId, int childSessionId = -1)
        {
            var directory = Path.GetDirectoryName(AgentConfigPath);
            if (string.IsNullOrEmpty(directory)) throw new InvalidOperationException("Windows could not prepare the protected-session agent.");
            Directory.CreateDirectory(directory);
            var temporaryPath = AgentConfigPath + ".tmp";
            File.WriteAllText(
                temporaryPath,
                pipeName + "\n" + token + "\n" + parentSessionId.ToString(CultureInfo.InvariantCulture),
                new UTF8Encoding(false));
            File.AppendAllText(
                temporaryPath,
                "\n" + childSessionId.ToString(CultureInfo.InvariantCulture),
                new UTF8Encoding(false));
            try
            {
                if (File.Exists(AgentConfigPath)) File.Replace(temporaryPath, AgentConfigPath, null);
                else File.Move(temporaryPath, AgentConfigPath);
            }
            catch (IOException)
            {
                File.Copy(temporaryPath, AgentConfigPath, true);
                File.Delete(temporaryPath);
            }
        }

        internal static string ConfiguredAgentConfigPath()
        {
            try
            {
                using (var key = Registry.LocalMachine.OpenSubKey(Program.BackupKeyPath))
                {
                    var value = key == null ? null : key.GetValue("AgentConfigPath", null, RegistryValueOptions.DoNotExpandEnvironmentNames);
                    if (value is string && !string.IsNullOrWhiteSpace((string)value)) return (string)value;
                }
            }
            catch { }
            return AgentConfigPath;
        }

        internal static bool TryReadAgentConfig(out string pipeName, out string token, out int parentSessionId, out int childSessionId)
        {
            return TryReadAgentConfig(ConfiguredAgentConfigPath(), out pipeName, out token, out parentSessionId, out childSessionId);
        }

        internal static bool TryReadAgentConfig(string configPath, out string pipeName, out string token, out int parentSessionId, out int childSessionId)
        {
            pipeName = string.Empty;
            token = string.Empty;
            parentSessionId = 0;
            childSessionId = -1;
            try
            {
                var values = File.ReadAllLines(configPath);
                if (values.Length < 4 || string.IsNullOrEmpty(values[0]) || string.IsNullOrEmpty(values[1])) return false;
                if (!int.TryParse(values[2], NumberStyles.None, CultureInfo.InvariantCulture, out parentSessionId)) return false;
                if (!int.TryParse(values[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out childSessionId)) return false;
                pipeName = values[0];
                token = values[1];
                return true;
            }
            catch { }
            return false;
        }

        internal static string DescribeAgentConfig(string configPath)
        {
            try
            {
                var values = File.ReadAllLines(configPath);
                int parentSessionId;
                int childSessionId;
                var parentParsed = values.Length > 2 && int.TryParse(values[2], NumberStyles.None, CultureInfo.InvariantCulture, out parentSessionId);
                var childParsed = values.Length > 3 && int.TryParse(values[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out childSessionId);
                return "exists=true lines=" + values.Length.ToString(CultureInfo.InvariantCulture) +
                    " pipe-length=" + (values.Length > 0 ? values[0].Length : 0).ToString(CultureInfo.InvariantCulture) +
                    " token-length=" + (values.Length > 1 ? values[1].Length : 0).ToString(CultureInfo.InvariantCulture) +
                    " parent-parsed=" + parentParsed.ToString(CultureInfo.InvariantCulture) +
                    " child-parsed=" + childParsed.ToString(CultureInfo.InvariantCulture);
            }
            catch (Exception exception)
            {
                return "exists=" + File.Exists(configPath).ToString(CultureInfo.InvariantCulture) +
                    " error=" + exception.GetType().Name;
            }
        }

        internal static void RemoveAgentConfig()
        {
            try { File.Delete(AgentConfigPath); }
            catch { }
            try { File.Delete(AgentConfigPath + ".tmp"); }
            catch { }
        }
    }

    internal sealed class ProtectedSessionAgentService : ServiceBase
    {
        private volatile bool stopping;
        private Thread worker;
        private Thread controlWorker;
        private readonly object controlPipeLock = new object();
        private NamedPipeServerStream controlPipe;
        private readonly object configLock = new object();
        private bool hasConfig;
        private string configuredPipeName = string.Empty;
        private string configuredToken = string.Empty;
        private int configuredParentSessionId;
        private int configuredChildSessionId = -1;
        private Process agentProcess;
        private int lastLoggedChildSessionId = -2;
        private string lastLoggedError;

        internal ProtectedSessionAgentService()
        {
            ServiceName = Program.AgentServiceName;
            CanStop = true;
            CanShutdown = true;
            CanPauseAndContinue = false;
            AutoLog = false;
        }

        protected override void OnStart(string[] args)
        {
            stopping = false;
            Program.WriteServiceLog("service-start");
            controlWorker = new Thread(ControlLoop)
            {
                IsBackground = true,
                Name = "Valdor protected-session control pipe",
            };
            controlWorker.Start();
            worker = new Thread(Run)
            {
                IsBackground = true,
                Name = "Valdor protected-session service",
            };
            worker.Start();
        }

        protected override void OnStop()
        {
            stopping = true;
            ClearConfig();
            lock (controlPipeLock)
            {
                try { if (controlPipe != null) controlPipe.Dispose(); } catch { }
                controlPipe = null;
            }
            if (controlWorker != null) controlWorker.Join(5000);
            if (worker != null) worker.Join(5000);
            StopAgent();
            Program.WriteServiceLog("service-stop");
        }

        protected override void OnShutdown()
        {
            OnStop();
            base.OnShutdown();
        }

        private void Run()
        {
            while (!stopping)
            {
                try { ReconcileAgent(); }
                catch (Exception exception)
                {
                    StopAgent();
                    if (!string.Equals(lastLoggedError, exception.Message, StringComparison.Ordinal))
                    {
                        lastLoggedError = exception.Message;
                        Program.WriteServiceLog("reconcile-error: " + exception.Message);
                    }
                }
                Thread.Sleep(500);
            }
            StopAgent();
        }

        private void ControlLoop()
        {
            while (!stopping)
            {
                NamedPipeServerStream server = null;
                try
                {
                    server = CreateControlPipe();
                    lock (controlPipeLock) controlPipe = server;
                    server.WaitForConnection();
                    if (stopping) break;
                    Program.WriteServiceLog("control-connected");

                    using (var reader = new StreamReader(server, new UTF8Encoding(false), false, 4096, true))
                    {
                        string line;
                        while (!stopping && (line = reader.ReadLine()) != null)
                        {
                            if (line == "STOP")
                            {
                                ClearConfig();
                                StopAgent();
                                break;
                            }
                            try { ApplyConfig(line); }
                            catch (Exception exception)
                            {
                                Program.WriteServiceLog("control-error: " + exception.Message);
                            }
                        }
                    }
                    ClearConfig();
                    StopAgent();
                }
                catch (ObjectDisposedException)
                {
                    if (!stopping) Program.WriteServiceLog("control-pipe-disposed");
                }
                catch (Exception exception)
                {
                    if (!stopping) Program.WriteServiceLog("control-pipe-error: " + exception.Message);
                    Thread.Sleep(1000);
                }
                finally
                {
                    lock (controlPipeLock)
                    {
                        if (controlPipe == server) controlPipe = null;
                    }
                    try { if (server != null) server.Dispose(); } catch { }
                }
            }
        }

        private void ApplyConfig(string line)
        {
            var parts = line.Split('\t');
            if (parts.Length != 5 || parts[0] != "CONFIG") throw new InvalidOperationException("The protected-session control message was invalid.");
            Program.ValidateBridgeValues(parts[1], parts[2]);
            int parentSessionId;
            int childSessionId;
            if (!int.TryParse(parts[3], NumberStyles.None, CultureInfo.InvariantCulture, out parentSessionId) || parentSessionId < 0)
                throw new InvalidOperationException("The protected-session parent session was invalid.");
            if (!int.TryParse(parts[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out childSessionId) || childSessionId < -1)
                throw new InvalidOperationException("The protected-session child session was invalid.");
            lock (configLock)
            {
                configuredPipeName = parts[1];
                configuredToken = parts[2];
                configuredParentSessionId = parentSessionId;
                configuredChildSessionId = childSessionId;
                hasConfig = true;
            }
            Program.WriteServiceLog(
                "control-config parent=" + parentSessionId.ToString(CultureInfo.InvariantCulture) +
                " child=" + childSessionId.ToString(CultureInfo.InvariantCulture));
        }

        private void ClearConfig()
        {
            lock (configLock)
            {
                hasConfig = false;
                configuredPipeName = string.Empty;
                configuredToken = string.Empty;
                configuredParentSessionId = 0;
                configuredChildSessionId = -1;
            }
        }

        private void ReconcileAgent()
        {
            string pipeName;
            string token;
            int parentSessionId;
            int childSessionId;
            lock (configLock)
            {
                if (!hasConfig)
                {
                    StopAgent();
                    return;
                }
                pipeName = configuredPipeName;
                token = configuredToken;
                parentSessionId = configuredParentSessionId;
                childSessionId = configuredChildSessionId;
            }

            try { Program.ValidateBridgeValues(pipeName, token); }
            catch (Exception exception)
            {
                StopAgent();
                if (!string.Equals(lastLoggedError, exception.Message, StringComparison.Ordinal))
                {
                    lastLoggedError = exception.Message;
                    Program.WriteServiceLog("agent-config-invalid: " + exception.Message);
                }
                return;
            }

            if (agentProcess != null)
            {
                try
                {
                    if (!agentProcess.HasExited) return;
                }
                catch { }
                agentProcess.Dispose();
                agentProcess = null;
            }

            if (childSessionId < 0 || childSessionId == parentSessionId)
            {
                if (lastLoggedChildSessionId != -1)
                {
                    lastLoggedChildSessionId = -1;
                    Program.WriteServiceLog("waiting-for-child-session");
                }
                return;
            }

            if (childSessionId != lastLoggedChildSessionId)
            {
                lastLoggedChildSessionId = childSessionId;
                lastLoggedError = null;
                Program.WriteServiceLog("launching-agent session=" + childSessionId.ToString(CultureInfo.InvariantCulture));
            }
            agentProcess = Program.LaunchAgentProcessInSession((uint)childSessionId, pipeName, token, parentSessionId);
            Program.WriteServiceLog("agent-started pid=" + agentProcess.Id.ToString(CultureInfo.InvariantCulture) + " session=" + agentProcess.SessionId.ToString(CultureInfo.InvariantCulture));
        }

        private static NamedPipeServerStream CreateControlPipe()
        {
            var security = new PipeSecurity();
            var authenticatedUsers = new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null);
            security.AddAccessRule(new PipeAccessRule(
                authenticatedUsers,
                PipeAccessRights.ReadWrite | PipeAccessRights.CreateNewInstance,
                System.Security.AccessControl.AccessControlType.Allow));
            return new NamedPipeServerStream(
                Program.AgentControlPipeName,
                PipeDirection.In,
                1,
                PipeTransmissionMode.Byte,
                PipeOptions.None,
                4096,
                4096,
                security);
        }

        private void StopAgent()
        {
            if (agentProcess == null) return;
            try
            {
                if (!agentProcess.HasExited) agentProcess.Kill();
            }
            catch { }
            try { agentProcess.Dispose(); } catch { }
            agentProcess = null;
        }
    }

    internal static class Program
    {
        internal const string AgentServiceName = "ValdorProtectedSession";
        internal const string AgentControlPipeName = "ValdorProtectedSessionControl";
        internal const string BackupKeyPath = @"SOFTWARE\Valdor\ProtectedSession";
        private static readonly string ServiceLogPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Valdor", "ProtectedSession", "service.log");
        private const string CredentialPolicyPath = @"SOFTWARE\Policies\Microsoft\Windows\CredentialsDelegation";
        private const string TerminalPolicyPath = @"SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services";
        private const string TerminalServerPath = @"SYSTEM\CurrentControlSet\Control\Terminal Server";
        private const string WinStationsPath = @"SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations";
        private const string RdpTcpPath = @"SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp";
        // DWMFRAMEINTERVAL uses four delivered frames per unit. Four is the
        // closest supported value to the 15 FPS target (approximately 16 FPS).
        // This limits RDP composition/transport only; Roblox has its own cap.
        private const int ProtectedSessionRdpFrameInterval = 4;
        private const string LocalhostSpn = "TERMSRV/localhost";
        private const uint CredentialTypeDomainPassword = 2;
        private const int ErrorNotFound = 1168;

        private static readonly Dictionary<string, ushort> AllowedKeys = new Dictionary<string, ushort>(StringComparer.Ordinal)
        {
            { "KeyW", 0x57 }, { "KeyA", 0x41 }, { "KeyS", 0x53 }, { "KeyD", 0x44 },
            { "Space", 0x20 }, { "ShiftLeft", 0xA0 }, { "KeyE", 0x45 }, { "KeyQ", 0x51 },
            { "KeyR", 0x52 }, { "KeyF", 0x46 }, { "Digit1", 0x31 }, { "Digit2", 0x32 },
            { "Digit3", 0x33 }, { "Digit4", 0x34 }, { "Digit5", 0x35 }, { "Digit6", 0x36 },
            { "Digit7", 0x37 }, { "Digit8", 0x38 }, { "Digit9", 0x39 }, { "Digit0", 0x30 },
            { "ArrowUp", 0x26 }, { "ArrowDown", 0x28 }, { "ArrowLeft", 0x25 }, { "ArrowRight", 0x27 },
        };
        private static readonly Dictionary<uint, string> AgentAccounts = new Dictionary<uint, string>();
        private static readonly Dictionary<uint, Process> AgentProcesses = new Dictionary<uint, Process>();
        private static readonly object AgentProcessLock = new object();
        private static readonly Dictionary<string, Process> AutoHotkeyProcesses = new Dictionary<string, Process>(StringComparer.OrdinalIgnoreCase);
        private static readonly object AutoHotkeyProcessLock = new object();

        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                if (args.Length == 1 && args[0] == "--service")
                {
                    ServiceBase.Run(new ProtectedSessionAgentService());
                    return 0;
                }
                if (args.Length == 1 && args[0] == "--status") return WriteStatus();
                if (args.Length == 1 && args[0] == "--ahk-status")
                {
                    Console.WriteLine(BuildAutoHotkeyStatusJson());
                    return 0;
                }
                if (args.Length == 1 && args[0] == "--check-input-layout")
                {
                    var inputSize = Marshal.SizeOf(typeof(NativeMethods.Input));
                    var keyboardSize = Marshal.SizeOf(typeof(NativeMethods.KeyboardInput));
                    Console.WriteLine("input=" + inputSize.ToString(CultureInfo.InvariantCulture) + " keyboard=" + keyboardSize.ToString(CultureInfo.InvariantCulture));
                    return IntPtr.Size == 8 && inputSize == 40 && keyboardSize == 24 ? 0 : 1;
                }
                if (args.Length == 1 && args[0] == "--check-mouse")
                {
                    using (var form = new Form())
                    using (var host = new RdpHostControl())
                    {
                        form.Controls.Add(host);
                        form.ShowInTaskbar = false;
                        form.Opacity = 0;
                        form.Show();
                        host.CreateControl();
                        return ConfigureRelativeMouse(host.ControlObject) ? 0 : 1;
                    }
                }
                if (args.Length == 2 && args[0] == "--setup") return Configure(args[1], true);
                if (args.Length == 2 && args[0] == "--teardown") return Configure(args[1], false);
                if (args.Length == 7 && args[0] == "--host" && args[1] == "--pipe" && args[3] == "--token" && args[5] == "--parent-session")
                    return RunHost(args[2], args[4], ParseInt(args[6], "parent session"));
                if ((args.Length == 0) || (args.Length == 1 && args[0] == "--agent-config"))
                {
                    string pipeName;
                    string token;
                    int parentSessionId;
                    int childSessionId;
                    if (!HostBridge.TryReadAgentConfig(out pipeName, out token, out parentSessionId, out childSessionId))
                        throw new InvalidOperationException("The protected-session agent configuration was not found.");
                    return RunAgent(pipeName, token, parentSessionId);
                }
                if (args.Length == 7 && args[0] == "--agent" && args[1] == "--pipe" && args[3] == "--token" && args[5] == "--parent-session")
                    return RunAgent(args[2], args[4], ParseInt(args[6], "parent session"));

                Console.Error.WriteLine("Usage: protected-session-helper <--status|--setup result|--teardown result|--host ...|--agent ...>");
                return 2;
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine(exception.Message);
                return 1;
            }
        }

        private static int WriteStatus()
        {
            bool childEnabled;
            var childQueryOk = NativeMethods.WTSIsChildSessionsEnabled(out childEnabled);
            var rdpType = Type.GetTypeFromCLSID(new Guid("A0C63C30-F08D-4AB4-907C-34905D770C7D"), false);
            var deny = ReadDword(Registry.LocalMachine, TerminalServerPath, "fDenyTSConnections", 1);
            var firewallEnabled = AreAllFirewallProfilesEnabled();
            var rdpFrameLimited = ReadDword(Registry.LocalMachine, WinStationsPath, "DWMFRAMEINTERVAL", -1) == ProtectedSessionRdpFrameInterval;
            var configured = childQueryOk && childEnabled && deny == 0 && HasLocalhostCredentialPolicy() && IsAgentServiceInstalled() && rdpFrameLimited;
            Console.WriteLine(
                "{" +
                "\"supported\":" + (childQueryOk && rdpType != null ? "true" : "false") + "," +
                "\"configured\":" + (configured ? "true" : "false") + "," +
                "\"childSessionsEnabled\":" + (childEnabled ? "true" : "false") + "," +
                "\"rdpListenerEnabled\":" + (deny == 0 ? "true" : "false") + "," +
                "\"firewallEnabled\":" + (firewallEnabled ? "true" : "false") + "," +
                "\"currentSessionId\":" + Process.GetCurrentProcess().SessionId.ToString(CultureInfo.InvariantCulture) +
                "}");
            return 0;
        }

        internal static void WriteServiceLog(string message)
        {
            try
            {
                var directory = Path.GetDirectoryName(ServiceLogPath);
                if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
                File.AppendAllText(
                    ServiceLogPath,
                    DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture) + " " + message + Environment.NewLine,
                    new UTF8Encoding(false));
            }
            catch { }
        }

        private static int Configure(string resultPath, bool enable)
        {
            var result = "";
            var success = false;
            try
            {
                if (!IsAdministrator()) throw new InvalidOperationException("Administrator approval is required.");
                if (enable)
                {
                    if (!AreAllFirewallProfilesEnabled())
                        throw new InvalidOperationException("Turn on Windows Firewall for every network profile before enabling Protected Session.");
                    if (!HasConfigurationBackup()) BackupConfiguration();
                    HostBridge.SetServiceConfigPath();
                    InstallAgentService(Process.GetCurrentProcess().MainModule.FileName);
                    StartAgentService();
                    if (!NativeMethods.WTSEnableChildSessions(true))
                        throw new InvalidOperationException("Windows rejected child sessions (error " + Marshal.GetLastWin32Error() + ").");
                    WriteDword(Registry.LocalMachine, TerminalServerPath, "fDenyTSConnections", 0);
                    ConfigureCredentialPolicy();
                    WriteDword(Registry.LocalMachine, TerminalPolicyPath, "fPromptForPassword", 0);
                    WriteDword(Registry.LocalMachine, RdpTcpPath, "fPromptForPassword", 0);
                    BackupRdpFrameIntervalIfNeeded();
                    WriteDword(Registry.LocalMachine, WinStationsPath, "DWMFRAMEINTERVAL", ProtectedSessionRdpFrameInterval);
                    EnsureTermServiceRunning();
                    result = "Protected Session is configured with a low-bandwidth alt-desktop stream. Restart Windows once to guarantee the 16 FPS RDP stream limit is active. Windows may ask you to verify your account on the first connection.";
                }
                else
                {
                    StopAgentService();
                    RemoveAgentService();
                    RestoreConfiguration();
                    result = "Protected Session was removed and the previous Windows settings were restored.";
                }
                success = true;
            }
            catch (Exception exception)
            {
                result = exception.Message;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(resultPath)));
            File.WriteAllText(resultPath,
                "{\"ok\":" + (success ? "true" : "false") + ",\"message\":" + Protocol.JsonString(result) + "}",
                new UTF8Encoding(false));
            return success ? 0 : 1;
        }

        private static bool HasConfigurationBackup()
        {
            using (var key = Registry.LocalMachine.OpenSubKey(BackupKeyPath))
            {
                return key != null && Convert.ToInt32(key.GetValue("Complete", 0), CultureInfo.InvariantCulture) == 1;
            }
        }

        private static bool IsAgentServiceInstalled()
        {
            try
            {
                using (var service = new ServiceController(AgentServiceName))
                {
                    service.Refresh();
                    var ignored = service.Status;
                    return true;
                }
            }
            catch { return false; }
        }

        private static void InstallAgentService(string executable)
        {
            var manager = NativeMethods.OpenSCManagerW(null, null, NativeMethods.ScManagerConnect | NativeMethods.ScManagerCreateService);
            if (manager == IntPtr.Zero) throw new InvalidOperationException("Windows could not open the Service Control Manager (error " + Marshal.GetLastWin32Error() + ").");

            try
            {
                var binaryPath = Quote(executable) + " --service";
                var service = NativeMethods.OpenServiceW(manager, AgentServiceName, NativeMethods.ServiceAllAccess);
                if (service == IntPtr.Zero)
                {
                    var error = Marshal.GetLastWin32Error();
                    if (error != NativeMethods.ErrorServiceDoesNotExist)
                        throw new InvalidOperationException("Windows could not open the protected-session service (error " + error + ").");
                    service = NativeMethods.CreateServiceW(
                        manager,
                        AgentServiceName,
                        "Valdor Protected Session",
                        NativeMethods.ServiceAllAccess,
                        NativeMethods.ServiceWin32OwnProcess,
                        NativeMethods.ServiceAutoStart,
                        NativeMethods.ServiceErrorNormal,
                        binaryPath,
                        null,
                        IntPtr.Zero,
                        null,
                        null,
                        null);
                    if (service == IntPtr.Zero)
                        throw new InvalidOperationException("Windows could not install the protected-session service (error " + Marshal.GetLastWin32Error() + ").");
                }
                else if (!NativeMethods.ChangeServiceConfigW(
                    service,
                    NativeMethods.ServiceWin32OwnProcess,
                    NativeMethods.ServiceAutoStart,
                    NativeMethods.ServiceErrorNormal,
                    binaryPath,
                    null,
                    IntPtr.Zero,
                    null,
                    null,
                    null,
                    "Valdor Protected Session"))
                {
                    var error = Marshal.GetLastWin32Error();
                    NativeMethods.CloseServiceHandle(service);
                    throw new InvalidOperationException("Windows could not update the protected-session service (error " + error + ").");
                }
                NativeMethods.CloseServiceHandle(service);
            }
            finally { NativeMethods.CloseServiceHandle(manager); }
        }

        private static void StartAgentService()
        {
            using (var service = new ServiceController(AgentServiceName))
            {
                service.Refresh();
                if (service.Status == ServiceControllerStatus.Running) return;
                if (service.Status != ServiceControllerStatus.StartPending) service.Start();
                service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20));
            }
        }

        private static void StopAgentService()
        {
            try
            {
                using (var service = new ServiceController(AgentServiceName))
                {
                    service.Refresh();
                    if (service.Status == ServiceControllerStatus.Stopped || service.Status == ServiceControllerStatus.StopPending) return;
                    service.Stop();
                    service.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(20));
                }
            }
            catch { }
        }

        private static void RemoveAgentService()
        {
            var manager = NativeMethods.OpenSCManagerW(null, null, NativeMethods.ScManagerConnect);
            if (manager == IntPtr.Zero) return;
            try
            {
                var service = NativeMethods.OpenServiceW(manager, AgentServiceName, NativeMethods.ServiceDelete);
                if (service == IntPtr.Zero) return;
                try { NativeMethods.DeleteService(service); }
                finally { NativeMethods.CloseServiceHandle(service); }
            }
            finally { NativeMethods.CloseServiceHandle(manager); }
        }

        internal static Process LaunchAgentProcessInSession(uint sessionId, string pipeName, string token, int parentSessionId)
        {
            var executable = Process.GetCurrentProcess().MainModule.FileName;
            IntPtr userToken = IntPtr.Zero;
            IntPtr primaryToken = IntPtr.Zero;
            IntPtr environment = IntPtr.Zero;
            try
            {
                if (!NativeMethods.WTSQueryUserToken(sessionId, out userToken))
                    throw new InvalidOperationException("Windows could not open the protected-session user token (error " + Marshal.GetLastWin32Error() + ").");
                var tokenAccess = NativeMethods.TokenAssignPrimary | NativeMethods.TokenDuplicate | NativeMethods.TokenQuery |
                    NativeMethods.TokenAdjustDefault | NativeMethods.TokenAdjustSessionId;
                if (!NativeMethods.DuplicateTokenEx(userToken, tokenAccess, IntPtr.Zero, NativeMethods.SecurityImpersonation, NativeMethods.TokenPrimary, out primaryToken))
                    throw new InvalidOperationException("Windows could not prepare the protected-session user token (error " + Marshal.GetLastWin32Error() + ").");

                NativeMethods.CreateEnvironmentBlock(out environment, primaryToken, false);
                var commandLine = new StringBuilder(
                    Quote(executable) + " --agent --pipe " + Quote(pipeName) +
                    " --token " + Quote(token) + " --parent-session " + parentSessionId.ToString(CultureInfo.InvariantCulture));
                var startup = new NativeMethods.StartupInfo
                {
                    cb = Marshal.SizeOf(typeof(NativeMethods.StartupInfo)),
                    desktop = @"winsta0\default",
                };
                NativeMethods.ProcessInformation processInformation;
                if (!NativeMethods.CreateProcessAsUserW(
                    primaryToken,
                    executable,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    NativeMethods.CreateUnicodeEnvironment,
                    environment,
                    Path.GetDirectoryName(executable),
                    ref startup,
                    out processInformation))
                    throw new InvalidOperationException("Windows could not start the protected-session agent (error " + Marshal.GetLastWin32Error() + ").");

                NativeMethods.CloseHandle(processInformation.thread);
                NativeMethods.CloseHandle(processInformation.process);
                return Process.GetProcessById((int)processInformation.processId);
            }
            finally
            {
                if (environment != IntPtr.Zero) NativeMethods.DestroyEnvironmentBlock(environment);
                if (primaryToken != IntPtr.Zero) NativeMethods.CloseHandle(primaryToken);
                if (userToken != IntPtr.Zero) NativeMethods.CloseHandle(userToken);
            }
        }

        private static int RunHost(string pipeName, string token, int parentSessionId)
        {
            ValidateBridgeValues(pipeName, token);
            bool enabled;
            if (!NativeMethods.WTSIsChildSessionsEnabled(out enabled) || !enabled)
                throw new InvalidOperationException("Protected Session has not been configured on this PC.");

            var dpiAware = false;
            try { dpiAware = NativeMethods.SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
            if (!dpiAware) try { NativeMethods.SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            NativeMethods.SetThreadExecutionState(
                NativeMethods.ExecutionStateContinuous |
                NativeMethods.ExecutionStateSystemRequired |
                NativeMethods.ExecutionStateDisplayRequired);
            try
            {
                using (var bridge = new HostBridge(pipeName, token, parentSessionId))
                using (var form = new Form())
                using (var host = new RdpHostControl())
                {
                    bridge.Start();

                form.Text = "Valdor — Alt desktop";
                form.Width = 1280;
                form.Height = 720;
                form.MinimumSize = new Size(800, 450);
                form.ShowInTaskbar = true;
                form.StartPosition = FormStartPosition.CenterScreen;
                form.FormBorderStyle = FormBorderStyle.Sizable;
                form.MinimizeBox = true;
                form.MaximizeBox = true;
                host.Dock = DockStyle.Fill;
                host.TabStop = true;
                form.Controls.Add(host);

                Action activateViewer = delegate
                {
                    try
                    {
                        form.ActiveControl = host;
                        host.Select();
                        host.Focus();
                    }
                    catch { }
                };
                form.Activated += delegate { activateViewer(); };
                host.Enter += delegate { activateViewer(); };

                form.Shown += delegate
                {
                    try
                    {
                        DeleteStaleLocalhostCredential();
                        dynamic client = host.ControlObject;
                        client.Server = "localhost";
                        client.DesktopWidth = 960;
                        client.DesktopHeight = 540;
                        client.ColorDepth = 32;
                        dynamic advanced;
                        try { advanced = client.AdvancedSettings9; }
                        catch
                        {
                            try { advanced = client.AdvancedSettings8; }
                            catch { advanced = client.AdvancedSettings7; }
                        }
                        advanced.EnableCredSspSupport = true;
                        advanced.AuthenticationLevel = 0;
                        try { advanced.PromptForCredentials = false; } catch { }
                        try { advanced.PromptForCredsOnClient = false; } catch { }
                        advanced.RedirectClipboard = false;
                        advanced.RedirectDrives = false;
                        advanced.RedirectPrinters = false;
                        advanced.RedirectSmartCards = false;
                        advanced.SmartSizing = true;
                        ConfigureRelativeMouse(host.ControlObject);
                        try { advanced.KeyboardHookMode = 1; } catch { }
                        try { advanced.EnableAutoReconnect = true; } catch { }
                        try { advanced.MaxReconnectAttempts = 20; } catch { }

                        var extended = (IMsRdpExtendedSettings)host.ControlObject;
                        object connectToChildSession = true;
                        extended.set_Property("ConnectToChildSession", ref connectToChildSession);
                        client.Connect();
                        Protocol.Write("EVENT", "HOST_CONNECTING");
                    }
                    catch (Exception exception)
                    {
                        Protocol.Write("EVENT", "HOST_ERROR", Protocol.Encode(exception.Message));
                        form.BeginInvoke(new Action(form.Close));
                    }
                };

                var connectedReported = false;
                var configuredChildSessionId = -1;
                var disconnectedAt = DateTime.MinValue;
                const int reconnectGracePeriodMs = 45000;
                var timer = new System.Windows.Forms.Timer { Interval = 200 };
                timer.Tick += delegate
                {
                    try
                    {
                        dynamic client = host.ControlObject;
                        var connected = Convert.ToInt16(client.Connected, CultureInfo.InvariantCulture) == 1;
                        uint childSessionId;
                        var hasChild = NativeMethods.WTSGetChildSessionId(out childSessionId) && childSessionId != NativeMethods.NoChildSession;
                        if (connected)
                        {
                            disconnectedAt = DateTime.MinValue;
                            if (hasChild && (int)childSessionId != configuredChildSessionId)
                            {
                                configuredChildSessionId = (int)childSessionId;
                                bridge.UpdateChildSession(configuredChildSessionId);
                                if (!connectedReported)
                                {
                                    connectedReported = true;
                                    Protocol.Write("EVENT", "CONNECTED", childSessionId.ToString(CultureInfo.InvariantCulture));
                                }
                            }
                        }
                        else if (connectedReported)
                        {
                            if (disconnectedAt == DateTime.MinValue) disconnectedAt = DateTime.UtcNow;
                            else if ((DateTime.UtcNow - disconnectedAt).TotalMilliseconds >= reconnectGracePeriodMs)
                            {
                                Protocol.Write("EVENT", "DISCONNECTED");
                                form.Close();
                            }
                        }
                    }
                    catch { }
                };
                timer.Start();

                var commandThread = new Thread(delegate()
                {
                    string line;
                    while ((line = Console.In.ReadLine()) != null)
                    {
                        if (line == "STOP")
                        {
                            try { form.BeginInvoke(new Action(form.Close)); } catch { }
                            return;
                        }
                        if (line == "SHOW_VIEWER")
                        {
                            try
                            {
                                form.BeginInvoke(new Action(delegate
                                {
                                    if (form.WindowState == FormWindowState.Minimized) form.WindowState = FormWindowState.Normal;
                                    if (!form.Visible) form.Show();
                                    NativeMethods.ShowWindowAsync(form.Handle, NativeMethods.SwShow);
                                    form.BringToFront();
                                    NativeMethods.SetForegroundWindow(form.Handle);
                                    form.Activate();
                                    activateViewer();
                                }));
                            }
                            catch { }
                            continue;
                        }
                        bridge.Send(line);
                    }
                    try { form.BeginInvoke(new Action(form.Close)); } catch { }
                }) { IsBackground = true, Name = "Valdor protected-session command input" };
                commandThread.Start();

                Application.Run(form);
                timer.Stop();
                try
                {
                    dynamic client = host.ControlObject;
                    if (Convert.ToInt16(client.Connected, CultureInfo.InvariantCulture) != 0) client.Disconnect();
                }
                catch { }
                    return connectedReported ? 0 : 4;
                }
            }
            finally
            {
                NativeMethods.SetThreadExecutionState(NativeMethods.ExecutionStateContinuous);
            }
        }

        private static bool ConfigureRelativeMouse(object control)
        {
            // Windows 11 24H2+ negotiates relative input through this extended
            // capability. The legacy property alone does not enable it.
            try
            {
                var extended = (IMsRdpExtendedSettings)control;
                object enabled = true;
                extended.set_Property("AllowRelativeMouseMode", ref enabled);
                var accepted = Convert.ToBoolean(extended.get_Property("AllowRelativeMouseMode"), CultureInfo.InvariantCulture);
                Protocol.Write("EVENT", "MOUSE_MODE", accepted ? "relative-capability-enabled" : "relative-capability-rejected");
                WriteServiceLog("viewer-mouse relative-capability=" + accepted);
                if (accepted) return true;
            }
            catch (Exception exception)
            {
                Protocol.Write("EVENT", "MOUSE_MODE_DETAIL", "extended-" + exception.HResult.ToString("X8", CultureInfo.InvariantCulture));
                WriteServiceLog("viewer-mouse relative-capability-unavailable hresult=" + exception.HResult.ToString("X8", CultureInfo.InvariantCulture));
            }
            // Older Windows builds retain the legacy option. Report rejection
            // instead of silently claiming that mouse behavior was corrected.
            try
            {
                dynamic client = control;
                dynamic advanced = client.AdvancedSettings7;
                advanced.RelativeMouseMode = true;
                var accepted = Convert.ToBoolean(advanced.RelativeMouseMode, CultureInfo.InvariantCulture);
                Protocol.Write("EVENT", "MOUSE_MODE", accepted ? "legacy-relative-enabled" : "absolute-fallback");
                return accepted;
            }
            catch (Exception exception)
            {
                WriteServiceLog("viewer-mouse legacy-unavailable hresult=" + exception.HResult.ToString("X8", CultureInfo.InvariantCulture));
                Protocol.Write("EVENT", "MOUSE_MODE", "absolute-fallback");
                return false;
            }
        }

        private static void DeleteStaleLocalhostCredential()
        {
            if (NativeMethods.CredDeleteW(LocalhostSpn, CredentialTypeDomainPassword, 0))
            {
                WriteServiceLog("Removed stale " + LocalhostSpn + " credential before child-session connection.");
                return;
            }

            var error = Marshal.GetLastWin32Error();
            if (error != ErrorNotFound)
                WriteServiceLog("Could not remove " + LocalhostSpn + " credential (error " + error.ToString(CultureInfo.InvariantCulture) + ").");
        }

        private static int RunAgent(string pipeName, string token, int parentSessionId)
        {
            ValidateBridgeValues(pipeName, token);
            var currentSessionId = Process.GetCurrentProcess().SessionId;
            if (currentSessionId == parentSessionId) return 3;
            WriteServiceLog("agent-entry session=" + currentSessionId.ToString(CultureInfo.InvariantCulture));

            using (var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous))
            {
                pipe.Connect(60000);
                var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, true);
                var writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
                writer.WriteLine("HELLO\t" + token + "\t" + currentSessionId.ToString(CultureInfo.InvariantCulture));
                WriteServiceLog("agent-hello-sent session=" + currentSessionId.ToString(CultureInfo.InvariantCulture));

                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    if (line == "STOP") break;
                    var parts = line.Split('\t');
                    var requestId = parts.Length > 1 ? parts[1] : "unknown";
                    try
                    {
                        if (parts.Length == 2 && parts[0] == "LIST")
                        {
                            WriteServiceLog("agent-list-start session=" + currentSessionId.ToString(CultureInfo.InvariantCulture));
                            var windowsJson = BuildWindowListJson();
                            WriteServiceLog("agent-list-end bytes=" + windowsJson.Length.ToString(CultureInfo.InvariantCulture));
                            WriteAgentResult(writer, requestId, windowsJson);
                            WriteServiceLog("agent-list-sent session=" + currentSessionId.ToString(CultureInfo.InvariantCulture));
                        }
                        else if (parts.Length == 6 && parts[0] == "INPUT")
                        {
                            var processId = ParseUInt(parts[2], "process ID");
                            var windowHandle = ParseLong(parts[3], "window handle");
                            var duration = ParseInt(parts[5], "input duration");
                            WriteAgentResult(writer, requestId, SendRobloxInput(processId, new IntPtr(windowHandle), parts[4], duration));
                        }
                        else if (parts.Length == 6 && parts[0] == "LAUNCH")
                        {
                            WriteAgentResult(writer, requestId, LaunchRoblox(
                                Protocol.Decode(parts[2]),
                                Protocol.Decode(parts[3]),
                                Protocol.Decode(parts[4]),
                                Protocol.Decode(parts[5])));
                        }
                        else if (parts.Length == 6 && parts[0] == "LAUNCH_URI")
                        {
                            WriteAgentResult(writer, requestId, LaunchRobloxProtocol(
                                Protocol.Decode(parts[2]),
                                Protocol.Decode(parts[3]),
                                Protocol.Decode(parts[4]),
                                Protocol.Decode(parts[5])));
                        }
                        else if (parts.Length == 2 && parts[0] == "PING")
                        {
                            WriteAgentResult(writer, requestId, "{\"ok\":true}");
                        }
                        else if (parts.Length == 2 && parts[0] == "AHK_STATUS")
                        {
                            WriteAgentResult(writer, requestId, BuildAutoHotkeyStatusJson());
                        }
                        else if (parts.Length == 4 && parts[0] == "AHK_RUN")
                        {
                            WriteAgentResult(writer, requestId, RunAutoHotkeyScript(Protocol.Decode(parts[2]), Protocol.Decode(parts[3])));
                        }
                        else if (parts.Length == 3 && parts[0] == "AHK_STOP")
                        {
                            WriteAgentResult(writer, requestId, StopAutoHotkeyScript(Protocol.Decode(parts[2])));
                        }
                        else
                        {
                            throw new InvalidOperationException("The protected-session command was invalid.");
                        }
                    }
                    catch (Exception exception)
                    {
                        WriteAgentError(writer, requestId, exception.Message);
                    }
                }
            }
            StopAllAutoHotkeyScripts();
            return 0;
        }

        private static string ResolveAutoHotkeyExecutable()
        {
            var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            var localPrograms = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs");
            var candidates = new[]
            {
                Path.Combine(programFiles, "AutoHotkey", "v2", "AutoHotkey64.exe"),
                Path.Combine(programFiles, "AutoHotkey", "AutoHotkey.exe"),
                Path.Combine(localPrograms, "AutoHotkey", "v2", "AutoHotkey64.exe"),
                Path.Combine(localPrograms, "AutoHotkey", "AutoHotkey.exe"),
            };
            return candidates.FirstOrDefault(File.Exists) ?? string.Empty;
        }

        private static string BuildAutoHotkeyStatusJson()
        {
            var executable = ResolveAutoHotkeyExecutable();
            var running = new List<string>();
            lock (AutoHotkeyProcessLock)
            {
                foreach (var pair in AutoHotkeyProcesses.ToList())
                {
                    try
                    {
                        if (!pair.Value.HasExited) running.Add(pair.Key);
                        else { pair.Value.Dispose(); AutoHotkeyProcesses.Remove(pair.Key); }
                    }
                    catch { AutoHotkeyProcesses.Remove(pair.Key); }
                }
            }
            var version = string.Empty;
            if (!string.IsNullOrEmpty(executable))
            {
                try { version = FileVersionInfo.GetVersionInfo(executable).FileVersion ?? string.Empty; } catch { }
            }
            return "{" +
                "\"installed\":" + (!string.IsNullOrEmpty(executable) ? "true" : "false") + "," +
                "\"version\":" + Protocol.JsonString(version) + "," +
                "\"runningScriptIds\":[" + string.Join(",", running.Select(Protocol.JsonString)) + "]" +
                "}";
        }

        private static string RunAutoHotkeyScript(string scriptId, string content)
        {
            if (string.IsNullOrWhiteSpace(scriptId) || scriptId.Length > 80 || scriptId.Any(character => !char.IsLetterOrDigit(character) && character != '-'))
                throw new InvalidOperationException("The AutoHotkey script ID is invalid.");
            if (string.IsNullOrWhiteSpace(content)) throw new InvalidOperationException("The AutoHotkey script is empty.");
            if (Encoding.UTF8.GetByteCount(content) > 131072) throw new InvalidOperationException("AutoHotkey scripts are limited to 128 KB.");
            var executable = ResolveAutoHotkeyExecutable();
            if (string.IsNullOrEmpty(executable)) throw new InvalidOperationException("AutoHotkey v2 is not installed. Install it from autohotkey.com, then refresh.");
            StopAutoHotkeyScriptInternal(scriptId);
            var scriptsDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Valdor", "ProtectedSession", "AutoHotkey");
            Directory.CreateDirectory(scriptsDirectory);
            var scriptPath = Path.Combine(scriptsDirectory, scriptId + ".ahk");
            var source = content.TrimStart().StartsWith("#Requires AutoHotkey v2", StringComparison.OrdinalIgnoreCase)
                ? content
                : "#Requires AutoHotkey v2.0\r\n#SingleInstance Force\r\n" + content;
            File.WriteAllText(scriptPath, source, new UTF8Encoding(false));
            var process = Process.Start(new ProcessStartInfo
            {
                FileName = executable,
                Arguments = Quote(scriptPath),
                WorkingDirectory = scriptsDirectory,
                UseShellExecute = false,
                CreateNoWindow = false,
            });
            if (process == null) throw new InvalidOperationException("AutoHotkey did not start in the protected session.");
            process.EnableRaisingEvents = true;
            lock (AutoHotkeyProcessLock) AutoHotkeyProcesses[scriptId] = process;
            process.Exited += delegate
            {
                lock (AutoHotkeyProcessLock)
                {
                    Process tracked;
                    if (AutoHotkeyProcesses.TryGetValue(scriptId, out tracked) && tracked.Id == process.Id) AutoHotkeyProcesses.Remove(scriptId);
                }
                try { process.Dispose(); } catch { }
            };
            WriteServiceLog("autohotkey-start id=" + scriptId + " pid=" + process.Id.ToString(CultureInfo.InvariantCulture));
            return "{\"scriptId\":" + Protocol.JsonString(scriptId) + ",\"processId\":" + process.Id.ToString(CultureInfo.InvariantCulture) + "}";
        }

        private static string StopAutoHotkeyScript(string scriptId)
        {
            StopAutoHotkeyScriptInternal(scriptId);
            return "{\"scriptId\":" + Protocol.JsonString(scriptId) + ",\"running\":false}";
        }

        private static void StopAutoHotkeyScriptInternal(string scriptId)
        {
            Process process = null;
            lock (AutoHotkeyProcessLock)
            {
                if (AutoHotkeyProcesses.TryGetValue(scriptId, out process)) AutoHotkeyProcesses.Remove(scriptId);
            }
            if (process == null) return;
            try { if (!process.HasExited) process.Kill(); } catch { }
            try { process.Dispose(); } catch { }
            WriteServiceLog("autohotkey-stop id=" + scriptId);
        }

        private static void StopAllAutoHotkeyScripts()
        {
            string[] ids;
            lock (AutoHotkeyProcessLock) ids = AutoHotkeyProcesses.Keys.ToArray();
            foreach (var id in ids) StopAutoHotkeyScriptInternal(id);
        }

        private static void WriteAgentResult(StreamWriter writer, string requestId, string payload)
        {
            writer.WriteLine("RESULT\t" + requestId + "\tOK\t" + Protocol.Encode(payload));
        }

        private static void WriteAgentError(StreamWriter writer, string requestId, string message)
        {
            writer.WriteLine("RESULT\t" + requestId + "\tERROR\t" + Protocol.Encode(message));
        }

        private static string BuildWindowListJson()
        {
            var windows = EnumerateRobloxWindows();
            return "[" + string.Join(",", windows.Select(window =>
                "{" +
                "\"processId\":" + window.ProcessId.ToString(CultureInfo.InvariantCulture) + "," +
                "\"windowHandle\":" + Protocol.JsonString(window.WindowHandle.ToString(CultureInfo.InvariantCulture)) + "," +
                "\"windowTitle\":" + Protocol.JsonString(window.WindowTitle) + "," +
                "\"accountId\":" + Protocol.JsonString(window.AccountId) +
                "}")) + "]";
        }

        private static List<RobloxWindow> EnumerateRobloxWindows()
        {
            var windows = new List<RobloxWindow>();
            var currentSessionId = (uint)Process.GetCurrentProcess().SessionId;
            NativeMethods.EnumWindows(delegate(IntPtr window, IntPtr parameter)
            {
                if (!NativeMethods.IsWindowVisible(window) || NativeMethods.GetAncestor(window, NativeMethods.GaRoot) != window) return true;
                uint processId;
                NativeMethods.GetWindowThreadProcessId(window, out processId);
                uint processSessionId;
                if (processId == 0 || !NativeMethods.ProcessIdToSessionId(processId, out processSessionId) || processSessionId != currentSessionId) return true;
                string processPath;
                if (!TryGetProcessPath(processId, out processPath) || !string.Equals(Path.GetFileName(processPath), "RobloxPlayerBeta.exe", StringComparison.OrdinalIgnoreCase)) return true;
                var titleLength = Math.Max(0, NativeMethods.GetWindowTextLengthW(window));
                var title = new StringBuilder(titleLength + 1);
                NativeMethods.GetWindowTextW(window, title, title.Capacity);
                string accountId;
                lock (AgentProcessLock) accountId = AgentAccounts.ContainsKey(processId) ? AgentAccounts[processId] : string.Empty;
                windows.Add(new RobloxWindow
                {
                    ProcessId = processId,
                    WindowHandle = window.ToInt64(),
                    WindowTitle = title.ToString(),
                    AccountId = accountId,
                });
                return true;
            }, IntPtr.Zero);
            return windows.OrderBy(window => window.ProcessId).ToList();
        }

        private static string SendRobloxInput(uint processId, IntPtr window, string keyCode, int durationMs)
        {
            ushort virtualKey;
            if (!AllowedKeys.TryGetValue(keyCode, out virtualKey)) throw new InvalidOperationException("That key is not in Valdor's protected-session allowlist.");
            if (durationMs < 40 || durationMs > 1500) throw new InvalidOperationException("Input duration must be between 40 and 1500 milliseconds.");
            if (!NativeMethods.IsWindow(window) || NativeMethods.GetAncestor(window, NativeMethods.GaRoot) != window)
                throw new InvalidOperationException("The selected Roblox window no longer exists.");

            uint windowProcessId;
            NativeMethods.GetWindowThreadProcessId(window, out windowProcessId);
            if (windowProcessId != processId) throw new InvalidOperationException("The selected window no longer belongs to the recorded Roblox process.");
            uint processSessionId;
            if (!NativeMethods.ProcessIdToSessionId(processId, out processSessionId) || processSessionId != (uint)Process.GetCurrentProcess().SessionId)
                throw new InvalidOperationException("Valdor refused input outside the protected Windows session.");
            string processPath;
            if (!TryGetProcessPath(processId, out processPath) || !string.Equals(Path.GetFileName(processPath), "RobloxPlayerBeta.exe", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("The selected process is not RobloxPlayerBeta.exe.");

            var previous = NativeMethods.GetForegroundWindow();
            if (!ActivateWindow(window)) throw new InvalidOperationException("Windows did not activate the selected alt window inside the protected session.");
            SendVirtualKey(virtualKey, durationMs);
            var restored = previous != IntPtr.Zero && previous != window && NativeMethods.IsWindow(previous) && ActivateWindow(previous);
            return "{" +
                "\"processId\":" + processId.ToString(CultureInfo.InvariantCulture) + "," +
                "\"key\":" + Protocol.JsonString(keyCode) + "," +
                "\"durationMs\":" + durationMs.ToString(CultureInfo.InvariantCulture) + "," +
                "\"restoredPreviousWindow\":" + (restored ? "true" : "false") +
                "}";
        }

        private static string LaunchRoblox(string executable, string arguments, string accountId, string launchRequestId)
        {
            var fullPath = ResolveRobloxExecutable(executable);
            var robloxRoot = Path.GetFullPath(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Roblox", "Versions")) + Path.DirectorySeparatorChar;
            if (!fullPath.StartsWith(robloxRoot, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(Path.GetFileName(fullPath), "RobloxPlayerBeta.exe", StringComparison.OrdinalIgnoreCase) ||
                !File.Exists(fullPath))
                throw new InvalidOperationException("Valdor refused to launch an executable outside the installed Roblox Versions folder.");
            if (arguments.Length > 32700 || accountId.Length > 256 || launchRequestId.Length > 256)
                throw new InvalidOperationException("The protected launch request was too large.");

            var info = new ProcessStartInfo
            {
                FileName = fullPath,
                Arguments = arguments,
                WorkingDirectory = Path.GetDirectoryName(fullPath),
                UseShellExecute = false,
                CreateNoWindow = false,
            };
            var process = Process.Start(info);
            if (process == null) throw new InvalidOperationException("Roblox Player did not start in the protected session.");
            var processId = (uint)process.Id;
            var hasGlobalSettings = arguments.IndexOf("-g ", StringComparison.OrdinalIgnoreCase) >= 0;
            var hasTicket = arguments.IndexOf("-t ", StringComparison.OrdinalIgnoreCase) >= 0;
            var hasJoinUrl = arguments.IndexOf("-j ", StringComparison.OrdinalIgnoreCase) >= 0;
            process.EnableRaisingEvents = true;
            lock (AgentProcessLock)
            {
                AgentAccounts[processId] = accountId;
                AgentProcesses[processId] = process;
            }
            process.Exited += delegate
            {
                try
                {
                    WriteServiceLog("roblox-exit pid=" + processId.ToString(CultureInfo.InvariantCulture) +
                        " code=" + process.ExitCode.ToString(CultureInfo.InvariantCulture) +
                        " account=" + accountId);
                }
                catch (Exception exception)
                {
                    WriteServiceLog("roblox-exit pid=" + processId.ToString(CultureInfo.InvariantCulture) + " code=unknown error=" + exception.Message);
                }
                lock (AgentProcessLock)
                {
                    AgentAccounts.Remove(processId);
                    AgentProcesses.Remove(processId);
                }
                try { process.Dispose(); } catch { }
            };
            // Never log the command line: it contains a short-lived Roblox
            // authentication ticket. Only record non-sensitive launch-shape
            // flags needed to compare stable and failing launch paths.
            WriteServiceLog("roblox-start pid=" + processId.ToString(CultureInfo.InvariantCulture) +
                " resolution=960x540" +
                " globalSettings=" + (hasGlobalSettings ? "yes" : "no") +
                " ticket=" + (hasTicket ? "yes" : "no") +
                " joinUrl=" + (hasJoinUrl ? "yes" : "no"));
            return "{" +
                "\"processId\":" + processId.ToString(CultureInfo.InvariantCulture) + "," +
                "\"accountId\":" + Protocol.JsonString(accountId) + "," +
                "\"launchRequestId\":" + Protocol.JsonString(launchRequestId) +
                "}";
        }

        private static string LaunchRobloxProtocol(string appUri, string gameUri, string accountId, string launchRequestId)
        {
            if (string.IsNullOrWhiteSpace(appUri) ||
                !appUri.StartsWith("roblox-player:", StringComparison.OrdinalIgnoreCase) ||
                appUri.IndexOf("launchmode:app", StringComparison.OrdinalIgnoreCase) < 0 ||
                string.IsNullOrWhiteSpace(gameUri) ||
                !gameUri.StartsWith("roblox://placeId=", StringComparison.OrdinalIgnoreCase) ||
                appUri.Length > 32700 || gameUri.Length > 2048 || accountId.Length > 256 || launchRequestId.Length > 256)
                throw new InvalidOperationException("Valdor refused an invalid protected Roblox launch URL.");

            var currentSessionId = Process.GetCurrentProcess().SessionId;
            var before = new HashSet<int>(Process.GetProcessesByName("RobloxPlayerBeta")
                .Where(candidate => candidate.SessionId == currentSessionId)
                .Select(candidate => candidate.Id));
            Process bootstrapProcess = null;
            try
            {
                bootstrapProcess = Process.Start(new ProcessStartInfo
                {
                    FileName = appUri,
                    UseShellExecute = true,
                });
            }
            catch (Exception exception)
            {
                throw new InvalidOperationException("Windows could not open Roblox in authenticated app mode: " + exception.Message);
            }

            var bootstrapDeadline = DateTime.UtcNow.AddSeconds(15);
            while (DateTime.UtcNow < bootstrapDeadline)
            {
                bootstrapProcess = Process.GetProcessesByName("RobloxPlayerBeta")
                    .Where(candidate => candidate.SessionId == currentSessionId && !before.Contains(candidate.Id))
                    .OrderByDescending(candidate =>
                    {
                        try { return candidate.StartTime; }
                        catch { return DateTime.MinValue; }
                    })
                    .FirstOrDefault() ?? bootstrapProcess;
                if (bootstrapProcess != null)
                {
                    try
                    {
                        bootstrapProcess.Refresh();
                        if (bootstrapProcess.HasExited)
                        {
                            bootstrapProcess = null;
                            continue;
                        }
                        if (bootstrapProcess.MainWindowHandle != IntPtr.Zero) break;
                    }
                    catch { }
                }
                Thread.Sleep(200);
            }
            if (bootstrapProcess == null)
                throw new InvalidOperationException("Roblox did not finish opening its authenticated app in the protected session.");
            // Match the stable manual sequence: allow the authenticated app
            // shell to settle before asking it to transition into a game.
            Thread.Sleep(1500);
            Process shellProcess = null;
            try
            {
                var executable = ResolveRobloxExecutable(string.Empty);
                shellProcess = Process.Start(new ProcessStartInfo
                {
                    FileName = executable,
                    Arguments = Quote(gameUri),
                    WorkingDirectory = Path.GetDirectoryName(executable),
                    UseShellExecute = false,
                    CreateNoWindow = false,
                });
            }
            catch (Exception exception)
            {
                throw new InvalidOperationException("Roblox could not receive the protected game deep link: " + exception.Message);
            }

            // The deep-link invocation commonly creates a short-lived
            // forwarding Player process. The authenticated app process remains
            // alive and transitions into the game, so it is the authoritative
            // process for Session Guardian and protected controls.
            Thread.Sleep(1000);
            Process process = null;
            if (bootstrapProcess != null)
            {
                try
                {
                    bootstrapProcess.Refresh();
                    if (!bootstrapProcess.HasExited) process = bootstrapProcess;
                }
                catch { }
            }
            var deadline = DateTime.UtcNow.AddSeconds(15);
            while (DateTime.UtcNow < deadline && process == null)
            {
                process = Process.GetProcessesByName("RobloxPlayerBeta")
                    .Where(candidate => candidate.SessionId == currentSessionId && !before.Contains(candidate.Id))
                    .OrderBy(candidate =>
                    {
                        try { return candidate.StartTime; }
                        catch { return DateTime.MaxValue; }
                    })
                    .FirstOrDefault();
                if (process == null) Thread.Sleep(200);
            }
            if (process == null)
                throw new InvalidOperationException("Roblox's registered launcher did not start a new Player process in the protected session.");

            var processId = (uint)process.Id;
            process.EnableRaisingEvents = true;
            lock (AgentProcessLock)
            {
                AgentAccounts[processId] = accountId;
                AgentProcesses[processId] = process;
            }
            process.Exited += delegate
            {
                try
                {
                    WriteServiceLog("roblox-protocol-exit pid=" + processId.ToString(CultureInfo.InvariantCulture) +
                        " code=" + process.ExitCode.ToString(CultureInfo.InvariantCulture) +
                        " account=" + accountId);
                }
                catch (Exception exception)
                {
                    WriteServiceLog("roblox-protocol-exit pid=" + processId.ToString(CultureInfo.InvariantCulture) + " code=unknown error=" + exception.Message);
                }
                lock (AgentProcessLock)
                {
                    AgentAccounts.Remove(processId);
                    AgentProcesses.Remove(processId);
                }
                try { process.Dispose(); } catch { }
            };
            WriteServiceLog("roblox-protocol-start pid=" + processId.ToString(CultureInfo.InvariantCulture) + " session=" + currentSessionId.ToString(CultureInfo.InvariantCulture));
            return "{" +
                "\"processId\":" + processId.ToString(CultureInfo.InvariantCulture) + "," +
                "\"accountId\":" + Protocol.JsonString(accountId) + "," +
                "\"launchRequestId\":" + Protocol.JsonString(launchRequestId) +
                "}";
        }

        private static string ResolveRobloxExecutable(string suggestedPath)
        {
            if (!string.IsNullOrWhiteSpace(suggestedPath))
            {
                try
                {
                    var candidate = Path.GetFullPath(suggestedPath);
                    if (File.Exists(candidate) && string.Equals(Path.GetFileName(candidate), "RobloxPlayerBeta.exe", StringComparison.OrdinalIgnoreCase))
                        return candidate;
                }
                catch { }
            }

            foreach (var protocol in new[] { "roblox-player", "roblox" })
            {
                try
                {
                    using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Classes\" + protocol + @"\shell\open\command"))
                    {
                        var command = Convert.ToString(key == null ? null : key.GetValue(null), CultureInfo.InvariantCulture) ?? string.Empty;
                        var marker = "RobloxPlayerBeta.exe";
                        var end = command.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
                        if (end >= 0)
                        {
                            var start = command.LastIndexOf('"', end);
                            var candidate = start >= 0 ? command.Substring(start + 1, end + marker.Length - start - 1) : command.Substring(0, end + marker.Length).Trim();
                            if (File.Exists(candidate)) return Path.GetFullPath(candidate);
                        }
                    }
                }
                catch { }
            }

            var versions = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Roblox", "Versions");
            if (Directory.Exists(versions))
            {
                var candidate = Directory.GetDirectories(versions, "version-*")
                    .Select(folder => new { Path = Path.Combine(folder, "RobloxPlayerBeta.exe"), Folder = folder })
                    .Where(item => File.Exists(item.Path))
                    .OrderByDescending(item => Directory.GetLastWriteTimeUtc(item.Folder))
                    .Select(item => item.Path)
                    .FirstOrDefault();
                if (!string.IsNullOrEmpty(candidate)) return Path.GetFullPath(candidate);
            }

            throw new InvalidOperationException("Roblox Player was not found in the protected Windows session. Open Roblox.com in the alt desktop and install Player once, then retry.");
        }

        private static bool ActivateWindow(IntPtr window)
        {
            if (NativeMethods.IsIconic(window)) NativeMethods.ShowWindowAsync(window, NativeMethods.SwRestore);
            var foreground = NativeMethods.GetForegroundWindow();
            var currentThread = NativeMethods.GetCurrentThreadId();
            uint ignored;
            var targetThread = NativeMethods.GetWindowThreadProcessId(window, out ignored);
            var foregroundThread = foreground != IntPtr.Zero ? NativeMethods.GetWindowThreadProcessId(foreground, out ignored) : 0;
            var attachedTarget = targetThread != 0 && targetThread != currentThread && NativeMethods.AttachThreadInput(currentThread, targetThread, true);
            var attachedForeground = foregroundThread != 0 && foregroundThread != currentThread && foregroundThread != targetThread && NativeMethods.AttachThreadInput(currentThread, foregroundThread, true);
            NativeMethods.BringWindowToTop(window);
            NativeMethods.SetForegroundWindow(window);
            NativeMethods.SetActiveWindow(window);
            NativeMethods.SetFocus(window);
            if (attachedForeground) NativeMethods.AttachThreadInput(currentThread, foregroundThread, false);
            if (attachedTarget) NativeMethods.AttachThreadInput(currentThread, targetThread, false);

            for (var attempt = 0; attempt < 20; attempt++)
            {
                var active = NativeMethods.GetForegroundWindow();
                if (active == window || NativeMethods.GetAncestor(active, NativeMethods.GaRoot) == window) return true;
                Thread.Sleep(25);
            }
            return false;
        }

        private static void SendVirtualKey(ushort virtualKey, int durationMs)
        {
            var extended = virtualKey == 0x25 || virtualKey == 0x26 || virtualKey == 0x27 || virtualKey == 0x28;
            var down = new NativeMethods.Input
            {
                type = NativeMethods.InputKeyboard,
                union = new NativeMethods.InputUnion
                {
                    keyboard = new NativeMethods.KeyboardInput
                    {
                        virtualKey = virtualKey,
                        scanCode = (ushort)NativeMethods.MapVirtualKeyW(virtualKey, NativeMethods.MapVkToVsc),
                        flags = extended ? NativeMethods.KeyEventExtendedKey : 0,
                    },
                },
            };
            var up = down;
            up.union.keyboard.flags |= NativeMethods.KeyEventKeyUp;
            if (NativeMethods.SendInput(1, new[] { down }, Marshal.SizeOf(typeof(NativeMethods.Input))) != 1)
                throw new InvalidOperationException("Windows could not press the requested key (error " + Marshal.GetLastWin32Error() + ").");
            Thread.Sleep(durationMs);
            if (NativeMethods.SendInput(1, new[] { up }, Marshal.SizeOf(typeof(NativeMethods.Input))) != 1)
                throw new InvalidOperationException("Windows could not release the requested key (error " + Marshal.GetLastWin32Error() + ").");
        }

        private static bool TryGetProcessPath(uint processId, out string processPath)
        {
            processPath = string.Empty;
            var process = NativeMethods.OpenProcess(NativeMethods.ProcessQueryLimitedInformation, false, processId);
            if (process == IntPtr.Zero) return false;
            try
            {
                var value = new StringBuilder(32768);
                uint length = (uint)value.Capacity;
                if (!NativeMethods.QueryFullProcessImageNameW(process, 0, value, ref length)) return false;
                processPath = value.ToString();
                return true;
            }
            finally
            {
                NativeMethods.CloseHandle(process);
            }
        }

        private static void ConfigureCredentialPolicy()
        {
            using (var root = Registry.LocalMachine.CreateSubKey(CredentialPolicyPath))
            {
                if (root == null) throw new InvalidOperationException("Windows could not configure localhost credential delegation.");
                root.SetValue("AllowDefaultCredentials", 1, RegistryValueKind.DWord);
                root.SetValue("ConcatenateDefaults_AllowDefault", 1, RegistryValueKind.DWord);
                root.SetValue("AllowDefCredentialsWhenNTLMOnly", 1, RegistryValueKind.DWord);
                root.SetValue("ConcatenateDefaults_AllowDefNTLMOnly", 1, RegistryValueKind.DWord);
            }
            AddPolicyListValue(CredentialPolicyPath + @"\AllowDefaultCredentials", LocalhostSpn, "DefaultCredentialListValue");
            AddPolicyListValue(CredentialPolicyPath + @"\AllowDefCredentialsWhenNTLMOnly", LocalhostSpn, "NtlmCredentialListValue");
        }

        private static void AddPolicyListValue(string path, string value, string backupName)
        {
            using (var key = Registry.LocalMachine.CreateSubKey(path))
            using (var backup = Registry.LocalMachine.CreateSubKey(BackupKeyPath))
            {
                if (key == null || backup == null) throw new InvalidOperationException("Windows could not create the localhost credential allowlist.");
                foreach (var name in key.GetValueNames())
                {
                    if (string.Equals(Convert.ToString(key.GetValue(name), CultureInfo.InvariantCulture), value, StringComparison.OrdinalIgnoreCase))
                    {
                        backup.SetValue(backupName, string.Empty, RegistryValueKind.String);
                        return;
                    }
                }
                var index = 1;
                while (key.GetValue(index.ToString(CultureInfo.InvariantCulture)) != null) index++;
                var createdName = index.ToString(CultureInfo.InvariantCulture);
                key.SetValue(createdName, value, RegistryValueKind.String);
                backup.SetValue(backupName, createdName, RegistryValueKind.String);
            }
        }

        private static bool HasLocalhostCredentialPolicy()
        {
            return PolicyListContains(CredentialPolicyPath + @"\AllowDefaultCredentials", LocalhostSpn) &&
                PolicyListContains(CredentialPolicyPath + @"\AllowDefCredentialsWhenNTLMOnly", LocalhostSpn);
        }

        private static bool PolicyListContains(string path, string value)
        {
            using (var key = Registry.LocalMachine.OpenSubKey(path))
            {
                return key != null && key.GetValueNames().Any(name =>
                    string.Equals(Convert.ToString(key.GetValue(name), CultureInfo.InvariantCulture), value, StringComparison.OrdinalIgnoreCase));
            }
        }

        private static void BackupConfiguration()
        {
            using (var backup = Registry.LocalMachine.CreateSubKey(BackupKeyPath))
            {
                if (backup == null) throw new InvalidOperationException("Windows could not create the Protected Session restore point.");
                if (Convert.ToInt32(backup.GetValue("Complete", 0), CultureInfo.InvariantCulture) == 1) return;
                bool childEnabled;
                NativeMethods.WTSIsChildSessionsEnabled(out childEnabled);
                backup.SetValue("ChildSessionsEnabled", childEnabled ? 1 : 0, RegistryValueKind.DWord);
                BackupValue(backup, Registry.LocalMachine, TerminalServerPath, "fDenyTSConnections", "Deny");
                BackupValue(backup, Registry.LocalMachine, TerminalPolicyPath, "fPromptForPassword", "PolicyPrompt");
                BackupValue(backup, Registry.LocalMachine, RdpTcpPath, "fPromptForPassword", "ListenerPrompt");
                BackupValue(backup, Registry.LocalMachine, CredentialPolicyPath, "AllowDefaultCredentials", "AllowDefault");
                BackupValue(backup, Registry.LocalMachine, CredentialPolicyPath, "ConcatenateDefaults_AllowDefault", "ConcatDefault");
                BackupValue(backup, Registry.LocalMachine, CredentialPolicyPath, "AllowDefCredentialsWhenNTLMOnly", "AllowNtlm");
                BackupValue(backup, Registry.LocalMachine, CredentialPolicyPath, "ConcatenateDefaults_AllowDefNTLMOnly", "ConcatNtlm");
                BackupValue(backup, Registry.LocalMachine, WinStationsPath, "DWMFRAMEINTERVAL", "RdpFrameInterval");
                backup.SetValue("RdpFrameIntervalBackupComplete", 1, RegistryValueKind.DWord);
                backup.SetValue("Complete", 1, RegistryValueKind.DWord);
            }
        }

        private static void BackupRdpFrameIntervalIfNeeded()
        {
            using (var backup = Registry.LocalMachine.CreateSubKey(BackupKeyPath))
            {
                if (backup == null) throw new InvalidOperationException("Windows could not update the Protected Session restore point.");
                if (Convert.ToInt32(backup.GetValue("RdpFrameIntervalBackupComplete", 0), CultureInfo.InvariantCulture) == 1) return;
                BackupValue(backup, Registry.LocalMachine, WinStationsPath, "DWMFRAMEINTERVAL", "RdpFrameInterval");
                backup.SetValue("RdpFrameIntervalBackupComplete", 1, RegistryValueKind.DWord);
            }
        }

        private static void RestoreConfiguration()
        {
            using (var backup = Registry.LocalMachine.OpenSubKey(BackupKeyPath, true))
            {
                if (backup == null || Convert.ToInt32(backup.GetValue("Complete", 0), CultureInfo.InvariantCulture) != 1)
                {
                    NativeMethods.WTSEnableChildSessions(false);
                    WriteDword(Registry.LocalMachine, TerminalServerPath, "fDenyTSConnections", 1);
                    return;
                }

                var childEnabled = Convert.ToInt32(backup.GetValue("ChildSessionsEnabled", 0), CultureInfo.InvariantCulture) == 1;
                NativeMethods.WTSEnableChildSessions(childEnabled);
                RestoreValue(backup, Registry.LocalMachine, TerminalServerPath, "fDenyTSConnections", "Deny");
                RestoreValue(backup, Registry.LocalMachine, TerminalPolicyPath, "fPromptForPassword", "PolicyPrompt");
                RestoreValue(backup, Registry.LocalMachine, RdpTcpPath, "fPromptForPassword", "ListenerPrompt");
                RestoreValue(backup, Registry.LocalMachine, CredentialPolicyPath, "AllowDefaultCredentials", "AllowDefault");
                RestoreValue(backup, Registry.LocalMachine, CredentialPolicyPath, "ConcatenateDefaults_AllowDefault", "ConcatDefault");
                RestoreValue(backup, Registry.LocalMachine, CredentialPolicyPath, "AllowDefCredentialsWhenNTLMOnly", "AllowNtlm");
                RestoreValue(backup, Registry.LocalMachine, CredentialPolicyPath, "ConcatenateDefaults_AllowDefNTLMOnly", "ConcatNtlm");
                if (Convert.ToInt32(backup.GetValue("RdpFrameIntervalBackupComplete", 0), CultureInfo.InvariantCulture) == 1)
                    RestoreValue(backup, Registry.LocalMachine, WinStationsPath, "DWMFRAMEINTERVAL", "RdpFrameInterval");
                RemoveCreatedPolicyEntry(backup, CredentialPolicyPath + @"\AllowDefaultCredentials", "DefaultCredentialListValue");
                RemoveCreatedPolicyEntry(backup, CredentialPolicyPath + @"\AllowDefCredentialsWhenNTLMOnly", "NtlmCredentialListValue");
            }
            Registry.LocalMachine.DeleteSubKeyTree(BackupKeyPath, false);
        }

        private static void BackupValue(RegistryKey backup, RegistryKey hive, string path, string name, string backupName)
        {
            using (var key = hive.OpenSubKey(path))
            {
                var value = key == null ? null : key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
                backup.SetValue(backupName + "Exists", value == null ? 0 : 1, RegistryValueKind.DWord);
                if (value != null) backup.SetValue(backupName + "Value", Convert.ToInt32(value, CultureInfo.InvariantCulture), RegistryValueKind.DWord);
            }
        }

        private static void RestoreValue(RegistryKey backup, RegistryKey hive, string path, string name, string backupName)
        {
            var existed = Convert.ToInt32(backup.GetValue(backupName + "Exists", 0), CultureInfo.InvariantCulture) == 1;
            using (var key = hive.CreateSubKey(path))
            {
                if (key == null) return;
                if (existed)
                    key.SetValue(name, Convert.ToInt32(backup.GetValue(backupName + "Value", 0), CultureInfo.InvariantCulture), RegistryValueKind.DWord);
                else
                    key.DeleteValue(name, false);
            }
        }

        private static void RemoveCreatedPolicyEntry(RegistryKey backup, string path, string backupName)
        {
            var valueName = Convert.ToString(backup.GetValue(backupName, string.Empty), CultureInfo.InvariantCulture);
            if (string.IsNullOrEmpty(valueName)) return;
            using (var key = Registry.LocalMachine.OpenSubKey(path, true))
            {
                if (key != null) key.DeleteValue(valueName, false);
            }
        }

        private static void EnsureTermServiceRunning()
        {
            using (var service = new ServiceController("TermService"))
            {
                service.Refresh();
                if (service.Status == ServiceControllerStatus.Running) return;
                service.Start();
                service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));
            }
        }

        private static bool AreAllFirewallProfilesEnabled()
        {
            var root = @"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\";
            return ReadDword(Registry.LocalMachine, root + "DomainProfile", "EnableFirewall", 1) != 0 &&
                ReadDword(Registry.LocalMachine, root + "StandardProfile", "EnableFirewall", 1) != 0 &&
                ReadDword(Registry.LocalMachine, root + "PublicProfile", "EnableFirewall", 1) != 0;
        }

        private static bool IsAdministrator()
        {
            using (var identity = WindowsIdentity.GetCurrent())
            {
                return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
            }
        }

        private static int ReadDword(RegistryKey hive, string path, string name, int fallback)
        {
            using (var key = hive.OpenSubKey(path))
            {
                var value = key == null ? null : key.GetValue(name);
                return value == null ? fallback : Convert.ToInt32(value, CultureInfo.InvariantCulture);
            }
        }

        private static void WriteDword(RegistryKey hive, string path, string name, int value)
        {
            using (var key = hive.CreateSubKey(path))
            {
                if (key == null) throw new InvalidOperationException("Windows could not update " + path + ".");
                key.SetValue(name, value, RegistryValueKind.DWord);
            }
        }

        internal static void ValidateBridgeValues(string pipeName, string token)
        {
            if (string.IsNullOrEmpty(pipeName) || pipeName.Length > 100 || pipeName.Any(character => !char.IsLetterOrDigit(character) && character != '-'))
                throw new InvalidOperationException("The protected-session pipe name is invalid.");
            if (token.Length != 64 || token.Any(character => !Uri.IsHexDigit(character)))
                throw new InvalidOperationException("The protected-session token is invalid.");
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private static int ParseInt(string value, string label)
        {
            int parsed;
            if (!int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out parsed) || parsed < 0)
                throw new InvalidOperationException("The " + label + " is invalid.");
            return parsed;
        }

        private static uint ParseUInt(string value, string label)
        {
            uint parsed;
            if (!uint.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out parsed) || parsed == 0)
                throw new InvalidOperationException("The " + label + " is invalid.");
            return parsed;
        }

        private static long ParseLong(string value, string label)
        {
            long parsed;
            if (!long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out parsed) || parsed == 0)
                throw new InvalidOperationException("The " + label + " is invalid.");
            return parsed;
        }
    }
}
