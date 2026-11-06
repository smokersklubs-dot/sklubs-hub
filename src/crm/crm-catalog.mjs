// Catalogue ENRICHI pour le CRM privé (route /api/crm/v1/catalog, jeton serveur à serveur).
// Jamais servi aux routes publiques des sites (/api/public/catalog garde catalogEntries tel quel).
// Ajoute ce que le hub sait déjà et que le CRM ne recevait pas : modes de transport et délais, TVA, échelle et plage
// de quantités, épaisseur et photo de chaque format Mylar, libellés des matières, types de sachet avec photo,
// coefficients et frais fixes des options stickers, photo de chaque produit. Aucun coût usine, aucune marge, aucun tarif
// de transport au kilo : ces données restent internes au hub.
import {catalogEntries} from './public-pricing.mjs';

export const MYLAR_QUANTITIES=[200,300,500,1000,2000,3000,5000];
export const DEFAULT_QUANTITIES=[100,250,500,1000,2500,5000,10000];
// Plage acceptée par /price (public-pricing.mjs) : Mylar 200 à 5 000 pièces (bornes des devis usine) ; stickers minQ du hub.
export const MYLAR_RANGE={min:200,max:5000};
const MAX_Q=10_000_000;
// Mêmes libellés que l'écran du hub (public/index.html : MAT et PHT).
export const MATERIAL_LABELS={'MOPP/VMPET/PE':'Métallisé','MOPP/AL/PE':'Aluminium'};
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
const choice=(dict,withFee=false)=>Object.entries(dict||{}).map(([id,v])=>({id,name:String(v?.n||id),factor:Number.isFinite(Number(v?.c))?Number(v.c):1,...(withFee?{fixedFee:Number.isFinite(Number(v?.fix))?Number(v.fix):0}:{})}));

export function crmCatalogEntries(published,manifest=null){
 return catalogEntries(published).map(entry=>{
  const s=published[entry.id],hyp=s?.hyp||{};
  const extra={vatRate:Number.isFinite(Number(s?.shared?.vat))?Number(s.shared.vat):null,modes:transportModes(hyp),image:productImage(entry.id,manifest),...quantityPlan(entry.kind,entry.minimum)};
  if(entry.kind==='mylar'){
   const th=new Map((s.rows||[]).map(r=>[r.ref,Number(r.th)]));
   const types=[...new Set(entry.formats.map(f=>f.t))];
   return {...entry,...extra,
    formats:entry.formats.map(f=>({...f,thickness:Number.isFinite(th.get(f.ref))?th.get(f.ref):null,image:manifest?.mylar_par_format?.[f.ref]??manifest?.types?.[TYPE_PHOTOS[f.t]||'doypack_zip']?.[0]??null})),
    types:types.map(t=>({id:t,name:t,image:manifest?.types?.[TYPE_PHOTOS[t]||'doypack_zip']?.[0]??null,formats:entry.formats.filter(f=>f.t===t).length})),
    materials:[...new Set(entry.formats.map(f=>f.m))].map(m=>({id:m,name:MATERIAL_LABELS[m]||m})),
    // Le hub ne modélise pas de finition Mylar séparée (mat, brillant, fenêtre) : le zip fait partie du type de sachet.
    options:[]};
  }
  if(entry.kind==='stk')return {...entry,...extra,shapes:choice(hyp.sh),materials:choice(hyp.pm),finishes:choice(hyp.fin,true),packaging:choice(hyp.cond,true)};
  return {...entry,...extra};
 });
}
