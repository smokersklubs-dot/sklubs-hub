// Catalogue ENRICHI pour le CRM privé (route /api/crm/v1/catalog, jeton serveur à serveur).
// Jamais servi aux routes publiques des sites (/api/public/catalog garde catalogEntries tel quel).
// Ajoute ce que le hub sait déjà et que le CRM ne recevait pas : modes de transport et délais, TVA, échelle et plage
// de quantités, épaisseur et photo de chaque format Mylar, libellés des matières, types de sachet avec photo,
// coefficients et frais fixes des options stickers, photo de chaque produit.
// Bloc `internal` (demande de Lemexx du 6 novembre 2026, route CRM privée seulement) : tarifs de transport au kilo par
// mode, poids, frais fixes par commande et marges minimales du hub. Jamais servi aux sites ; le CRM le réserve au droit
// finance. Toujours exclus : taux RMB, prix usine bruts, indices matière.
import {catalogEntries} from './public-pricing.mjs';
import {offCatalogCost,offCatalogKey} from './mylar-off-catalog.mjs';

export const MYLAR_QUANTITIES=[200,300,500,1000,2000,3000,5000];
export const DEFAULT_QUANTITIES=[100,250,500,1000,2500,5000,10000];
// Plage acceptée par /price (public-pricing.mjs) : Mylar 200 à 5 000 pièces (bornes des devis usine) ; stickers minQ du hub.
export const MYLAR_RANGE={min:200,max:5000};
const MAX_Q=10_000_000;
// Mêmes libellés que l'écran du hub (public/index.html : MAT et PHT).
// Épaisseurs proposées au client (décision de Lemexx du 6 novembre 2026). Une épaisseur sans prix usine dans le tarif
// reste « à chiffrer » : aucun prix n'est inventé, elle devient chiffrable dès que des formats à cette épaisseur existent.
export const MYLAR_THICKNESS_OFFER=[0.1,0.12,0.13,0.14];
export const MATERIAL_LABELS={'MOPP/VMPET/PE':'Métallisé','MOPP/AL/PE':'Aluminium'};
// Composition en clair (couches extérieure / barrière / intérieure).
export const MATERIAL_DESCRIPTIONS={'MOPP/VMPET/PE':'Polypropylène mat (MOPP) · PET métallisé (VMPET) · polyéthylène (PE)','MOPP/AL/PE':'Polypropylène mat (MOPP) · aluminium (AL) · polyéthylène (PE)'};
export const TYPE_PHOTOS={'Doypack à zip':'doypack_zip','Best-seller KHH':'doypack_zip','Doypack sans zip':'doypack_nozip','3 soudures à zip (plat)':'flat3_zip','3 soudures ouv. bas (sans zip)':'flat3_open','8 soudures à zip (fond plat)':'flatbottom','Doypack diamant à zip':'diamond'};
const GENERIC_PHOTOS=new Set(['badge','beanie','bottle','bucket','businesscard','cap','lanyard','patch','pen','pin','sock','tote','tshirt']);

/** Modes de transport publiés : nom et délai en jours, mode par défaut ; jamais le tarif au kilo. */
export function transportModes(hyp){
 const modes=hyp&&typeof hyp.modes==='object'?hyp.modes:{},def=hyp?.mode&&Object.hasOwn(modes,hyp.mode)?hyp.mode:'air';
 return Object.entries(modes).map(([id,m])=>({id,name:String(m?.n||id),days:Number.isFinite(Number(m?.d))?Number(m.d):null,default:id===def}));
}
function quantityPlan(kind,min){
 const range=kind==='mylar'?{...MYLAR_RANGE}:{min:Math.max(1,Number(min)||1),max:MAX_Q};
 const base=kind==='mylar'?MYLAR_QUANTITIES:DEFAULT_QUANTITIES;
 const quantities=[...new Set([...(range.min>1&&!base.includes(range.min)?[range.min]:[]),...base.filter(q=>q>=range.min&&q<=range.max)])].sort((a,b)=>a-b);
 return {quantityRange:range,quantities};
}
/** Chemin d'image relatif (« mylar/doypack_zip_11.jpg »), lisible par le CRM via GET /api/crm/v1/image/<chemin>. */
function productImage(id,manifest){
 if(id==='mylar')return manifest?.types?.doypack_zip?.[0]??null;
 if(id==='stk')return 'produits/sticker_set.jpg';
 return GENERIC_PHOTOS.has(id)?`produits/${id}.jpg`:null;
}
/** Tarifs de transport au kilo (paliers de poids total), par mode : même table que le moteur (rateFor / grate). */
export function transportRates(modes){return Object.entries(modes||{}).map(([id,m])=>({id,name:String(m?.n||id),rates:[...(Array.isArray(m?.t)?m.t:[])].filter(r=>Array.isArray(r)&&Number.isFinite(Number(r[0]))&&Number.isFinite(Number(r[1]))).sort((a,b)=>a[0]-b[0]).map(([k,v])=>({fromKg:Number(k),eurPerKg:Number(v)}))}))}
const num=v=>Number.isFinite(Number(v))?Number(v):null;
/** Données internes du tarif (CRM privé) : transport au kilo, poids, frais fixes, marges minimales. */
function internalTariff(kind,s){
 if(kind==='mylar'){const H=s.shared||s.hyp;return {transport:{modes:transportRates(H.modes),includedInCost:true,weight:{basis:'format',densityGPerCm3:num(H.dens),overweight:num(H.over)}},fixedCostPerOrderHT:num(H.fixed),marginFloor:{small:num(H.mS),large:num(H.mB),largeFrom:num(H.qB)},
  // Matières hors catalogue : coût usine en € par pièce aux quantités cotées (marchandise, fret annoncé, frais fixes), jamais de prix de vente inventé.
  offCatalog:(s.offCatalog||[]).map(o=>({materialId:o.id,name:o.name,source:o.source,receivedAt:o.receivedAt,costsHT:o.tiers.map(t=>{const c=offCatalogCost(o,t.q,H,s.materialAdjustment||0);return c?{quantity:t.q,factoryUnitHT:c.usine,freightUnitHT:c.tr,freightApprox:c.freightApprox,fixedUnitHT:c.fx,unitCostHT:c.cout}:{quantity:t.q}})}))};}
 const h=s.hyp||{};
 if(kind==='stk')return {transport:{modes:transportRates(h.modes),includedInCost:true,weight:{basis:'surface',gsm:num(h.gsm),overweight:num(h.over),waste:num(h.chute)}},fixedCostPerOrderHT:num(h.fixed),marginFloor:{small:num(h.mS),large:num(h.mB),largeFrom:num(h.qB)}};
 // Produits génériques : prix selon la courbe du hub, sans plancher de marge dans le moteur (à venir) ; transport compté
// dans le coût par défaut (incTr, décision de Lemexx du 6 novembre 2026).
 return {transport:{modes:transportRates(h.modes),includedInCost:!!h.incTr,weight:{basis:'piece',unitWeightKg:Number.isFinite(Number(h.wg))?Math.round(Number(h.wg)*(1+(Number(h.over)||0))*1000)/1e6:null}},fixedCostPerOrderHT:num(h.fixed),marginFloor:null};
}
const choice=(dict,withFee=false)=>Object.entries(dict||{}).map(([id,v])=>({id,name:String(v?.n||id),factor:Number.isFinite(Number(v?.c))?Number(v.c):1,...(withFee?{fixedFee:Number.isFinite(Number(v?.fix))?Number(v.fix):0}:{})}));

