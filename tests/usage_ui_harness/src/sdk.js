import React, { useSyncExternalStore } from 'react';
import { atom } from 'nanostores';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Checkbox as RadixCheckbox, Popover as RadixPopover } from 'radix-ui';
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
export const atomValue = atom;
export { atom };
export const host = {
  state: { profile: atom('fixture-profile-a'), connectionId: atom('fixture-connection-a'), gateway: atom('open'), focusedStoredSessionId: atom('synthetic-session-a'), focusedSessionId: atom(''), focusedSessionOwner: atom({connectionId:'fixture-connection-a',profile:'fixture-profile-a'}) },
  paneVisibility: () => visible,
  request: (method, params = {}) => { if (method === 'plugin.limits-monitor.usage.list' && params.session_id) (window.__usageRpcCalls ||= []).push({...params,profile:host.state.profile.get(),connection:host.state.connectionId.get()}); return fetch('/api/rpc', { method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({method,params,profile:host.state.profile.get(),connection:host.state.connectionId.get()}) }).then(async r => {
      const result = await r.json(); if (!r.ok) throw new Error(result.error || `HTTP ${r.status}`); return result;
    }); },
  requestProfile: (route, method, params = {}) => { if (method === 'plugin.limits-monitor.usage.list' && params.session_id) (window.__usageRpcCalls ||= []).push({...params,profile:route.profile,connection:route.connectionId}); return fetch('/api/rpc', { method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({method,params,profile:route.profile,connection:route.connectionId}) }).then(async r => {
      const result = await r.json(); if (!r.ok) throw new Error(result.error || `HTTP ${r.status}`); return result;
    }); }
};
export const visible = atom(true);
export const useValue = store => useSyncExternalStore(cb => store.subscribe(cb), () => store.get(), () => store.get());
export { useQuery };
export const Button = ({variant, size, ...props}) => React.createElement('button', { ...props, 'data-variant':variant, 'data-size':size });
export const Checkbox = ({checked, style, ...props}) => React.createElement(RadixCheckbox.Root, { ...props, checked, type:'button',
  style:{display:'inline-flex',alignItems:'center',justifyContent:'center',width:16,height:16,padding:0,flex:'none',
    border:`1px solid ${checked ? 'var(--ui-accent)' : 'var(--ui-stroke-secondary)'}`,
    borderRadius:3,background:checked ? 'var(--ui-accent)' : 'var(--ui-background, transparent)',
    color:checked ? 'var(--ui-text-on-accent, white)' : 'var(--ui-text-primary)',...style}},
React.createElement(RadixCheckbox.Indicator, {children:'✓'}));
export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverContent = RadixPopover.Content;
let messages = {};
export const usePluginI18n = () => key => key.split('.').reduce((value, part)=>value?.[part], messages) ?? key;
export const registerLocales = value => { messages = value.ko || value.en || {}; };
