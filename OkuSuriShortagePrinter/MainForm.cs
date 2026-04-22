using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Printing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace OkuSuriShortagePrinter;

public sealed class MainForm : Form
{
	private sealed record FormInput(string Patient, string PrinterName, IReadOnlyList<DrugInput> Drugs);

	private sealed record DrugInput(string Drug, string DrugType, string DrugUsage, string ShortageCount, string ShortageDays, string ShortageUnit, string ShortageUnitOther, string Arrive, string ArriveOtherText, string Dest, string DestSmallText, string DestOtherText, string Notes);

	private sealed record AppSettings(string PrinterName, int StartupWindowScalePercent, int UiScalePercent, int Page1YellowFrameThicknessTenthsMm);

	private static readonly bool IsDevMode = string.Equals(Environment.GetEnvironmentVariable("OKUSURI_DEV"), "1", StringComparison.Ordinal);

	private readonly WebView2 _webView;

	private readonly WebView2 _printWebView;

	private static readonly Size DesiredClientSizeAt96Dpi = new Size(1000, 800);

	private static readonly Size MinimumClientSizeAt96Dpi = new Size(760, 608);

	private const int DefaultStartupWindowScalePercent = 100;

	private const int DefaultUiScalePercent = 100;

	private const int MinStartupWindowScalePercent = 75;

	private const int MaxStartupWindowScalePercent = 150;

	private const int MinUiScalePercent = 75;

	private const int MaxUiScalePercent = 150;

	private const int DefaultPage1YellowFrameThicknessTenthsMm = 30;

	private const int MinPage1YellowFrameThicknessTenthsMm = 30;

	private const int MaxPage1YellowFrameThicknessTenthsMm = 120;

	private const int AspectWidth = 5;

	private const int AspectHeight = 4;

	private const int WM_SIZING = 0x0214;

	private const int WMSZ_LEFT = 1;

	private const int WMSZ_RIGHT = 2;

	private const int WMSZ_TOP = 3;

	private const int WMSZ_TOPLEFT = 4;

	private const int WMSZ_TOPRIGHT = 5;

	private const int WMSZ_BOTTOM = 6;

	private const int WMSZ_BOTTOMLEFT = 7;

	private const int WMSZ_BOTTOMRIGHT = 8;

	private static readonly string SettingsFilePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OkuSuriShortagePrinter", "settings.json");

	private FileSystemWatcher? _uiFileWatcher;

	private System.Windows.Forms.Timer? _uiReloadTimer;

	private bool _pendingUiReload;

	private bool _clearAllPending;

	private AppSettings _settings;

	[StructLayout(LayoutKind.Sequential)]
	private struct WinRect
	{
		public int Left;

		public int Top;

		public int Right;

		public int Bottom;

		public int Width => Right - Left;

		public int Height => Bottom - Top;
	}

	public MainForm()
	{
		_settings = LoadSettings();
		Text = "おくすり不足 印刷アプリ（ファーマックス由利調剤薬局）";
		ApplyWindowIcon();
		base.StartPosition = FormStartPosition.CenterScreen;
		base.ClientSize = BuildClientSizeFromScalePercent(_settings.StartupWindowScalePercent);
		MinimumSize = MinimumClientSizeAt96Dpi;
		_webView = new WebView2
		{
			Dock = DockStyle.Fill
		};
		_printWebView = new WebView2
		{
			Visible = false,
			Size = new Size(1, 1),
			Location = new Point(-10000, -10000)
		};
		base.Controls.Add(_webView);
		base.Controls.Add(_printWebView);
		base.Load += OnLoadAsync;
	}

	private void ApplyWindowIcon()
	{
		try
		{
			string baseDir = AppContext.BaseDirectory;
			string iconPath = Path.Combine(baseDir, "app.ico");
			if (!File.Exists(iconPath))
			{
				return;
			}

			using Icon src = new Icon(iconPath, SystemInformation.SmallIconSize);
			Icon = (Icon)src.Clone();
		}
		catch
		{
			// Ignore icon load failures and continue with default app icon.
		}
	}

	protected override void WndProc(ref Message m)
	{
		if (m.Msg == WM_SIZING && base.WindowState == FormWindowState.Normal && m.LParam != IntPtr.Zero)
		{
			WinRect rect = Marshal.PtrToStructure<WinRect>(m.LParam);
			ApplyAspectSizing(ref rect, (int)m.WParam);
			Marshal.StructureToPtr(rect, m.LParam, fDeleteOld: false);
		}
		base.WndProc(ref m);
	}

