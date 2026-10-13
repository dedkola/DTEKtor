// Tiny i18n dictionary. English + Russian only.
// Safe to import from both server and client components (no server-only deps).

export type Lang = "en" | "ru";

export type Dict = {
  tagline: string;
  todayTitle: string;
  tomorrowTitle: string;
  noOutages: string;
  possibleOutages: string;
  updatedLabel: string;
  checkedLabel: string;
  graphLabel: string;
  hoursShort: string;
  addressLabel: string;
  refresh: string;
  waitingTitle: string;
  waitingIntro: string;
  streetLabel: string;
  buildingLabel: string;
  labelLabel: string;
  labelPlaceholder: string;
  save: string;
  saving: string;
  saved: string;
  currentAddress: string;
  notSet: string;
  settingsTitle: string;
  settingsNote: string;
  backToDashboard: string;
  noData: string;
  errorRequired: string;
  errorGeneric: string;
  windowLabel: string;
  cardTitle: string;
  network: string;
  todayShort: string;
  tomorrowShort: string;
  noOutagesToday: string;
  noOutagesTomorrow: string;
  upToDate: string;
  checkedPrefix: string;
  dtekDataPrefix: string;
  graphPrefix: string;
  bookmarkNote: string;
  graphPanelTitle: string;
  footer: string;
  screenshotTitle: string;
  screenshotHint: string;
  screenshotClickHint: string;
};

const en: Dict = {
  tagline: "DTEK outage tracker",
  todayTitle: "Today (remaining)",
  tomorrowTitle: "Tomorrow",
  noOutages: "No outages planned",
  possibleOutages: "Possible outages",
  updatedLabel: "DTEK updated",
  checkedLabel: "Last checked",
  graphLabel: "Graph updated",
  hoursShort: "h",
  addressLabel: "Address",
  refresh: "Refresh",
  waitingTitle: "Waiting for data",
  waitingIntro:
    "No address has been recorded yet. The collector fills this automatically every few minutes.",
  streetLabel: "Street",
  buildingLabel: "Building",
  labelLabel: "Label (optional)",
  labelPlaceholder: "e.g. Home",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  currentAddress: "Current address",
  notSet: "Not set",
  settingsTitle: "Settings",
  settingsNote:
    "Your address is matched against DTEK's outage list by the checker.",
  backToDashboard: "Back to dashboard",
  noData: "No data yet",
  errorRequired: "Please enter both street and building.",
  errorGeneric: "Something went wrong. Please try again.",
  windowLabel: "window",
  cardTitle: "Power outage schedule",
  network: "DTEK Kyiv Electric Networks",
  todayShort: "TODAY",
  tomorrowShort: "TOMORROW",
  noOutagesToday: "no outages today",
  noOutagesTomorrow: "no outages tomorrow",
  upToDate: "UP TO DATE",
  checkedPrefix: "Checked:",
  dtekDataPrefix: "DTEK data",
  graphPrefix: "graph",
  bookmarkNote: "Bookmark this page — your address is already set.",
  graphPanelTitle: "DTEK GRAPH",
  footer: "Data is collected from DTEK's public outage schedule.",
  screenshotTitle: "Latest DTEK graph",
  screenshotHint: "Captured by the collector on its most recent check.",
  screenshotClickHint: "Click to enlarge",
};

const ru: Dict = {
  tagline: "Трекер отключений ДТЕК",
  todayTitle: "Сегодня (осталось)",
  tomorrowTitle: "Завтра",
  noOutages: "Отключений не запланировано",
  possibleOutages: "Возможны отключения",
  updatedLabel: "Обновлено в ДТЕК",
  checkedLabel: "Проверено",
  graphLabel: "Обновлён график",
  hoursShort: "ч",
  addressLabel: "Адрес",
  refresh: "Обновить",
  waitingTitle: "Ожидание данных",
  waitingIntro:
    "Адрес ещё не записан. Сборщик заполнит его автоматически в течение нескольких минут.",
  streetLabel: "Улица",
  buildingLabel: "Дом",
  labelLabel: "Название (необязательно)",
  labelPlaceholder: "напр. Дом",
  save: "Сохранить",
  saving: "Сохранение…",
  saved: "Сохранено",
  currentAddress: "Текущий адрес",
  notSet: "Не указан",
  settingsTitle: "Настройки",
  settingsNote:
    "Ваш адрес сопоставляется со списком отключений ДТЕК во время проверки.",
  backToDashboard: "Вернуться на главную",
  noData: "Пока нет данных",
  errorRequired: "Укажите улицу и дом.",
  errorGeneric: "Что-то пошло не так. Попробуйте ещё раз.",
  windowLabel: "интервал",
  cardTitle: "График отключений",
  network: "ДТЕК Киевские электрoсети",
  todayShort: "СЕГОДНЯ",
  tomorrowShort: "ЗАВТРА",
  noOutagesToday: "сегодня отключений нет",
  noOutagesTomorrow: "завтра отключений нет",
  upToDate: "АКТУАЛЬНО",
  checkedPrefix: "Проверено:",
  dtekDataPrefix: "Данные ДТЕК",
  graphPrefix: "график",
  bookmarkNote: "Добавьте страницу в закладки — адрес уже указан.",
  graphPanelTitle: "ГРАФИК ДТЕК",
  footer: "Данные собираются из публичного графика отключений ДТЕК.",
  screenshotTitle: "Последний график ДТЕК",
  screenshotHint: "Снимок сделан сборщиком во время последней проверки.",
  screenshotClickHint: "Нажмите, чтобы увеличить",
};

const DICTS: Record<Lang, Dict> = { en, ru };

export function normalizeLang(value: string | null | undefined): Lang {
  return value === "ru" ? "ru" : "en";
}

export function t(lang: Lang): Dict {
  return DICTS[lang] ?? DICTS.en;
}

export const LANGS: Lang[] = ["en", "ru"];
