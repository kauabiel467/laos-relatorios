const ts=require('typescript');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'laos-projects-test-'));
try {
 for(const name of ['model','metrics','schema']){const source=fs.readFileSync('lib/projects/'+name+'.ts','utf8');fs.writeFileSync(path.join(dir,name+'.js'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);}
 // Resolve zod through the project without copying dependencies.
 const zodPath=require.resolve('zod');const Module=require('node:module');const original=Module._resolveFilename;Module._resolveFilename=function(req,...args){return req==='zod'?zodPath:original.call(this,req,...args);};
 const m=require(path.join(dir,'model.js')), {metrics}=require(path.join(dir,'metrics.js')), {configSchema}=require(path.join(dir,'schema.js'));
 assert.deepEqual(m.periodDates('last_month',new Date(2024,2,15)),{since:'2024-02-01',until:'2024-02-29'});
 assert.deepEqual(m.periodDates('last_month',new Date(2026,0,15)),{since:'2025-12-01',until:'2025-12-31'});
 assert.deepEqual(m.previousDates('2026-08-01','2026-08-31'),{compare_since:'2026-07-01',compare_until:'2026-07-31'});
 assert.deepEqual(m.comparisonDates({preset:'last_month',since:'2024-03-01',until:'2024-03-31'}),{compare_since:'2024-02-01',compare_until:'2024-02-29'});
 assert.equal(m.metricChange(10,0),null);assert.equal(m.metricChange(0,10),-100);
 const v=metrics({spend:'100',impressions:'1000',reach:'400',clicks:'100',actions:[{action_type:'link_click',value:'50'},{action_type:'offsite_conversion.fb_pixel_purchase',value:'4'},{action_type:'purchase',value:'4'},{action_type:'lead',value:'3'},{action_type:'onsite_conversion.lead_grouped',value:'3'}],action_values:[{action_type:'offsite_conversion.fb_pixel_purchase',value:'320'}]});
 assert.equal(v.purchases,4);assert.equal(v.leads,3);assert.equal(v.ctr,5);assert.equal(v.cpc,2);assert.equal(v.cpa,25);assert.equal(v.roas,3.2);assert.equal(v.messages,0);assert.equal(v.cost_message,null);assert.equal(metrics(undefined).spend,0);assert.equal(metrics(undefined).cpa,null);
 const c=m.defaultConfig();assert.equal(configSchema.safeParse(c).success,true);assert.equal(configSchema.safeParse({...c,since:'2026-09-20',until:'2026-09-01'}).success,false);assert.equal(configSchema.safeParse({...c,comparison:'custom'}).success,false);assert.equal(configSchema.safeParse({...c,metrics:['spend','spend']}).success,false);assert.equal(configSchema.safeParse({...c,campaign_ids:['../../123']}).success,false);
 console.log('PASS: date boundaries, previous periods, zero baselines, non-duplicated conversions, CTR/CPC/ROAS, missing denominators, configuration validation');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