	private void ApplyAspectSizing(ref WinRect rect, int edge)
	{
		int nonClientWidth = Math.Max(0, base.Width - base.ClientSize.Width);
		int nonClientHeight = Math.Max(0, base.Height - base.ClientSize.Height);

		bool hasHorizontalEdge = IsHorizontalEdge(edge);
		bool hasVerticalEdge = IsVerticalEdge(edge);
		int candidateClientWidth = Math.Max(MinimumClientSizeAt96Dpi.Width, rect.Width - nonClientWidth);
		int candidateClientHeight = Math.Max(MinimumClientSizeAt96Dpi.Height, rect.Height - nonClientHeight);

		Size targetClientSize;
		if (hasHorizontalEdge && hasVerticalEdge)
		{
			Size byWidth = NormalizeClientFromWidth(candidateClientWidth);
			Size byHeight = NormalizeClientFromHeight(candidateClientHeight);

			int byWidthDistance = Math.Abs(byWidth.Width - candidateClientWidth) + Math.Abs(byWidth.Height - candidateClientHeight);
			int byHeightDistance = Math.Abs(byHeight.Width - candidateClientWidth) + Math.Abs(byHeight.Height - candidateClientHeight);

			targetClientSize = byWidthDistance <= byHeightDistance ? byWidth : byHeight;
		}
		else if (hasHorizontalEdge)
		{
			targetClientSize = NormalizeClientFromWidth(candidateClientWidth);
		}
		else
		{
			targetClientSize = NormalizeClientFromHeight(candidateClientHeight);
		}

		int targetWindowWidth = targetClientSize.Width + nonClientWidth;
		int targetWindowHeight = targetClientSize.Height + nonClientHeight;
		ApplyRectForEdge(ref rect, edge, targetWindowWidth, targetWindowHeight);
	}

	private static Size NormalizeClientFromWidth(int width)
	{
		int normalizedWidth = Math.Max(MinimumClientSizeAt96Dpi.Width, width);
		int normalizedHeight = DivideRound(normalizedWidth * AspectHeight, AspectWidth);
		if (normalizedHeight < MinimumClientSizeAt96Dpi.Height)
		{
			normalizedHeight = MinimumClientSizeAt96Dpi.Height;
			normalizedWidth = DivideRound(normalizedHeight * AspectWidth, AspectHeight);
		}
		return new Size(normalizedWidth, normalizedHeight);
	}

	private static Size NormalizeClientFromHeight(int height)
	{
		int normalizedHeight = Math.Max(MinimumClientSizeAt96Dpi.Height, height);
		int normalizedWidth = DivideRound(normalizedHeight * AspectWidth, AspectHeight);
		if (normalizedWidth < MinimumClientSizeAt96Dpi.Width)
		{
			normalizedWidth = MinimumClientSizeAt96Dpi.Width;
			normalizedHeight = DivideRound(normalizedWidth * AspectHeight, AspectWidth);
		}
		return new Size(normalizedWidth, normalizedHeight);
	}

	private static int DivideRound(int numerator, int denominator)
	{
		return (numerator + (denominator / 2)) / denominator;
	}

	private static int ClampStartupWindowScalePercent(int value)
	{
		return Math.Clamp(value, MinStartupWindowScalePercent, MaxStartupWindowScalePercent);
	}

	private static int ClampUiScalePercent(int value)
	{
		return Math.Clamp(value, MinUiScalePercent, MaxUiScalePercent);
	}

	private static int ClampPage1YellowFrameThicknessTenthsMm(int value)
	{
		return Math.Clamp(value, MinPage1YellowFrameThicknessTenthsMm, MaxPage1YellowFrameThicknessTenthsMm);
	}

	private static int NormalizePage1YellowFrameThicknessTenthsMm(int value)
	{
		if (value <= 0)
		{
			return DefaultPage1YellowFrameThicknessTenthsMm;
		}
		return ClampPage1YellowFrameThicknessTenthsMm(value);
	}

	private static Size BuildClientSizeFromScalePercent(int scalePercent)
	{
		int normalizedPercent = ClampStartupWindowScalePercent(scalePercent);
		int scaledWidth = DivideRound(DesiredClientSizeAt96Dpi.Width * normalizedPercent, 100);
		return NormalizeClientFromWidth(scaledWidth);
	}

	private static AppSettings NormalizeSettings(AppSettings settings)
	{
		return new AppSettings((settings.PrinterName ?? "").Trim(), ClampStartupWindowScalePercent(settings.StartupWindowScalePercent), ClampUiScalePercent(settings.UiScalePercent), NormalizePage1YellowFrameThicknessTenthsMm(settings.Page1YellowFrameThicknessTenthsMm));
	}

