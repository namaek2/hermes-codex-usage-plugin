import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QueryClient, QueryObserver } from '@tanstack/query-core';

const file = new URL('../desktop/plugin.js', import.meta.url);
const source = await fs.readFile(file, 'utf8');
test('optional usage UI Vite config derives paths from its location and limits served files', async () => {
  const previous = process.env.HERMES_DESKTOP_NODE_MODULES;
  const fixtureModules = path.join(os.tmpdir(), 'hermes-desktop', 'node_modules');
  process.env.HERMES_DESKTOP_NODE_MODULES = fixtureModules;
  try {
    const configUrl = new URL('./usage_ui_harness/vite.config.mjs', import.meta.url);
    delete process.env.HERMES_DESKTOP_NODE_MODULES;
    await assert.rejects(import(`${configUrl.href}?missing-env`), /HERMES_DESKTOP_NODE_MODULES/);
    process.env.HERMES_DESKTOP_NODE_MODULES = fixtureModules;
    const { default: config } = await import(`${configUrl.href}?selfcheck`);
    const harness = path.dirname(fileURLToPath(configUrl));
    const repo = path.resolve(harness, '../..');
    assert.equal(config.root, harness);
    assert.ok(config.resolve.alias.some(alias => alias.replacement.startsWith(fixtureModules + path.sep)));
    assert.ok(config.server.fs.allow.includes(repo));
    assert.ok(config.server.fs.allow.includes(config.cacheDir));
    assert.ok(!config.server.fs.allow.includes(os.tmpdir()));
    assert.ok(!config.server.fs.allow.includes(path.resolve(os.homedir())));
    assert.equal(config.server.host, '127.0.0.1');
    assert.ok(config.plugins.some(plugin => plugin.name === 'raw-limits-plugin'));
  } finally {
    if (previous === undefined) delete process.env.HERMES_DESKTOP_NODE_MODULES;
    else process.env.HERMES_DESKTOP_NODE_MODULES = previous;
  }
});
const testSource = source.replace(/^import .*;\r?\n/gm, '') + `
export function renderPaneForTest(data, gateway, isError = false) {
  host.state = {profile: atom('default'), connectionId: atom('local'), gateway: atom(gateway)};
  renderQuery = {data, isError, isPending: false, isFetching: false};
  try { return LimitsPane(); } finally { renderQuery = null; }
}
export function renderStatusBarForTest(data, gateway = 'open', isError = false) {
  host.state = {profile: atom('default'), connectionId: atom('local'), gateway: atom(gateway), focusedStoredSessionId: atom('chat-a'), focusedSessionOwner: atom({connectionId:'local',profile:'default'})};
  renderQuery = {data, isError, isPending: false, isFetching: false};
  clock.set(Date.now());
  try { return LimitsStatusBar(); } finally { renderQuery = null; }
}
export function queryOptionsForTest(profile = 'default', connection = 'local') {
  host.state = {profile: atom(profile), connectionId: atom(connection), gateway: atom('open')};
  host.request = async () => ({providers: []});
  return useLimitsQuery(true).query;
}
export function usageQueryOptionsForTest(profile = 'default', connection = 'local', offset = 0) {
  host.state = {profile: atom(profile), connectionId: atom(connection), gateway: atom('open')};
  host.request = async (...args) => { lastUsageRequest = args; return { rows: [] }; };
  return useUsageQuery(profile, connection, offset);
}
export function lastUsageRequestForTest() { return lastUsageRequest; }
export function currentChatOptionsForTest(open = true) { return useCurrentChatQuery(open); }
export function setChatScopeForTest(session, connection, profile, gateway='open') { for (const [key,value] of Object.entries({profile:'default',connectionId:'local',gateway,focusedStoredSessionId:session,focusedSessionId:'',focusedSessionOwner:connection && profile ? {connectionId:connection,profile} : null})) { if (host.state[key]?.set) host.state[key].set(value); else host.state[key]=atom(value); } }
export function chatHookReadsForTest() { hookReads = 0; useCurrentChatQuery(true); return hookReads; }
export function renderChatSummaryForTest(data, flags={}) { renderQuery = {data,isError:false,isPending:false,isFetching:false,...flags}; try { return CurrentChatSummary({open:true,t:key=>({'state.locale':'ko-KR','usage.loading':'대화 사용량 조회 중…','usage.chatUnknown':'현재 대화 식별 정보를 확인할 수 없습니다.'}[key]||key)}); } finally { renderQuery=null; } }
export function setUsageStateForTest(profile, connection, gateway = 'open') {
  host.state = {profile: atom(profile), connectionId: atom(connection), gateway: atom(gateway)};
}
export function setUsageRequestForTest(fn) { host.request = fn; }
export function renderUsageForTest(data, gateway = 'open', flags = {}, initialOffset = 0) {
  host.state = {profile: atom('profile-a'), connectionId: atom('connection-a'), gateway: atom(gateway)};
  renderQuery = {data, isError: false, isPending: false, isFetching: false, ...flags};
  const t = key => ({'state.locale':'ko-KR','usage.heading':'대화별 보고된 사용량','usage.unmeasured':'계정 한도 사용률: 미측정','usage.reason':'요청별 계정 및 한도 구간 출처 정보가 없어 대화 토큰으로 계정 한도 사용률을 산출할 수 없습니다.','usage.coverage':'부분 수집: 이벤트 {dropped}건 누락, 저장 실패 {failures}건.','usage.unreportedValue':'미보고','usage.empty':'관찰된 대화 사용량이 없습니다. 과거 내역을 소급 수집하지 않습니다.','usage.loading':'대화 사용량 조회 중…','usage.offline':'Hermes 연결 중에만 사용량을 조회할 수 있습니다.','usage.error':'대화 사용량을 새로 조회하지 못했습니다. 이전 결과는 오래된 값입니다.','usage.total':'Reported token subtotal','usage.calls':'Calls','usage.success':'successful','usage.failed':'failed','usage.pending':'pending'})[key] || key;
  try { return UsageSection({profile:'profile-a',connection:'connection-a',gateway,t,initialOffset}); } finally { renderQuery = null; }
}
`;
const stubs = `const host = {}; let renderQuery; let lastUsageRequest; let hookReads=0; const useValue = x => {hookReads++; return x.get();}; const useQuery = x => renderQuery || x; const queryClient = {getQueryData: () => null}; const atom = value => ({get: () => value, set: next => {value = next;}}); const Button = 'button'; const Checkbox = 'checkbox'; const Popover = 'popover'; const PopoverTrigger = 'trigger'; const PopoverContent = 'content'; const useRef = current => ({current}); const useState = value => [value, () => {}]; const useEffect = () => {}; const usePluginI18n = () => key => key === 'state.locale' ? 'ko-KR' : key; host.request = async (...args) => { lastUsageRequest = args; return {rows:[]}; }; const jsx = (type, props, key) => ({type, props, key}); const jsxs = jsx;\n`;
const mod = await import('data:text/javascript;base64,' + Buffer.from(stubs + testSource).toString('base64'));
const window = used_percent => ({ label: 'Weekly', used_percent, scope: 'account' });
const provider = (accounts, slug = 'openai-codex') => mod.normalizeProvider({ slug, usage: { accounts } }, 'owner');
const profile = (name, providers, more = {}) => ({ name, key: name, connection: 'local', providers, ...more });

