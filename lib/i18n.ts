// Russian interface labels. Safe for server and client components.

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

export const labels: Dict = {
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
  noOutagesTomorrow: "нет данных",
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
