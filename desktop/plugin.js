import { host, useValue, useQuery, queryClient, atom, Button, Checkbox, Popover, PopoverTrigger, PopoverContent, usePluginI18n } from '@hermes/plugin-sdk';
import { useRef, useEffect, useState } from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';

const ID = 'limits-monitor';
const PANE = `${ID}:pane`;
const always = atom(true);
const disconnected = atom('');
const barMounted = atom(0);
const clock = atom(Date.now());
const preferences = atom({ hidden: [], statusBarDisplay: 'percent' });
const storageError = atom(false);
let preferenceStorage;
let recoveryRest;
const text = value => typeof value === 'string' ? value : '';
const list = value => Array.isArray(value) ? value : [];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const subtle = { color: 'var(--ui-text-tertiary)', fontSize: 11, lineHeight: 1.5 };
const block = { border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8, padding: 10, marginTop: 10 };
const warning = 'var(--ui-warning, var(--ui-accent))';
const labels = { Session: 'Session limit', Weekly: 'Weekly limit', 'API key quota': 'API key quota', day: 'Day', week: 'Week', month: 'Month', top_tier: 'Top-tier models' };
const flatLocales = {
  en: {
    'pane.title': 'Limits', 'pane.heading': 'Account allowances',
    'action.refresh': 'Refresh', 'action.loading': 'Loading…', 'connection.offline': 'Hermes is disconnected. Data may be stale.',
    'status.reading': 'Reading provider data…', 'status.waiting': 'Waiting for Hermes connection…',
    'error.refresh': 'Could not refresh data. Previous values are unverified.', 'error.routes': 'Profile routes unavailable; coverage may be incomplete.',
    'error.roster': 'Profile list unavailable; showing reachable routes.', 'error.provider': 'Part of the provider catalog is invalid.',
    'error.catalog': 'Could not read profile allowances.', 'empty.providers': 'No provider data is available.',
    'empty.quota': 'No allowance data. This does not imply a zero balance.', 'label.profileAccount': 'Profile account',
    'label.account': 'Account', 'label.unknown': 'Unknown', 'label.limit': 'Limit', 'label.planLimit': 'Plan limit',
    'label.weekly': 'Weekly limit', 'label.session': 'Session limit', 'label.apiKey': 'API key quota',
    'label.day': 'Day', 'label.week': 'Week', 'label.month': 'Month', 'label.topTier': 'Top-tier models',
    'state.ready': 'Available', 'state.limited': 'Limited', 'state.unavailable': 'Authorization unavailable',
    'state.unknown': 'Allowance unknown', 'state.notConnected': 'Provider is not connected',
    'state.stale': 'Previous data — check again', 'state.observation': 'Profile observation',
    'state.modelScope': 'Applies only to this model family, not the whole account',
    'state.low': 'Low allowance', 'state.exhausted': 'Allowance exhausted', 'state.resetUnknown': 'Reset time unknown',
    'state.resetPassed': 'Reset time passed — refresh', 'state.resetIn': 'Resets in', 'state.unitDay': 'd', 'state.unitHour': 'h', 'state.unitMinute': 'm', 'state.locale': 'en-US',
    'state.providerPaused': 'Provider paused the plan', 'state.limit': 'Limit',
    'state.allowance': 'allowance remaining', 'state.readError': 'Profile data unavailable'
  },
  ru: {
    'pane.title': 'Лимиты', 'pane.heading': 'Лимиты аккаунтов',
    'action.refresh': 'Обновить', 'action.loading': 'Загрузка…', 'connection.offline': 'Нет соединения с Hermes. Данные могут быть устаревшими.',
    'status.reading': 'Читаем данные провайдеров…', 'status.waiting': 'Ожидание соединения с Hermes…',
    'error.refresh': 'Не удалось обновить данные. Предыдущие значения не подтверждены.', 'error.routes': 'Маршруты профилей недоступны; охват может быть неполным.',
    'error.roster': 'Список профилей недоступен; показаны доступные маршруты.', 'error.provider': 'Часть каталога провайдеров некорректна.',
    'error.catalog': 'Не удалось прочитать лимиты профиля.', 'empty.providers': 'Нет доступных данных провайдеров.',
    'empty.quota': 'Нет данных о лимите. Это не означает нулевой остаток.', 'label.profileAccount': 'Аккаунт профиля',
    'label.account': 'Аккаунт', 'label.unknown': 'Неизвестно', 'label.limit': 'Лимит', 'label.planLimit': 'Лимит плана',
    'label.weekly': 'Недельный лимит', 'label.session': 'Сеансовый лимит', 'label.apiKey': 'Квота API-ключа',
    'label.day': 'День', 'label.week': 'Неделя', 'label.month': 'Месяц', 'label.topTier': 'Старшие модели',
    'state.ready': 'Доступен', 'state.limited': 'Есть ограничение', 'state.unavailable': 'Авторизация недоступна',
    'state.unknown': 'Лимит неизвестен', 'state.notConnected': 'Провайдер не подключён',
    'state.stale': 'Предыдущие данные — проверьте обновление', 'state.observation': 'Наблюдение профиля',
    'state.modelScope': 'Только семейство моделей, не весь аккаунт',
    'state.low': 'Мало остатка', 'state.exhausted': 'Лимит исчерпан', 'state.resetUnknown': 'Время сброса неизвестно',
    'state.resetPassed': 'Время сброса прошло — обновите данные', 'state.resetIn': 'Сброс через', 'state.unitDay': 'д', 'state.unitHour': 'ч', 'state.unitMinute': 'м', 'state.locale': 'ru-RU',
    'state.providerPaused': 'План приостановлен провайдером', 'state.limit': 'Ограничение',
    'state.allowance': 'осталось', 'state.readError': 'Данные профиля недоступны'
  }
};

