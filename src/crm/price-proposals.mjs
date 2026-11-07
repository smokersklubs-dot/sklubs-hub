// Propositions de tarif de l'agent du CRM (7 novembre 2026, demande de Lemexx : « l'agent doit pouvoir remplir les tarifs »).
// - Le CRM DÉPOSE une proposition (prix HT d'un palier précis) : aucun tarif ne change à ce moment-là.
// - Lemexx l'ACCEPTE ou la REFUSE dans le hub (page protégée) : seule l'acceptation écrit le document cfg_price_<produit>,
//   par le même calcul que le tableau du hub (price-rules.change), avec une ligne d'historique.
// - Le prix plancher (marge minimale) reste appliqué par le moteur : un prix proposé dessous est relevé au plancher.
// - File gardée dans hub.kv (clé price_proposals) : aucune nouvelle table, aucune migration.
import {priceSnapshot} from './public-pricing.mjs';
import {createPriceRules} from './price-rules.mjs';
import {PRODUCT_IDS} from './campaigns.mjs';

const rules=createPriceRules();
export const STORE_KEY='price_proposals',MAX_PENDING=100,MAX_KEPT=300;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const round3=n=>Math.round((n+Number.EPSILON)*1000)/1000;

/** Contrôle d'une proposition reçue du CRM. Renvoie {value} ou {error}. */
export function validateProposalInput(body){
 if(!plain(body))return {error:'JSON objet attendu'};
 const allowed=['productId','configuration','quantity','unitHT','reason','author','source'];
 const extra=Object.keys(body).filter(k=>!allowed.includes(k));if(extra.length)return {error:'champ inconnu : '+extra.join(', ')};
 if(!PRODUCT_IDS.includes(body.productId))return {error:'productId inconnu'};
 if(!Number.isInteger(body.quantity)||body.quantity<1||body.quantity>1e7)return {error:'quantity : entier entre 1 et 10 000 000'};
 if(!rules.validPrice(body.unitHT))return {error:'unitHT : prix HT entre 0,001 et 100 000 €'};
 const configuration=body.configuration===undefined?{}:body.configuration;
 if(!plain(configuration)||Object.keys(configuration).length>12)return {error:'configuration : objet de 12 champs maximum'};
 for(const [k,v] of Object.entries(configuration)){
  if(!/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(k)||k==='rate'||k==='q')return {error:'configuration : champ refusé ('+k+')'};
  if(!(typeof v==='string'&&v.length<=100)&&!(typeof v==='number'&&Number.isFinite(v)))return {error:'configuration : valeur invalide ('+k+')'};
 }
 const reason=text(body.reason,500);if(reason.length<3)return {error:'reason : dire pourquoi ce prix (3 caractères minimum)'};
 const author=plain(body.author)?{id:text(body.author.id,64),name:text(body.author.name,120)}:null;
 if(!author||!author.name)return {error:'author : nom de la personne qui a demandé la proposition'};
 return {value:{productId:body.productId,configuration,quantity:body.quantity,unitHT:round3(body.unitHT),reason,author,source:text(body.source,200)}};
}

// Mylar : la proposition vise un format de la grille (référence « K1# » ou type + matière + dimensions), jamais une taille estimée.
function configurationFor(snapshot,input){
 const c={...input.configuration};
 if(snapshot.kind==='mylar'&&c.ref!==undefined){
  const row=(snapshot.rows||[]).find(r=>r.ref===c.ref);if(!row)throw new Error('Format Mylar inconnu : '+c.ref);
  const {ref:_,...rest}=c;void _;return {...rest,t:row.t,m:c.m??row.m,L:row.L,H:row.H,G:row.G||0,q:input.quantity};
 }
 return {...c,q:input.quantity};
}
function describe(snapshot,configuration){
 if(snapshot.kind==='mylar'){const row=(snapshot.rows||[]).find(r=>r.t===configuration.t&&Math.abs(r.L-configuration.L)<1.5&&Math.abs(r.H-configuration.H)<1.5&&Math.abs((r.G||0)-(configuration.G||0))<1.5);
  return [row?.ref,configuration.t,`${configuration.L} × ${configuration.H}${configuration.G?' + '+configuration.G:''} mm`,configuration.th?(Number(configuration.th)<1?Math.round(Number(configuration.th)*1000):configuration.th)+' µm':null].filter(Boolean).join(' · ');}
 if(snapshot.kind==='stk')return `Sticker ${configuration.sh} ${configuration.w} × ${configuration.h} mm · ${configuration.mat} · ${configuration.fin} · ${configuration.cond}`;
 const v=(snapshot.hyp?.vars||[]).find(x=>x.id===configuration.v);return v?.n||configuration.v||'Variante de base';
}