export function crmCatalogEntries(published,manifest=null){
 return catalogEntries(published).map(entry=>{
  const s=published[entry.id],hyp=s?.hyp||{};
  const extra={internal:internalTariff(entry.kind,s),vatRate:Number.isFinite(Number(s?.shared?.vat))?Number(s.shared.vat):null,modes:transportModes(hyp),image:productImage(entry.id,manifest),...quantityPlan(entry.kind,entry.minimum)};
  if(entry.kind==='mylar'){
   const th=new Map((s.rows||[]).map(r=>[r.ref,Number(r.th)]));
   const types=[...new Set(entry.formats.map(f=>f.t))];
   return {...entry,...extra,
    formats:entry.formats.map(f=>({...f,thickness:Number.isFinite(th.get(f.ref))?th.get(f.ref):null,image:manifest?.mylar_par_format?.[f.ref]??manifest?.types?.[TYPE_PHOTOS[f.t]||'doypack_zip']?.[0]??null})),
    types:types.map(t=>({id:t,name:t,image:manifest?.types?.[TYPE_PHOTOS[t]||'doypack_zip']?.[0]??null,formats:entry.formats.filter(f=>f.t===t).length})),
    materials:[...[...new Set(entry.formats.map(f=>f.m))].map(m=>({id:m,name:MATERIAL_LABELS[m]||m,description:MATERIAL_DESCRIPTIONS[m]||null,thicknesses:[...new Set(entry.formats.filter(f=>f.m===m).map(f=>th.get(f.ref)).filter(Number.isFinite))].sort((a,b)=>a-b)})),
     // Matières hors catalogue : proposées au choix « Matière » du CRM sans format ni configuration préremplis ; prix de vente à saisir dans le hub.
     ...(s.offCatalog||[]).map(o=>({id:o.id,name:o.name,description:o.description,thicknesses:[],offCatalog:true,status:o.status,receivedAt:o.receivedAt,unknown:o.unknown,quotedQuantities:o.tiers.map(t=>t.q),salePrice:'à saisir dans le hub',margin:'à valider'}))],
    offCatalog:(s.offCatalog||[]).map(o=>({materialId:o.id,ref:o.ref,name:o.name,status:o.status,receivedAt:o.receivedAt,unknown:o.unknown,quotedQuantities:o.tiers.map(t=>t.q),pricedQuantities:o.tiers.map(t=>t.q).filter(q=>Number.isFinite(Number(s.rules?.[offCatalogKey(o.ref,q)])))})),
    thicknesses:[...new Set([...th.values()].filter(Number.isFinite))].sort((a,b)=>a-b),
    thicknessOffer:[...new Set([...MYLAR_THICKNESS_OFFER,...th.values()].filter(Number.isFinite))].sort((a,b)=>a-b).map(v=>({value:v,priced:[...th.values()].includes(v)})),
    // Le hub ne modélise pas de finition Mylar séparée (mat, brillant, fenêtre) : le zip fait partie du type de sachet.
    options:[]};
  }
  if(entry.kind==='stk')return {...entry,...extra,shapes:choice(hyp.sh),materials:choice(hyp.pm),finishes:choice(hyp.fin,true),packaging:choice(hyp.cond,true)};
  return {...entry,...extra};
 });
}