function nestMessages(flat) {
  const nested = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let branch = nested;
    for (const part of parts.slice(0, -1)) branch = branch[part] ||= {};
    branch[parts.at(-1)] = value;
  }
  return nested;
}
const extraMessages = {
  'bar.title': 'Account limits', 'bar.empty': 'No accounts selected', 'bar.pin': 'Show in status bar',
  'error.recovery': 'Automatic recovery could not be verified. Existing limits are preserved.',
  'bar.saveError': 'Preferences could not be saved; current choices apply only until reload.'
  , 'usage.heading': 'Conversation reported usage', 'usage.unmeasured': 'Account quota usage: unmeasured',
  'usage.coverage': 'Partial coverage: {dropped} events dropped; {failures} storage failures since this plugin loaded.',
  'usage.reason': 'No request-account or quota-window provenance is available.',
  'usage.empty': 'No observed conversation usage yet; history is not backfilled.', 'usage.chatEmpty': 'No usage has been reported for this conversation yet.', 'usage.loading': 'Loading conversation usage…',
  'usage.error': 'Could not refresh conversation usage. Previous results are stale.', 'usage.offline': 'Usage query is unavailable while Hermes is disconnected.',
  'usage.calls': 'Calls', 'usage.success': 'successful', 'usage.failed': 'failed', 'usage.pending': 'pending',
  'usage.reportedCalls': 'complete reported calls', 'usage.unreported': 'usage-unreported', 'usage.total': 'Reported token subtotal',
  'usage.prompt': 'Known input / prompt tokens', 'usage.output': 'Known output tokens', 'usage.provider': 'Providers', 'usage.models': 'Models',
  'usage.started': 'Collection started', 'usage.latest': 'Latest event', 'usage.queried': 'Query time',
  'usage.previous': 'Previous', 'usage.next': 'Next', 'usage.unreportedValue': 'Unreported',
  'usage.interval': 'Observed collection interval (local)', 'usage.rowStart': 'Request start (reported)'
  , 'usage.refresh': 'Refresh usage', 'usage.scope': 'Main-loop API requests only; auxiliary titling/compression/MoA/vision and external CLI are excluded. Continuations may split unless an explicit conversation ID links them; relationship metadata is shown separately and child usage is not added.',
  'usage.refreshing': 'Refreshing; visible values are from the previous read.', 'usage.links': 'Session links (metadata only)',
  'usage.current': 'Usage in this chat', 'usage.explanation': 'Follows the focused conversation.', 'usage.since': 'Partial API usage collected since plugin activation; not subscription quota %.',
  'usage.requests': 'API requests', 'usage.chatUnknown': 'Focused conversation is unavailable.', 'usage.chatError': 'Could not load usage for this conversation.',
  'bar.display': 'Display shape', 'bar.percent': 'Percentage', 'bar.graph': 'Bar graph', 'bar.circle': 'Circular graph', 'bar.readAt': 'Last read · Hermes catalog', 'bar.notRead': 'No Hermes catalog read yet.'
};
Object.assign(flatLocales.en, extraMessages);
flatLocales.ko = { ...flatLocales.en,
  'pane.title': '한도', 'pane.heading': '계정별 사용 한도',
  'action.refresh': '새로고침', 'action.loading': '조회 중…', 'connection.offline': 'Hermes 연결이 끊겼습니다. 이전 값은 최신 정보가 아닐 수 있습니다.',
  'status.reading': '한도 정보를 읽는 중…', 'status.waiting': 'Hermes 연결 대기 중…',
  'error.refresh': '조회 실패 — 이전 값은 미확인 상태입니다.', 'error.routes': '일부 프로필 경로를 확인하지 못했습니다.',
  'error.roster': '프로필 목록 조회 실패 — 접근 가능한 경로만 표시합니다.', 'error.provider': '일부 공급자 정보가 올바르지 않습니다.',
  'error.catalog': '프로필 한도 조회 실패', 'empty.providers': '한도 정보가 없습니다.',
  'empty.quota': '한도 정보 없음 — 잔여량 0이라는 뜻이 아닙니다.', 'label.profileAccount': '프로필 계정',
  'label.account': '계정', 'label.unknown': '확인 불가', 'label.limit': '한도', 'label.planLimit': '요금제 한도',
  'label.weekly': '주간', 'label.session': '세션', 'label.apiKey': 'API 키 한도',
  'label.day': '일간', 'label.week': '주간', 'label.month': '월간', 'label.topTier': '상위 모델',
  'state.ready': '사용 가능', 'state.limited': '제한됨', 'state.unavailable': '인증 확인 필요',
  'state.unknown': '한도 확인 불가', 'state.notConnected': '공급자에 연결되지 않았습니다.',
  'state.stale': '이전 데이터 — 다시 확인해야 합니다.', 'state.observation': '조회한 프로필',
  'state.modelScope': '이 모델 계열에만 적용되며 계정 전체 한도가 아닙니다.',
  'state.low': '잔여량 20% 이하', 'state.exhausted': '한도 소진', 'state.resetUnknown': '초기화 시각 미제공',
  'state.resetPassed': '초기화 시각 지남 — 새로고침 필요', 'state.resetIn': '초기화까지',
  'state.unitDay': '일', 'state.unitHour': '시간', 'state.unitMinute': '분', 'state.locale': 'ko-KR',
  'state.providerPaused': '공급자가 요금제를 일시 중지했습니다.', 'state.limit': '제한',
  'state.allowance': '남음', 'state.readError': '프로필 정보 확인 불가',
  'bar.title': '계정 한도', 'bar.empty': '표시 중인 계정 없음', 'bar.pin': '상태바에 표시',
  'error.recovery': '자동 제한 해제를 확인하지 못했습니다. 기존 제한은 유지됩니다.',
  'bar.saveError': '설정 저장 실패 — 현재 선택은 다시 열 때까지 적용됩니다.'
  , 'usage.heading': '대화별 보고된 사용량', 'usage.unmeasured': '계정 한도 사용률: 미측정',
  'usage.coverage': '부분 수집: 플러그인 로드 후 이벤트 {dropped}건 누락, 저장 실패 {failures}건.',
  'usage.reason': '요청별 계정 및 한도 구간 출처 정보가 없어 대화 토큰으로 계정 한도 사용률을 산출할 수 없습니다.',
  'usage.empty': '관찰된 대화 사용량이 없습니다. 과거 내역을 소급 수집하지 않습니다.', 'usage.chatEmpty': '이 대화에 보고된 사용량이 아직 없습니다.', 'usage.loading': '대화 사용량 조회 중…',
  'usage.error': '대화 사용량을 새로 조회하지 못했습니다. 이전 결과는 오래된 값입니다.', 'usage.offline': 'Hermes 연결 중에만 사용량을 조회할 수 있습니다.',
  'usage.calls': '요청', 'usage.success': '성공', 'usage.failed': '실패', 'usage.pending': '대기 중',
  'usage.reportedCalls': '사용량 보고 완료', 'usage.unreported': '사용량 미보고', 'usage.total': '보고된 토큰 소계',
  'usage.prompt': '알려진 프롬프트', 'usage.output': '알려진 출력', 'usage.provider': '공급자', 'usage.models': '모델',
  'usage.started': '수집 시작', 'usage.latest': '최근 이벤트', 'usage.queried': '조회 시각',
  'usage.previous': '이전', 'usage.next': '다음', 'usage.unreportedValue': '미보고',
  'usage.interval': '관찰 수집 구간(로컬 시각)', 'usage.rowStart': '요청 시작(보고된 값)'
  , 'usage.refresh': '사용량 새로고침', 'usage.scope': '메인 루프 API 요청만 포함합니다. 보조 제목 생성·압축·MoA·비전 및 외부 CLI는 제외됩니다. 명시적 대화 ID 연결이 없으면 이어진 대화도 분리될 수 있습니다. 관계 메타데이터는 별도로 표시하며 자식 사용량을 부모에 더하지 않습니다.',
  'usage.refreshing': '새로 조회 중입니다. 표시된 값은 이전 조회 결과입니다.', 'usage.links': '세션 연결(메타데이터만)',
  'usage.current': '이 대화의 사용량', 'usage.explanation': '현재 선택된 대화를 따라 표시합니다.', 'usage.since': '플러그인 활성화 이후 수집된 일부 API 사용량이며 구독 한도 %가 아닙니다.', 'usage.requests': 'API 요청 수', 'usage.chatUnknown': '선택된 대화를 확인할 수 없습니다.', 'usage.chatError': '이 대화의 사용량을 불러오지 못했습니다.', 'usage.total': '보고된 토큰 소계', 'usage.prompt': '확인된 입력 / 프롬프트 토큰', 'usage.output': '확인된 출력 토큰',
  'bar.display': '표시 모양', 'bar.percent': '퍼센트', 'bar.graph': '막대 그래프', 'bar.circle': '원형 그래프', 'bar.readAt': '최근 조회 · Hermes 카탈로그', 'bar.notRead': 'Hermes 카탈로그 조회 기록이 없습니다.'
};
const locales = Object.fromEntries(Object.entries(flatLocales).map(([locale, messages]) => [locale, nestMessages({ ...flatLocales.en, ...messages })]));

