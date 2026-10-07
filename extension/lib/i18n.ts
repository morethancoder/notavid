import { browser } from "wxt/browser";

const en = {
  appName: "Notavid",
  notes: "Notes",
  lyrics: "Lyrics",
  history: "History",
  autoPauseOn: "Auto-pause on",
  autoPauseOff: "Auto-pause off",
  autoPauseOnHint: "The video pauses while you type and resumes when you stop",
  pausedWriting: "Paused while you write",
  resumingIn: "resuming in {n}s",
  toggleAutoPause: "Pause video while typing",
  insertTimestamp: "Insert current video time (Alt+T)",
  placeholder: "Start taking notes — the video pauses while you type…",
  word: "{n} word",
  words: "{n} words",
  download: "Download .md",
  copy: "Copy markdown",
  copied: "Copied",
  delete: "Delete note",
  deleteConfirm: "Sure?",
  deleteConfirmHint: "Click again to delete",
  search: "Search notes",
  emptyHistory: "No notes yet. Open a video and start typing.",
  noMatches: "No notes match your search.",
  current: "This video",
  settings: "Settings",
  close: "Close",
  collapse: "Hide notes",
  expand: "Show notes",
  language: "Language",
  langSystem: "Use browser language",
  langEnglish: "English",
  langArabic: "العربية",
  playback: "Playback",
  ignoreWhitespace: "Don't pause on spaces or blank lines",
  resumeDelay: "Resume after",
  seconds: "{n}s",

  // editor right-click menu
  bold: "Bold",
  italic: "Italic",
  strikethrough: "Strikethrough",
  inlineCode: "Code",
  link: "Link",
  image: "Image",
  heading: "Heading",
  bulletList: "Bulleted list",
  quote: "Quote",
  timestamp: "Timestamp",
  browserMenuHint: "Shift + right-click for the browser menu",
  imageUpload: "Upload image",
  imageLinkPlaceholder: "or paste an image link",
  imageCaptionPlaceholder: "Add a caption",
  linkPlaceholder: "Paste a link…",
  confirm: "Confirm",
  uploading: "Adding image…",

  // transcript
  transcript: "Transcript",
  transcriptLoading: "Loading the transcript…",
  transcriptNone: "This video has no transcript. Try Lyrics for songs.",
  transcriptError: "YouTube didn't load the transcript.",
  transcriptAuto: "Auto-generated",
  transcriptFilter: "Search transcript",
  transcriptSource: "From YouTube",
  lines: "{n} lines",

  // lyrics
  lyricsLoading: "Looking for lyrics…",
  lyricsNotFound: "No lyrics found for this video.",
  lyricsError: "Couldn't reach the lyrics service. Check your connection and try again.",
  lyricsInstrumental: "This track is instrumental.",
  lyricsSearch: "Search song or artist",
  lyricsSearchAction: "Search",
  lyricsWrongSong: "Wrong song? Search",
  lyricsNoResults: "Nothing matched that search.",
  lyricsSynced: "Synced",
  lyricsPlain: "Not synced",
  lyricsOffset: "Shift lyrics timing",
  lyricsEarlier: "Show lyrics earlier",
  lyricsLater: "Show lyrics later",
  lyricsAddToNote: "Add line to note",
  lyricsSource: "Lyrics from LRCLIB",
  retry: "Try again",
};

