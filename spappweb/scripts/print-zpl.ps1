param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$ZplFile
)

if (-not (Test-Path -LiteralPath $ZplFile)) {
    throw "ZPL file not found: $ZplFile"
}

$zpl = [System.IO.File]::ReadAllText($ZplFile)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void SendBytesToPrinter(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
            throw new System.ComponentModel.Win32Exception();
        }

        try {
            var di = new DOCINFOA {
                pDocName = "SPapp Label",
                pDataType = "RAW"
            };

            if (!StartDocPrinter(hPrinter, 1, di)) {
                throw new System.ComponentModel.Win32Exception();
            }

            try {
                if (!StartPagePrinter(hPrinter)) {
                    throw new System.ComponentModel.Win32Exception();
                }

                IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                int dwWritten;
                if (!WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten)) {
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    throw new System.ComponentModel.Win32Exception();
                }
                Marshal.FreeCoTaskMem(pUnmanagedBytes);
                EndPagePrinter(hPrinter);
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
"@

$bytes = [System.Text.Encoding]::UTF8.GetBytes($zpl)
[RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes)
