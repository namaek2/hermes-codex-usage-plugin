"""Synthetic fixtures for the privacy-bounded conversation usage collector."""
import importlib.util, os, tempfile, time, unittest, sys
import sqlite3
import contextvars
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from hermes_constants import reset_hermes_home_override, set_hermes_home_override
from plugins.plugin_storage import plugin_data_dir
PLUGIN=Path(__file__).resolve().parents[1]
class FakeCtx:
    profile_name='fixture'; plugin_id='limits-monitor'
    def __init__(self): self.hooks={}; self.rpcs={}
    def register_hook(self,n,cb,**kw): self.hooks[n]=cb
    def register_rpc(self,n,cb,**kw): self.rpcs[n]=cb
class UsageTrackingTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')); self.addCleanup(self.tmp.cleanup)
        token=set_hermes_home_override(Path(self.tmp.name)); self.addCleanup(reset_hermes_home_override,token)
    def load(self):
        spec=importlib.util.spec_from_file_location(f'limits_usage_{time.time_ns()}',PLUGIN/'__init__.py',submodule_search_locations=[str(PLUGIN)])
        mod=importlib.util.module_from_spec(spec); sys.modules[spec.name]=mod; spec.loader.exec_module(mod); return mod
    def test_register_dedup_privacy_and_canonical_arithmetic(self):
        ctx=FakeCtx(); self.load().register(ctx)
        self.assertEqual(set(('pre_api_request','post_api_request','api_request_error'))-ctx.hooks.keys(),set())
        payload=dict(session_id='session-a',api_request_id='req-a',provider='openai',model='m',started_at=time.time()-1,ended_at=time.time(),usage=dict(input_tokens=100,cache_read_tokens=20,cache_write_tokens=5,output_tokens=50,reasoning_tokens=10),request={'authorization':'secret-marker'},response={'body':'secret-marker'},account_id='secret-marker')
        ctx.hooks['pre_api_request'](**payload); ctx.hooks['post_api_request'](**payload); ctx.hooks['post_api_request'](**{**payload,'usage':None})
        db=plugin_data_dir('limits-monitor')/'usage.db'; content=db.read_bytes(); self.assertNotIn(b'secret-marker',content)
        result=ctx.rpcs['usage.list']({},session_id='session-a'); row=result['rows'][0]
        self.assertEqual((row['calls'],row['successful'],row['reported_total_tokens']),(1,1,175))
        self.assertEqual(row['usage_unreported'],0); self.assertEqual(result['quota_status'],'unmeasured')
        for bound in (-1,101,'10'):
            with self.assertRaises(ValueError): ctx.rpcs['usage.list']({'limit':bound})
    def test_unreported_error_pending_and_invalid_values(self):
        c=FakeCtx(); self.load().register(c)
        c.hooks['pre_api_request'](session_id='s',api_request_id='pending')
        c.hooks['api_request_error'](session_id='s',api_request_id='failed',status_code=500,error={'message':'secret'})
        c.hooks['post_api_request'](session_id='s',api_request_id='bad',usage={'input_tokens':True,'cache_read_tokens':-2,'cache_write_tokens':float('nan'),'output_tokens':'2'})
        row=c.rpcs['usage.list']({'session_id':'s'})['rows'][0]
        self.assertEqual((row['calls'],row['pending'],row['failed'],row['usage_unreported']),(3,1,1,3))
        self.assertIsNone(row['reported_total_tokens'])
    def test_profile_switch_is_rejected_before_creating_other_profile_storage(self):
        c=FakeCtx(); self.load().register(c)
        other=Path(self.tmp.name)/'other-profile'; token=set_hermes_home_override(other)
        try:
            with self.assertRaises(PermissionError): c.rpcs['usage.list']({})
            self.assertFalse((other/'plugin-data').exists())
        finally: reset_hermes_home_override(token)

    def test_opaque_ids_partial_updates_and_invalid_ids_diagnostics(self):
        c=FakeCtx(); mod=self.load(); mod.register(c)
        payload=dict(session_id='opaque request|한글',api_request_id='opaque request|한글',usage={'input_tokens':2,'cache_read_tokens':1,'cache_write_tokens':0,'output_tokens':4})
        c.hooks['post_api_request'](**payload)
        c.hooks['pre_api_request'](api_request_id=payload['api_request_id'])
        c.hooks['post_api_request'](api_request_id=payload['api_request_id'],usage={'input_tokens':None,'output_tokens':None})
        c.hooks['post_api_request'](api_request_id='bad\nID',usage={})
        row=c.rpcs['usage.list']({'session_id':payload['session_id']})['rows'][0]
        self.assertEqual((row['calls'],row['reported_total_tokens']),(1,7))
        diagnostics=c.rpcs['usage.list']({})['diagnostics']
        self.assertGreaterEqual(diagnostics['dropped_events'],1)

    def test_unknown_components_merge_without_rewriting_known_facts(self):
        c=FakeCtx(); self.load().register(c)
        c.hooks['post_api_request'](api_request_id='merge',session_id='s',usage={'input_tokens':3,'cache_read_tokens':0,'cache_write_tokens':0,'output_tokens':None})
        c.hooks['post_api_request'](api_request_id='merge',session_id='s',usage={'input_tokens':99,'cache_read_tokens':99,'cache_write_tokens':99,'output_tokens':4})
        row=c.rpcs['usage.list']({'session_id':'s'})['rows'][0]
        self.assertEqual((row['known_prompt_tokens'],row['known_output_tokens'],row['reported_total_tokens']),(3,4,7))

    def test_relationships_conversation_segments_and_strict_rpc_params(self):
        c=FakeCtx(); self.load().register(c)
        for sid in ('seg-a','seg-b'):
            c.hooks['post_api_request'](api_request_id='r-'+sid,session_id=sid,conversation_id='conv',usage={'input_tokens':1,'cache_read_tokens':0,'cache_write_tokens':0,'output_tokens':2})
        c.hooks['subagent_start'](parent_session_id='parent',child_session_id='child')
        c.hooks['on_session_reset'](session_id='ambiguous-current',old_session_id='old',new_session_id='new')
        rows=c.rpcs['usage.list']({'conversation_id':'conv'})['rows']
        self.assertEqual(len(rows),1); self.assertEqual(rows[0]['calls'],2); self.assertEqual(rows[0]['reported_total_tokens'],6)
        self.assertEqual(set(rows[0]['segment_session_ids']),{'seg-a','seg-b'})
        links=c.rpcs['usage.list']({})['relationships']
        self.assertEqual({(x['kind'],x['parent_session_id'],x['child_session_id']) for x in links},
                         {('subagent','parent','child'),('reset','old','new')})
        with self.assertRaises(ValueError): c.rpcs['usage.list']({'path':'/tmp'})
        with self.assertRaises(ValueError): c.rpcs['usage.list'](None)
        with self.assertRaises(ValueError): c.rpcs['usage.list']({'conversation_id':'conv','limit':101})

    def test_diagnostics_are_per_registration_instance(self):
        module=self.load(); first=FakeCtx(); module.register(first)
        first.hooks['post_api_request'](api_request_id='bad\nid')
        self.assertEqual(first.rpcs['usage.list']({})['diagnostics']['dropped_events'],1)
        other=Path(self.tmp.name)/'other-owner'; token=set_hermes_home_override(other)
        try:
            second=FakeCtx(); module.register(second)
            self.assertEqual(second.rpcs['usage.list']({})['diagnostics'],{'dropped_events':0,'storage_failures':0})
        finally: reset_hermes_home_override(token)

    def test_storage_failure_is_fail_open_and_reported(self):
        c=FakeCtx(); self.load().register(c)
        collector=c.rpcs['usage.list'].__self__
        with unittest.mock.patch.object(collector,'_connect',side_effect=sqlite3.OperationalError('synthetic')):
            c.hooks['post_api_request'](api_request_id='storage-fails',session_id='s')
        self.assertEqual(collector.storage_failures,1)

    def test_huge_numeric_and_invalid_timestamp_are_unreported_without_throwing(self):
        c=FakeCtx(); self.load().register(c)
        for ix,v in enumerate((10**10000,True,float('nan'),float('inf'),-1,'2',None)):
            c.hooks['post_api_request'](api_request_id=f'x{ix}',session_id='s',started_at=1e100,usage={'input_tokens':v})
        row=c.rpcs['usage.list']({'session_id':'s'})['rows'][0]
        self.assertEqual(row['calls'],7); self.assertEqual(row['usage_unreported'],7)

    def test_context_copied_concurrent_inserts_do_not_collide(self):
        c=FakeCtx(); self.load().register(c)
        def insert(n):
            c.hooks['post_api_request'](api_request_id=f'r{n}',session_id=f's{n}',
                usage={'input_tokens':n,'cache_read_tokens':0,'cache_write_tokens':0,'output_tokens':1})
        contexts=[(contextvars.copy_context(),n) for n in range(1,41)]
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda pair: pair[0].run(insert,pair[1]),contexts))
        result=c.rpcs['usage.list']({'limit':100})['rows']
        self.assertEqual(sum(r['calls'] for r in result),40,c.rpcs['usage.list']({'limit':100})['diagnostics'])
        self.assertEqual(len({r['session_id'] for r in result}),40)
if __name__=='__main__': unittest.main()
