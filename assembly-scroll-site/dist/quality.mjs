import { qualityLagDelay } from './timeline.mjs?v=progressive-1';

export class QualityController {
  constructor() {
    this.healthySince = this.lagSince = null;
    this.lastDrop = this.lastPromotion = -Infinity;
    this.retryAt = 0;
    this.drops = this.promotions = 0;
    this.rate = 1;
    this.sampleAfter = 0;
  }
  configure(resolutions, desired, initialCap, saveData) {
    this.resolutions = resolutions;
    this.desired = saveData ? resolutions[0] : desired;
    this.saveData = saveData;
    const id = Math.min(Number(this.desired.id), this.motion ? Number(this.motion.id) : initialCap);
    this.motion = resolutions.findLast(x=>Number(x.id)<=id) || resolutions[0];
  }
  observe({now,lag,failed,rate,deliveryMs,samples}) {
    // Large scroll jumps do not require decoding more than the display can present.
    this.rate=rate>0 ? Math.min(60,rate) : Math.min(this.rate,30);
    if(lag<=1 && !failed)this.healthySince ??= now;
    else this.healthySince=null;
    const tier=this.resolutions.findIndex(x=>x.id===this.motion.id);
    if(lag>=2 && tier>0) {
      this.lagSince ??= now;
      if(now-this.lagSince>=qualityLagDelay(deliveryMs,rate,samples)) {
        this.lagDuration=now-this.lagSince;
        this.motion=this.resolutions[tier-1];this.lastDrop=now;this.drops++;
        this.sampleAfter=now;
        this.lagSince=null;this.healthySince=null;
        return true;
      }
    }else this.lagSince=null;
    return false;
  }
  healthy(now) { return this.healthySince!==null && now-this.healthySince>=3000; }
  next(now) {
    if(this.saveData || !this.healthy(now) || now<this.retryAt || now-this.lastDrop<10000 || now-this.lastPromotion<5000)return null;
    return this.resolutions.find(x=>Number(x.id)>Number(this.motion.id) && Number(x.id)<=Number(this.desired.id)) || null;
  }
  usableSamples(rows,now) {
    return [...new Map(rows.filter(x=>now-x.at<=10000 && x.at>=this.sampleAfter).map(x=>[x.index,x])).values()].slice(-3);
  }
  hasHeadroom(rows,now) {
    const unique=this.usableSamples(rows,now);
    return unique.length===3 && unique.every(x=>x.decodeMs*this.rate<=700 && (x.cached || x.fetchMs*this.rate<=2800));
  }
  promote(now,rows) {
    const next=this.next(now);
    if(!next || !this.hasHeadroom(rows,now))return false;
    this.motion=next;this.lastPromotion=now;this.promotions++;
    return true;
  }
  probeFailed(now) { this.retryAt=now+15000; this.sampleAfter=now; }
  distant(now,network) { return !this.saveData && this.healthy(now) && network.count>=8 && network.mbps>=5; }
  nextDeadline(now) {
    const deadlines=[this.healthySince===null?0:this.healthySince+3000,this.lastDrop+10000,this.lastPromotion+5000,this.retryAt];
    return Math.min(...deadlines.filter(x=>x>now));
  }
}
