// Fonctions extraites a l'identique de la version initiale. Ne pas modifier manuellement.
export function calculateNative(snapshot,p){
 const H=snapshot.shared||snapshot.hyp,MKF=snapshot.marketFactor||1,MADJ=snapshot.materialAdjustment||0;
 const gH=()=>snapshot.hyp;
 const FM=(()=>{const m=new Map();for(const r of snapshot.rows||[]){const k=r.ref+'|'+r.t+'|'+r.m;if(!m.has(k))m.set(k,{...r,rmb:{},mk:{}});const f=m.get(k);f.rmb[r.q]=r.rmb;f.mk[r.q]=r.mk}return [...m.values()]})();
 const gvar=(h,id)=>h.vars.find(x=>x.id==id)||h.vars[0];
const ground=x=>x<1?Math.round(x*1000)/1000:Math.round(x*100)/100;
const gus=(ty,L,Hh,G)=>!G||/3 soudures/.test(ty)?0:/8 soudures/.test(ty)?G*(L+Hh)/100:G*L/100;
const area=f=>f.L*(f.H+f.G/2);
 function model(rmb,mk,th,L,Hh,q,rateOverride,mode,G,ty){mk=mk*MKF;
 const w=((2*L*Hh/100)+gus(ty,L,Hh,G))*(th/10)*H.dens*(1+H.over);
 const usine=rmb*H.fx*(1+H.mat)*(1+MADJ)*(1+H.secFx)*(1+H.qual),totKg=w*q/1000,rate=rateFor(totKg,rateOverride,mode),tr=w/1000*rate,fx=H.fixed/q,cout=usine+tr+fx;
 const floor=cout/(1-(q>=H.qB?H.mB:H.mS)),price=Math.max(Math.round(mk*H.pos*100)/100,Math.ceil((floor-1e-12)*100)/100),marge=(price-cout)/price;
 return{w,usine,tr,fx,cout,floor,mk,price,marge,ttc:price*(1+H.vat),gap:price/mk-1,total:price*q,margeEur:(price-cout)*q,rate,totKg,q,L,H:Hh}}
function rateFor(totKg,rateOverride,mode){if(rateOverride>0)return rateOverride;const m=H.modes[mode||H.mode]||H.modes.air;const tt=[...m.t].sort((a,b)=>a[0]-b[0]);let r=tt[0][1];for(const [k,v] of tt)if(totKg>=k)r=v;return r}
function gmodel(p,h){h=h||gH();const vr=gvar(h,p.v),q=Math.max(1,p.q),raw=h.p0*vr.c*Math.pow(q/h.q0,-h.b),price=ground(raw),known=h.cost0>0;
 const bc=h.b*h.bcr,cost=known?h.cost0*H.fx*vr.cc*Math.pow(q/h.q0,-bc)*(1+(h.matOn?gmadj(h):0))*(1+H.secFx)*(1+H.qual):null;
 const wg=h.wg*(1+h.over),totKg=wg*q/1000,rate=grate(h,totKg,p.rate,p.mode),tr=wg/1000*rate,fx=h.fixed/q;
 const cb=known?cost+fx+(h.incTr?tr:0):null,marge=known?(price-cb)/price:null;
 return{q,price,ttc:price*(1+H.vat),total:price*q,tr,rendu:price+tr,cost,fx,cb,marge,margeEur:known?(price-cb)*q:null,known,wg,totKg,rate,remise:1-price/ground(h.p0*vr.c*Math.pow(100/h.q0,-h.b)),vr}}
function grate(h,totKg,ro,mode){if(ro>0)return ro;const m=h.modes[mode||h.mode]||h.modes.air,tt=[...m.t].sort((a,b)=>a[0]-b[0]);let r=tt[0][1];for(const[k,v]of tt)if(totKg>=k)r=v;return r}
function gmadj(h){const m=h.idx,ws=Object.values(m).reduce((a,x)=>a+x.w,0)||1;let s=0;for(const k in m)s+=m[k].w/ws*(m[k].cur/m[k].base-1);return Math.max(-.15,Math.min(.15,s*h.matShare))}
function stickerCalc(settings,p){const c=settings.hyp,H=settings.shared,sh=c.sh[p.sh]||c.sh.rond,pm=c.pm[p.mat]||c.pm.vin,fn=c.fin[p.fin]||c.fin.mat,cd=c.cond[p.cond]||c.cond.unit;
 const q=Math.max(1,p.q),height=p.sh=='rond'?p.w:p.h,A=(p.w/10)*(height/10),m2=A/10000*(1+c.chute),known=c.usine>0;
 const mkb=(c.mkt.F+c.mkt.k*Math.pow(A,c.mkt.a)*Math.pow(q,c.mkt.b))/q,mkt=mkb*settings.marketFactor*pm.c*sh.c*fn.c*cd.c,target=mkt*c.pos;
 const wg=m2*c.gsm*(1+c.over);
 const usine=known?c.usine*H.fx*m2*pm.cc*(1+c.mat)*(1+settings.materialAdjustment)*(1+H.secFx)*(1+H.qual):0;
 const totKg=wg*q/1000,mode=c.modes[p.mode||c.mode]||c.modes.air,tiers=[...mode.t].sort((a,b)=>a[0]-b[0]);let rate=p.rate>0?p.rate:tiers[0][1];if(!(p.rate>0))for(const[k,v]of tiers)if(totKg>=k)rate=v;
 const tr=wg/1000*rate,fxc=c.fixed/q,extra=((fn.fix||0)+(cd.fix||0))/q;
 const cout=known?usine+tr+fxc+extra:null,floor=known?cout/(1-(q>=c.qB?c.mB:c.mS)):0,raw=Math.max(floor,target+extra),scale=raw<1?1000:100;
 const price=Math.max(Math.round((target+extra)*scale),Math.ceil((floor-1e-12)*scale))/scale,marge=known?(price-cout)/price:null;
 return{A,m2,q,w:p.w,h:height,mkb,mkt,target,wg,usine,tr,fx:fxc,extra,cout,floor,price,marge,ttc:price*(1+H.vat),total:price*q,margeEur:known?(price-cout)*q:null,perM2:price*q/(A*q/10000),gap:price/mkt-1,rate,totKg,known,pm,sh,fn,cd}}
function llq(d,q){q=Math.min(5000,Math.max(200,q));const ks=Object.keys(d).map(Number).sort((a,b)=>a-b);if(d[q]!=null)return d[q];if(ks.length<2)return d[ks[0]];let i=ks.findIndex(k=>k>q);if(i==-1)i=ks.length-1;if(i==0)i=1;const a=ks[i-1],b=ks[i];return Math.exp(Math.log(d[a])+(Math.log(d[b])-Math.log(d[a]))*(Math.log(q)-Math.log(a))/(Math.log(b)-Math.log(a)))}
function interp(t,m,L,Hh,G,q){const g=FM.filter(f=>f.t==t&&f.m==m);const ex=g.find(f=>Math.abs(f.L-L)<1.5&&Math.abs(f.H-Hh)<1.5&&Math.abs(f.G-G)<1.5);
 if(ex)return{rmb:llq(ex.rmb,q),mk:llq(ex.mk,q),th:ex.th,kind:'exact',ref:ex.ref,qin:ex.rmb[q]!=null};
 const A=L*(Hh+G/2),pts=g.map(f=>({A:area(f),rmb:llq(f.rmb,q),mk:llq(f.mk,q),th:f.th})).sort((a,b)=>a.A-b.A);if(pts.length<2)return null;
 let i=pts.findIndex(x=>x.A>=A);if(i==-1)i=pts.length-1;else if(i==0)i=1;const a=pts[i-1],b=pts[i],r=(Math.log(A)-Math.log(a.A))/(Math.log(b.A)-Math.log(a.A));
 const out=A>pts[pts.length-1].A*1.02||A<pts[0].A*.98,ip=(x,y)=>Math.exp(Math.log(x)+(Math.log(y)-Math.log(x))*r);
 const near=pts.reduce((p,c)=>Math.abs(c.A-A)<Math.abs(p.A-A)?c:p);return{rmb:ip(a.rmb,b.rmb),mk:ip(a.mk,b.mk),th:near.th,kind:out?'out':'est'}}
 if(snapshot.kind==='g'){if(!snapshot.hyp.vars.some(v=>v.id===p.v))throw new Error('Variante inconnue');return {result:gmodel(p,snapshot.hyp),configuration:p}}
 if(snapshot.kind==='stk'){if(!snapshot.hyp.sh[p.sh]||!snapshot.hyp.pm[p.mat]||!snapshot.hyp.fin[p.fin]||!snapshot.hyp.cond[p.cond])throw new Error('Configuration stickers inconnue');return {result:stickerCalc(snapshot,p),configuration:p}}
 const found=interp(p.t,p.m,p.L,p.H,p.G||0,p.q);if(!found)throw new Error('Format Mylar non calculable');return {result:model(found.rmb,found.mk,found.th,p.L,p.H,p.q,p.rate||0,p.mode,p.G||0,p.t),configuration:{...p,th:found.th},estimated:found.kind!=='exact'};
}