const ar: typeof en = {
  appName: "Notavid",
  notes: "الملاحظات",
  lyrics: "الكلمات",
  history: "السجل",
  autoPauseOn: "الإيقاف التلقائي مفعّل",
  autoPauseOff: "الإيقاف التلقائي متوقف",
  autoPauseOnHint: "يتوقف الفيديو مؤقتًا أثناء الكتابة ويُستأنف عند التوقف",
  pausedWriting: "متوقف أثناء الكتابة",
  resumingIn: "سيُستأنف خلال {n} ث",
  toggleAutoPause: "إيقاف الفيديو مؤقتًا أثناء الكتابة",
  insertTimestamp: "إدراج توقيت الفيديو الحالي (Alt+T)",
  placeholder: "ابدأ بتدوين الملاحظات — يتوقف الفيديو مؤقتًا أثناء الكتابة…",
  word: "{n} كلمة",
  words: "{n} كلمة",
  download: "تنزيل ‎.md",
  copy: "نسخ Markdown",
  copied: "تم النسخ",
  delete: "حذف الملاحظة",
  deleteConfirm: "متأكد؟",
  deleteConfirmHint: "انقر مرة أخرى للحذف",
  search: "البحث في الملاحظات",
  emptyHistory: "لا توجد ملاحظات بعد. افتح فيديو وابدأ الكتابة.",
  noMatches: "لا توجد ملاحظات مطابقة.",
  current: "هذا الفيديو",
  settings: "الإعدادات",
  close: "إغلاق",
  collapse: "إخفاء الملاحظات",
  expand: "إظهار الملاحظات",
  language: "اللغة",
  langSystem: "لغة المتصفح",
  langEnglish: "English",
  langArabic: "العربية",
  playback: "التشغيل",
  ignoreWhitespace: "عدم الإيقاف عند المسافات أو الأسطر الفارغة",
  resumeDelay: "الاستئناف بعد",
  seconds: "{n} ث",

  bold: "غامق",
  italic: "مائل",
  strikethrough: "يتوسطه خط",
  inlineCode: "رمز برمجي",
  link: "رابط",
  image: "صورة",
  heading: "عنوان",
  bulletList: "قائمة نقطية",
  quote: "اقتباس",
  timestamp: "توقيت",
  browserMenuHint: "Shift + نقر أيمن لقائمة المتصفح",
  imageUpload: "رفع صورة",
  imageLinkPlaceholder: "أو الصق رابط صورة",
  imageCaptionPlaceholder: "أضف تعليقًا",
  linkPlaceholder: "الصق رابطًا…",
  confirm: "تأكيد",
  uploading: "جارٍ إضافة الصورة…",

  transcript: "النص",
  transcriptLoading: "جارٍ تحميل النص…",
  transcriptNone: "لا يوجد نص لهذا الفيديو. جرّب الكلمات للأغاني.",
  transcriptError: "لم يحمّل YouTube النص.",
  transcriptAuto: "منشأ تلقائيًا",
  transcriptFilter: "البحث في النص",
  transcriptSource: "من YouTube",
  lines: "{n} سطر",

  lyricsLoading: "جارٍ البحث عن الكلمات…",
  lyricsNotFound: "لم يتم العثور على كلمات لهذا الفيديو.",
  lyricsError: "تعذّر الوصول إلى خدمة الكلمات. تحقق من الاتصال وحاول مجددًا.",
  lyricsInstrumental: "هذا المقطع موسيقي بلا كلمات.",
  lyricsSearch: "ابحث عن أغنية أو فنان",
  lyricsSearchAction: "بحث",
  lyricsWrongSong: "أغنية خاطئة؟ ابحث",
  lyricsNoResults: "لا توجد نتائج مطابقة.",
  lyricsSynced: "متزامنة",
  lyricsPlain: "غير متزامنة",
  lyricsOffset: "تعديل توقيت الكلمات",
  lyricsEarlier: "إظهار الكلمات أبكر",
  lyricsLater: "إظهار الكلمات لاحقًا",
  lyricsAddToNote: "إضافة السطر إلى الملاحظة",
  lyricsSource: "الكلمات من LRCLIB",
  retry: "حاول مجددًا",
};

export type MessageKey = keyof typeof en;
export type Locale = "en" | "ar";
export type LanguageSetting = "system" | Locale;

/**
 * The browser's language — the same one Chrome uses for the extension's own
 * name in _locales — so the panel, the popup and chrome://extensions agree.
 */
export function browserLocale(): Locale {
  let lang = "";
  try {
    lang = browser.i18n.getUILanguage();
  } catch {
    // i18n isn't available in every context; fall back to the page's view of it.
  }
  lang ||= navigator.languages?.[0] || navigator.language || "en";
  return lang.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function resolveLocale(setting: LanguageSetting): Locale {
  return setting === "system" ? browserLocale() : setting;
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  let text = (locale === "ar" ? ar : en)[key];
  for (const [k, v] of Object.entries(vars ?? {})) text = text.replace(`{${k}}`, String(v));
  return text;
}

export function relativeTime(locale: Locale, iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(0, "second"); // "now"
}
