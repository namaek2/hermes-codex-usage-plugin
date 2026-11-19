import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { host, queryClient, visible, registerLocales } from './sdk.js';
import './style.css';

const contributions = [];
const storage = new Map(Object.entries(JSON.parse(localStorage.getItem('limits-monitor-presentation') || '{}')));
const ctx = {
  i18n: { register: registerLocales }, storage: { get:key=>storage.get(key) ?? null, set:(key,value)=>{storage.set(key,value);localStorage.setItem('limits-monitor-presentation',JSON.stringify(Object.fromEntries(storage)));} },
  register: item=>contributions.push(item), setInterval:()=>0, onDispose:()=>{}, rest:async()=>({status:'checked'})
};
const root = createRoot(document.getElementById('root'));
window.__usageQA = {
  async control(value) { return fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}).then(r=>r.json()); },
  swap(profile, connection) { host.state.profile.set(profile); host.state.connectionId.set(connection); },
  focus(session, profile='fixture-profile-a', connection='fixture-connection-a') { host.state.focusedStoredSessionId.set(session); host.state.focusedSessionId.set(''); host.state.focusedSessionOwner.set(profile && connection ? {profile,connectionId:connection} : null); },
  disconnect() { host.state.gateway.set('closed'); }, reconnect() { host.state.gateway.set('open'); },
  pane() { return document.querySelector('[data-limits-monitor="pane"]'); },
  mainScope() { return {profile:host.state.profile.get(),connection:host.state.connectionId.get()}; },
  text() { return document.body.innerText; },
  moduleAllowlist: ['@hermes/plugin-sdk','react','react/jsx-runtime']
};
function FixtureControls() {
  return <header><strong>SYNTHETIC FIXTURE</strong><button onClick={()=>window.__usageQA.swap('fixture-profile-a','fixture-connection-a')}>Profile A</button>
    <button onClick={()=>window.__usageQA.swap('fixture-profile-b','fixture-connection-b')}>Profile B (empty)</button>
    <button onClick={()=>window.__usageQA.focus('',null,null)}>Focus missing</button><button onClick={()=>window.__usageQA.focus('synthetic-session-a','fixture-profile-b','fixture-connection-b')}>Focus Profile B</button><button onClick={()=>window.__usageQA.focus('synthetic-session-a')}>Focus Profile A</button>
    <button onClick={()=>window.__usageQA.swap('fixture-profile-a','fixture-connection-b')}>Connection mismatch</button>
    <button onClick={()=>window.__usageQA.disconnect()}>Offline</button><button onClick={()=>window.__usageQA.reconnect()}>Online</button>
    <button onClick={()=>window.__usageQA.control({delay_ms:3500,fail_usage:false})}>Delay query</button>
    <button onClick={()=>window.__usageQA.control({delay_ms:0,fail_usage:true})}>Fail query</button>
    <button onClick={()=>window.__usageQA.control({delay_ms:0,fail_usage:false})}>Clear error</button></header>;
}
function App() {
  return <QueryClientProvider client={queryClient}><FixtureControls/><main>{contributions.map(c=><section key={c.id}><h2>{c.title || c.id}</h2>{c.render()}</section>)}</main></QueryClientProvider>;
}
async function loadRawPlugin() {
  const source = await fetch('/raw-product.js').then(r=>r.text());
  const allowed = new Set(window.__usageQA.moduleAllowlist);
  const specs = [...source.matchAll(/^import .*? from ['"]([^'"]+)['"]/gm)].map(m=>m[1]);
  if (specs.some(spec=>!allowed.has(spec))) throw new Error(`Refused raw imports: ${specs.filter(x=>!allowed.has(x)).join(', ')}`);
  const urls = {'@hermes/plugin-sdk':new URL('/src/sdk.js',location.href).href,'react':new URL('/src/react-bridge.js',location.href).href,'react/jsx-runtime':new URL('/src/jsx-bridge.js',location.href).href};
  const rewritten = source.replace(/^import (.*?) from ['"]([^'"]+)['"];?$/gm, (_all, clause, spec)=>`import ${clause} from ${JSON.stringify(urls[spec])};`);
  const blob = URL.createObjectURL(new Blob([rewritten],{type:'text/javascript'}));
  try { const plugin = (await import(/* @vite-ignore */ blob)).default; plugin.register(ctx); }
  finally { URL.revokeObjectURL(blob); }
}
loadRawPlugin().then(()=>root.render(<App/>)).catch(error=>{document.body.textContent=`Harness load failed: ${error.stack || error}`;});