export function remaining(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? 100 - value : null;
}
export function resetInfo(value, now = Date.now(), t) {
  const date = typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
  const translate = typeof t === 'function' ? t : key => ({ unknown: 'Reset time unknown', passed: 'Reset time passed — refresh', in: 'Resets in', day: 'd', hour: 'h', minute: 'm' })[key];
  if (!date || !Number.isFinite(date.getTime())) return translate('unknown');
  const delta = date.getTime() - now;
  if (delta <= 0) return translate('passed');
  const minutes = Math.ceil(delta / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  const mins = minutes % 60;
  return `${translate('in')} ${days ? `${days}${translate('day')} ` : ''}${hours ? `${hours}${translate('hour')} ` : ''}${mins}${translate('minute')} · ${date.toLocaleString(typeof t === 'function' ? t('locale') : 'en-US')}`;
}
export function normalizePreferences(value) {
  return { hidden: [...new Set(list(value?.hidden).filter(key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key)))].slice(0, 512),
    statusBarDisplay: ['percent', 'graph', 'circle'].includes(value?.statusBarDisplay) ? value.statusBarDisplay : 'percent' };
}
export function displayLabel(label, maskEmails) {
  return maskEmails ? label.replace(/[^\s@]+@[^\s@]+/g, email => `${email[0]}…@…`) : label;
}
export async function accountPins(row, profileKey) {
  const counts = new Map();
  const accounts = Array.isArray(row.usage?.accounts) ? row.usage.accounts.filter(record) : [{}];
  return Promise.all(accounts.map(async (account, i) => {
    const identity = text(account.id) || text(account.label) || `ordinal:${i}`;
    const occurrence = counts.get(identity) || 0; counts.set(identity, occurrence + 1);
    const bytes = new TextEncoder().encode(JSON.stringify([profileKey, row.slug, identity, occurrence]));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
  }));
}
export function accountSummary(account, now = Date.now()) {
  const empty = kind => ({ kind, window: null });
  if (account.stale || !Number.isFinite(account.readAt) || account.readAt <= 0 || account.readAt > now || now - account.readAt > 300000) return empty('stale');
  if (account.authenticated === false || account.state === 'unavailable') return empty('unavailable');
  if (account.state === 'unknown') return empty('unknown');
  const windows = list(account.windows).filter(w => w.scope === 'account');
  if (windows.some(w => w.resets != null && new Date(w.resets).getTime() <= now)) return empty('stale');
  if (account.state === 'limited') return empty('limited');
  if (!windows.length || windows.some(w => w.left === null || !Number.isFinite(w.left) || w.left < 0 || w.left > 100)) return empty('unknown');
  const window = windows.reduce((a, b) => a.left <= b.left ? a : b);
  return { kind: window.left === 0 ? 'exhausted' : window.left <= 20 ? 'low' : 'ready', window };
}
function windowsOf(windows) {
  return list(windows).filter(record).map(w => ({ label: labels[w.label] || text(w.label) || 'Limit',
    left: remaining(w.used_percent), resets: w.resets_at || null,
    scope: w.scope === 'model' ? 'model' : 'account' }));
}
export function normalizeProvider(row) {
  const slug = text(row.slug) || text(row.name) || 'unknown';
  const pooled = Array.isArray(row.usage?.accounts);
  const accounts = [];
  const raw = pooled ? row.usage.accounts : [{ id: '', label: 'Profile account', windows: row.usage?.windows, state: '' }];
  for (const [i, account] of raw.filter(record).entries()) {
    const key = String(i);
    const windows = windowsOf(account.windows);
    if (!pooled && !windows.length) {
      for (const g of list(row.plan_usage?.gauges).filter(record)) {
        const fraction = g.left_fraction;
        windows.push({ label: labels[g.label] || text(g.title) || text(g.label) || 'Plan limit',
          left: typeof fraction === 'number' && Number.isFinite(fraction) && fraction >= 0 && fraction <= 1
            ? fraction * 100 : null,
          resets: g.resets_at_ms ?? null, scope: g.scope === 'top_tier' ? 'model' : 'account' });
      }
    }
    const normalized = { key, label: text(account.label) || `Account ${i + 1}`, windows,
      state: text(account.state), resets: account.resets_at || null };
    // Keep account rows separate by ordinal; omit provider account identifiers entirely.
    accounts.push(normalized);
  }
  return { slug, name: text(row.name) || slug, authenticated: row.authenticated,
    current: row.is_current === true, pooled, accounts,
    limit: row.limit ? { scope: row.limit.scope, resets: row.limit.resets_at,
      models: Object.entries(row.limit.models || {}).map(([name, resets]) => ({ name, resets })) } : null,
    paused: !!text(row.plan_usage?.paused_reason) };
}
export function groupAccounts(profiles) {
  const groups = new Map();
  for (const profile of profiles) for (const provider of profile.providers) {
    const key = JSON.stringify([profile.connection, provider.slug]);
    if (!groups.has(key)) groups.set(key, { key, name: provider.name, slug: provider.slug, accounts: [], sources: [] });
    const group = groups.get(key);
    group.sources.push({ profile: profile.name, stale: profile.stale, provider });
    for (const account of provider.accounts) {
      // Each row is an observation, never an independent budget to add up.
      // No cross-profile union without a server identity including endpoint.
      const accountKey = `${profile.key}:${provider.slug}:${account.key}`;
      group.accounts.push({ ...account, key: accountKey, profiles: [profile.name], readAt: profile.readAt, stale: !!profile.stale,
        authenticated: provider.authenticated });
    }
  }
  return [...groups.values()].sort((a, b) => {
    const priority = g => g.sources.some(s => s.provider.current) ? 2 : g.accounts.some(a => a.windows.length) ? 1 : 0;
    return priority(b) - priority(a);
  });
}
export function statusRows(snapshot, profile, connection) {
  return groupAccounts(list(snapshot?.profiles).filter(p => p.name === profile && p.connection === connection))
    .flatMap(group => group.accounts.map(account => ({ ...account, provider: group.slug, providerName: group.name })));
}
async function mapLimited(items, fn, concurrency = 3) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; results[index] = await fn(items[index]); }
  }));
  return results;
}
function checkActive(control) {
  if (control.signal?.aborted || control.isVisible?.() === false) {
    const error = new Error('Limits read cancelled'); error.name = 'AbortError'; throw error;
  }
}
export async function loadSnapshot(api, homeProfile, connection = '', control = {}) {
  checkActive(control);
  const canRoute = !control.currentOnly && typeof api.profileRoutes === 'function' && typeof api.requestProfile === 'function';
  const [rosterRead, routeRead] = await Promise.allSettled([
    control.currentOnly ? Promise.resolve({ profiles: [{ name: homeProfile }] }) : api.request('profiles.list', { include_sessions: false }),
    canRoute ? api.profileRoutes() : Promise.resolve([]),
  ]);
  checkActive(control);
  const roster = rosterRead.status === 'fulfilled' ? list(rosterRead.value?.profiles).filter(record)
    .map(p => ({ name: text(p.name), display_name: text(p.display_name) })) : [];
  const rosterFailure = rosterRead.status === 'rejected';
  const routeFailure = routeRead.status === 'rejected';
  const routes = routeRead.status === 'fulfilled' ? list(routeRead.value).filter(r => record(r) &&
    text(r.connectionId) && text(r.profile) && text(r.targetProfile)) : [];
  const items = routes.length ? routes.map(route => ({
    name: text(route.targetProfile) || text(route.profile), connection: text(route.connectionId), route,
    metadata: route.connectionId === connection ? roster.find(p => p.name === route.targetProfile) || {} : {},
  })) : roster.map(p => ({ name: text(p.name), connection, metadata: p }));
  if (!items.some(i => i.name === homeProfile && i.connection === connection) && !routes.length)
    items.unshift({ name: homeProfile, connection, metadata: {} });
  const profiles = await mapLimited(items, async item => {
    const key = JSON.stringify([item.connection, item.name]);
    const result = { key, name: item.name, connection: item.connection, label: text(item.metadata.display_name) || item.name,
      providers: [], errors: [], readAt: Date.now(), stale: false, catalogFailed: false };
    const request = async (method, params = {}) => {
      checkActive(control);
      if (item.route) return api.requestProfile(item.route, method, params, 20000);
      if (item.name === homeProfile) return api.request(method, params, 20000);
      throw new Error('profile routing unavailable');
    };
    const catalog = await Promise.allSettled([
      request('model.options', { explicit_only: true, include_unconfigured: false }),
    ]).then(([value]) => value);
    if (catalog.status === 'fulfilled' && Array.isArray(catalog.value?.providers)) {
      for (const row of catalog.value.providers) {
        try {
          if (!record(row) || !text(row.slug)) throw new Error('Invalid provider');
          const normalized = normalizeProvider(row);
          const pins = await accountPins(row, key);
          normalized.accounts.forEach((account, index) => { account.pin = pins[index]; });
          result.providers.push(normalized);
        } catch { result.errors.push('error.provider'); }
      }
    } else { result.catalogFailed = true; result.errors.push('error.catalog'); }
    return result;
  });
  checkActive(control);
  return { profiles, readAt: Date.now(), routeFailure, rosterFailure };
}
export function mergeSnapshots(next, previous) {
  if (!previous) return next;
  return { ...next, profiles: next.profiles.map(p => {
    if (!p.catalogFailed) return p;
    const old = previous.profiles.find(o => o.key === p.key);
    return old?.providers.length ? { ...p, providers: old.providers, readAt: old.readAt, stale: true } : p;
  }) };
}
export function pollInterval(visible, attempts) { return !visible ? false : attempts < 3 ? 5000 : 120000; }
export async function readCycle(api, profile, connection, cache, control = {}) {
  try {
    checkActive(control);
    let recovery = null;
    if (profile === 'default' && ['', 'local'].includes(connection) && control.reconcile) {
      try { recovery = await control.reconcile(); }
      catch { recovery = { status: 'unavailable' }; }
    }
    checkActive(control);
    const next = mergeSnapshots(await loadSnapshot(api, profile, connection, control), cache.previous);
    next.recovery = recovery;
    cache.previous = next;
    return next;
  } finally { cache.attempts++; }
}
const formatLeft = (value, locale) => value > 0 && value < 0.1
  ? (locale === 'ru-RU' ? '<0,1%' : '<0.1%') : `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
const windowKeys = { 'Session limit': 'label.session', 'Weekly limit': 'label.weekly', 'API key quota': 'label.apiKey', Day: 'label.day', Week: 'label.week', Month: 'label.month', 'Top-tier models': 'label.topTier', 'Plan limit': 'label.planLimit', Limit: 'label.limit' };
const resetTranslator = t => key => key === 'locale' ? t('state.locale') : t(({ unknown: 'state.resetUnknown', passed: 'state.resetPassed', in: 'state.resetIn', day: 'state.unitDay', hour: 'state.unitHour', minute: 'state.unitMinute' })[key]);
function WindowGauge({ window: w, stale, t }) {
  const now = useValue(clock);
  const low = w.left !== null && w.left <= 20;
  const label = t(windowKeys[w.label] || w.label);
  const locale = t('state.locale');
  return jsxs('div', { style: { marginTop: 10 }, children: [
    jsxs('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 6 }, children: [
      jsx('span', { style: { fontSize: 11 }, children: label }),
      jsx('strong', { style: { whiteSpace: 'nowrap', color: low ? warning : 'var(--ui-text-primary)' }, children:
        w.left === null ? t('label.unknown') : `${formatLeft(w.left, locale)} ${t('state.allowance')}` }),
    ] }),
    w.left !== null && jsx('div', { role: 'progressbar', 'aria-label': `${t('state.allowance')}: ${label}`,
      'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': w.left,
      style: { height: 5, borderRadius: 3, background: 'var(--ui-stroke-secondary)', marginTop: 6, overflow: 'hidden' },
      children: jsx('div', { style: { width: `${w.left}%`, height: '100%', background: low ? warning : 'var(--ui-accent)', opacity: stale ? 0.45 : 1 } }) }),
    jsx('div', { style: subtle, children: resetInfo(w.resets, now, resetTranslator(t)) }),
    w.scope === 'model' && jsx('div', { style: subtle, children: t('state.modelScope') }),
    low && jsx('div', { style: { ...subtle, color: warning }, children: w.left === 0 ? t('state.exhausted') : t('state.low') }),
  ] });
}
function AccountCard({ account, t }) {
  const tick = useValue(clock);
  const now = Math.max(tick, Date.now());
  const stale = accountSummary(account, now).kind === 'stale';
  const stateKey = { ready: 'state.ready', limited: 'state.limited', unavailable: 'state.unavailable', unknown: 'state.unknown' }[account.state];
  const numbered = /^Account (\d+)$/.exec(account.label);
  const label = numbered ? `${t('label.account')} ${numbered[1]}` : account.label === 'Profile account' ? t('label.profileAccount') : account.label;
  return jsxs('div', { style: { marginTop: 9, paddingTop: 8, borderTop: '1px solid var(--ui-stroke-secondary)' }, children: [
    jsx('div', { style: { fontWeight: 600, overflowWrap: 'anywhere' }, children: displayLabel(label, true) }),
    jsx('div', { style: subtle, children: `${t('state.observation')}: ${account.profiles.join(', ')}` }),
    stateKey && jsx('div', { style: subtle, children: t(stateKey) }),
    stale && jsx('div', { role: 'status', style: { ...subtle, color: warning }, children: t('state.stale') }),
    account.authenticated === false && jsx('div', { style: subtle, children: t('state.notConnected') }),
    account.windows.length ? account.windows.map((w, i) => jsx(WindowGauge, { window: w, stale, t }, i))
      : jsx('div', { style: subtle, children: t('empty.quota') }),
    account.state === 'limited' && account.resets && jsx('div', { style: subtle, children: resetInfo(account.resets, now, resetTranslator(t)) }),
  ] });
}
function ProviderCard({ group, t }) {
  return jsxs('details', { open: group.sources.some(s => s.provider.current) || group.accounts.some(a => a.windows.length), style: block, children: [
    jsx('summary', { style: { cursor: 'pointer', fontWeight: 600, overflowWrap: 'anywhere' }, children: group.name }),
    jsx('div', { style: subtle, children: group.slug }),
    group.accounts.map(account => jsx(AccountCard, { account, t }, account.key)),
    group.sources.filter(s => s.provider.limit || s.provider.paused).map((s, i) => jsxs('div', { style: subtle, children: [
      jsx('div', { children: s.provider.paused ? t('state.providerPaused') : `${t('state.limit')}: ${s.profile}` }),
      s.provider.limit?.scope === 'account' && jsx('div', { children: resetInfo(s.provider.limit.resets, Date.now(), resetTranslator(t)) }),
      list(s.provider.limit?.models).map(m => jsx('div', { children: `${m.name}: ${resetInfo(m.resets, Date.now(), resetTranslator(t))}` }, m.name)),
    ] }, i)),
  ] });
}
function useLimitsQuery(statusBar = false) {
  const visibility = typeof host.paneVisibility === 'function' ? host.paneVisibility(PANE) : always;
  const visible = useValue(visibility);
  const mounted = useValue(barMounted);
  useEffect(() => {
    if (!statusBar) return;
    barMounted.set(barMounted.get() + 1);
    return () => barMounted.set(Math.max(0, barMounted.get() - 1));
  }, [statusBar]);
  const profile = useValue(host.state.profile);
  const connection = useValue(host.state.connectionId || disconnected) || '';
  const gateway = useValue(host.state.gateway);
  // A background status chip must not wake every profile/remote gateway.
  const queryKey = [ID, connection, profile, visible ? 'all' : 'current'];
  const key = JSON.stringify(queryKey);
  const memory = useRef({ key, attempts: 0, previous: queryClient.getQueryData(queryKey) || null });
  if (memory.current.key !== key) memory.current = { key, attempts: 0, previous: queryClient.getQueryData(queryKey) || null };
  const cache = memory.current;
  // Only one observer owns the poll timer. The pane subscribes to the same query.
  const polling = statusBar || (!mounted && visible);
  const query = useQuery({ queryKey, enabled: polling && gateway === 'open',
    queryFn: ({ signal }) => readCycle(host, profile, connection, cache, {
      signal, currentOnly: !visible,
      reconcile: recoveryRest ? () => recoveryRest('/reconcile', { method: 'POST', timeoutMs: 45000 }) : null,
      isVisible: () => (statusBar || visibility.get()) && host.state.gateway.get() === 'open'
        && host.state.profile.get() === profile && (host.state.connectionId?.get() || '') === connection,
    }), retry: (count, error) => error?.name !== 'AbortError' && count < 1,
    staleTime: 120000, refetchOnWindowFocus: false, refetchIntervalInBackground: true,
    refetchInterval: () => pollInterval(polling, cache.attempts),
  });
  return { query, profile, connection, gateway, refresh: () => { cache.attempts = 0; void query.refetch(); } };
}
function useUsageQuery(profile, connection, offset) {
  const gateway = useValue(host.state.gateway);
  const visible = useValue(typeof host.paneVisibility === 'function' ? host.paneVisibility(PANE) : always);
  const queryKey = ['limits-monitor-usage', connection, profile, offset];
  return useQuery({ queryKey, enabled: visible && gateway === 'open', retry: false, staleTime: 0,
    refetchInterval: visible && gateway === 'open' ? 30000 : false, refetchIntervalInBackground: false,
    queryFn: async ({ signal }) => {
      const current = () => !signal?.aborted && host.state.gateway.get() === 'open'
        && host.state.profile.get() === profile && (host.state.connectionId?.get() || '') === connection;
      if (!current()) throw Object.assign(new Error('usage query scope changed'), { name: 'AbortError' });
      const result = await host.request('plugin.limits-monitor.usage.list', { limit: 25, offset });
      if (!current()) throw Object.assign(new Error('usage query scope changed'), { name: 'AbortError' });
      return result;
    }
  });
}
const usageNumber = (value, locale, missing) => Number.isFinite(value) && value >= 0 ? value.toLocaleString(locale) : missing;
const stateValue = value => value && typeof value.get === 'function' ? value.get() : value;
const useStateValue = value => value && typeof value.get === 'function' ? useValue(value) : value;
const EMPTY_SESSION_ATOM = atom('');
const EMPTY_OWNER_ATOM = atom(null);
function useCurrentChatQuery(open) {
  const state = host.state;
  const storedSession = useValue(state.focusedStoredSessionId || EMPTY_SESSION_ATOM);
  const transientSession = useValue(state.focusedSessionId || EMPTY_SESSION_ATOM);
  const session = storedSession || transientSession || '';
  const owner = useValue(state.focusedSessionOwner || EMPTY_OWNER_ATOM);
  const connection = text(owner?.connectionId);
  const profile = text(owner?.profile);
  const gateway = useValue(state.gateway);
  const queryKey = ['limits-monitor-current-chat', connection, profile, session];
  return useQuery({ queryKey, enabled: open && gateway === 'open' && !!session && !!connection && !!profile,
    retry: false, staleTime: 0, refetchInterval: open && gateway === 'open' && session && connection && profile ? 30000 : false,
    refetchIntervalInBackground: false, queryFn: async ({ signal }) => {
      const current = () => !signal?.aborted && state.gateway.get() === 'open'
        && (stateValue(state.focusedStoredSessionId) || stateValue(state.focusedSessionId) || '') === session
        && stateValue(state.focusedSessionOwner)?.connectionId === connection
        && stateValue(state.focusedSessionOwner)?.profile === profile;
      if (!current()) throw Object.assign(new Error('usage query scope changed'), { name: 'AbortError' });
      const params = { session_id: session, limit: 25, offset: 0 };
      const result = connection === (stateValue(state.connectionId) || '') && profile === (stateValue(state.profile) || '')
        ? await host.request('plugin.limits-monitor.usage.list', params)
        : typeof host.requestProfile === 'function'
          ? await host.requestProfile({ connectionId: connection, profile, targetProfile: profile }, 'plugin.limits-monitor.usage.list', params)
          : null;
      if (!current()) throw Object.assign(new Error('usage query scope changed'), { name: 'AbortError' });
      if (result === null) throw new Error('usage owner route unavailable');
      return result;
    }
  });
}
function CurrentChatSummary({ open, t }) {
  const query = useCurrentChatQuery(open);
  const state = host.state;
  const storedSession = useValue(state.focusedStoredSessionId || EMPTY_SESSION_ATOM);
  const transientSession = useValue(state.focusedSessionId || EMPTY_SESSION_ATOM);
  const session = storedSession || transientSession || '';
  const owner = useValue(state.focusedSessionOwner || EMPTY_OWNER_ATOM);
  const data = query.isError || state.gateway.get() !== 'open' ? null : query.data;
  const row = list(data?.rows).find(item => item.session_id === session || list(item.segment_session_ids).includes(session)) || null;
  const number = value => usageNumber(value, t('state.locale'), t('usage.unreportedValue'));
  return jsxs('section', { style: block, 'data-current-chat-usage': true, children: [
    jsx('strong', { children: t('usage.current') }),
    jsx('p', { style: subtle, children: t('usage.explanation') }),
    (!session || !owner?.connectionId || !owner?.profile) && jsx('p', { role: 'status', children: t('usage.chatUnknown') }),
    open && state.gateway.get() !== 'open' && jsx('p', { role: 'status', children: t('usage.offline') }),
    query.isError && jsx('p', { role: 'status', children: t('usage.chatError') }),
    query.isFetching && open && state.gateway.get() === 'open' && !row && jsx('p', { role: 'status', children: t('usage.loading') }),
    open && state.gateway.get() === 'open' && session && owner?.connectionId && owner?.profile && !query.isPending && !query.isFetching && !query.isError && query.data && !row && jsx('p', { role: 'status', children: t('usage.chatEmpty') }),
    row && jsxs('div', { 'aria-label': t('usage.current'), style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }, children: [
      ...[[t('usage.total'), row.reported_total_tokens], [t('usage.requests'), row.calls], [t('usage.prompt'), row.known_prompt_tokens], [t('usage.output'), row.known_output_tokens]].map(([label, value]) => jsxs('div', { key: label, 'data-usage-metric': label, style: { border: '1px solid var(--ui-stroke-secondary)', borderRadius: 6, padding: 8 }, children: [jsx('div', { style: subtle, children: label }), jsx('strong', { children: number(value) })] }))
    ] }),
    jsx('p', { style: subtle, children: t('usage.since') })
  ] });
}
function UsageSection({ profile, connection, gateway, t, initialOffset = 0 }) {
  const [offset, setOffset] = useState(initialOffset);
  useEffect(() => setOffset(0), [profile, connection]);
  const query = useUsageQuery(profile, connection, offset);
  const page = offset;
  const data = query.isError || gateway !== 'open' ? null : query.data;
  const rows = list(data?.rows);
  const time = value => Number.isFinite(value) ? new Date(value * 1000).toLocaleString(t('state.locale')) : t('usage.unreportedValue');
  const number = value => usageNumber(value, t('state.locale'), t('usage.unreportedValue'));
  return jsxs('section', { style: block, 'data-usage-section': true, children: [
    jsx('details', { children: [jsx('summary', { style: { cursor: 'pointer', fontWeight: 600 }, children: t('usage.heading') }),
      jsx('div', { role: 'status', style: subtle, children: t('usage.unmeasured') }),
      jsx('p', { style: subtle, children: t('usage.reason') }),
      jsx('p', { style: subtle, children: t('usage.scope') }),
      jsx(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: query.isFetching || gateway !== 'open', onClick: () => void query.refetch(), children: query.isFetching ? t('action.loading') : t('usage.refresh') }),
      gateway !== 'open' && jsx('div', { role: 'status', children: t('usage.offline') }),
      query.isError && jsx('div', { role: 'alert', children: t('usage.error') }),
      query.isFetching && data && jsx('div', { role: 'status', children: t('usage.refreshing') }),
      gateway === 'open' && !query.data && query.isPending && jsx('div', { role: 'status', children: t('usage.loading') }),
      data && !rows.length && jsx('div', { role: 'status', children: t('usage.empty') }),
      data && jsxs('p', { style: subtle, children: [`${t('usage.interval')}: ${time(data.collection_started_at)} – ${time(data.last_observed_at)} · ${t('usage.queried')}: ${time(data.read_at)}`] }),
      data?.diagnostics && (data.diagnostics.dropped_events > 0 || data.diagnostics.storage_failures > 0) && jsx('div', { role: 'status', style: { ...subtle, color: warning }, children: t('usage.coverage').replace('{dropped}', number(data.diagnostics.dropped_events)).replace('{failures}', number(data.diagnostics.storage_failures)) }),
      data && jsx('p', { style: subtle, children: `${t('usage.started')}: ${time(data.collection_started_at)} · ${t('usage.latest')}: ${time(data.last_observed_at)}` }),
      rows.map((row, index) => jsxs('details', { style: { borderTop: '1px solid var(--ui-stroke-secondary)', padding: '8px 0' }, children: [
        jsx('summary', { style: { cursor: 'pointer', overflowWrap: 'anywhere' }, children: row.conversation_id || row.session_id || '귀속 불명' }),
        jsx('div', { style: subtle, children: `${t('usage.calls')}: ${number(row.calls)} · ${t('usage.success')}: ${number(row.successful)} · ${t('usage.failed')}: ${number(row.failed)} · ${t('usage.pending')}: ${number(row.pending)}` }),
        jsx('div', { style: subtle, children: `${t('usage.reportedCalls')}: ${number(row.reported_calls)} · ${t('usage.unreported')}: ${number(row.usage_unreported)}` }),
        jsx('div', { style: subtle, children: `${t('usage.total')}: ${number(row.reported_total_tokens)} · ${t('usage.prompt')}: ${number(row.known_prompt_tokens)} · ${t('usage.output')}: ${number(row.known_output_tokens)}` }),
        jsx('div', { style: subtle, children: `${t('usage.provider')}: ${list(row.providers).join(', ') || '—'} · ${t('usage.models')}: ${list(row.models).join(', ') || '—'}` }),
        jsx('div', { style: subtle, children: `${t('usage.rowStart')}: ${time(row.first_started_at)} · ${t('usage.latest')}: ${time(row.last_observed_at)}` }),
        list(row.segment_session_ids).length > 0 && jsx('div', { style: subtle, children: `세션 구간: ${row.segment_session_ids.join(', ')}` })
      ] }, `${row.session_id || row.conversation_id || index}`)),
      list(data?.relationships).length > 0 && jsx('details', { children: [jsx('summary', { style: { cursor: 'pointer' }, children: t('usage.links') }),
        ...list(data.relationships).map((link,index) => jsx('div', { style: subtle, children: `${link.kind}: ${link.parent_session_id} → ${link.child_session_id} (metadata only)` }, `${link.kind}-${index}`))] }),
      jsxs('div', { style: { display: 'flex', gap: 8, marginTop: 8 }, children: [
        jsx(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: page === 0, onClick: () => setOffset(Math.max(0, page - 25)), children: t('usage.previous') }),
        jsx(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: page >= 10000 || rows.length < 25 || query.isError || query.isFetching || gateway !== 'open', onClick: () => setOffset(Math.min(10000, page + 25)), children: t('usage.next') })
      ] })
    ] })
  ] });
}
function updatePreferences(value) {
  const next = normalizePreferences(value);
  preferences.set(next);
  try { preferenceStorage?.set('presentation', next); storageError.set(false); }
  catch { storageError.set(true); }
}
function LimitsStatusBar() {
  const t = usePluginI18n(ID);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { query, profile, connection, gateway, refresh } = useLimitsQuery(true);
  const prefs = useValue(preferences);
  const failedSave = useValue(storageError);
  const tick = useValue(clock);
  const now = Math.max(tick, Date.now());
  const rows = statusRows(query.data, profile, connection);
  const labelOf = row => displayLabel(row.label === 'Profile account' ? t('label.profileAccount') : row.label, true);
  const providerOf = row => row.provider === 'openai-codex' ? 'Codex' : row.providerName;
  const summaryOf = row => accountSummary({ ...row, stale: row.stale || query.isError || gateway !== 'open' }, now);
  const limited = summary => ['limited', 'exhausted'].includes(summary.kind);
  const headline = summary => limited(summary) ? 'Limited'
    : summary.window ? formatLeft(summary.window.left, t('state.locale')) : '—';
  const chip = row => {
    const summary = summaryOf(row);
    const prefix = `${providerOf(row)} · ${labelOf(row)}`;
    const value = headline(summary);
    const critical = limited(summary) || summary.kind === 'low';
    const valueNode = ['graph', 'circle'].includes(prefs.statusBarDisplay) && summary.window
      && Number.isFinite(summary.window.left) && summary.window.left > 0 && !limited(summary)
      ? (() => {
          const exact = `${formatLeft(summary.window.left, t('state.locale'))} ${t('state.allowance')}`;
          const value = summary.window.left;
          if (prefs.statusBarDisplay === 'circle') return jsxs('svg', { width: 16, height: 16, viewBox: '0 0 16 16',
            role: 'progressbar', 'aria-label': exact, 'aria-valuemin': 0, 'aria-valuemax': 100,
            'aria-valuenow': value, 'aria-valuetext': exact, title: exact,
            style: { display: 'inline-block', flex: 'none', verticalAlign: 'middle' }, children: [
              jsx('circle', { cx: 8, cy: 8, r: 6, fill: 'none', stroke: 'var(--ui-stroke-secondary)', strokeWidth: 2 }),
              jsx('circle', { cx: 8, cy: 8, r: 6, fill: 'none', stroke: critical ? warning : 'var(--ui-accent)', strokeWidth: 2,
                pathLength: 100, strokeDasharray: `${Math.max(value, 1)} 100`, strokeLinecap: 'round', transform: 'rotate(-90 8 8)' })
            ] });
          return jsx('span', { role: 'progressbar', 'aria-label': exact, 'aria-valuemin': 0, 'aria-valuemax': 100,
            'aria-valuenow': value, 'aria-valuetext': exact, title: exact,
            style: { display: 'inline-block', width: 44, height: 5, borderRadius: 4, verticalAlign: 'middle', background: 'var(--ui-stroke-secondary)', overflow: 'hidden' },
            children: jsx('span', { style: { display: 'block', width: `${Math.max(1, 44 * value / 100)}px`, height: '100%', borderRadius: 4,
              background: critical ? warning : 'var(--ui-accent)' } }) });
        })()
      : value;
    return { summary, critical, prefix, value, node: jsxs('span', { key: row.pin || row.key, 'data-limits-account': 'chip',
      'aria-label': `${prefix} · ${value}`, title: `${prefix} · ${value}`, style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: critical ? warning : 'var(--ui-text-primary)' },
      children: [prefix, ' · ', valueNode] }) };
  };
  const pinned = rows.filter(row => !prefs.hidden.includes(row.pin));
  const chipInfo = pinned.map(row => ({ row, ...chip(row) }));
  return jsxs(Popover, { open: popoverOpen, onOpenChange: setPopoverOpen, children: [
    jsx(PopoverTrigger, { asChild: true, children: jsxs(Button, {
      type: 'button', variant: 'ghost', size: 'sm', 'data-limits-monitor': 'statusbar',
      'aria-label': `${t('bar.title')} · ${chipInfo.map(item => `${item.prefix} · ${item.value}`).join('; ') || profile}`,
      style: { display: 'flex', gap: 8, height: 24, maxWidth: 'min(560px, 50vw)', padding: '0 6px', overflow: 'hidden', fontSize: 11 },
      children: [...chipInfo.map(({ node }) => node),
        !pinned.length && jsx('span', { children: query.isPending ? t('action.loading') : t('bar.empty') })]
    }) }),
    jsxs(PopoverContent, { side: 'top', align: 'end', 'aria-label': t('bar.title'),
      style: { width: 'min(400px, calc(100vw - 24px))', maxHeight: '70vh', overflowY: 'auto', padding: 12 },
      children: [
        jsxs('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, children: [
          jsx('span', { children: query.data ? `${t('bar.readAt')}: ${new Date(query.data.readAt).toLocaleTimeString(t('state.locale'))}` : t('bar.notRead') }),
          jsx(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: query.isFetching || gateway !== 'open', onClick: refresh,
            children: query.isFetching ? t('action.loading') : t('action.refresh') })] }),
        jsx(CurrentChatSummary, { open: popoverOpen, t }),
        gateway !== 'open' && jsx('div', { role: 'status', style: { ...subtle, color: warning }, children: t('connection.offline') }),
        query.isError && jsx('div', { role: 'status', style: { ...subtle, color: warning }, children: t('error.refresh') }),
        (query.data?.recovery?.status === 'unavailable' || query.data?.recovery?.errors > 0) &&
          jsx('p', { role: 'status', style: { ...subtle, color: warning }, children: t('error.recovery') }),
        jsxs('div', { style: { marginTop: 8 }, children: [
          jsx('strong', { style: subtle, children: t('bar.display') }),
          jsxs('div', { role: 'group', 'aria-label': t('bar.display'), style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }, children: [
            ...[['percent', t('bar.percent')], ['graph', t('bar.graph')], ['circle', t('bar.circle')]].map(([mode, label]) => jsxs('label', { key: mode,
              style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }, children: [
                jsx(Checkbox, { checked: prefs.statusBarDisplay === mode, 'aria-label': label,
                  onCheckedChange: checked => { if (checked === true) updatePreferences({ ...preferences.get(), statusBarDisplay: mode }); } }),
                jsx('span', { children: label })
              ] }))] })
        ] }),
        failedSave && jsx('p', { role: 'status', style: { ...subtle, color: warning }, children: t('bar.saveError') }),
        ...rows.map(row => jsxs('section', { style: block, children: [
          jsxs('label', { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [
            jsx(Checkbox, { checked: !prefs.hidden.includes(row.pin), disabled: !row.pin,
              'aria-label': `${t('bar.pin')}: ${providerOf(row)} ${labelOf(row)}`,
              onCheckedChange: checked => { const value = preferences.get(); updatePreferences({ ...value,
                hidden: checked === true ? value.hidden.filter(pin => pin !== row.pin) : [row.pin, ...value.hidden.filter(pin => pin !== row.pin)] }); } }),
            jsx('strong', { children: providerOf(row) }), jsx('span', { style: subtle, children: t('bar.pin') })] }),
          jsx(AccountCard, { account: { ...row, stale: row.stale || query.isError || gateway !== 'open' }, t })]
        }, row.pin || row.key)),
        !rows.length && jsx('p', { style: subtle, children: query.isPending ? t('status.reading') : t('empty.providers') }),
      ] })
  ] });
}
function LimitsPane() {
  const t = usePluginI18n(ID);
  const { query, gateway, refresh, profile, connection } = useLimitsQuery();
  const data = query.data;
  return jsxs('div', { 'data-limits-monitor': 'pane', tabIndex: 0, 'aria-label': t('pane.title'), style: { height: '100%', overflowY: 'auto', padding: 12,
    boxSizing: 'border-box', fontSize: 12, color: 'var(--ui-text-primary)' }, children: [
    jsxs('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, children: [
      jsx('span', { style: subtle, children: data ? `${t('bar.readAt')}: ${new Date(data.readAt).toLocaleTimeString(t('state.locale'))}` : t('bar.notRead') }),
      jsx(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: query.isFetching || gateway !== 'open',
        onClick: refresh, children: query.isFetching ? t('action.loading') : t('action.refresh') }),
    ] }),
    jsx(UsageSection, { profile, connection, gateway, t }),
    gateway !== 'open' && jsx('div', { role: 'status', style: subtle, children: t('connection.offline') }),
    query.isError && jsx('div', { role: 'alert', style: { ...subtle, color: warning }, children: t('error.refresh') }),
    (data?.recovery?.status === 'unavailable' || data?.recovery?.errors > 0) &&
      jsx('p', { role: 'status', style: subtle, children: t('error.recovery') }),
    !data && query.isPending && jsx('div', { role: 'status', style: subtle, children: gateway === 'open' ? t('status.reading') : t('status.waiting') }),
    data?.routeFailure && jsx('div', { style: { ...subtle, color: warning }, children: t('error.routes') }),
    data?.rosterFailure && jsx('div', { style: { ...subtle, color: warning }, children: t('error.roster') }),
    data && groupAccounts(data.profiles.map(p => ({ ...p, stale: p.stale || query.isError || gateway !== 'open' })))
      .map(group => jsx(ProviderCard, { group, t }, group.key)),
    data && !data.profiles.some(p => p.providers.length) && jsx('p', { style: subtle, children: t('empty.providers') }),
    data?.profiles.filter(p => p.errors.length).map(p => jsx('div', { role: 'status', style: { ...block, ...subtle },
      children: `${p.label}: ${[...new Set(p.errors)].map(error => t(error)).join('; ')}` }, p.key)),
  ] });
}
export default { id: ID, name: 'Limits · Beta', description: 'Provider allowances and observed conversation usage', defaultEnabled: true, register(ctx) {
  ctx.i18n.register(locales);
  preferenceStorage = ctx.storage;
  recoveryRest = typeof ctx.rest === 'function' ? ctx.rest.bind(ctx) : undefined;
  try { preferences.set(normalizePreferences(ctx.storage?.get('presentation', null))); }
  catch { preferences.set(normalizePreferences(null)); storageError.set(true); }
  clock.set(Date.now());
  ctx.setInterval?.(() => clock.set(Date.now()), 30000);
  ctx.onDispose?.(() => { preferenceStorage = undefined; recoveryRest = undefined; });
  ctx.register({ id: 'status', area: 'statusBar.right', order: 110, render: () => jsx(LimitsStatusBar, {}) });
  ctx.register({ id: 'pane', area: 'panes', title: 'Limits', order: 1000,
    data: { placement: 'left', width: '300px', collapsible: true, hideOnly: true,
      dock: { pane: 'terminal', pos: 'center' } }, render: () => jsx(LimitsPane, {}) });
} };
