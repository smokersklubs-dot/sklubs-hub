import {calculateNative} from './pricing-engine.mjs';import {createPriceRules} from './price-rules.mjs';import {createCampaignTools,PRODUCT_IDS} from './campaigns.mjs';
const rules=createPriceRules(),campaigns=createCampaignTools(),sites=['com','fr'];
export function validPublications(doc){return !!(doc&&doc.schema===1&&doc.sites&&sites.every(site=>doc.sites[site]&&typeof doc.sites[site]==='object'&&!Array.isArray(doc.sites[site])&&Object.entries(doc.sites[site]).every(([id,p])=>PRODUCT_IDS.includes(id)&&p&&p.product===id&&['mylar','stk','g'].includes(p.kind)&&p.hyp&&p.shared&&p.scope?.id==='default'&&p.scope.currency==='EUR'&&p.rules&&typeof p.approvedAt==='string'&&(!p.rows||Array.isArray(p.rows)&&p.rows.length<=1000))));}
// Calcul détaillé partagé (aucune formule dupliquée) : `quote` est la sortie publique, `internal` reste réservé aux routes privées.
export function priceSnapshot(snapshot,configuration,campaign=null){
 if(Object.hasOwn(configuration,'rate'))throw new Error('Le tarif de transport personnalisé est réservé au dashboard.');
 if(configuration.mode&&!Object.hasOwn(snapshot.hyp.modes,configuration.mode))throw new Error('Mode de transport inconnu');
 const p={...configuration};for(const key of ['q','L','H','G','w','h','rate'])if(key in p)p[key]=Number(p[key]);
 if(!Number.isInteger(p.q)||p.q<1||p.q>1e7)throw new Error('Quantité invalide');
 if(snapshot.kind==='mylar'&&(!(p.L>0&&p.L<=2000&&p.H>0&&p.H<=2000&&p.G>=0&&p.G<=1000)||p.q<200||p.q>5000))throw new Error('Dimensions ou quantité Mylar hors limites');
 if(snapshot.kind==='stk'&&(!(p.w>0&&p.w<=3000&&p.h>0&&p.h<=3000)||p.q<snapshot.hyp.minQ))throw new Error('Dimensions ou quantité stickers hors limites');
 const calculated=calculateNative(snapshot,p),key=rules.key(snapshot.product,calculated.configuration);
 // Prix fixé exact, sinon interpolation entre les prix fixés voisins de la même série (formule native × coefficient).
 const nativeAt=q=>{try{return calculateNative(snapshot,{...p,q}).result.price}catch{return null}};
 let result=rules.resolve(snapshot.product,snapshot.rules||{},key,calculated.result,nativeAt,snapshot.shared.vat);
 const regular=result.price;if(campaign)result=campaigns.discount(campaign,result);
 if(!(result.price>0&&Number.isFinite(result.price)))throw new Error('Prix non calculable');
 // Liste blanche de sortie : aucun coût, paramètre usine, prix matière ou taux de marge.
 const quote={product:snapshot.product,scope:snapshot.scope,currency:'EUR',quantity:p.q,unitHT:result.price,totalHT:Math.round(result.price*p.q*100)/100,totalTTC:Math.round(result.price*p.q*(1+snapshot.shared.vat)*100)/100,vat:snapshot.shared.vat,regularUnitHT:regular,promotion:campaign?{id:campaign.id,title:campaign.title,end:campaign.end}:null,estimated:!!calculated.estimated,version:snapshot.approvedAt};
 const unitCost=result.known===false?null:(result.cout??result.cb??null);
 return {quote,configuration:calculated.configuration,internal:{unitCostHT:Number.isFinite(unitCost)?unitCost:null,marginRate:Number.isFinite(unitCost)?(result.price-unitCost)/result.price:null,marginTotalHT:Number.isFinite(unitCost)?(result.price-unitCost)*p.q:null,manualRule:!!result.manual,interpolatedRule:!!result.interpolated,basePriceHT:result.basePrice??regular,...costDetail(snapshot,p,result)}};
}
// Détail interne du coût (CRM privé, jamais dans `quote`) : transport au kilo, poids, part usine, frais fixes, plancher, marge minimale.
function costDetail(snapshot,p,r){
 const fin=v=>Number.isFinite(v)?v:null,h=snapshot.kind==='mylar'?(snapshot.shared||snapshot.hyp):snapshot.hyp,modes=h.modes||{},id=Object.hasOwn(modes,p.mode||'')?p.mode:Object.hasOwn(modes,h.mode||'')?h.mode:'air',m=modes[id]||{};
 const known=snapshot.kind==='mylar'?true:r.known!==false,grams=snapshot.kind==='mylar'?r.w:r.wg;
 const floorRate=snapshot.kind==='g'?null:(p.q>=h.qB?h.mB:h.mS);
 return {transport:{mode:id,name:String(m.n||id),days:fin(Number(m.d)),ratePerKg:fin(r.rate),unitWeightKg:fin(grams/1000),totalKg:fin(r.totKg),unitHT:fin(r.tr),totalHT:fin(r.tr*p.q),includedInCost:snapshot.kind==='g'?!!h.incTr:true},
  factoryUnitHT:known?fin(snapshot.kind==='g'?r.cost:r.usine):null,fixedUnitHT:fin(r.fx),optionFeesUnitHT:snapshot.kind==='stk'?fin(r.extra):null,
  floorUnitHT:snapshot.kind==='g'||!known?null:fin(r.floor),marginFloorRate:fin(floorRate)};
}
export function quoteSnapshot(snapshot,configuration,campaign=null){return priceSnapshot(snapshot,configuration,campaign).quote;}
// Configuration d'un palier personnalisé (clé du document) telle qu'attendue par /price ; null si la clé est inexploitable.
export function tierConfiguration(snapshot,tier){
 let a;try{a=JSON.parse(tier.key)}catch{return null}
 if(!Array.isArray(a)||a[0]!==snapshot.product)return null;
 if(snapshot.kind==='g')return {v:a[1],q:a[2]};
 if(snapshot.kind==='stk')return {sh:a[1],w:a[2],h:a[3],q:a[4],mat:a[5],fin:a[6],cond:a[7]};
 // Mylar : la clé ne porte pas la matière ; elle est reprise du format du tarif usine correspondant.
 const row=(snapshot.rows||[]).find(r=>r.t===a[1]&&Number(r.th)===a[2]&&Math.abs(r.L-a[3])<1.5&&Math.abs(r.H-a[4])<1.5&&Math.abs((r.G||0)-a[5])<1.5);
 return row?{t:a[1],m:row.m,L:row.L,H:row.H,G:row.G||0,q:a[6]}:null;
}
// Paliers personnalisés d'un produit (quantité + prix HT courant, fixé ou interpolé), liste blanche sans coût.
export function customTiers(snapshot){
 return (snapshot.tiers||[]).map(tier=>{const configuration=tierConfiguration(snapshot,tier);if(!configuration)return null;
  let unitHT=null,manual=false;try{const d=priceSnapshot(snapshot,configuration);unitHT=d.quote.unitHT;manual=d.internal.manualRule}catch{unitHT=null}
  return {quantity:tier.q,unitHT,fixed:manual&&Object.hasOwn(snapshot.rules||{},tier.key),configuration}}).filter(Boolean);
}
// Catalogue publié (liste blanche, sans coût) : partagé par la route publique et la route privée CRM.
export function catalogEntries(published){return Object.entries(published).map(([id,p])=>({id,name:p.name,kind:p.kind,approvedAt:p.approvedAt,variants:p.kind==='g'?p.hyp.vars.map(v=>({id:v.id,name:v.n})):[],formats:p.kind==='mylar'?[...new Map(p.rows.map(r=>[r.ref,{ref:r.ref,t:r.t,m:r.m,L:r.L,H:r.H,G:r.G||0}])).values()]:[],...(p.kind==='stk'?Object.fromEntries([['shapes','sh'],['materials','pm'],['finishes','fin'],['packaging','cond']].map(([out,k])=>[out,Object.entries(p.hyp[k]).map(([id,v])=>({id,name:v.n||id}))])):{}),minimum:p.kind==='mylar'?200:p.kind==='stk'?p.hyp.minQ:1,customTiers:customTiers(p)}));}
// Lecture stricte (routes CRM) : n'initialise jamais le stockage de l'acteur, n'écrit jamais dans KV.
export async function readOnlyDocument(env,name){if(env.DOCUMENTS){const actor=env.DOCUMENTS.get(env.DOCUMENTS.idFromName('sklubs-pricing-v1'));return (await actor.fetch(new Request('https://documents.internal/'+name,{headers:{'X-Read-Only':'1'}}))).json()}const raw=await env.DATA.get(name);return raw?JSON.parse(raw):{data:null,version:0}}
export async function privateDocument(env,name){if(env.DOCUMENTS){const actor=env.DOCUMENTS.get(env.DOCUMENTS.idFromName('sklubs-pricing-v1'));return (await actor.fetch(new Request('https://documents.internal/'+name))).json()}const raw=await env.DATA.get(name);return raw?JSON.parse(raw):{data:null,version:0}}
export async function publicPricingRoute(request,env,url){
 if(!url.pathname.startsWith('/api/public/'))return null;
 if(url.pathname==='/api/public/connector.zip'&&request.method==='GET'&&env.ASSETS){const asset=await env.ASSETS.fetch(new Request(new URL('/sklubs-tarifs-centraux.zip',url.origin)));return new Response(asset.body,{status:asset.status,headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="sklubs-tarifs-centraux.zip"','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=300'}})}
 const origin=request.headers.get('Origin'),allowed=['https://sklubs.com','https://www.sklubs.com','https://sklubs.fr','https://www.sklubs.fr'];
 const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Vary':'Origin'};if(origin&&allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
 if(origin&&!allowed.includes(origin))return json({error:'origine'},403);
 try{
  const site=url.searchParams.get('site');if(!sites.includes(site))return json({error:'site requis'},400);
  const doc=await privateDocument(env,'cfg_publications'),published=doc.data?.sites?.[site]||{};
  if(request.method==='GET'&&url.pathname==='/api/public/catalog')return json({site,scope:{id:'default',zone:null,country:null,currency:'EUR'},products:catalogEntries(published)});
  if(request.method!=='POST'||url.pathname!=='/api/public/quote')return json({error:'méthode'},405);
  const raw=await request.text();if(raw.length>4000)return json({error:'taille'},413);let body;try{body=JSON.parse(raw)}catch{return json({error:'JSON'},400)}
  const snapshot=published[body.product];if(!snapshot)return json({error:'Tarif non publié pour ce produit sur ce site.'},404);
  if(!body.configuration||typeof body.configuration!=='object'||Array.isArray(body.configuration))return json({error:'configuration'},422);
  const campaignDoc=await privateDocument(env,'cfg_promotions'),campaign=campaigns.active(campaignDoc.data,site,body.product);
  return json(quoteSnapshot(snapshot,body.configuration,campaign));
 }catch(error){return json({error:error.message||'Devis indisponible'},422)}
}
