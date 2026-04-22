using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Threading;

namespace OkuSuriShortagePrinter;

internal static class Program
{
    private const string SingleInstanceMutexName = @"Local\OkuSuriShortagePrinter.SingleInstance";
    private const string ActivateAndClearEventName = @"Local\OkuSuriShortagePrinter.ActivateAndClear";
    private const int SwRestore = 9;
    private static readonly bool IsDevMode =
        string.Equals(Environment.GetEnvironmentVariable("OKUSURI_DEV"), "1", StringComparison.Ordinal);

    [STAThread]
    [SupportedOSPlatform("windows")]
    private static void Main()
    {
        using var singleInstanceMutex = new Mutex(initiallyOwned: true, SingleInstanceMutexName, out var isFirstInstance);
        using var activateAndClearEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ActivateAndClearEventName);

        if (!isFirstInstance)
        {
            if (!IsDevMode)
            {
                TrySignalActivateAndClear(activateAndClearEvent);
                ActivateRunningInstanceWindow();
            }
            return;
        }

        ApplicationConfiguration.Initialize();

        using var mainForm = new MainForm();
        var activationListener = RegisterActivationListener(mainForm, activateAndClearEvent);
        try
        {
            Application.Run(mainForm);
        }
        finally
        {
            activationListener.Unregister(null);
        }
    }

    private static RegisteredWaitHandle RegisterActivationListener(MainForm mainForm, EventWaitHandle activateAndClearEvent)
    {
        return ThreadPool.RegisterWaitForSingleObject(
            waitObject: activateAndClearEvent,
            callBack: (_, _) =>
            {
                try
                {
                    if (mainForm.IsDisposed)
                        return;

                    if (!mainForm.IsHandleCreated)
                        return;

                    mainForm.BeginInvoke(new Action(mainForm.ActivateAndClearFromSecondLaunch));
                }
                catch
                {
                    // Ignore callbacks while app is shutting down.
                }
            },
            state: null,
            millisecondsTimeOutInterval: Timeout.Infinite,
            executeOnlyOnce: false);
    }

    private static void TrySignalActivateAndClear(EventWaitHandle activateAndClearEvent)
    {
        try
        {
            activateAndClearEvent.Set();
        }
        catch
        {
            // Ignore signaling failures and still try foreground activation fallback.
        }
    }

    private static void ActivateRunningInstanceWindow()
    {
        using var current = Process.GetCurrentProcess();
        var currentExecutablePath = TryGetExecutablePath(current);

        for (var attempt = 0; attempt < 10; attempt++)
        {
            var candidates = Process.GetProcessesByName(current.ProcessName);
            try
            {
                foreach (var candidate in candidates)
                {
                    if (candidate.Id == current.Id)
                        continue;
                    if (!IsSameExecutable(candidate, currentExecutablePath))
                        continue;

                    candidate.Refresh();
                    var handle = candidate.MainWindowHandle;
                    if (handle == IntPtr.Zero)
                        continue;

                    ShowWindowAsync(handle, SwRestore);
                    SetForegroundWindow(handle);
                    return;
                }
            }
            finally
            {
                foreach (var candidate in candidates)
                {
                    candidate.Dispose();
                }
            }

            Thread.Sleep(100);
        }
    }

    private static bool IsSameExecutable(Process process, string currentExecutablePath)
    {
        if (string.IsNullOrWhiteSpace(currentExecutablePath))
            return true;

        var targetPath = TryGetExecutablePath(process);
        if (string.IsNullOrWhiteSpace(targetPath))
            return true;

        return string.Equals(targetPath, currentExecutablePath, StringComparison.OrdinalIgnoreCase);
    }

    private static string TryGetExecutablePath(Process process)
    {
        try
        {
            return process.MainModule?.FileName ?? "";
        }
        catch
        {
            return "";
        }
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr hWnd);
}
