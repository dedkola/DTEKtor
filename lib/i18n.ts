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
  historyTitle: string;
  hoursShort: string;
  addressLabel: string;
  changeAddress: string;
  setupTitle: string;
  setupIntro: string;
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
  footer: string;
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
  historyTitle: "Last 7 days",
  hoursShort: "h",
  addressLabel: "Address",
  changeAddress: "Change address",
  setupTitle: "Where do you live?",
  setupIntro:
    "Enter your street and building once. DTEKtor will show only your address from then on.",
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
  footer: "Data is collected from DTEK's public outage schedule.",
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
  historyTitle: "Последние 7 дней",
  hoursShort: "ч",
  addressLabel: "Адрес",
  changeAddress: "Изменить адрес",
  setupTitle: "Где вы живёте?",
  setupIntro:
    "Укажите улицу и дом один раз. DTEKtor будет показывать только ваш адрес.",
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
  footer: "Данные собираются из публичного графика отключений ДТЕК.",
};

const DICTS: Record<Lang, Dict> = { en, ru };

export function normalizeLang(value: string | null | undefined): Lang {
  return value === "ru" ? "ru" : "en";
}

export function t(lang: Lang): Dict {
  return DICTS[lang] ?? DICTS.en;
}

export const LANGS: Lang[] = ["en", "ru"];
