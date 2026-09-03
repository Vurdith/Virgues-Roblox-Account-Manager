using System;
using System.Collections.Generic;
using System.Diagnostics;
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

namespace Virgue.ProtectedSession
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
        internal const uint GaRoot = 2;
        internal const uint ProcessQueryLimitedInformation = 0x1000;

        internal delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

        [StructLayout(LayoutKind.Sequential)]
        internal struct Input
        {
            internal uint type;
            internal InputUnion union;
        }

        [StructLayout(LayoutKind.Explicit)]
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

        [DllImport("user32.dll")]
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
        private NamedPipeServerStream pipe;
        private StreamWriter writer;
        private volatile bool disposed;

        internal HostBridge(string pipeName, string token, int parentSessionId)
        {
            this.pipeName = pipeName;
            this.token = token;
            this.parentSessionId = parentSessionId;
        }

        internal void Start()
        {
            var thread = new Thread(Run) { IsBackground = true, Name = "Virgue protected-session pipe" };
            thread.Start();
        }

        private void Run()
        {
            try
            {
                pipe = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1,
                    PipeTransmissionMode.Byte, PipeOptions.None, 16384, 16384);
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
                RemoveRunOnce();
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
            lock (pipeLock)
            {
                try { if (writer != null) writer.WriteLine("STOP"); } catch { }
                try { if (pipe != null) pipe.Dispose(); } catch { }
                writer = null;
            }
            RemoveRunOnce();
        }

        internal static void SetRunOnce(string command)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\RunOnce"))
            {
                if (key == null) throw new InvalidOperationException("Windows could not prepare the protected-session agent.");
                key.SetValue("VirgueProtectedSessionAgent", command, RegistryValueKind.String);
            }
        }

        internal static void RemoveRunOnce()
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\RunOnce", true))
                {
                    if (key != null) key.DeleteValue("VirgueProtectedSessionAgent", false);
                }
            }
            catch { }
        }
    }

    internal static class Program
    {
        private const string BackupKeyPath = @"SOFTWARE\Virgue\ProtectedSession";
        private const string CredentialPolicyPath = @"SOFTWARE\Policies\Microsoft\Windows\CredentialsDelegation";
        private const string TerminalPolicyPath = @"SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services";
        private const string TerminalServerPath = @"SYSTEM\CurrentControlSet\Control\Terminal Server";
        private const string RdpTcpPath = @"SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp";
        private const string LocalhostSpn = "TERMSRV/localhost";

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

        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                if (args.Length == 1 && args[0] == "--status") return WriteStatus();
                if (args.Length == 2 && args[0] == "--setup") return Configure(args[1], true);
                if (args.Length == 2 && args[0] == "--teardown") return Configure(args[1], false);
                if (args.Length == 7 && args[0] == "--host" && args[1] == "--pipe" && args[3] == "--token" && args[5] == "--parent-session")
                    return RunHost(args[2], args[4], ParseInt(args[6], "parent session"));
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
            var configured = childQueryOk && childEnabled && deny == 0 && HasLocalhostCredentialPolicy();
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
                    BackupConfiguration();
                    if (!NativeMethods.WTSEnableChildSessions(true))
                        throw new InvalidOperationException("Windows rejected child sessions (error " + Marshal.GetLastWin32Error() + ").");
                    WriteDword(Registry.LocalMachine, TerminalServerPath, "fDenyTSConnections", 0);
                    ConfigureCredentialPolicy();
                    WriteDword(Registry.LocalMachine, TerminalPolicyPath, "fPromptForPassword", 0);
                    WriteDword(Registry.LocalMachine, RdpTcpPath, "fPromptForPassword", 0);
                    EnsureTermServiceRunning();
                    result = "Protected Session is configured. Windows may ask you to verify your account on the first connection.";
                }
                else
                {
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

        private static int RunHost(string pipeName, string token, int parentSessionId)
        {
            ValidateBridgeValues(pipeName, token);
            bool enabled;
            if (!NativeMethods.WTSIsChildSessionsEnabled(out enabled) || !enabled)
                throw new InvalidOperationException("Protected Session has not been configured on this PC.");

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            using (var bridge = new HostBridge(pipeName, token, parentSessionId))
            using (var form = new Form())
            using (var host = new RdpHostControl())
            {
                var executable = Process.GetCurrentProcess().MainModule.FileName;
                var agentCommand = Quote(executable) + " --agent --pipe " + Quote(pipeName) +
                    " --token " + Quote(token) + " --parent-session " + parentSessionId.ToString(CultureInfo.InvariantCulture);
                HostBridge.SetRunOnce(agentCommand);
                bridge.Start();

                form.Text = "Virgue Protected Session";
                form.Width = 1280;
                form.Height = 720;
                form.ShowInTaskbar = false;
                form.StartPosition = FormStartPosition.Manual;
                form.Left = -10000;
                form.Top = -10000;
                form.FormBorderStyle = FormBorderStyle.None;
                host.Dock = DockStyle.Fill;
                form.Controls.Add(host);

                form.Shown += delegate
                {
                    try
                    {
                        dynamic client = host.ControlObject;
                        client.Server = "localhost";
                        client.DesktopWidth = 1280;
                        client.DesktopHeight = 720;
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
                        advanced.RedirectClipboard = false;
                        advanced.RedirectDrives = false;
                        advanced.RedirectPrinters = false;
                        advanced.RedirectSmartCards = false;
                        advanced.SmartSizing = true;
                        try { advanced.EnableAutoReconnect = true; } catch { }

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
                var timer = new System.Windows.Forms.Timer { Interval = 200 };
                timer.Tick += delegate
                {
                    try
                    {
                        dynamic client = host.ControlObject;
                        var connected = Convert.ToInt16(client.Connected, CultureInfo.InvariantCulture) == 1;
                        uint childSessionId;
                        var hasChild = NativeMethods.WTSGetChildSessionId(out childSessionId) && childSessionId != NativeMethods.NoChildSession;
                        if (connected && hasChild && !connectedReported)
                        {
                            connectedReported = true;
                            Protocol.Write("EVENT", "CONNECTED", childSessionId.ToString(CultureInfo.InvariantCulture));
                        }
                        if (connectedReported && !connected)
                        {
                            Protocol.Write("EVENT", "DISCONNECTED");
                            form.Close();
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
                        bridge.Send(line);
                    }
                    try { form.BeginInvoke(new Action(form.Close)); } catch { }
                }) { IsBackground = true, Name = "Virgue protected-session command input" };
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

        private static int RunAgent(string pipeName, string token, int parentSessionId)
        {
            ValidateBridgeValues(pipeName, token);
            var currentSessionId = Process.GetCurrentProcess().SessionId;
            if (currentSessionId == parentSessionId) return 3;

            bool ownsRobloxMutex = false;
            using (var robloxMutex = new Mutex(true, "ROBLOX_singletonMutex", out ownsRobloxMutex))
            using (var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.None))
            {
                if (!ownsRobloxMutex)
                {
                    try { ownsRobloxMutex = robloxMutex.WaitOne(0); }
                    catch (AbandonedMutexException) { ownsRobloxMutex = true; }
                }
                if (!ownsRobloxMutex) throw new InvalidOperationException("Virgue could not enable multiple Roblox clients in the protected session.");

                pipe.Connect(60000);
                var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, true);
                var writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
                writer.WriteLine("HELLO\t" + token + "\t" + currentSessionId.ToString(CultureInfo.InvariantCulture));

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
                            WriteAgentResult(writer, requestId, BuildWindowListJson());
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
                        else if (parts.Length == 2 && parts[0] == "PING")
                        {
                            WriteAgentResult(writer, requestId, "{\"ok\":true}");
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

                robloxMutex.ReleaseMutex();
            }
            return 0;
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
                windows.Add(new RobloxWindow
                {
                    ProcessId = processId,
                    WindowHandle = window.ToInt64(),
                    WindowTitle = title.ToString(),
                    AccountId = AgentAccounts.ContainsKey(processId) ? AgentAccounts[processId] : string.Empty,
                });
                return true;
            }, IntPtr.Zero);
            return windows.OrderBy(window => window.ProcessId).ToList();
        }

        private static string SendRobloxInput(uint processId, IntPtr window, string keyCode, int durationMs)
        {
            ushort virtualKey;
            if (!AllowedKeys.TryGetValue(keyCode, out virtualKey)) throw new InvalidOperationException("That key is not in Virgue's protected-session allowlist.");
            if (durationMs < 40 || durationMs > 1500) throw new InvalidOperationException("Input duration must be between 40 and 1500 milliseconds.");
            if (!NativeMethods.IsWindow(window) || NativeMethods.GetAncestor(window, NativeMethods.GaRoot) != window)
                throw new InvalidOperationException("The selected Roblox window no longer exists.");

            uint windowProcessId;
            NativeMethods.GetWindowThreadProcessId(window, out windowProcessId);
            if (windowProcessId != processId) throw new InvalidOperationException("The selected window no longer belongs to the recorded Roblox process.");
            uint processSessionId;
            if (!NativeMethods.ProcessIdToSessionId(processId, out processSessionId) || processSessionId != (uint)Process.GetCurrentProcess().SessionId)
                throw new InvalidOperationException("Virgue refused input outside the protected Windows session.");
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
            var fullPath = Path.GetFullPath(executable);
            var robloxRoot = Path.GetFullPath(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Roblox", "Versions")) + Path.DirectorySeparatorChar;
            if (!fullPath.StartsWith(robloxRoot, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(Path.GetFileName(fullPath), "RobloxPlayerBeta.exe", StringComparison.OrdinalIgnoreCase) ||
                !File.Exists(fullPath))
                throw new InvalidOperationException("Virgue refused to launch an executable outside the installed Roblox Versions folder.");
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
            using (var process = Process.Start(info))
            {
                if (process == null) throw new InvalidOperationException("Roblox Player did not start in the protected session.");
                AgentAccounts[(uint)process.Id] = accountId;
                return "{" +
                    "\"processId\":" + process.Id.ToString(CultureInfo.InvariantCulture) + "," +
                    "\"accountId\":" + Protocol.JsonString(accountId) + "," +
                    "\"launchRequestId\":" + Protocol.JsonString(launchRequestId) +
                    "}";
            }
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
                backup.SetValue("Complete", 1, RegistryValueKind.DWord);
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

        private static void ValidateBridgeValues(string pipeName, string token)
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
