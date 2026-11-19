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
export function setPresentationForTest(value) { preferences.set(normalizePreferences(value)); }
export function resetPreferencesForTest() { preferences.set(normalizePreferences(null)); storageError.set(false); }
export function renderStatusBarForTest(data, gateway = 'open', isError = false, renderTick = Date.now()) {
  host.state = {profile: atom('default'), connectionId: atom('local'), gateway: atom(gateway), focusedStoredSessionId: atom('chat-a'), focusedSessionOwner: atom({connectionId:'local',profile:'default'})};
  renderQuery = {data, isError, isPending: false, isFetching: false};
  clock.set(renderTick);
  try { return LimitsStatusBar(); } finally { renderQuery = null; }
}
export function renderAccountCardForTest(account, renderTick = Date.now()) {
  clock.set(renderTick);
  try { return AccountCard({account, t:key=>key}); } finally { renderQuery = null; }
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
export function renderChatSummaryForTest(data, flags={}) { renderQuery = {data,isError:false,isPending:false,isFetching:false,...flags}; try { return CurrentChatSummary({open:true,t:key=>({'state.locale':'ko-KR','usage.loading':'대화 사용량 조회 중…','usage.chatUnknown':'선택된 대화를 확인할 수 없습니다.','usage.chatError':'이 대화의 사용량을 불러오지 못했습니다.','usage.chatEmpty':'이 대화에 보고된 사용량이 아직 없습니다.','usage.loading':'대화 사용량 조회 중…','usage.offline':'Hermes 연결 중에만 사용량을 조회할 수 있습니다.'}[key]||key)}); } finally { renderQuery=null; } }
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
const stubs = `const host = {}; let renderQuery; let lastUsageRequest; let hookReads=0; const useValue = x => {hookReads++; return x.get();}; const useQuery = x => renderQuery || x; const queryClient = {getQueryData: () => null}; const atom = value => ({get: () => value, set: next => {value = next;}}); const Button = 'button'; const Checkbox = 'checkbox'; const Popover = 'popover'; const PopoverTrigger = 'trigger'; const PopoverContent = 'content'; const useRef = current => ({current}); const useState = value => [value, () => {}]; const useEffect = () => {}; const usePluginI18n = () => key => ({'state.locale':'ko-KR'})[key] || key; host.request = async (...args) => { lastUsageRequest = args; return {rows:[]}; }; const jsx = (type, props, key) => ({type, props, key}); const jsxs = jsx;\n`;
const mod = await import('data:text/javascript;base64,' + Buffer.from(stubs + testSource).toString('base64'));
const flattenTest = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(flattenTest).join(' ') : node?.props ? flattenTest(node.props.children) : '';
const nodesTest = node => Array.isArray(node) ? node.flatMap(nodesTest) : node?.props ? [node, ...nodesTest(node.props.children)] : [];
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

test('status bar and pane register with Korean strings and presentation-only preference storage', () => {
  const contributions = []; const readKeys = []; let messages;
  mod.default.register({ register: value => { contributions.push(value); },
    i18n: { register: value => { messages = value; } },
    storage: { get: key => { readKeys.push(key); return null; }, set() {} },
    setInterval() {}, onDispose() {} });
  assert.equal(contributions.filter(c => c.area === 'statusBar.right').length, 1);
  assert.equal(contributions.filter(c => c.area === 'panes').length, 1);
  assert.equal(messages.ko.state.locale, 'ko-KR');
  assert.equal(messages.en.bar.display, 'Display shape');
  assert.deepEqual([messages.en.bar.percent, messages.en.bar.graph, messages.en.bar.circle], ['Percentage', 'Bar graph', 'Circular graph']);
  assert.equal(messages.ko.bar.display, '표시 모양');
  assert.deepEqual([messages.ko.bar.percent, messages.ko.bar.graph, messages.ko.bar.circle], ['퍼센트', '막대 그래프', '원형 그래프']);
  assert.deepEqual(readKeys, ['presentation']);
  assert.ok(contributions.find(c => c.area === 'statusBar.right').render());
});

test('presentation normalization preserves valid hidden pins and supported shapes only', () => {
  const first='a'.repeat(64), second='b'.repeat(64);
  assert.deepEqual(mod.normalizePreferences({ hidden:[first,second,first,'private@example.test','G'.repeat(64),null],
    maskEmails:false,statusBarDisplay:'graph',token:'never-store',extra:true }),
  { hidden:[first,second], statusBarDisplay:'graph' });
  assert.deepEqual(mod.normalizePreferences({ hidden:[first],maskEmails:false,statusBarDisplay:'percent' }),
    { hidden:[first], statusBarDisplay:'percent' });
  assert.deepEqual(mod.normalizePreferences({ hidden:['private@example.test'],statusBarDisplay:'circle',unknown:true }),
    { hidden:[], statusBarDisplay:'circle' });
  assert.deepEqual(mod.normalizePreferences(null), { hidden:[], statusBarDisplay:'percent' });
  assert.deepEqual(mod.normalizePreferences({ statusBarDisplay:'bars' }), { hidden:[], statusBarDisplay:'percent' });
  const ids=Array.from({length:513},(_,index)=>String(index).padStart(64,'0'));
  assert.equal(mod.normalizePreferences({hidden:ids}).hidden.length,512);
});

test('account pins stay stable on reordering, separate profile observations and store no labels', async () => {
  assert.equal(typeof mod.accountPins, 'function');
  const row = { slug: 'openai-codex', usage: { accounts: [{ id: 'fixture-a', label: 'a@example.test' }, { id: 'fixture-b', label: 'Work' }] } };
  const profileKey=JSON.stringify(['local','default']);
  const pins = await mod.accountPins(row, profileKey);
  const reordered = await mod.accountPins({ ...row, usage: { accounts: [...row.usage.accounts].reverse() } }, profileKey);
  assert.equal(pins[0], reordered[1]); assert.equal(pins[1], reordered[0]);
  assert.ok(pins.every(x => /^[a-f0-9]{64}$/.test(x)));
  assert.notEqual(pins[0], (await mod.accountPins(row, JSON.stringify(['remote','default'])))[0]);
  assert.notEqual(pins[0], (await mod.accountPins(row, JSON.stringify(['local','other'])))[0]);
  assert.deepEqual(mod.normalizePreferences({ hidden:[...pins,'private@example.test',pins[0]],maskEmails:false,token:'never-store' }),
    { hidden:pins, statusBarDisplay:'percent' });
  assert.deepEqual(mod.normalizePreferences(null), { hidden:[], statusBarDisplay:'percent' });
  assert.equal(mod.displayLabel('name@example.test', true), 'n…@…');
  assert.equal(mod.displayLabel('Work', true), 'Work');
});

test('percent, bar and circle modes render truthful text and accessible gauges', () => {
  const render = used => mod.renderStatusBarForTest({profiles:[profile('default',[provider([{label:'Synthetic',windows:[window(used)]}])],{readAt:Date.now(),errors:[]})]});
  const chipOf = tree => tree.props.children.find(x=>x.type==='trigger').props.children.props.children
    .flat().find(x=>x?.props?.['data-limits-account']==='chip');
  mod.setPresentationForTest({statusBarDisplay:'percent'});
  assert.match(flattenTest(chipOf(render(20))), /Codex · Synthetic\s+·\s+80%/);
  assert.doesNotMatch(JSON.stringify(chipOf(render(20))), /progressbar/);
  mod.setPresentationForTest({statusBarDisplay:'graph'});
  let gauge = chipOf(render(20)).props.children[2];
  assert.equal(gauge.type,'span'); assert.equal(gauge.props.role,'progressbar');
  assert.equal(gauge.props['aria-valuenow'],80); assert.equal(gauge.props['aria-valuemin'],0); assert.equal(gauge.props['aria-valuemax'],100);
  assert.equal(gauge.props['aria-valuetext'],'80% state.allowance'); assert.equal(gauge.props.title,'80% state.allowance');
  assert.equal(gauge.props.children.props.style.width,'35.2px');
  gauge = chipOf(render(99.99999)).props.children[2];
  assert.ok(gauge.props['aria-valuenow'] > 0); assert.equal(gauge.props.children.props.style.width,'1px');
  assert.equal(gauge.props['aria-valuetext'],'<0.1% state.allowance'); assert.equal(gauge.props.title,'<0.1% state.allowance');
  mod.setPresentationForTest({statusBarDisplay:'circle'});
  gauge = chipOf(render(20)).props.children[2];
  assert.equal(gauge.type,'svg'); assert.equal(gauge.props.role,'progressbar');
  assert.equal(gauge.props['aria-valuenow'],80); assert.equal(gauge.props['aria-valuemin'],0); assert.equal(gauge.props['aria-valuemax'],100);
  assert.equal(gauge.props['aria-valuetext'],'80% state.allowance'); assert.equal(gauge.props.title,'80% state.allowance');
  assert.equal(gauge.props.width,16); assert.equal(gauge.props.height,16);
  assert.equal(gauge.props.children[1].props.pathLength,100); assert.equal(gauge.props.children[1].props.strokeDasharray,'80 100');
  gauge = chipOf(render(99.99999)).props.children[2];
  assert.ok(gauge.props['aria-valuenow'] > 0); assert.equal(gauge.props.children[1].props.strokeDasharray,'1 100');
  assert.equal(gauge.props['aria-valuetext'],'<0.1% state.allowance'); assert.equal(gauge.props.title,'<0.1% state.allowance');
  mod.setPresentationForTest(null);
});

test('graph modes omit gauges for limited and every unverified account state', () => {
  for (const {state='ready',used=20,windows,gateway='open',isError=false,age=0,expected} of [
    {state:'limited',used:100,expected:'Limited'}, {state:'unknown',expected:'—'}, {state:'unavailable',expected:'—'},
    {state:'ready',windows:[],expected:'—'}, {state:'ready',windows:[{scope:'account',used_percent:null}],expected:'—'},
    {state:'ready',windows:[{scope:'account',used_percent:101}],expected:'—'},
    {state:'ready',windows:[{scope:'account',used_percent:20,resets_at:new Date(Date.now()-1000).toISOString()}],expected:'—'},
    {gateway:'closed',expected:'—'}, {isError:true,expected:'—'}, {age:300001,expected:'—'},
    {state:'ready',used:20,expected:'80%'},
  ]) for (const mode of ['graph','circle']) {
    mod.setPresentationForTest({statusBarDisplay:mode});
    const data={profiles:[profile('default',[provider([{label:'Synthetic',state,windows:windows || [window(used)]}])],{readAt:Date.now()-age,errors:[]})]};
    const tree=mod.renderStatusBarForTest(data,gateway,isError); const button=tree.props.children.find(x=>x.type==='trigger').props.children;
    const chip=button.props.children.flat().find(x=>x?.props?.['data-limits-account']==='chip');
    assert.equal(chip.props['aria-label'].endsWith(expected),true,JSON.stringify({state,used,gateway,isError,age,mode}));
    assert.equal(chip.props.children[2]?.props?.role==='progressbar',expected==='80%',`${mode}: ${expected}`);
  }
  mod.setPresentationForTest({statusBarDisplay:'circle'});
  for (const readAt of [undefined,null,0,NaN,Infinity,Date.now()+10000]) {
    const data={profiles:[profile('default',[provider([{label:'Synthetic',windows:[window(20)]}])],{readAt,errors:[]})]};
    const tree=mod.renderStatusBarForTest(data); const button=tree.props.children.find(x=>x.type==='trigger').props.children;
    const chip=button.props.children.flat().find(x=>x?.props?.['data-limits-account']==='chip');
    assert.ok(chip.props.children[2]?.type !== 'svg',`invalid readAt ${String(readAt)} rendered a gauge`);
    assert.ok(chip.props['aria-label'].endsWith('—'),`invalid readAt ${String(readAt)} rendered ${chip.props['aria-label']}`);
  }
  mod.setPresentationForTest(null);
});

test('fresh quota is not marked stale when the subscribed render clock lags the read timestamp', () => {
  const readAt=Date.now(); const staleTick=readAt-300001;
  const data={profiles:[profile('default',[provider([{label:'Synthetic',windows:[window(20)]}])],{readAt,errors:[]})]};
  const account={state:'ready',label:'Synthetic',profiles:['default'],windows:[{scope:'account',left:80,resets:null}],readAt,stale:false,authenticated:true};
  try {
    for (const [mode, expectedGauge] of [['percent',false],['graph',true],['circle',true]]) {
      mod.setPresentationForTest({statusBarDisplay:mode});
      const tree=mod.renderStatusBarForTest(data,'open',false,staleTick);
      const button=tree.props.children.find(x=>x.type==='trigger').props.children;
      const chip=button.props.children.flat().find(x=>x?.props?.['data-limits-account']==='chip');
      assert.match(chip.props['aria-label'],/80%$/,`${mode} should use the current wall clock`);
      assert.equal(chip.props.children[2]?.props?.role==='progressbar' || chip.props.children[2]?.props?.type==='svg',expectedGauge,mode);
    }
    const card=mod.renderAccountCardForTest(account,staleTick);
    assert.equal(nodesTest(card).some(node=>node.props.role==='status'&&node.props.children==='state.stale'),false);
  } finally {
    mod.setPresentationForTest(null);
    mod.renderAccountCardForTest(account);
  }
});

test('shape and account selectors preserve each other, retain rows when all are hidden, and report storage failure', async () => {
  const raw = {slug:'openai-codex',usage:{accounts:[
    {id:'fixture-email-a',label:'synthetic.user@example.invalid',state:'ready',windows:[window(20)]},
    {id:'fixture-email-b',label:'other.user@example.invalid',state:'ready',windows:[window(40)]},
  ]}};
  const pins = await mod.accountPins(raw, JSON.stringify(['local','default']));
  const accounts = mod.normalizeProvider(raw).accounts;
  accounts.forEach((account,index) => { account.pin = pins[index]; });
  let stored = {hidden:[pins[1]],maskEmails:false,statusBarDisplay:'percent',unknown:'must not persist'};
  const writes = [];
  const ctx = {register(){},i18n:{register(){}},storage:{get:key=>key==='presentation'?structuredClone(stored):null,
    set:(key,value)=>{assert.equal(key,'presentation');writes.push(structuredClone(value));stored=structuredClone(value);}},setInterval(){},onDispose(){}};
  const chipsOf=tree=>tree.props.children.find(x=>x.type==='trigger').props.children.props.children.flat()
    .filter(x=>x?.props?.['data-limits-account']==='chip');
  try {
    mod.default.register(ctx);
    const data={readAt:Date.now(),profiles:[profile('default',[{...mod.normalizeProvider(raw),accounts}],{readAt:Date.now(),errors:[]})]};
    let tree=mod.renderStatusBarForTest(data); let content=tree.props.children.find(x=>x.type==='content');
    const controlsIn=content=>nodesTest(content).filter(x=>x.type==='checkbox');
    const group=nodesTest(content).find(x=>x?.props?.role==='group');
    assert.equal(group.props['aria-label'],'bar.display');
    let shapes=group.props.children.map(label=>label.props.children[0]);
    assert.deepEqual(shapes.map(control=>control.props['aria-label']),['bar.percent','bar.graph','bar.circle']);
    assert.deepEqual(shapes.map(control=>control.props.checked),[true,false,false]);
    let selectors=controlsIn(content).filter(control=>control.props['aria-label']?.startsWith('bar.pin:'));
    assert.equal(controlsIn(content).length,5);
    assert.equal(nodesTest(content).filter(x=>x.type==='section').length,2);
    assert.deepEqual(selectors.map(control=>control.props.checked),[true,false]);
    assert.match(selectors[0].props['aria-label'],/s…@…/);
    assert.match(selectors[1].props['aria-label'],/o…@…/);
    assert.equal(chipsOf(tree).length,1);
    assert.match(flattenTest(chipsOf(tree)),/s…@…/);
    assert.doesNotMatch(flattenTest(chipsOf(tree)),/Synthetic zero|synthetic\.user@example\.invalid/);
    assert.equal(content.props.children.filter(x=>x?.props?.role==='status'&&x.props.children==='bar.saveError').length,0);
    assert.equal(shapes[0].props['aria-pressed'],undefined);
    shapes[0].props.onCheckedChange(false);
    assert.equal(writes.length,0);

    shapes[2].props.onCheckedChange(true);
    assert.deepEqual(stored,{hidden:[pins[1]],statusBarDisplay:'circle'});
    selectors[1].props.onCheckedChange(true);
    assert.deepEqual(stored,{hidden:[],statusBarDisplay:'circle'});
    selectors[0].props.onCheckedChange(false);
    selectors[1].props.onCheckedChange(false);
    assert.deepEqual(stored,{hidden:[pins[1],pins[0]],statusBarDisplay:'circle'});

    tree=mod.renderStatusBarForTest(data); content=tree.props.children.find(x=>x.type==='content');
    selectors=controlsIn(content).filter(control=>control.props['aria-label']?.startsWith('bar.pin:'));
    assert.equal(chipsOf(tree).length,0);
    assert.match(flattenTest(tree.props.children.find(x=>x.type==='trigger')),/bar.empty/);
    assert.equal(nodesTest(content).filter(x=>x.type==='section').length,2);
    assert.equal(selectors.length,2);
    assert.deepEqual(selectors.map(control=>control.props.checked),[false,false]);
    selectors[0].props.onCheckedChange(true);
    assert.deepEqual(stored,{hidden:[pins[1]],statusBarDisplay:'circle'});

    mod.default.register(ctx);
    tree=mod.renderStatusBarForTest(data); content=tree.props.children.find(x=>x.type==='content');
    shapes=nodesTest(content).find(x=>x?.props?.role==='group').props.children.map(label=>label.props.children[0]);
    selectors=controlsIn(content).filter(control=>control.props['aria-label']?.startsWith('bar.pin:'));
    assert.deepEqual(shapes.map(control=>control.props.checked),[false,false,true]);
    assert.deepEqual(selectors.map(control=>control.props.checked),[true,false]);
    assert.equal(chipsOf(tree).length,1);
    selectors[1].props.onCheckedChange(true);
    assert.deepEqual(stored,{hidden:[],statusBarDisplay:'circle'});
    shapes[1].props.onCheckedChange(true);
    assert.deepEqual(stored,{hidden:[],statusBarDisplay:'graph'});

    const unpinnedData={profiles:[profile('default',[{slug:'openai-codex',name:'Codex',accounts:[{key:'unhashed',label:'Unpinned',windows:[],state:'unknown'}]}],{readAt:Date.now(),errors:[]})]};
    content=mod.renderStatusBarForTest(unpinnedData).props.children.find(x=>x.type==='content');
    const unpinned=controlsIn(content).find(control=>control.props['aria-label']?.startsWith('bar.pin:'));
    assert.equal(unpinned.props.disabled,true);

    mod.default.register({...ctx,storage:{get:()=>stored,set(){throw new Error('synthetic storage failure');}}});
    tree=mod.renderStatusBarForTest(data); content=tree.props.children.find(x=>x.type==='content');
    nodesTest(content).find(x=>x?.props?.role==='group').props.children[0].props.children[0].props.onCheckedChange(true);
    content=mod.renderStatusBarForTest(data).props.children.find(x=>x.type==='content');
    assert.ok(content.props.children.some(x=>x?.props?.role==='status'&&x.props.children==='bar.saveError'));
  } finally {
    mod.default.register(ctx);
    mod.resetPreferencesForTest();
  }
});

test('both surfaces keep the concise catalog read and remove obsolete freshness/scope content and tooltip', () => {
  const data={readAt:Date.now(),profiles:[profile('default',[provider([])],{readAt:Date.now(),errors:[]})]};
  const tree=mod.renderStatusBarForTest(data); const content=tree.props.children.find(x=>x.type==='content');
  assert.match(flattenTest(content.props.children[0]),/bar.readAt/);
  assert.equal(content.props.children.filter(x=>flattenTest(x).includes('pane.heading')).length,0);
  const pane=mod.renderPaneForTest(data,'open');
  assert.equal(pane.props['aria-label'],'pane.title');
  assert.equal(pane.props.children.flat().filter(x=>flattenTest(x).includes('pane.heading')).length,0);
  const statusButton=tree.props.children.find(x=>x.type==='trigger').props.children;
  assert.equal(statusButton.props.title,undefined);
  for(const value of [flattenTest(tree),flattenTest(pane)])
    assert.doesNotMatch(value,/Data freshness and scope|데이터 최신성 및 범위|bar\.caveats|bar\.caveatText|bar\.profileContext/);
  for(const value of ['bar.mask','bar.restore','bar.readOnly','bar.scope','bar.caveats','bar.caveatText','bar.profileContext','pane.description','state.cached','state.readAt'])
    assert.ok(!source.includes(value),`obsolete source key ${value}`);
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
  mod.setPresentationForTest(null);
  const data = { readAt: Date.now(), profiles: [profile('default', [provider([
    { label: 'Main', state: 'ready', windows: [window(20)] },
    { label: 'Second', state: 'limited', windows: [window(100)] },
  ])], { readAt: Date.now(), errors: [] })] };
  const popover = mod.renderStatusBarForTest(data);
  const button = popover.props.children.find(child => child.type === 'trigger').props.children;
  const visible = button.props.children.flat().filter(Boolean).map(child => flattenTest(child).replace(/\s+/g, ' ').trim());
  assert.deepEqual(visible, ['Codex · Main · 80%', 'Codex · Second · Limited']);
});

test('compact quota distinguishes zero, tiny positive values and unverified data', () => {
  mod.setPresentationForTest(null);
  for (const { state = 'ready', used = 20, windows, gateway = 'open', isError = false, age = 0, expected } of [
    { used: 100, expected: 'Limited' },
    { used: 99.99, expected: '<0.1%' },
    { state: 'limited', expected: 'Limited' },
    { state: 'unknown', expected: '—' },
    { state: 'unavailable', expected: '—' },
    { windows: [], expected: '—' },
    { windows: [{ scope: 'account', left: null }], expected: '—' },
    { windows: [{ scope: 'account', left: 101 }], expected: '—' },
    { windows: [{ scope: 'account', left: 80, resets: new Date(Date.now() - 1000).toISOString() }], expected: '—' },
    { gateway: 'closed', expected: '—' },
    { isError: true, expected: '—' },
    { age: 300001, expected: '—' },
  ]) {
    const data = { readAt: Date.now(), profiles: [profile('default', [provider([
      { label: 'Main', state, windows: windows || [window(used)] },
    ])], { readAt: Date.now() - age, errors: [] })] };
    const popover = mod.renderStatusBarForTest(data, gateway, isError);
    const button = popover.props.children.find(child => child.type === 'trigger').props.children;
    const chip = button.props.children.flat().find(child => child?.props?.['data-limits-account'] === 'chip');
    assert.equal(chip.props['aria-label'], `Codex · Main · ${expected}`, JSON.stringify({ state, used, gateway, isError, age }));
    assert.match(flattenTest(chip), /Codex · Main/); assert.ok(flattenTest(chip).includes(expected), flattenTest(chip));
  }
});

test('status bar keeps selected account triples without an extra overflow counter', () => {
  mod.setPresentationForTest(null);
  const accounts = Array.from({ length: 4 }, (_, i) => ({ label: `Account-${i}`, state: 'ready', windows: [window(20)] }));
  const data = { profiles: [profile('default', [provider(accounts)], { readAt: Date.now(), errors: [] })] };
  const popover = mod.renderStatusBarForTest(data);
  const button = popover.props.children.find(child => child.type === 'trigger').props.children;
  const visible = button.props.children.flat().filter(Boolean).map(child => flattenTest(child).replace(/\s+/g, ' ').trim());
  assert.deepEqual(visible, accounts.map(account => `Codex · ${account.label} · 80%`));
});

test('automatic check failures appear in details without changing compact account chips', () => {
  mod.setPresentationForTest(null);
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
    assert.equal(chip.props['aria-label'], 'Codex · Main · 80%');
  }
});
test('raw runtime entrypoint only imports modules supported by the Hermes loader', () => {
  const modules = [...source.matchAll(/^import .*? from ['"]([^'"]+)['"]/gm)].map(match => match[1]);
  assert.deepEqual(modules, ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime']);
  assert.doesNotMatch(source, /\bimport\s*\(/);
});

test('status summary uses the tightest account window, never sums accounts or model quotas', () => {
  assert.equal(typeof mod.accountSummary, 'function');
  const account = { state: 'ready', readAt: 1000, windows: [
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
    { ...account, readAt: undefined }, { ...account, readAt: null }, { ...account, readAt: Infinity }, { ...account, readAt: 1001 },
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
  const summaryText = flattenTest(summary);
  assert.match(summaryText,/usage.current/); assert.match(summaryText,/3/); assert.match(JSON.stringify(summary),/1,200/);
  const chip = tree.props.children.find(item=>item.type==='trigger').props.children.props.children.flat().find(Boolean);
  assert.equal(chip.props['aria-label'],'Codex · Main · 80%');
});

test('current-chat row matches explicit segment membership in filtered response', () => {
  mod.setChatScopeForTest('synthetic-session-a','local','default');
  const summary = mod.renderChatSummaryForTest({rows:[{session_id:'synthetic-conversation-a',segment_session_ids:['synthetic-session-a'],calls:3,reported_total_tokens:40,known_prompt_tokens:30,known_output_tokens:10}]});
  const flatten = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : node?.props ? flatten(node.props.children) : '';
  assert.match(flatten(summary), /3/); assert.match(flatten(summary), /40/); assert.match(flatten(summary), /30/); assert.match(flatten(summary), /10/);
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
  assert.match(flatten(summary), /선택된 대화를 확인할 수 없습니다/);
  assert.doesNotMatch(flatten(summary), /대화 사용량 조회 중/);
});

test('selected chat distinguishes offline, query error, loading, empty and missing focus without stale numbers', () => {
  const flatten=flattenTest;
  mod.setChatScopeForTest('chat-a','local','default');
  let tree=mod.renderChatSummaryForTest({rows:[],diagnostics:{}});
  assert.match(flatten(tree),/이 대화에 보고된 사용량이 아직 없습니다/);
  tree=mod.renderChatSummaryForTest({rows:[]},{isPending:false,isFetching:true,fetchStatus:'fetching'});
  assert.doesNotMatch(flatten(tree),/이 대화에 보고된 사용량이 아직 없습니다/);
  assert.match(flatten(tree),/대화 사용량 조회 중/);
  assert.match(flatten(mod.renderUsageForTest({rows:[],diagnostics:{}})),/관찰된 대화 사용량이 없습니다/);
  tree=mod.renderChatSummaryForTest({rows:[{session_id:'chat-a',calls:9,reported_total_tokens:900}]},{isError:true});
  assert.match(flatten(tree),/이 대화의 사용량을 불러오지 못했습니다/); assert.doesNotMatch(flatten(tree),/900/);
  mod.setChatScopeForTest('chat-a','local','default','closed');
  tree=mod.renderChatSummaryForTest({rows:[{session_id:'chat-a',calls:9,reported_total_tokens:900}]});
  assert.match(flatten(tree),/Hermes 연결 중에만/); assert.doesNotMatch(flatten(tree),/usage.chatEmpty/); assert.doesNotMatch(flatten(tree),/900/);
  mod.setChatScopeForTest('','local','default');
  tree=mod.renderChatSummaryForTest(undefined,{isPending:true,fetchStatus:'idle'});
  assert.match(flatten(tree),/선택된 대화를 확인할 수 없습니다/); assert.doesNotMatch(flatten(tree),/usage.loading/); assert.doesNotMatch(flatten(tree),/usage.chatEmpty/);
  mod.setChatScopeForTest('chat-a','local','default');
  tree=mod.renderChatSummaryForTest(undefined,{isPending:true,isFetching:true,fetchStatus:'fetching'});
  assert.match(flatten(tree),/대화 사용량 조회 중/); assert.doesNotMatch(flatten(tree),/usage.chatEmpty/);
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