/** Proposition complète à partir du tarif en cours : clé du palier, prix actuel, prix plancher. */
export function buildProposal(snapshot,input,{id,now=new Date(),standardQuantities=[]}={}){
 let detail;
 try{detail=priceSnapshot(snapshot,configurationFor(snapshot,input))}catch(e){throw Object.assign(new Error(e.message||'Configuration non chiffrable'),{status:422})}
 if(snapshot.kind==='mylar'&&detail.quote.estimated)throw Object.assign(new Error('Format hors de la grille du hub : un prix ne se fixe que sur un format de la grille.'),{status:422});
 const configuration=detail.configuration,key=rules.key(snapshot.product,configuration),floor=detail.internal.floorUnitHT;
 return {id,createdAt:now.toISOString(),status:'pending',productId:snapshot.product,productName:snapshot.name||snapshot.product,
  label:describe(snapshot,configuration),key,quantity:input.quantity,configuration,
  currentUnitHT:detail.quote.unitHT,currentFixed:Object.hasOwn(snapshot.rules||{},key),proposedUnitHT:input.unitHT,
  floorUnitHT:Number.isFinite(floor)?floor:null,newTier:!standardQuantities.includes(input.quantity),
  reason:input.reason,author:input.author,source:input.source,decidedAt:null,decidedBy:null,appliedUnitHT:null,error:null};
}

/** Ajout dans la file : une proposition en attente sur le même palier est remplacée (la dernière demande compte). */
export function addProposal(items,proposal){
 const list=items.filter(p=>!(p.status==='pending'&&p.key===proposal.key&&p.productId===proposal.productId));
 if(list.filter(p=>p.status==='pending').length>=MAX_PENDING)throw Object.assign(new Error('Trop de propositions en attente dans le hub : traitez-les avant d’en envoyer d’autres.'),{status:429});
 list.unshift(proposal);
 // Au-delà de MAX_KEPT, les plus anciennes propositions déjà traitées sortent de la file (jamais une proposition en attente).
 while(list.length>MAX_KEPT){let i=list.length-1;while(i>=0&&list[i].status==='pending')i--;if(i<0)break;list.splice(i,1)}
 return list;
}

/** Nouveau document de prix fixés après acceptation (même calcul et même historique que le tableau du hub). */
export function acceptedDocument(document,proposal,now=new Date()){
 const doc=document&&rules.validDocument(proposal.productId,document)?document:rules.empty();
 const tiers=Array.isArray(doc.tiers)?doc.tiers:[];
 const nextTiers=proposal.newTier&&!tiers.some(t=>t.key===proposal.key)?[...tiers,{key:proposal.key,q:proposal.quantity}]:undefined;
 const label=('Proposition de l’agent acceptée : '+proposal.label+' · '+proposal.quantity+' ex.').slice(0,190);
 const next=rules.change(doc,{[proposal.key]:proposal.proposedUnitHT},label,now,nextTiers,proposal.productId);
 if(!rules.validDocument(proposal.productId,next))throw Object.assign(new Error('Document de prix invalide après la proposition.'),{status:422});
 return next;
}

/** Vue pour le CRM : ni coût, ni plancher, ni marge. */
export const crmView=p=>({id:p.id,createdAt:p.createdAt,status:p.status,productId:p.productId,productName:p.productName,label:p.label,quantity:p.quantity,
 currentUnitHT:p.currentUnitHT,proposedUnitHT:p.proposedUnitHT,appliedUnitHT:p.appliedUnitHT,reason:p.reason,decidedAt:p.decidedAt});

/** File en mémoire (recette locale et tests), même contrat que la file PostgreSQL. */
export function memoryProposalStore(){
 let items=[];
 return {async list(){return JSON.parse(JSON.stringify(items))},
  async mutate(fn){const copy=JSON.parse(JSON.stringify(items)),out=await fn(copy);items=out.items;return out.result}};
}