	private static AppSettings LoadSettings()
	{
		try
		{
			if (!File.Exists(SettingsFilePath))
			{
				return NormalizeSettings(new AppSettings("", DefaultStartupWindowScalePercent, DefaultUiScalePercent, DefaultPage1YellowFrameThicknessTenthsMm));
			}
			string json = File.ReadAllText(SettingsFilePath);
			AppSettings? loaded = JsonSerializer.Deserialize<AppSettings>(json);
			if (loaded == null)
			{
				return NormalizeSettings(new AppSettings("", DefaultStartupWindowScalePercent, DefaultUiScalePercent, DefaultPage1YellowFrameThicknessTenthsMm));
			}
			return NormalizeSettings(loaded);
		}
		catch
		{
			return NormalizeSettings(new AppSettings("", DefaultStartupWindowScalePercent, DefaultUiScalePercent, DefaultPage1YellowFrameThicknessTenthsMm));
		}
	}

	private static void SaveSettings(AppSettings settings)
	{
		try
		{
			string? directory = Path.GetDirectoryName(SettingsFilePath);
			if (!string.IsNullOrWhiteSpace(directory))
			{
				Directory.CreateDirectory(directory);
			}
			string json = JsonSerializer.Serialize(NormalizeSettings(settings), new JsonSerializerOptions
			{
				WriteIndented = true
			});
			File.WriteAllText(SettingsFilePath, json);
		}
		catch
		{
		}
	}

	private static bool IsHorizontalEdge(int edge)
	{
		return edge == WMSZ_LEFT
			|| edge == WMSZ_RIGHT
			|| edge == WMSZ_TOPLEFT
			|| edge == WMSZ_TOPRIGHT
			|| edge == WMSZ_BOTTOMLEFT
			|| edge == WMSZ_BOTTOMRIGHT;
	}

	private static bool IsVerticalEdge(int edge)
	{
		return edge == WMSZ_TOP
			|| edge == WMSZ_BOTTOM
			|| edge == WMSZ_TOPLEFT
			|| edge == WMSZ_TOPRIGHT
			|| edge == WMSZ_BOTTOMLEFT
			|| edge == WMSZ_BOTTOMRIGHT;
	}

	private static void ApplyRectForEdge(ref WinRect rect, int edge, int width, int height)
	{
		switch (edge)
		{
		case WMSZ_LEFT:
			rect.Left = rect.Right - width;
			rect.Bottom = rect.Top + height;
			break;
		case WMSZ_RIGHT:
			rect.Right = rect.Left + width;
			rect.Bottom = rect.Top + height;
			break;
		case WMSZ_TOP:
			rect.Top = rect.Bottom - height;
			rect.Right = rect.Left + width;
			break;
		case WMSZ_TOPLEFT:
			rect.Left = rect.Right - width;
			rect.Top = rect.Bottom - height;
			break;
		case WMSZ_TOPRIGHT:
			rect.Right = rect.Left + width;
			rect.Top = rect.Bottom - height;
			break;
		case WMSZ_BOTTOM:
			rect.Bottom = rect.Top + height;
			rect.Right = rect.Left + width;
			break;
		case WMSZ_BOTTOMLEFT:
			rect.Left = rect.Right - width;
			rect.Bottom = rect.Top + height;
			break;
		case WMSZ_BOTTOMRIGHT:
			rect.Right = rect.Left + width;
			rect.Bottom = rect.Top + height;
			break;
		default:
			rect.Right = rect.Left + width;
			rect.Bottom = rect.Top + height;
			break;
		}
	}

	private async void OnLoadAsync(object? sender, EventArgs e)
	{
		try
		{
			await _webView.EnsureCoreWebView2Async();
			await _printWebView.EnsureCoreWebView2Async();
			_webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
			_webView.CoreWebView2.Settings.IsZoomControlEnabled = false;
			_webView.CoreWebView2.WebMessageReceived += OnWebMessageReceivedAsync;
			string uiPath = Path.Combine(AppContext.BaseDirectory, "ui", "index.html");
			if (!File.Exists(uiPath))
			{
				MessageBox.Show("UIファイルが見つかりません。\r\nuiフォルダはpublish先に配置される必要があります。", "エラー", MessageBoxButtons.OK, MessageBoxIcon.Hand);
				Close();
			}
			else
			{
				_webView.Source = new Uri(uiPath);
				SetupDevUiHotReload(uiPath);
			}
		}
		catch (Exception ex)
		{
			Exception ex2 = ex;
			MessageBox.Show("WebView2 Runtime が見つかりません。再起動しても解決しない場合は、\r\nWebView2 Runtime をインストールしてください。\r\n\r\n" + ex2.Message, "エラー", MessageBoxButtons.OK, MessageBoxIcon.Hand);
			Close();
		}
	}

