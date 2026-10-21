import test from 'node:test';
import assert from 'node:assert/strict';
import { QualityController } from '../dist/quality.mjs';
const tiers=[540,720,1080].map(id=>({id:String(id)}));
const rows=now=>[1,2,3].map(index=>({index,at:now,fetchMs:50,decodeMs:3,cached:false}));
const healthy=(q,now)=>q.observe({now,lag:0,failed:false,rate:20,deliveryMs:100,samples:8});
test('motion recovers a tier at a time with healthy-window and promotion cooldowns',()=>{
 const q=new QualityController();q.configure(tiers,tiers[2],540,false);
 healthy(q,0);assert.equal(q.next(2999),null);
 assert.ok(q.promote(3000,rows(3000)));assert.equal(q.motion.id,'720');
 assert.equal(q.promote(7999,rows(7999)),false);
 assert.ok(q.promote(8000,rows(8000)));assert.equal(q.motion.id,'1080');
});
test('a downgrade delays recovery and failed probes have a separate cooldown',()=>{
 const q=new QualityController();q.configure(tiers,tiers[2],1080,false);
 q.observe({now:0,lag:10,rate:30,deliveryMs:300,samples:4});
 assert.ok(q.observe({now:350,lag:10,rate:30,deliveryMs:300,samples:4}));
 assert.equal(q.motion.id,'720');healthy(q,400);
 assert.equal(q.next(10349),null);assert.equal(q.next(10350).id,'1080');
 q.probeFailed(10350);assert.equal(q.next(25349),null);assert.ok(q.next(25350));
});
test('Data Saver is a hard automatic ceiling while phone limits are startup choices',()=>{
 const q=new QualityController();q.configure(tiers,tiers[2],720,false);healthy(q,0);
 assert.ok(q.promote(3000,rows(3000)));
 q.configure(tiers,tiers[2],540,true);assert.equal(q.desired.id,'540');assert.equal(q.motion.id,'540');
 assert.equal(q.distant(9000,{count:100,mbps:100}),false);
 assert.equal(q.next(9000),null);
 q.configure(tiers,tiers[2],720,false);assert.equal(q.desired.id,'1080');
});
test('promotion needs three distinct recent samples and both decode and transfer headroom',()=>{
 const q=new QualityController();q.configure(tiers,tiers[2],540,false);healthy(q,0);
 assert.equal(q.promote(3000,[rows(3000)[0],rows(3000)[0],rows(3000)[0]]),false);
 assert.equal(q.promote(3000,rows(3000).map(x=>({...x,decodeMs:50}))),false);
 assert.equal(q.promote(3000,rows(3000).map(x=>({...x,fetchMs:500}))),false);
 assert.ok(q.promote(3000,rows(3000).map(x=>({...x,fetchMs:500,cached:true}))));
});
test('distant loading requires health and measured network evidence',()=>{
 const q=new QualityController();q.configure(tiers,tiers[2],720,false);healthy(q,0);
 assert.equal(q.distant(2999,{count:20,mbps:20}),false);
 assert.equal(q.distant(3000,{count:7,mbps:20}),false);
 assert.equal(q.distant(3000,{count:8,mbps:4.9}),false);
 assert.equal(q.distant(3000,{count:8,mbps:5}),true);
 q.observe({now:3100,lag:2,failed:false,rate:10});assert.equal(q.distant(4000,{count:20,mbps:20}),false);
});
test('jump velocity cannot block paused recovery indefinitely',()=>{
 const q=new QualityController();q.configure(tiers,tiers[2],540,false);
 q.observe({now:0,lag:0,failed:false,rate:300,deliveryMs:10,samples:8});
 assert.equal(q.rate,60);
 q.observe({now:1000,lag:0,failed:false,rate:0,deliveryMs:10,samples:8});
 assert.equal(q.rate,30);
 assert.ok(q.promote(3000,rows(3000)));
 q.probeFailed(3100);
 assert.equal(q.usableSamples(rows(3000),3200).length,0);
});
