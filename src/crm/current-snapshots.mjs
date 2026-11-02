// Prix « en cours » du hub pour le CRM (lecture seule) : même instantané que le bouton de publication
// (PRICE_TABLE_API.snapshot), mais reconstruit à partir des documents ENREGISTRÉS du hub, sans clic de publication.
// - Lit : cfg_hyp, cfg_veille, cfg_zhyp, cfg_zveille, cfg_g_<produit>, cfg_price_<produit>, KV mat_series.
// - Ne lit jamais : cfg_publications, ni les brouillons non enregistrés (ils ne vivent que dans le navigateur).
// - N'écrit jamais : lecture stricte (readOnlyDocument) et KV en lecture.
import {createCurrentPricing} from './current-pricing.mjs';
import {createPriceRules} from './price-rules.mjs';
import {PRODUCT_IDS} from './campaigns.mjs';
import {readOnlyDocument} from './public-pricing.mjs';

const rules=createPriceRules(),clone=x=>JSON.parse(JSON.stringify(x));
// Documents dont dépend le prix de chaque produit (cfg_hyp porte le taux RMB, la TVA et les réserves partagées).
export const sourceDocuments=id=>id==='mylar'?['cfg_hyp','cfg_veille','cfg_price_mylar']:id==='stk'?['cfg_hyp','cfg_zhyp','cfg_zveille','cfg_price_stk']:['cfg_hyp','cfg_g_'+id,'cfg_price_'+id];

// Documents propres au produit (hors hypothèses partagées) : servent à dire si le produit a été réglé dans le hub ou s'il reste sur les valeurs par défaut.
export const ownDocuments=id=>id==='mylar'?['cfg_hyp','cfg_veille','cfg_price_mylar']:id==='stk'?['cfg_zhyp','cfg_zveille','cfg_price_stk']:['cfg_g_'+id,'cfg_price_'+id];

export async function currentSnapshots(env,ids=PRODUCT_IDS){
 const names=[...new Set(['cfg_hyp','cfg_veille','cfg_zhyp','cfg_zveille',...ids.flatMap(sourceDocuments)])];
 const docs=Object.fromEntries(await Promise.all(names.map(async name=>[name,await readOnlyDocument(env,name)])));
 let market=null;try{const raw=await env.DATA.get('mat_series');market=raw?JSON.parse(raw):null}catch{market=null}
 const hub=createCurrentPricing(docs,market),out={},unreadable=[];
 for(const id of ids){
  const price=docs['cfg_price_'+id]?.data;
  // Même règle que l'écran du hub : un document de prix fixés invalide rend le tarif indisponible.
  if(price&&!rules.validDocument(id,price)){unreadable.push(id);continue}
  const common={product:id,name:hub.names[id],rules:clone(price?.rules||{}),scope:{id:'default',zone:null,country:null,currency:'EUR'},shared:clone(hub.H)};
  const snapshot=id==='mylar'?{...common,kind:'mylar',hyp:clone(hub.H),rows:clone(hub.rows),marketFactor:hub.MKF,materialAdjustment:hub.MADJ}
   :id==='stk'?{...common,kind:'stk',...clone(hub.sticker())}:{...common,kind:'g',hyp:clone(hub.generic(id))};
  const used=sourceDocuments(id),version=Math.max(0,...used.map(n=>docs[n]?.version||0));
  snapshot.approvedAt=version?new Date(version).toISOString():null;
  out[id]={snapshot,documentVersion:version,savedDocuments:ownDocuments(id).filter(n=>(docs[n]?.version||0)>0)};
 }
 return {products:out,unreadable,documentVersion:Math.max(0,...names.map(n=>docs[n]?.version||0))};
}
