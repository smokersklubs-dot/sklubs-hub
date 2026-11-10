// Indices officiels, jamais présentés comme cotations de marché en temps réel.
export const MARKET_SOURCES = [
 ['alu','Aluminium','$/t','fred','PALUMUSDM','FMI via FRED','monthly'],
 ['zinc','Zinc','$/t','fred','PZINCUSDM','FMI via FRED','monthly'],
 ['copper','Cuivre','$/t','fred','PCOPPUSDM','FMI via FRED','monthly'],
 ['tin','Étain','$/t','fred','PTINUSDM','FMI via FRED','monthly'],
 ['nickel','Nickel','$/t','fred','PNICKUSDM','FMI via FRED','monthly'],
 ['cotton','Coton, indice A','c$/lb','fred','PCOTTINDUSDM','FMI via FRED','monthly'],
 ['rubber','Caoutchouc','c$/kg','fred','PRUBBUSDM','FMI via FRED','monthly'],
 ['brent','Brent, moyenne mensuelle','$/baril','fred','POILBREUSDM','FMI via FRED','monthly'],
 ['brent_daily','Brent, indicateur quotidien','$/baril','fred','DCOILBRENTEU','EIA via FRED','daily'],
 ['polyester','Fibres polyester, indice industriel US','indice','fred','PCU3252203252207','BLS via FRED','monthly'],
 ['resins_us','Résines plastiques, indice industriel US','indice','fred','WPU066','BLS via FRED','monthly'],
 ['eu_plastic','Plastiques de base UE, indice proxy PVC/PET/PP','indice 2021=100','estat','C2016','Eurostat','monthly'],
 ['eu_paper','Papier et carton UE','indice 2021=100','estat','C171','Eurostat','monthly'],
 ['eu_textile','Textiles UE','indice 2021=100','estat','C13','Eurostat','monthly']
];
export function parseFred(text,frequency='monthly') {
 const rows=text.trim().split(/\r?\n/).slice(1).map(line=>line.split(','));
 const points=rows.filter(([date,value])=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Number(value))&&value!==''&&value!=='.').map(([d,v])=>[frequency==='daily'?d:d.slice(0,7),Number(v)]);
 if(points.length<2)throw new Error('Série FRED sans observations valides');
 return points.slice(frequency==='daily'?-90:-36);
}
export function parseEurostat(data) {
 const time=data.dimension?.time?.category?.index;
 if(!time||!data.value)throw new Error('Réponse Eurostat non reconnue');
 for(const key of data.id||[])if(key!=='time'&&(data.dimension[key]?.category?.index&&Object.keys(data.dimension[key].category.index).length!==1))throw new Error('Plusieurs séries Eurostat, sélection à préciser');
 const inverse={};for(const [date,index] of Object.entries(time))inverse[index]=date;
 const points=Object.entries(data.value).filter(([i,v])=>inverse[i]&&typeof v==='number'&&Number.isFinite(v)).map(([i,v])=>[inverse[i],v]).sort((a,b)=>a[0].localeCompare(b[0]));
 if(points.length<2)throw new Error('Série Eurostat sans observations valides');
 return points.slice(-36);
}
export async function refreshMarkets(previous={},fetcher=fetch,now=new Date()) {
 const checkedAt=now.toISOString(),series={...(previous.series||{})},errors=[];
 const settled=await Promise.allSettled(MARKET_SOURCES.map(async([key,n,u,provider,id,s,frequency])=>{
  const url=provider==='fred'?'https://fred.stlouisfed.org/graph/fredgraph.csv?id='+id+'&cosd=2023-01-01':'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sts_inpp_m?format=JSON&lang=EN&freq=M&nace_r2='+id+'&s_adj=NSA&unit=I21&indic_bt=PRC_PRR&geo=EU27_2020&sinceTimePeriod=2023-01';
  const response=await fetcher(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('HTTP '+response.status);
  const p=provider==='fred'?parseFred(await response.text(),frequency):parseEurostat(await response.json());
  return {key,value:{n,u,s,p,frequency,sourceId:id,url:provider==='fred'?'https://fred.stlouisfed.org/series/'+id:url,checkedAt,observationDate:p.at(-1)[0],status:'ok'}};
 }));
 settled.forEach((result,i)=>{
  const key=MARKET_SOURCES[i][0];
  if(result.status==='fulfilled')series[key]=result.value.value;
  else {errors.push({key,error:String(result.reason.message||result.reason)});if(series[key])series[key]={...series[key],status:'cached',lastFailedAt:checkedAt};}
 });
 let exchange=previous.exchange||null;
 try{
  const response=await fetcher('https://api.frankfurter.dev/v1/latest?base=CNY&symbols=EUR',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('HTTP '+response.status);
  const j=await response.json(),rate=j.rates?.EUR;if(!(rate>.01&&rate<.5)||!/^\d{4}-\d{2}-\d{2}$/.test(j.date))throw new Error('Taux ou date non valide');
  exchange={base:'CNY',quote:'EUR',rate,date:j.date,checkedAt,source:'BCE via Frankfurter',url:'https://api.frankfurter.dev/v1/latest?base=CNY&symbols=EUR',status:'ok'};
 }catch(error){errors.push({key:'exchange',error:String(error.message)});if(exchange)exchange={...exchange,status:'cached',lastFailedAt:checkedAt}}
 // Dollar → euro (liste d'achat « Mylar alimentaire », fiche en USD) : même source BCE, même règle : jamais de taux inventé.
 let exchangeUsd=previous.exchangeUsd||null;
 try{
  const url='https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR',response=await fetcher(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('HTTP '+response.status);
  const j=await response.json(),rate=j.rates?.EUR;if(!(rate>.5&&rate<1.5)||!/^\d{4}-\d{2}-\d{2}$/.test(j.date))throw new Error('Taux ou date non valide');
  exchangeUsd={base:'USD',quote:'EUR',rate,date:j.date,checkedAt,source:'BCE via Frankfurter',url,status:'ok'};
 }catch(error){errors.push({key:'exchangeUsd',error:String(error.message)});if(exchangeUsd)exchangeUsd={...exchangeUsd,status:'cached',lastFailedAt:checkedAt}}
 return {checkedAt,updated:checkedAt.slice(0,10),series,exchange,exchangeUsd,errors,policy:'read_only_manual_application'};
}