	private void SetupDevUiHotReload(string uiPath)
	{
		if (!IsDevMode)
		{
			return;
		}
		string directoryName = Path.GetDirectoryName(uiPath);
		if (string.IsNullOrWhiteSpace(directoryName) || !Directory.Exists(directoryName))
		{
			return;
		}
		_uiReloadTimer = new System.Windows.Forms.Timer
		{
			Interval = 250
		};
		_uiReloadTimer.Tick += delegate
		{
			if (!_pendingUiReload)
			{
				return;
			}
			_pendingUiReload = false;
			_uiReloadTimer?.Stop();
			try
			{
				_webView.Reload();
			}
			catch
			{
			}
		};
		_uiFileWatcher = new FileSystemWatcher(directoryName)
		{
			Filter = "*.*",
			IncludeSubdirectories = true,
			NotifyFilter = (NotifyFilters.FileName | NotifyFilters.Size | NotifyFilters.LastWrite | NotifyFilters.CreationTime)
		};
		_uiFileWatcher.Changed += OnUiFileChanged;
		_uiFileWatcher.Created += OnUiFileChanged;
		_uiFileWatcher.Deleted += OnUiFileChanged;
		_uiFileWatcher.Renamed += OnUiFileRenamed;
		_uiFileWatcher.EnableRaisingEvents = true;
		base.FormClosed += delegate
		{
			_uiFileWatcher?.Dispose();
			_uiFileWatcher = null;
			_uiReloadTimer?.Dispose();
			_uiReloadTimer = null;
		};
	}

	private void OnUiFileChanged(object? sender, FileSystemEventArgs e)
	{
		QueueUiReload(e.FullPath);
	}

	private void OnUiFileRenamed(object? sender, RenamedEventArgs e)
	{
		QueueUiReload(e.FullPath);
	}

	private static bool IsUiLiveReloadTarget(string? fullPath)
	{
		if (string.IsNullOrWhiteSpace(fullPath))
		{
			return false;
		}
		bool result;
		switch (Path.GetExtension(fullPath).ToLowerInvariant())
		{
		case ".html":
		case ".css":
		case ".js":
			result = true;
			break;
		default:
			result = false;
			break;
		}
		return result;
	}

	private void QueueUiReload(string? changedPath)
	{
		if (!IsUiLiveReloadTarget(changedPath))
		{
			return;
		}
		try
		{
			BeginInvoke(delegate
			{
				if (_uiReloadTimer != null)
				{
					_pendingUiReload = true;
					_uiReloadTimer.Stop();
					_uiReloadTimer.Start();
				}
			});
		}
		catch
		{
		}
	}