test('remaining accepts finite percentages only and preserves exact bounds', () => {
  assert.equal(mod.remaining(0), 100); assert.equal(mod.remaining(100), 0);
  assert.equal(mod.remaining(28.4), 71.6);
  for (const value of [undefined, null, '0', NaN, Infinity, -1, 101]) assert.equal(mod.remaining(value), null);
});
test('reset labels distinguish unknown, expired, and future values', () => {
  assert.match(mod.resetInfo(null, 0), /unknown|неизвестно/i);
  assert.match(mod.resetInfo('bad', 0), /unknown|неизвестно/i);
  assert.match(mod.resetInfo(0, 0), /passed|expired|прошло/i);
  assert.match(mod.resetInfo(3600000, 0), /1h 0m|1ч 0м/);
});
test('pooled account rows preserve identities and never merge endpoint observations', () => {
  const p = provider([{ id: 'synthetic-a', state: 'ready', windows: [window(20)] }, { id: 'synthetic-b', windows: [] }, { id: 'synthetic-a', state: 'limited', windows: [window(100)] }]);
  assert.equal(p.accounts.length, 3); assert.equal(p.accounts[0].windows[0].left, 80);
  assert.equal(p.accounts[2].windows[0].left, 0); assert.notEqual(p.accounts[0].key, p.accounts[2].key);
  assert.ok(p.accounts.every(account => !('id' in account)));
});
test('unknown quota stays unknown and model windows retain their scope', () => {
  const p = mod.normalizeProvider({ slug: 'synthetic-provider', usage: { windows: [{ ...window(null), scope: 'model' }] } }, 'profile');
  assert.equal(p.accounts[0].windows[0].left, null); assert.equal(p.accounts[0].windows[0].scope, 'model');
  assert.equal(mod.normalizeProvider({ slug: 'synthetic-empty' }, 'profile').accounts[0].windows.length, 0);
});
test('plan gauges preserve fractions and model scope', () => {
  const p = mod.normalizeProvider({ slug: 'synthetic-plan', plan_usage: { gauges: [{ label: 'week', left_fraction: 0.42, scope: 'top_tier', resets_at_ms: 1000 }] } }, 'profile');
  assert.deepEqual(p.accounts[0].windows, [{ label: 'Week', left: 42, resets: 1000, scope: 'model' }]);
});
test('observations remain separate across profiles and connections', () => {
  const p = provider([{ id: 'synthetic-id', windows: [window(40)] }]);
  assert.equal(mod.groupAccounts([profile('synthetic-profile-a', [p]), profile('synthetic-profile-b', [p])])[0].accounts.length, 2);
  assert.equal(mod.groupAccounts([profile('same', [p]), profile('same', [p], { connection: 'remote' })]).length, 2);
});
test('catalog failure keeps only visibly stale previous values', () => {
  const previous = { profiles: [profile('profile', [provider([])])] };
  const retained = mod.mergeSnapshots({ profiles: [profile('profile', [], { catalogFailed: true })] }, previous);
  assert.equal(retained.profiles[0].stale, true); assert.equal(retained.profiles[0].providers.length, 1);
  assert.equal(mod.mergeSnapshots({ profiles: [profile('profile', [])] }, previous).profiles[0].providers.length, 0);
});
test('poll interval stops while hidden and bounds bootstrap attempts', () => {
  assert.equal(mod.pollInterval(false, 0), false); assert.equal(mod.pollInterval(true, 0), 5000);
  assert.equal(mod.pollInterval(true, 3), 120000);
});
test('existing read cycle checks automatic recovery before reading updated catalog', async () => {
  const calls = [];
  const api = {request: async () => { calls.push('catalog'); return {providers: []}; }};
  const result = await mod.readCycle(api, 'default', 'local', {attempts: 0}, {
    currentOnly: true, reconcile: async () => { calls.push('reconcile'); return {status: 'checked', cleared: 1}; }
  });
  assert.deepEqual(calls, ['reconcile', 'catalog']);
  assert.equal(result.recovery.cleared, 1);
});
test('recovery failure preserves catalog reads and is explicitly unverified', async () => {
  const api = {request: async () => ({providers: []})};
  const result = await mod.readCycle(api, 'default', 'local', {attempts: 0}, {
    currentOnly: true, reconcile: async () => { throw new Error('synthetic secret'); }
  });
  assert.deepEqual(result.recovery, {status: 'unavailable'});
  assert.equal(result.profiles[0].catalogFailed, false);
  assert.ok(!JSON.stringify(result).includes('synthetic secret'));
});
test('automatic recovery never fans out to remote or sibling profiles or aborted reads', async () => {
  let writes = 0;
  const control = {currentOnly: true, reconcile: async () => { writes++; }};
  const api = {request: async () => ({providers: []})};
  for (const [name, connection] of [['other', 'local'], ['default', 'remote']])
    await mod.readCycle(api, name, connection, {attempts: 0}, control);
  await assert.rejects(mod.readCycle(api, 'default', 'local', {attempts: 0}, {
    ...control, signal: AbortSignal.abort()
  }), {name: 'AbortError'});
  assert.equal(writes, 0);
});
test('registered plugin uses authenticated POST and keeps existing polling in background', async () => {
  const calls = []; let dispose;
  mod.default.register({register() {}, i18n: {register() {}}, onDispose: fn => {dispose = fn;},
    rest: async (...args) => { calls.push(args); return {status: 'checked', cleared: 0}; }});
  const options = mod.queryOptionsForTest();
  assert.equal(options.refetchIntervalInBackground, true);
  await options.queryFn({signal: new AbortController().signal});
  assert.deepEqual(calls, [['/reconcile', {method: 'POST', timeoutMs: 45000}]]);
  const oldOptions = mod.queryOptionsForTest();
  mod.queryOptionsForTest('other');
  await assert.rejects(oldOptions.queryFn({signal: new AbortController().signal}), {name: 'AbortError'});
  assert.equal(calls.length, 1);
  dispose();
  await mod.queryOptionsForTest().queryFn({signal: new AbortController().signal});
  assert.equal(calls.length, 1);
});
test('pane registers a «Лимиты» tab enabled by default with English and Russian locales', () => {
  let contribution; let locales;
  mod.default.register({ register: value => { contribution = value; }, i18n: { register: value => { locales = value; } } });
  assert.equal(contribution.title, 'Limits'); assert.equal(contribution.area, 'panes');
  assert.equal(mod.default.id, 'limits-monitor'); assert.equal(mod.default.defaultEnabled, true);
  assert.equal(locales.en?.state?.locale, 'en-US'); assert.equal(locales.ru?.state?.locale, 'ru-RU');
  assert.equal(locales.ru?.pane?.heading, 'Лимиты аккаунтов');
});
test('snapshot accesses only profile roster and model catalog, never sessions or chat data', async () => {
  const calls = []; let rosterParams;
  const api = {
    request: async (method, params) => { calls.push(method); if (method === 'profiles.list') rosterParams = params; return { profiles: [{ name: 'default' }, { name: 'synthetic-bot' }] }; },
    profileRoutes: async () => ['default', 'synthetic-bot'].map(name => ({ connectionId: 'local', profile: name, targetProfile: name })),
    requestProfile: async (route, method) => {
      calls.push(method);
      if (route.profile === 'synthetic-bot') throw new Error('offline');
      assert.equal(method, 'model.options');
      return { providers: [{ slug: 'openai-codex', usage: { windows: [window(10)] } }] };
    },
  };
  const result = await mod.loadSnapshot(api, 'default', 'local');
  assert.equal(result.profiles.length, 2);
  assert.equal(result.profiles[0].providers[0].accounts[0].windows[0].left, 90);
  assert.equal(result.profiles[1].errors.length, 1);
  assert.deepEqual([...new Set(calls)].sort(), ['model.options', 'profiles.list']);
  assert.deepEqual(rosterParams, { include_sessions: false });
  assert.ok(!source.includes('session.active_list')); assert.ok(!source.includes('subagent.list'));
  assert.ok(result.profiles.every(p => !('sessions' in p) && !('children' in p)));
});
test('without routing, home catalog is never attributed to another profile', async () => {
  const calls = []; let catalogs = 0;
  const result = await mod.loadSnapshot({ request: async method => {
    calls.push(method);
    if (method === 'profiles.list') return { profiles: [{ name: 'default' }, { name: 'synthetic-bot' }] };
    if (method === 'model.options') { catalogs++; return { providers: [] }; }
    throw new Error('unexpected RPC');
  } }, 'default');
  assert.equal(catalogs, 1); assert.ok(result.profiles.find(p => p.name === 'synthetic-bot').errors.length);
  assert.ok(calls.every(method => ['profiles.list', 'model.options'].includes(method)));
});
test('malformed provider rows do not hide valid provider data', async () => {
  const result = await mod.loadSnapshot({
    request: async () => ({ profiles: [] }),
    profileRoutes: async () => [{ connectionId: 'local', profile: 'good', targetProfile: 'good' }],
    requestProfile: async () => ({ providers: [null, { slug: 'valid', usage: { windows: [null, window(12)] } }] }),
  }, 'default', 'local');
  assert.equal(result.profiles[0].errors.length, 1);
  assert.equal(result.profiles[0].providers[0].accounts[0].windows[0].left, 88);
});
test('aborted query launches no RPC', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(mod.loadSnapshot({ request: async () => { calls++; } }, 'default', '', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
});
test('disabling the real QueryObserver stops pending provider fan-out and preserves prior cache', async () => {
  const client = new QueryClient(); let unsubscribe; let release; let started;
  const pending = new Promise(resolve => { release = resolve; });
  const firstRequest = new Promise(resolve => { started = resolve; });
  let visible = true; const calls = []; const previous = { profiles: [] };
  const cache = { attempts: 0, previous };
  const api = { request: async method => {
    calls.push(method);
    if (method === 'profiles.list') return { profiles: [{ name: 'default' }] };
    if (method === 'model.options') { started(); await pending; return { providers: [] }; }
    throw new Error('unexpected RPC');
  } };
  const options = { queryKey: ['limits-lifecycle'], enabled: true, retry: false, gcTime: 0,
    queryFn: ({ signal }) => mod.readCycle(api, 'default', '', cache, { signal, isVisible: () => visible }) };
  const observer = new QueryObserver(client, options);
  unsubscribe = observer.subscribe(() => {});
  try {
    await firstRequest; visible = false; observer.setOptions({ ...options, enabled: false }); release();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual([...new Set(calls)].sort(), ['model.options', 'profiles.list']);
    assert.equal(cache.previous, previous); assert.equal(cache.attempts, 1);
    assert.equal(observer.getCurrentResult().fetchStatus, 'idle');
  } finally { unsubscribe?.(); client.clear(); }
});
test('repeated failed reads exhaust the short bootstrap budget', async () => {
  const cache = { attempts: 0, previous: null };
  const api = { request: async () => { throw new Error('offline'); } };
  for (let i = 0; i < 5; i++) await mod.readCycle(api, 'default', 'local', cache);
  assert.equal(cache.attempts, 5); assert.equal(mod.pollInterval(true, cache.attempts), 120000);
  assert.equal(cache.previous.profiles[0].catalogFailed, true);
});
test('source avoids credential files, private provider endpoints, direct storage and raw logging', () => {
  for (const forbidden of ['auth.json', 'api_key', '/backend-api/', 'localStorage', 'console.log', 'XMLHttpRequest']) assert.ok(!source.includes(forbidden), forbidden);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});
test('tiny positive remaining quota is not rounded to exhausted', () => {
  assert.ok(mod.remaining(99.99) > 0); assert.ok(mod.remaining(99.99) < 0.1);
});

test('status bar and pane register with Korean strings and scoped preference storage', () => {
  const contributions = []; const readKeys = []; let messages;
  mod.default.register({ register: value => { contributions.push(value); },
    i18n: { register: value => { messages = value; } },
    storage: { get: key => { readKeys.push(key); return null; }, set() {} },
    setInterval() {}, onDispose() {} });
  assert.equal(contributions.filter(c => c.area === 'statusBar.right').length, 1);
  assert.equal(contributions.filter(c => c.area === 'panes').length, 1);
  assert.equal(messages.ko.state.locale, 'ko-KR');
  assert.deepEqual(readKeys, ['presentation']);
  assert.ok(contributions.find(c => c.area === 'statusBar.right').render());
});

test('account pins stay stable on reordering, separate profile observations and store no labels', async () => {
  assert.equal(typeof mod.accountPins, 'function');
  const row = { slug: 'openai-codex', usage: { accounts: [{ id: 'fixture-a', label: 'a@example.test' }, { id: 'fixture-b', label: 'Work' }] } };
  const pins = await mod.accountPins(row, 'local:default');
  const reordered = await mod.accountPins({ ...row, usage: { accounts: [...row.usage.accounts].reverse() } }, 'local:default');
  assert.equal(pins[0], reordered[1]); assert.equal(pins[1], reordered[0]);
  assert.ok(pins.every(x => /^[a-f0-9]{64}$/.test(x)));
  assert.notEqual(pins[0], (await mod.accountPins(row, 'remote:default'))[0]);
  assert.deepEqual(mod.normalizePreferences({ hidden: [...pins, 'private@example.test'], maskEmails: false, token: 'never-store' }), { hidden: pins, maskEmails: false });
  assert.deepEqual(mod.normalizePreferences(null), { hidden: [], maskEmails: true });
  assert.equal(mod.displayLabel('name@example.test', true), 'n…@…');
  assert.equal(mod.displayLabel('Work', true), 'Work');
});

test('status-bar-only polling reads only the selected profile without roster or route fan-out', async () => {
  const calls = [];
  const api = {
    request: async (method, params) => { calls.push(method); return { providers: [{ slug: 'openai-codex', usage: { accounts: [] } }] }; },
    profileRoutes: async () => { calls.push('profileRoutes'); return []; },
    requestProfile: async () => { calls.push('requestProfile'); return { providers: [] }; },
  };
  const result = await mod.loadSnapshot(api, 'default', 'local', { currentOnly: true });
  assert.deepEqual(calls, ['model.options']);
  assert.deepEqual(result.profiles.map(p => [p.connection, p.name]), [['local', 'default']]);
});

test('snapshot pins and status rows keep two accounts in their exact profile and connection', async () => {
  const row = { slug: 'openai-codex', authenticated: true, usage: { accounts: [
    { id: 'fixture-a', label: 'Main', state: 'ready', windows: [window(20)] },
    { id: 'fixture-b', label: 'Second', state: 'ready', windows: [window(60)] },
  ] } };
  const data = await mod.loadSnapshot({ request: async method => method === 'profiles.list'
    ? { profiles: [{ name: 'default' }] } : { providers: [row] } }, 'default', 'local');
  assert.match(data.profiles[0].providers[0].accounts[0].pin || '', /^[a-f0-9]{64}$/);
  assert.equal(typeof mod.statusRows, 'function');
  const rows = mod.statusRows(data, 'default', 'local');
  assert.equal(rows.length, 2); assert.notEqual(rows[0].pin, rows[1].pin);
  assert.deepEqual(rows.map(a => a.windows[0].left), [80, 40]);
  assert.equal(mod.statusRows(data, 'other', 'local').length, 0);
  assert.equal(mod.statusRows(data, 'default', 'remote').length, 0);
  assert.ok(rows.every(a => a.readAt > 0 && a.provider === 'openai-codex'));
});

test('original pane marks retained account values stale on disconnect or query error', () => {
  const data = { readAt: Date.now(), profiles: [profile('default', [provider([{ label: 'Main', state: 'ready', windows: [window(20)] }])], {readAt: Date.now(), errors: []})] };
  for (const [gateway, isError, expected] of [['open', false, false], ['closed', false, true], ['open', true, true]]) {
    const pane = mod.renderPaneForTest(data, gateway, isError);
    const card = pane.props.children.flat().find(child => child?.type?.name === 'ProviderCard');
    assert.ok(card, 'the original provider card must remain available');
    assert.equal(card.props.group.accounts[0].stale, expected, `${gateway}, error=${isError}`);
  }
  assert.equal(data.profiles[0].stale, undefined, 'rendering must not mutate the cached snapshot');
});

test('status bar shows only provider, account name and percentage or Limited', () => {
  const data = { readAt: Date.now(), profiles: [profile('default', [provider([
    { label: 'Main', state: 'ready', windows: [window(20)] },
    { label: 'Second', state: 'limited', windows: [window(100)] },
  ])], { readAt: Date.now(), errors: [] })] };
  const popover = mod.renderStatusBarForTest(data);
  const button = popover.props.children.find(child => child.type === 'trigger').props.children;
  const visible = button.props.children.flat().filter(Boolean).map(child => child.props.children);
  assert.deepEqual(visible, ['Codex · Main · 80%', 'Codex · Second · Limited']);
});

test('compact quota distinguishes zero, tiny positive values and unverified data', () => {
  for (const { state = 'ready', used = 20, gateway = 'open', isError = false, age = 0, expected } of [
    { used: 100, expected: 'Limited' },
    { used: 99.99, expected: '<0.1%' },
    { state: 'limited', expected: 'Limited' },
    { state: 'unknown', expected: '—' },
    { state: 'unavailable', expected: '—' },
    { gateway: 'closed', expected: '—' },
    { isError: true, expected: '—' },
    { age: 300001, expected: '—' },
  ]) {
    const data = { readAt: Date.now(), profiles: [profile('default', [provider([
      { label: 'Main', state, windows: [window(used)] },
    ])], { readAt: Date.now() - age, errors: [] })] };
    const popover = mod.renderStatusBarForTest(data, gateway, isError);
    const button = popover.props.children.find(child => child.type === 'trigger').props.children;
    const chip = button.props.children.flat().find(child => child?.props?.['data-limits-account'] === 'chip');
    assert.equal(chip.props.children, `Codex · Main · ${expected}`, JSON.stringify({ state, used, gateway, isError, age }));
  }
});

test('status bar keeps selected account triples without an extra overflow counter', () => {
  const accounts = Array.from({ length: 4 }, (_, i) => ({ label: `Account-${i}`, state: 'ready', windows: [window(20)] }));
  const data = { profiles: [profile('default', [provider(accounts)], { readAt: Date.now(), errors: [] })] };
  const popover = mod.renderStatusBarForTest(data);
  const button = popover.props.children.find(child => child.type === 'trigger').props.children;
  const visible = button.props.children.flat().filter(Boolean).map(child => child.props.children);
  assert.deepEqual(visible, accounts.map(account => `Codex · ${account.label} · 80%`));
});

test('automatic check failures appear in details without changing compact account chips', () => {
  for (const recovery of [{status: 'unavailable'}, {status: 'checked', errors: 1}]) {
    const data = {recovery, profiles: [profile('default', [provider([
      {label: 'Main', state: 'ready', windows: [window(20)]}
    ])], {readAt: Date.now(), errors: []})]};
    const popover = mod.renderStatusBarForTest(data);
    const content = popover.props.children.find(x => x.type === 'content');
    assert.ok(content.props.children.flat().some(x => x?.props?.children === 'error.recovery'));
    const pane = mod.renderPaneForTest(data, 'open');
    assert.ok(pane.props.children.flat().some(x => x?.props?.children === 'error.recovery'));
    const chip = popover.props.children.find(x => x.type === 'trigger').props.children.props.children.flat().find(Boolean);
    assert.equal(chip.props.children, 'Codex · Main · 80%');
  }
});
test('raw runtime entrypoint only imports modules supported by the Hermes loader', () => {
  const modules = [...source.matchAll(/^import .*? from ['"]([^'"]+)['"]/gm)].map(match => match[1]);
  assert.deepEqual(modules, ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime']);
  assert.doesNotMatch(source, /\bimport\s*\(/);
});

test('status summary uses the tightest account window, never sums accounts or model quotas', () => {
  assert.equal(typeof mod.accountSummary, 'function');
  const account = { state: 'ready', windows: [
    { label: 'Session', left: 80, scope: 'account', resets: 10000 },
    { label: 'Weekly', left: 25, scope: 'account', resets: 20000 },
    { label: 'Spark', left: 0, scope: 'model', resets: 10000 },
  ] };
  assert.deepEqual(mod.accountSummary(account, 1000), { kind: 'ready', window: account.windows[1] });
  assert.equal(mod.accountSummary({ ...account, windows: [{ left: 5, scope: 'account' }] }, 1000).kind, 'low');
  assert.equal(mod.accountSummary({ ...account, windows: [{ left: 0, scope: 'account' }] }, 1000).kind, 'exhausted');
  for (const value of [
    { ...account, state: 'unknown' }, { ...account, state: 'unavailable' },
    { ...account, stale: true }, { ...account, authenticated: false },
    { ...account, windows: [{ left: null, scope: 'account' }] },
    { ...account, windows: [{ left: 80, scope: 'account', resets: 500 }] },
  ]) assert.equal(mod.accountSummary(value, 1000).window, null);
});

test('conversation usage pane queries the selected profile and renders reported usage', async () => {
  assert.equal(typeof mod.usageQueryOptionsForTest, 'function', 'usage query is not implemented yet');
  const options = mod.usageQueryOptionsForTest('profile-a', 'connection-a', 0);
  assert.deepEqual(options.queryKey, ['limits-monitor-usage', 'connection-a', 'profile-a', 0]);
  assert.equal(options.enabled, true); assert.equal(options.refetchInterval, 30000);
  let call;
  await options.queryFn({ signal: new AbortController().signal });
  call = mod.lastUsageRequestForTest();
  assert.deepEqual(call, ['plugin.limits-monitor.usage.list', { limit: 25, offset: 0 }]);
  const row = { session_id: 'fixture-session', conversation_id: null, calls: 2, successful: 1, failed: 1, pending: 0,
    reported_calls: 1, usage_unreported: 1, reported_total_tokens: 0, known_prompt_tokens: 0, known_output_tokens: null,
    providers: ['openai-codex'], models: ['gpt-test'], first_started_at: 100, last_observed_at: 200 };
  const tree = mod.renderUsageForTest({ rows: [row], collection_started_at: 90, last_observed_at: 200, read_at: 210 }, 'open');
  const flatten = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : node?.props ? flatten(node.props.children) : '';
  const visible = flatten(tree);
  for (const expected of ['fixture-session', '대화별 보고된 사용량', '0', '미보고', '계정 한도 사용률: 미측정', '요청별 계정 및 한도 구간 출처 정보']) assert.ok(visible.includes(expected), expected);
});

test('usage query is keyed by selected connection, profile and offset; abort and scope changes reject results', async () => {
  const options = mod.usageQueryOptionsForTest('profile-b', 'connection-b', 25);
  assert.deepEqual(options.queryKey, ['limits-monitor-usage', 'connection-b', 'profile-b', 25]);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(options.queryFn({signal:aborted.signal}), {name:'AbortError'});
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  mod.setUsageRequestForTest(async () => pending);
  const request = options.queryFn({signal:new AbortController().signal});
  mod.setUsageStateForTest('profile-a','connection-b'); release({rows:[{session_id:'old-profile'}]});
  await assert.rejects(request, {name:'AbortError'});
});

test('usage loading, empty, offline and failed polls do not present stale totals as current', () => {
  const empty = mod.renderUsageForTest({rows:[]});
  const flatten = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : node?.props ? flatten(node.props.children) : '';
  assert.match(flatten(empty), /관찰된 대화 사용량이 없습니다/);
  const loading = flatten(mod.renderUsageForTest(undefined, 'open', {isPending:true}));
  assert.match(loading, /대화 사용량 조회 중/);
  const offline = flatten(mod.renderUsageForTest(undefined, 'closed'));
  assert.match(offline, /Hermes 연결 중에만 사용량을 조회할 수 있습니다/);
  const stale = flatten(mod.renderUsageForTest({rows:[{session_id:'old',reported_total_tokens:999}]}, 'open', {isError:true}));
  assert.match(stale, /이전 결과는 오래된 값/); assert.doesNotMatch(stale, /999/);
});

test('usage UI preserves null versus known zero and counts; pagination is bounded', () => {
  const rows = Array.from({length:25}, (_,i) => ({session_id:`row-${i}`,calls:2,successful:1,failed:1,pending:0,reported_calls:1,
    usage_unreported:1,reported_total_tokens:i ? null : 0,known_prompt_tokens:i ? null : 0,known_output_tokens:null,providers:[],models:[]}));
  const tree = mod.renderUsageForTest({rows});
  const flatten = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : node?.props ? flatten(node.props.children) : '';
  const shown = flatten(tree);
  assert.match(shown, /Reported token subtotal: 0/); assert.match(shown, /Reported token subtotal: 미보고/);
  assert.match(shown, /successful: 1/); assert.match(shown, /failed: 1/); assert.match(shown, /pending: 0/);
  const buttons = tree.props.children[0].props.children.at(-1).props.children;
  assert.equal(buttons[0].props.disabled, true); assert.equal(buttons[1].props.disabled, false);
  const short = mod.renderUsageForTest({rows:rows.slice(0,24)});
  assert.equal(short.props.children[0].props.children.at(-1).props.children[1].props.disabled, true);
  const capped = mod.renderUsageForTest({rows}, 'open', {}, 10000);
  assert.equal(capped.props.children[0].props.children.at(-1).props.children[1].props.disabled, true);
  const fetching = mod.renderUsageForTest({rows}, 'open', {isFetching:true});
  assert.equal(fetching.props.children[0].props.children.at(-1).props.children[1].props.disabled, true);
  const offline = mod.renderUsageForTest({rows}, 'closed');
  assert.equal(offline.props.children[0].props.children.at(-1).props.children[1].props.disabled, true);
});

test('unattributed sessions have a clear Korean label and diagnostics mark partial collection', () => {
  const tree = mod.renderUsageForTest({rows:[{session_id:null,conversation_id:null,calls:1,successful:0,failed:1,pending:0,
    reported_calls:0,usage_unreported:1,providers:[],models:[]}],diagnostics:{dropped_events:2,storage_failures:1}});
  const flatten = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : node?.props ? flatten(node.props.children) : '';
  const visible = flatten(tree);
  assert.match(visible, /귀속 불명/); assert.match(visible, /부분 수집: 이벤트 2건 누락, 저장 실패 1건/);
  assert.doesNotMatch(visible, /Unattributed/);
});

test('status popover contains current-chat totals and keeps the compact chip unchanged', () => {
  const data = {profiles:[profile('default',[provider([{label:'Main',windows:[window(20)]}])],{readAt:Date.now(),errors:[]})]};
  const tree = mod.renderStatusBarForTest(data);
  const flatten = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : node?.props ? flatten(node.props.children) : '';
  const content = tree.props.children.find(item=>item.type==='content');
  assert.ok(content.props.children.some(item => item?.type?.name === 'CurrentChatSummary'));
  const summary = mod.renderChatSummaryForTest({rows:[{session_id:'chat-a',calls:3,reported_total_tokens:1200,known_prompt_tokens:900,known_output_tokens:300}]});
  const summaryText = summary.props.children.map(item=>item?.props?.children).join(' ');
  assert.match(summaryText,/usage.current/); assert.match(summaryText,/3/); assert.match(summaryText,/1,200/);
  const chip = tree.props.children.find(item=>item.type==='trigger').props.children.props.children.flat().find(Boolean);
  assert.equal(chip.props.children,'Codex · Main · 80%');
});

test('current-chat row matches explicit segment membership in filtered response', () => {
  mod.setChatScopeForTest('synthetic-session-a','local','default');
  const summary = mod.renderChatSummaryForTest({rows:[{session_id:'synthetic-conversation-a',segment_session_ids:['synthetic-session-a'],calls:3,reported_total_tokens:40,known_prompt_tokens:30,known_output_tokens:10}]});
  const flatten = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : node?.props ? flatten(node.props.children) : '';
  assert.match(flatten(summary), /3.*40.*30.*10/);
});

test('current-chat atom reads stay stable when focus moves from transient to stored session', () => {
  mod.setChatScopeForTest('', 'local', 'default');
  const before = mod.chatHookReadsForTest();
  mod.setChatScopeForTest('durable-session', 'local', 'default');
  const after = mod.chatHookReadsForTest();
  assert.equal(after, before, `hook count changed ${before} -> ${after}`);
  assert.ok(before >= 4);
});

test('disabled current-chat queries do not claim to be loading', () => {
  mod.setChatScopeForTest('', null, null);
  const summary = mod.renderChatSummaryForTest(undefined, {isPending:true,fetchStatus:'idle'});
  const flatten = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : node?.props ? flatten(node.props.children) : '';
  assert.match(flatten(summary), /현재 대화 식별 정보를 확인할 수 없습니다/);
  assert.doesNotMatch(flatten(summary), /대화 사용량 조회 중/);
});

test('current-chat usage query scopes cache and RPC to focused owner and session', async () => {
  mod.setChatScopeForTest('chat-a','local','default');
  mod.setUsageRequestForTest(async (...args) => { globalThis.__chatRequest=args; return {rows:[]}; });
  const options = mod.currentChatOptionsForTest(true);
  assert.deepEqual(options.queryKey,['limits-monitor-current-chat','local','default','chat-a']);
  assert.equal(options.enabled,true); assert.equal(options.refetchInterval,30000);
  await options.queryFn({signal:new AbortController().signal});
  assert.deepEqual(globalThis.__chatRequest,['plugin.limits-monitor.usage.list',{session_id:'chat-a',limit:25,offset:0}]);
  assert.equal(mod.currentChatOptionsForTest(false).enabled,false);
});

test('current-chat scope transitions invalidate old requests and unknown owners stay disabled', async () => {
  mod.setChatScopeForTest('chat-old','local','default');
  const old = mod.currentChatOptionsForTest(true);
  mod.setChatScopeForTest('chat-new','connection-b','profile-b');
  await assert.rejects(old.queryFn({signal:new AbortController().signal}), {name:'AbortError'});
  const current = mod.currentChatOptionsForTest(true);
  assert.deepEqual(current.queryKey,['limits-monitor-current-chat','connection-b','profile-b','chat-new']);
  mod.setChatScopeForTest('',null,null);
  assert.equal(mod.currentChatOptionsForTest(true).enabled,false);
  mod.setChatScopeForTest('chat-a','local','default','closed');
  assert.equal(mod.currentChatOptionsForTest(true).enabled,false);
});