	private async void OnWebMessageReceivedAsync(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
	{
		try
		{
			using JsonDocument json = JsonDocument.Parse(e.WebMessageAsJson);
			JsonElement payload = json.RootElement.Clone();
			switch (ReadString(payload, "cmd"))
			{
			case "ready":
				PushState();
				break;
			case "saveSettings":
				HandleSaveSettings(payload);
				break;
			case "preview":
				await HandlePreviewAsync(payload);
				break;
			case "print":
				await HandlePrintAsync(payload);
				break;
			}
		}
		catch (Exception ex)
		{
			Exception ex2 = ex;
			ShowErrorToUi(ex2);
		}
	}

	private void PushState()
	{
		string defaultPrinter = GetDefaultPrinterName();
		Post(new
		{
			cmd = "state",
			printers = GetInstalledPrinters(),
			defaultPrinter = defaultPrinter,
			preferredPrinter = _settings.PrinterName,
			settings = new
			{
				startupWindowScalePercent = _settings.StartupWindowScalePercent,
				startupWindowScaleMin = MinStartupWindowScalePercent,
				startupWindowScaleMax = MaxStartupWindowScalePercent,
				uiScalePercent = _settings.UiScalePercent,
				uiScaleMin = MinUiScalePercent,
				uiScaleMax = MaxUiScalePercent,
				page1YellowFrameThicknessTenthsMm = _settings.Page1YellowFrameThicknessTenthsMm,
				page1YellowFrameThicknessMinTenthsMm = MinPage1YellowFrameThicknessTenthsMm,
				page1YellowFrameThicknessMaxTenthsMm = MaxPage1YellowFrameThicknessTenthsMm
			},
			devMode = IsDevMode
		});
		if (_clearAllPending)
		{
			_clearAllPending = false;
			Post(new
			{
				cmd = "clearAll"
			});
		}
	}

	private void HandleSaveSettings(JsonElement msg)
	{
		string printerName = ReadString(msg, "printerName").Trim();
		int startupWindowScalePercent = ClampStartupWindowScalePercent(ReadInt(msg, "startupWindowScalePercent", _settings.StartupWindowScalePercent));
		int uiScalePercent = ClampUiScalePercent(ReadInt(msg, "uiScalePercent", _settings.UiScalePercent));
		int page1YellowFrameThicknessTenthsMm = ClampPage1YellowFrameThicknessTenthsMm(ReadInt(msg, "page1YellowFrameThicknessTenthsMm", _settings.Page1YellowFrameThicknessTenthsMm));
		AppSettings nextSettings = new AppSettings(printerName, startupWindowScalePercent, uiScalePercent, page1YellowFrameThicknessTenthsMm);
		bool startupScaleChanged = nextSettings.StartupWindowScalePercent != _settings.StartupWindowScalePercent;
		_settings = nextSettings;
		SaveSettings(_settings);
		if (startupScaleChanged && base.WindowState == FormWindowState.Normal)
		{
			base.ClientSize = BuildClientSizeFromScalePercent(_settings.StartupWindowScalePercent);
		}
	}

	private async Task HandlePreviewAsync(JsonElement msg)
	{
		FormInput input = BuildInput(msg);
		PrintHtmlBuilder.RenderModel model = BuildRenderModel(input, DateTime.Today, _settings.Page1YellowFrameThicknessTenthsMm);
		string html = PrintHtmlBuilder.BuildDocument(model);
		Post(new
		{
			cmd = "showPreview",
			html = html
		});
		await Task.CompletedTask;
	}

	private async Task HandlePrintAsync(JsonElement msg)
	{
		FormInput input = BuildInput(msg);
		string validationError = ValidateForPrint(input);
		if (!string.IsNullOrWhiteSpace(validationError))
		{
			Post(new
			{
				cmd = "error",
				message = validationError
			});
			return;
		}
		PrintHtmlBuilder.RenderModel model = BuildRenderModel(input, DateTime.Today, _settings.Page1YellowFrameThicknessTenthsMm);
		string html = PrintHtmlBuilder.BuildDocument(model);
		try
		{
			base.UseWaitCursor = true;
			base.Enabled = false;
			CoreWebView2PrintStatus status = await PrintHtmlAsync(html, input.PrinterName);
			if (status == CoreWebView2PrintStatus.Succeeded)
			{
				Post(new
				{
					cmd = "toast",
					message = "印刷しました！"
				});
				return;
			}
			if (1 == 0)
			{
			}
			string text = ((status != CoreWebView2PrintStatus.PrinterUnavailable) ? "印刷に失敗しました。" : "既定のプリンタが利用できません。");
			if (1 == 0)
			{
			}
			string detail = text;
			Post(new
			{
				cmd = "error",
				message = detail
			});
		}
		catch (Exception ex)
		{
			Exception ex2 = ex;
			ShowErrorToUi(ex2);
		}
		finally
		{
			base.Enabled = true;
			base.UseWaitCursor = false;
		}
	}

	private async Task<CoreWebView2PrintStatus> PrintHtmlAsync(string html, string preferredPrinterName)
	{
		if (_printWebView.CoreWebView2 == null)
		{
			throw new InvalidOperationException("印刷エンジンが初期化されていません。");
		}
		TaskCompletionSource<bool> tcs = new TaskCompletionSource<bool>();
		_printWebView.CoreWebView2.NavigationCompleted += OnCompleted;
		_printWebView.CoreWebView2.NavigateToString(html);
		if (!(await tcs.Task.ConfigureAwait(continueOnCapturedContext: true)))
		{
			throw new InvalidOperationException("印刷用レイアウトの読み込みに失敗しました。");
		}
		await Task.Delay(120).ConfigureAwait(continueOnCapturedContext: true);
		CoreWebView2PrintSettings settings = _printWebView.CoreWebView2.Environment.CreatePrintSettings();
		settings.ShouldPrintBackgrounds = true;
		settings.ShouldPrintHeaderAndFooter = false;
		settings.Orientation = CoreWebView2PrintOrientation.Portrait;
		settings.MediaSize = CoreWebView2PrintMediaSize.Custom;
		settings.PageWidth = 8.27;
		settings.PageHeight = 11.69;
		settings.MarginTop = 0.0;
		settings.MarginBottom = 0.0;
		settings.MarginLeft = 0.0;
		settings.MarginRight = 0.0;
		settings.PrinterName = ResolvePrinterName(preferredPrinterName);
		return await _printWebView.CoreWebView2.PrintAsync(settings).ConfigureAwait(continueOnCapturedContext: true);
		void OnCompleted(object? _, CoreWebView2NavigationCompletedEventArgs args)
		{
			_printWebView.CoreWebView2.NavigationCompleted -= OnCompleted;
			tcs.TrySetResult(args.IsSuccess);
		}
	}

	private static string ValidateForPrint(FormInput input)
	{
		if (string.IsNullOrWhiteSpace(input.Patient))
		{
			return "患者氏名を入力してください。";
		}
		if (input.Drugs.Count == 0)
		{
			return "不足薬品を1件以上入力してください。";
		}
		for (int i = 0; i < input.Drugs.Count; i++)
		{
			string text = ValidateDrugForPrint(input.Drugs[i], i);
			if (!string.IsNullOrWhiteSpace(text))
			{
				return text;
			}
		}
		return "";
	}

	private static string ValidateDrugForPrint(DrugInput drug, int index)
	{
		string text = $"不足薬品{index + 1}";
		if (string.IsNullOrWhiteSpace(drug.Drug))
		{
			return text + "の薬品名を入力してください。";
		}
		if (string.IsNullOrWhiteSpace(drug.ShortageCount))
		{
			return text + "のお渡し数を入力してください。";
		}
		if (string.IsNullOrWhiteSpace(drug.ShortageDays))
		{
			return text + "の全体数を入力してください。";
		}
		if (!TryParseCount(drug.ShortageCount, out var parsed))
		{
			return text + "のお渡し数は0以上の整数で入力してください。";
		}
		if (!TryParseCount(drug.ShortageDays, out var parsed2))
		{
			return text + "の全体数は0以上の整数で入力してください。";
		}
		if (parsed > parsed2)
		{
			return text + "のお渡し数は全体数以下で入力してください。";
		}
		if (string.Equals(drug.ShortageUnit, "その他", StringComparison.Ordinal) && string.IsNullOrWhiteSpace(drug.ShortageUnitOther))
		{
			return text + "の単位（その他の時）を入力してください。";
		}
		return "";
	}

	private static FormInput BuildInput(JsonElement msg)
	{
		List<DrugInput> list = new List<DrugInput>();
		if (msg.TryGetProperty("drugs", out var value) && value.ValueKind == JsonValueKind.Array)
		{
			foreach (JsonElement item in value.EnumerateArray())
			{
				if (item.ValueKind == JsonValueKind.Object)
				{
					list.Add(BuildDrugInput(item));
				}
			}
		}
		if (list.Count == 0)
		{
			list.Add(new DrugInput(ReadString(msg, "drug").Trim(), ReadString(msg, "drugType").Trim(), ReadString(msg, "drugUsage").Trim(), ReadString(msg, "shortageCount").Trim(), ReadString(msg, "shortageDays").Trim(), ReadString(msg, "shortageUnit").Trim(), ReadString(msg, "shortageUnitOther").Trim(), ReadString(msg, "arrive").Trim(), ReadString(msg, "arriveOtherText").Trim(), ReadString(msg, "dest").Trim(), ReadString(msg, "destSmallText").Trim(), ReadString(msg, "destOtherText").Trim(), ReadString(msg, "notes").Trim()));
		}
		return new FormInput(ReadString(msg, "patient").Trim(), ReadString(msg, "printerName").Trim(), list);
	}

	private static DrugInput BuildDrugInput(JsonElement drugElement)
	{
		return new DrugInput(ReadString(drugElement, "drug").Trim(), ReadString(drugElement, "drugType").Trim(), ReadString(drugElement, "drugUsage").Trim(), ReadString(drugElement, "shortageCount").Trim(), ReadString(drugElement, "shortageDays").Trim(), ReadString(drugElement, "shortageUnit").Trim(), ReadString(drugElement, "shortageUnitOther").Trim(), ReadString(drugElement, "arrive").Trim(), ReadString(drugElement, "arriveOtherText").Trim(), ReadString(drugElement, "dest").Trim(), ReadString(drugElement, "destSmallText").Trim(), ReadString(drugElement, "destOtherText").Trim(), ReadString(drugElement, "notes").Trim());
	}

	private static string ReadString(JsonElement element, string key)
	{
		if (!element.TryGetProperty(key, out var value))
		{
			return "";
		}
		JsonValueKind valueKind = value.ValueKind;
		if (1 == 0)
		{
		}
		string result = valueKind switch
		{
			JsonValueKind.String => value.GetString() ?? "", 
			JsonValueKind.Null => "", 
			JsonValueKind.Undefined => "", 
			_ => value.ToString() ?? "", 
		};
		if (1 == 0)
		{
		}
		return result;
	}

	private static int ReadInt(JsonElement element, string key, int fallback)
	{
		if (!element.TryGetProperty(key, out var value))
		{
			return fallback;
		}
		if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var parsed))
		{
			return parsed;
		}
		if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out parsed))
		{
			return parsed;
		}
		return fallback;
	}

	private static PrintHtmlBuilder.RenderModel BuildRenderModel(FormInput input, DateTime today, int page1YellowFrameThicknessTenthsMm)
	{
		string reiwaDate = FormatReiwaDate(today);
		List<PrintHtmlBuilder.DrugRenderItem> list = new List<PrintHtmlBuilder.DrugRenderItem>();
		for (int i = 0; i < input.Drugs.Count; i++)
		{
			DrugInput drugInput = input.Drugs[i];
			string text = BuildDrugDisplay(drugInput.Drug, drugInput.DrugType, drugInput.DrugUsage);
			string unit = BuildUnitLabel(drugInput.ShortageUnit, drugInput.ShortageUnitOther);
			string count = BuildCalculatedShortageCount(drugInput.ShortageCount, drugInput.ShortageDays);
			string shortageText = BuildCountWithUnit(count, unit);
			string handoverText = BuildCountWithUnit(drugInput.ShortageCount, unit);
			string shortageLine = BuildShortageWithHandover(shortageText, handoverText);
			string arrivalLine = BuildArrivalDisplay(drugInput.Arrive, drugInput.ArriveOtherText, today);
			string destinationLine = BuildDestinationDisplay(drugInput.Dest, drugInput.DestSmallText, drugInput.DestOtherText);
			string detailLine = BuildShortageDetail(text, shortageText);
			string shortageReasonDrugName = (drugInput.Drug ?? "").Trim();
			bool showShortageReasonLine = string.Equals(drugInput.DrugType, "pack", StringComparison.Ordinal)
				|| string.Equals(drugInput.DrugType, "powder", StringComparison.Ordinal)
				|| string.Equals(drugInput.DrugType, "mixedOintment", StringComparison.Ordinal)
				|| string.Equals(drugInput.DrugType, "mixedSyrup", StringComparison.Ordinal);
			list.Add(new PrintHtmlBuilder.DrugRenderItem($"不足薬品{i + 1}", text, shortageLine, arrivalLine, destinationLine, drugInput.Notes, detailLine, shortageReasonDrugName, showShortageReasonLine));
		}
		return new PrintHtmlBuilder.RenderModel(input.Patient, list, reiwaDate, page1YellowFrameThicknessTenthsMm);
	}

	private static string BuildDrugDisplay(string drug, string drugType, string drugUsage)
	{
		string text = drug?.Trim() ?? "";
		if (1 == 0)
		{
		}
		string text2 = drugType switch
		{
			"pack" => "一包化", 
			"powder" => "粉薬", 
			"mixedOintment" => "混合軟膏", 
			"mixedSyrup" => "混合シロップ", 
			_ => "", 
		};
		if (1 == 0)
		{
		}
		string text3 = text2;
		if (!string.IsNullOrEmpty(text3))
		{
			if ((string.Equals(drugType, "pack", StringComparison.Ordinal) || string.Equals(drugType, "powder", StringComparison.Ordinal)) && !string.IsNullOrWhiteSpace(drugUsage))
			{
				return text3 + "（" + drugUsage.Trim() + "）";
			}
			return text3;
		}
		if (!string.IsNullOrWhiteSpace(text))
		{
			return text;
		}
		return "不足薬品";
	}

	private static bool TryParseCount(string value, out int parsed)
	{
		if (int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed) && parsed >= 0)
		{
			return true;
		}
		parsed = 0;
		return false;
	}

	private static string BuildCalculatedShortageCount(string handoverCountText, string totalCountText)
	{
		if (!TryParseCount(handoverCountText, out var parsed))
		{
			return "";
		}
		if (!TryParseCount(totalCountText, out var parsed2))
		{
			return "";
		}
		return (parsed2 - parsed).ToString(CultureInfo.InvariantCulture);
	}

	private static string BuildUnitLabel(string unit, string unitOther)
	{
		string text = unit;
		if (string.IsNullOrWhiteSpace(text))
		{
			text = "日分";
		}
		if (string.Equals(text, "その他", StringComparison.Ordinal))
		{
			text = unitOther;
		}
		return text.Trim();
	}

	private static string BuildCountWithUnit(string count, string unit)
	{
		if (string.IsNullOrWhiteSpace(count) || string.IsNullOrWhiteSpace(unit))
		{
			return "";
		}
		return count + unit;
	}

	private static string BuildShortageWithHandover(string shortageText, string handoverText)
	{
		string text = shortageText?.Trim() ?? "";
		string text2 = handoverText?.Trim() ?? "";
		if (string.IsNullOrWhiteSpace(text) && string.IsNullOrWhiteSpace(text2))
		{
			return "";
		}
		if (string.IsNullOrWhiteSpace(text))
		{
			return "(" + text2 + "お渡し済)";
		}
		if (string.IsNullOrWhiteSpace(text2))
		{
			return text;
		}
		return text + "\n(" + text2 + "お渡し済)";
	}

	private static string BuildShortageDetail(string drug, string shortageText)
	{
		if (string.IsNullOrWhiteSpace(drug) && string.IsNullOrWhiteSpace(shortageText))
		{
			return "";
		}
		if (string.IsNullOrWhiteSpace(drug))
		{
			return shortageText;
		}
		if (string.IsNullOrWhiteSpace(shortageText))
		{
			return drug;
		}
		return drug + "\u3000" + shortageText;
	}

	private static string BuildArrivalDisplay(string arrive, string arriveOtherText, DateTime today)
	{
		if (1 == 0)
		{
		}
		string result = arrive switch
		{
			"arriveUndecided" => "", 
			"arriveTodayPm" => "本日PM", 
			"arriveTomorrowAm" => BuildNextArrivalAmText(today), 
			"arriveOther" => arriveOtherText, 
			_ => "", 
		};
		if (1 == 0)
		{
		}
		return result;
	}

	private static string BuildDestinationDisplay(string dest, string destSmallText, string destOtherText)
	{
		if (1 == 0)
		{
		}
		string result = dest switch
		{
			"destUnknown" => "", 
			"destMediceo" => "メディセオ", 
			"destSuzuken" => "スズケン", 
			"destVital" => "バイタル", 
			"destAlfresa" => "アルフレッサ", 
			"destSmall" => string.IsNullOrWhiteSpace(destSmallText) ? "小分け" : ("小分け（" + destSmallText + "）"), 
			"destOther" => string.IsNullOrWhiteSpace(destOtherText) ? "その他" : destOtherText, 
			_ => "", 
		};
		if (1 == 0)
		{
		}
		return result;
	}

	private static string BuildNextArrivalAmText(DateTime today)
	{
		DayOfWeek dayOfWeek = today.DayOfWeek;
		if (1 == 0)
		{
		}
		DateTime dateTime = dayOfWeek switch
		{
			DayOfWeek.Friday => today.AddDays(3.0), 
			DayOfWeek.Saturday => today.AddDays(2.0), 
			_ => today.AddDays(1.0), 
		};
		if (1 == 0)
		{
		}
		DateTime dateTime2 = dateTime;
		string[] array = new string[7] { "日", "月", "火", "水", "木", "金", "土" };
		return $"{dateTime2.Month}月{dateTime2.Day}日({array[(int)dateTime2.DayOfWeek]})";
	}

	private static string FormatReiwaDate(DateTime date)
	{
		string[] array = new string[7] { "日", "月", "火", "水", "木", "金", "土" };
		string text = array[(int)date.DayOfWeek];
		DateTime dateTime = new DateTime(2019, 5, 1);
		if (date >= dateTime)
		{
			int value = date.Year - 2018;
			return $"令和{value}年{date.Month}月{date.Day}日({text})";
		}
		return $"{date.ToString("yyyy年M月d日", CultureInfo.InvariantCulture)}({text})";
	}

	private static string GetDefaultPrinterName()
	{
		try
		{
			PrinterSettings printerSettings = new PrinterSettings();
			return printerSettings.PrinterName ?? "";
		}
		catch
		{
			return "";
		}
	}

	private static IReadOnlyList<string> GetInstalledPrinters()
	{
		try
		{
			List<string> list = new List<string>();
			foreach (string installedPrinter in PrinterSettings.InstalledPrinters)
			{
				string name = (installedPrinter ?? "").Trim();
				if (name.Length != 0 && !list.Any((string existing) => string.Equals(existing, name, StringComparison.OrdinalIgnoreCase)))
				{
					list.Add(name);
				}
			}
			return list;
		}
		catch
		{
			return Array.Empty<string>();
		}
	}

	private static string ResolvePrinterName(string preferredPrinterName)
	{
		string text = (preferredPrinterName ?? "").Trim();
		if (text.Length == 0)
		{
			return GetDefaultPrinterName();
		}
		foreach (string installedPrinter in GetInstalledPrinters())
		{
			if (string.Equals(installedPrinter, text, StringComparison.OrdinalIgnoreCase))
			{
				return installedPrinter;
			}
		}
		return GetDefaultPrinterName();
	}

		internal void ActivateAndClearFromSecondLaunch()
	{
		if (IsDisposed)
		{
			return;
		}
		if (WindowState == FormWindowState.Minimized)
		{
			WindowState = FormWindowState.Normal;
		}
		Show();
		BringToFront();
		Activate();
		TopMost = true;
		TopMost = false;
		if (_webView.CoreWebView2 == null)
		{
			_clearAllPending = true;
			return;
		}
		Post(new
		{
			cmd = "clearAll"
		});
	}
private void ShowErrorToUi(Exception ex)
	{
		string message = BuildExceptionMessage(ex);
		Post(new
		{
			cmd = "error",
			message = message
		});
	}

	private void Post(object obj)
	{
		try
		{
			if (_webView.CoreWebView2 != null)
			{
				_webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(obj));
			}
		}
		catch
		{
		}
	}

	private static string BuildExceptionMessage(Exception ex)
	{
		List<string> list = new List<string>();
		for (Exception ex2 = ex; ex2 != null; ex2 = ex2.InnerException)
		{
			string text = ((ex2.HResult != 0) ? $" (HResult: 0x{ex2.HResult:X8})" : "");
			list.Add(ex2.Message + text);
		}
		return string.Join("\r\n", list);
	}
}

