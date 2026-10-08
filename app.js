(() => {
  'use strict';

  const CFG = window.HEXA_CONFIG;
  const $ = id => document.getElementById(id);
  const now = () => new Date();
  const fmtMoney = n => n == null || !Number.isFinite(n) ? '—' : '₹' + Math.round(n).toLocaleString('en-IN');
  const fmtDate = d => d instanceof Date && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  const daysAgo = d => d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)) : null;
  const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const median = values => {
    const a = values.filter(v => v != null && Number.isFinite(v)).slice().sort((x,y)=>x-y);
    if (!a.length) return null;
    const m = Math.floor(a.length/2);
    return a.length % 2 ? a[m] : (a[m-1] + a[m]) / 2;
  };
  const mean = values => {
    const a = values.filter(v => v != null && Number.isFinite(v));
    return a.length ? a.reduce((s,v)=>s+v,0)/a.length : null;
  };
  const clamp = (n,min,max) => Math.max(min, Math.min(max,n));

  const TARGET_PROCEDURES = window.HEXA_TARGETS || [];

  const state = {
    hospitals: [], cases: [], insurers: [], tpas: [], unmatchedCases: 0,
    currentResults: [], lastSearch: null, map: null, markers: [], loadedAt: null
  };

  function parseCSV(text) {
    const rows = [];
    let cur = '', row = [], quoted = false;
    for (let i=0;i<text.length;i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i+1] === '"') { cur += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        row.push(cur.trim()); cur='';
      } else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && text[i+1] === '\n') i++;
        row.push(cur.trim()); cur='';
        if (row.some(v=>v!=='')) rows.push(row);
        row=[];
      } else cur += ch;
    }
    row.push(cur.trim());
    if (row.some(v=>v!=='')) rows.push(row);
    return rows;
  }

  async function fetchCSV(url) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(url + sep + '_cb=' + Date.now(), {cache:'no-store'});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseCSV(await res.text());
  }

  function parseAmount(value) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s || s.includes('#')) return null;
    const cleaned = s.replace(/[₹,$£\s]/g,'').replace(/,/g,'').replace(/[^0-9.\-]/g,'');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function parseDate(value) {
    if (!value) return null;
    const s = String(value).trim();
    if (!s || s.includes('#')) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function canonText(s) {
    return String(s || '').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9/]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function hospitalKey(s) {
    return canonText(s)
      .replace(/\bformerly\b.*$/,'')
      .replace(/\bunit of\b.*$/,'')
      .trim();
  }

  const GENERIC_HOSPITAL_WORDS = new Set(['hospital','hospitals','multispeciality','multi','speciality','specialty','superspeciality','super','research','centre','center','clinic','medical','healthcare','health','and','the','pvt','private','limited','ltd']);
  function hospitalSignature(s) {
    return hospitalKey(s).split(' ').filter(t=>t.length>1 && !GENERIC_HOSPITAL_WORDS.has(t)).sort().join(' ');
  }

  function cityKey(s) {
    let c = canonText(s).replace(/\//g,' ');
    if (/gurgaon|gurugram/.test(c)) return 'gurugram';
    if (/bengaluru|bangalore/.test(c)) return 'bangalore';
    if (c === 'new delhi') return 'delhi';
    return c;
  }
  function cityLabelFromKey(k) {
    const special = {gurugram:'Gurugram',bangalore:'Bangalore',delhi:'Delhi','greater noida':'Greater Noida','navi mumbai':'Navi Mumbai'};
    return special[k] || k.replace(/\b\w/g,m=>m.toUpperCase());
  }

  function normalizeStatus(s) {
    const x=canonText(s);
    if (x === 'active') return 'Active';
    if (x === 'inactive') return 'Inactive';
    if (x.includes('hold')) return 'On Hold';
    return s ? String(s).trim() : 'Unknown';
  }
  function normalizeMop(s) {
    const x=canonText(s);
    if (x.includes('cashless') && x.includes('cash')) return 'Cashless / Cash';
    if (x.includes('cashless')) return 'Cashless';
    if (x.includes('reimb')) return 'Reimbursement';
    if (x.includes('cash')) return 'Cash';
    return s ? String(s).trim() : '—';
  }

  function insurerCanon(s) {
    let x = canonText(s).replace(/\//g,' ');
    x = x.replace(/\bmax bupa\b/g,'niva bupa');
    if (x.includes('edelweiss') || x.includes('zuno')) x = x.replace(/zuno|edelweiss/g,'edelweiss');
    return x
      .replace(/\bhealth insurance company ltd\b/g,'')
      .replace(/\bhealth insurance company limited\b/g,'')
      .replace(/\bgeneral insurance co ltd\b/g,'')
      .replace(/\bgeneral insurance company ltd\b/g,'')
      .replace(/\bgeneral insurance ltd\b/g,'')
      .replace(/\binsurance co ltd\b/g,'')
      .replace(/\binsurance company limited\b/g,'')
      .replace(/\bltd\b/g,'')
      .replace(/\s+/g,' ').trim();
  }

  function tpaCanon(s) {
    let x = canonText(s).replace(/\//g,' ');
    x = x.replace(/\bvolo\b/g,'').replace(/\bhittpa\b/g,'').replace(/healthinsurance/g,'health insurance');
    return x.replace(/\binsurance tpa services\b/g,'')
      .replace(/\binsurance tpa\b/g,'')
      .replace(/\bhealth insurance tpa\b/g,'')
      .replace(/\bprivate limited\b/g,'')
      .replace(/\blimited\b/g,'')
      .replace(/\bpvt ltd\b/g,'')
      .replace(/\s+/g,' ').trim();
  }

  function payerRawValue(rawMap, selected, canonFn) {
    const wanted = canonFn(selected);
    for (const [name,value] of Object.entries(rawMap || {})) {
      if (canonFn(name) === wanted) return String(value || '').trim();
    }
    return '';
  }

  function insurerKeyword(name) {
    const c=insurerCanon(name);
    const known=['aditya birla','bajaj','care','cholamandalam','digit','hdfc','icici','iffco','kotak','liberty','magma','niva bupa','reliance','star','sbi','tata aig','new india','oriental','national','united india','royal sundaram','acko','manipal cigna'];
    return known.find(k=>c.includes(k)) || c.split(' ').slice(0,2).join(' ');
  }

  function parseHospitalNetwork(rows) {
    if (!rows.length) return [];
    const header = rows[0].map(h=>String(h||'').trim());
    const lastTpa = Math.max(...header.map((h,i)=>/\btpa\b/i.test(h) ? i : -1));
    const tpaIdx = [];
    const insurerIdx = [];
    for (let i=9;i<header.length;i++) {
      if (i <= lastTpa) tpaIdx.push(i); else insurerIdx.push(i);
    }
    state.tpas = tpaIdx.map(i=>header[i]).filter(Boolean);
    state.insurers = insurerIdx.map(i=>header[i]).filter(Boolean);

    const hospitals=[];
    rows.slice(1).forEach((r,rowOffset)=>{
      const name=String(r[3]||'').trim(); if(!name) return;
      const tpaRaw={}, insurerRaw={};
      tpaIdx.forEach(i=>tpaRaw[header[i]] = String(r[i]||'').trim());
      insurerIdx.forEach(i=>insurerRaw[header[i]] = String(r[i]||'').trim());
      const rawCity=String(r[0]||'').trim();
      const pin=String(r[2]||'').trim().replace(/\.0$/,'');
      hospitals.push({
        id:hospitals.length,
        sourceRow:rowOffset+2,
        hospitalName:name,
        key:hospitalKey(name), signature:hospitalSignature(name),
        cityRaw:rawCity, cityKey:cityKey(rawCity),
        area:String(r[1]||'').trim(), pinCode:pin,
        status:normalizeStatus(r[4]), mop:normalizeMop(r[5]),
        insComments:String(r[6]||'').trim(), cityComments:String(r[7]||'').trim(), doctorComments:String(r[8]||'').trim(),
        tpaRaw, insurerRaw, cases:[]
      });
    });
    return hospitals;
  }

  function parseAsp(rows) {
    if (!rows.length) return [];
    const header=rows[0].map(h=>String(h||'').trim());
    const ix={}; header.forEach((h,i)=>ix[h]=i);
    const get=(r,k)=>ix[k] == null ? '' : (r[ix[k]] ?? '');
    const out=[];
    rows.slice(1).forEach((r,rowOffset)=>{
      const h=String(get(r,'Hospital Name')||'').trim(); if(!h) return;
      out.push({
        sourceRow:rowOffset+2,
        ipd:String(get(r,'IPD ID')||'').trim(),
        procedure:String(get(r,'Procedure')||'').trim(),
        category:String(get(r,'Category')||'').trim(),
        hospitalName:h, hospitalKey:hospitalKey(h), hospitalSignature:hospitalSignature(h),
        city:String(get(r,'City')||'').trim(), cityBucket:String(get(r,'City Bucket')||'').trim(),
        insurer:String(get(r,'Insurance Name')||'').trim(), tpa:String(get(r,'TPA Name')||'').trim(),
        dod:parseDate(get(r,'Discharge Done Date (By Insurance)')) || parseDate(get(r,'DOD')),
        billRaw:String(get(r,'Bill Amount')||'').trim(), approvalRaw:String(get(r,'Approval Amount')||'').trim(), settlementRaw:String(get(r,'Settlement Amount')||'').trim(),
        bill:parseAmount(get(r,'Bill Amount')), approval:parseAmount(get(r,'Approval Amount')), settlement:parseAmount(get(r,'Settlement Amount')),
        implantName:String(get(r,'Implant Name')||'').trim(), implantCost:parseAmount(get(r,'Implant Cost')), implantBilled:parseAmount(get(r,'Implant Billed Amount')),
        remarks:String(get(r,'Discharge Remarks')||'').trim(),
        partnerId:null
      });
    });
    return out;
  }

  function linkAspCasesToPartners() {
    const exact=new Map();
    const signatures=new Map();
    state.hospitals.forEach(h=>{
      exact.set(h.key,h);
      if(!signatures.has(h.signature)) signatures.set(h.signature,[]);
      signatures.get(h.signature).push(h);
      h.cases=[];
    });
    let unmatched=0;
    for (const c of state.cases) {
      let h=exact.get(c.hospitalKey) || null;
      if (!h && c.hospitalSignature) {
        const sig=signatures.get(c.hospitalSignature) || [];
        if (sig.length===1) h=sig[0];
      }
      if (!h) {
        // Conservative fuzzy fallback: same city + high token overlap + unique winner.
        const ct=new Set(c.hospitalSignature.split(' ').filter(Boolean));
        const cCity=cityKey(c.city);
        let best=null, bestScore=0, runner=0;
        for (const candidate of state.hospitals) {
          if (cCity && candidate.cityKey && cCity!==candidate.cityKey && !(cCity==='delhi' && candidate.cityKey==='gurugram')) continue;
          const ht=new Set(candidate.signature.split(' ').filter(Boolean));
          if (!ct.size || !ht.size) continue;
          let inter=0; ct.forEach(t=>{if(ht.has(t))inter++;});
          const union=new Set([...ct,...ht]).size;
          const score=union ? inter/union : 0;
          if(score>bestScore){runner=bestScore;bestScore=score;best=candidate;} else if(score>runner){runner=score;}
        }
        if(best && bestScore>=0.82 && bestScore-runner>=0.08) h=best;
      }
      if(h){ c.partnerId=h.id; h.cases.push(c); } else unmatched++;
    }
    state.unmatchedCases=unmatched;
  }

  function selectedProcedure() {
    return TARGET_PROCEDURES.find(p=>p.id===$('procedure').value) || TARGET_PROCEDURES[0];
  }
  function pinCoord(pin) { return window.PINCODES_DATA?.[String(pin||'').trim()] || null; }
  function haversine(a,b) {
    if(!a||!b) return null;
    const R=6371, rad=x=>x*Math.PI/180;
    const dLat=rad(b[0]-a[0]), dLon=rad(b[1]-a[1]);
    const q=Math.sin(dLat/2)**2 + Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(q));
  }

  function panelYes(h,type,selected) {
    if(!selected) return false;
    if(type==='tpa' && /in[- ]?house|self/i.test(selected)) return true;
    const map=type==='insurer'?h.insurerRaw:h.tpaRaw;
    const canon=type==='insurer'?insurerCanon:tpaCanon;
    return payerRawValue(map,selected,canon).toLowerCase()==='yes';
  }

  function currentRestriction(h,proc,insurer) {
    const text=[h.insComments,h.cityComments,h.doctorComments].filter(Boolean).join(' | ');
    if(!text) return {severity:'none',label:'None relevant',text:''};

    // IMPORTANT: scope restrictions to the clause they appear in.
    // A hospital comment can mention multiple payers, e.g.
    // "DO NOT give in GIPSA ... ICICI CC only 13k ...".
    // The old parser treated any negative phrase anywhere + "ICICI" anywhere
    // as a hard ICICI restriction and wrongly excluded the hospital.
    const clauses=text
      .split(/\n+|\|+|;|\.{2,}/)
      .map(x=>x.trim())
      .filter(Boolean);
    const ik=insurerKeyword(insurer);
    const escRe=v=>String(v||'').replace(/[-/\^$*+?.()|[\]{}]/g,'\$&');
    const negRe=/\bhold\b|do not give|don't give|dont give|not active|stop cashless|low pkg|low package|restricted|not proceed|total hold|inactive/;
    const globalRe=/hold all|all ins(?:urance)?|total hold|stop cashless/;

    let reviewHit=false;
    let relevantNote=false;

    for(const rawClause of clauses){
      const low=rawClause.toLowerCase();
      const hasNeg=negRe.test(low);
      const global=globalRe.test(low);
      const procHit=proc.keywords.some(k=>low.includes(k));
      const insurerHit=!!(ik && low.includes(ik));
      if(procHit || insurerHit) relevantNote=true;

      if(!hasNeg && !global) continue;
      if(!(global || procHit || insurerHit)) continue;

      // If the same clause explicitly creates an exception/preference for the
      // selected insurer, surface it for review rather than excluding it.
      const exception=!!(ik && new RegExp(`(?:except|accept|only\s+(?:give|given|for)|prefer|good\s+pkg|good\s+package)[^\n]{0,45}${escRe(ik)}|${escRe(ik)}[^\n]{0,45}(?:except|allowed|active|good\s+pkg|good\s+package)`,'i').test(low));
      if(exception){ reviewHit=true; continue; }

      return {severity:'hard',label:'Matching hold / restriction',text};
    }

    if(reviewHit) return {severity:'review',label:'Restriction has selected-insurer exception — review',text};
    if(relevantNote) return {severity:'info',label:'Selected insurer / procedure note available',text};
    return {severity:'info',label:'Other comments available',text};
  }

  function chooseEvidence(procCases, insurer, tpa) {
    const exact=procCases.filter(c=>insurerCanon(c.insurer)===insurerCanon(insurer) && (/in[- ]?house|self/i.test(tpa) ? /in[- ]?house|self/i.test(c.tpa) : tpaCanon(c.tpa)===tpaCanon(tpa)));
    const insurerOnly=procCases.filter(c=>insurerCanon(c.insurer)===insurerCanon(insurer));
    const usableCount=a=>a.filter(c=>c.bill!=null&&c.approval!=null).length;
    if(usableCount(exact)>=3 || (exact.length && exact.length===insurerOnly.length && exact.length===procCases.length)) return {rows:exact,level:'Exact insurer + TPA',rank:3,exact,insurerOnly};
    if(usableCount(insurerOnly)>=4) return {rows:insurerOnly,level:'Insurer match; TPA fallback',rank:2,exact,insurerOnly};
    if(procCases.length) return {rows:procCases,level:'Procedure-only history',rank:1,exact,insurerOnly};
    return {rows:[],level:'No procedure history',rank:0,exact,insurerOnly};
  }

  function latestDate(rows) {
    const dates=rows.map(r=>r.dod).filter(Boolean);
    return dates.length ? new Date(Math.max(...dates.map(d=>d.getTime()))) : null;
  }

  function riskFromPct(p) {
    if(p==null) return {key:'na',label:'No usable bill/approval data'};
    if(p<10) return {key:'low',label:'Low'};
    if(p<20) return {key:'mod',label:'Moderate'};
    if(p<30) return {key:'high',label:'High'};
    return {key:'severe',label:'Severe'};
  }

  function confidence(evidenceRank, rows, usable, lastExact, lastProc) {
    const completeness=rows.length?usable.length/rows.length:0;
    const relevantDate=lastExact || lastProc;
    const age=daysAgo(relevantDate);
    if(evidenceRank===3 && usable.length>=8 && age!=null && age<=120 && completeness>=0.65) return 'High';
    if(evidenceRank>=2 && usable.length>=3 && age!=null && age<=240 && completeness>=0.45) return 'Medium';
    return 'Low';
  }

  function buildRecommendation(h,proc,insurer,tpa,target,userCoord) {
    const procCases=h.cases.filter(c=>proc.match(c.procedure,c.remarks));
    const ev=chooseEvidence(procCases,insurer,tpa);
    const rows=ev.rows;
    const usable=rows.filter(c=>c.bill!=null&&c.approval!=null&&c.bill>0);

    let componentRows=usable.filter(c=>c.implantBilled!=null && c.implantBilled>0 && c.bill>c.implantBilled);
    let useBase=!!proc.separateComponent && componentRows.length>=2 && componentRows.length>=Math.ceil(Math.max(1,usable.length)*0.35);
    const planningRows=useBase?componentRows:usable;
    const planningBills=planningRows.map(c=>useBase?Math.max(0,c.bill-c.implantBilled):c.bill);
    const medBill=median(planningBills);
    const medTotalBill=median(usable.map(c=>c.bill));
    const medApproval=median(usable.map(c=>c.approval));
    const medSettlement=median(rows.map(c=>c.settlement));
    const medComponent=median(rows.map(c=>c.implantBilled));
    const approvalPct=median(usable.map(c=>c.approval/c.bill*100));
    const gapPct=median(usable.map(c=>Math.max(0,c.bill-c.approval)/c.bill*100));
    const medGap=median(usable.map(c=>Math.max(0,c.bill-c.approval)));
    const exactUsable=ev.exact.filter(c=>c.bill!=null&&c.approval!=null&&c.bill>0);
    const exactMedBill=median(exactUsable.map(c=>c.bill));
    const exactMedApproval=median(ev.exact.map(c=>c.approval));
    const exactGapPct=median(exactUsable.map(c=>Math.max(0,c.bill-c.approval)/c.bill*100));
    const lastExact=latestDate(ev.exact);
    const lastProc=latestDate(procCases);
    const lastEvidence=latestDate(rows);
    const dist=haversine(userCoord,pinCoord(h.pinCode));
    const variance=medBill!=null&&target ? (medBill-target)/target*100 : null;
    const restriction=currentRestriction(h,proc,insurer);
    const conf=confidence(ev.rank,rows,usable,lastExact,lastProc);

    // Business-outcome ranking: target is a floor/benchmark, not a bullseye.
    // Hospitals are NOT penalised for producing a bill above target.
    // Average Ticket Size (ATS) and average approval amount are the main commercial signals.
    const avgBill=mean(planningBills);
    const avgTotalBill=mean(usable.map(c=>c.bill));
    const avgApproval=mean(usable.map(c=>c.approval));
    const avgApprovalPct=mean(usable.map(c=>c.approval/c.bill*100));
    const avgGapPct=mean(usable.map(c=>Math.max(0,c.bill-c.approval)/c.bill*100));
    const avgGap=mean(usable.map(c=>Math.max(0,c.bill-c.approval)));
    const exactAvgBill=mean(exactUsable.map(c=>c.bill));
    const exactAvgApproval=mean(exactUsable.map(c=>c.approval));
    const avgVariance=avgBill!=null&&target ? (avgBill-target)/target*100 : null;
    const risk=riskFromPct(avgGapPct);

    // Business-outcome index. Target is a floor/benchmark, NOT a bullseye.
    // Do not cap strong hospitals at 140%; that previously flattened materially
    // different hospitals into the same score and caused stable-sort order bugs.
    const atsIndex=avgBill==null||!target?25:clamp((avgBill/target)*100,0,300);
    const approvalValueIndex=avgApproval==null||!target?25:clamp((avgApproval/target)*100,0,300);
    const sample=clamp(Math.log2(usable.length+1)*25,0,100);
    const recencyDate=lastExact||lastEvidence||lastProc;
    const recency=recencyDate?clamp(100-daysAgo(recencyDate)/4.0,0,100):20;
    const deductionScore=avgGapPct==null?45:clamp(100-avgGapPct*2.5,0,100);
    const distanceScore=dist==null?55:clamp(100-dist*2.0,0,100);
    const evidenceBonus=ev.rank===3?8:ev.rank===2?3:ev.rank===1?0:-8;

    // Best Business Outcome: ATS + absolute approval are the main business signals.
    // Sample size, deductions, recency and distance are supporting signals.
    let businessScore=atsIndex*.40+approvalValueIndex*.35+sample*.10+deductionScore*.075+recency*.05+distanceScore*.025+evidenceBonus;
    if(restriction.severity==='hard') businessScore-=40;
    if(restriction.severity==='review') businessScore-=10;

    // Kept only for backward compatibility with older UI helpers. Ranking uses
    // businessScore directly so strong hospitals are never flattened into a 100/100 tie.
    const score=businessScore;

    return {h,proc,procCases,rows,usable,ev,useBase,medBill,medTotalBill,medApproval,medSettlement,medComponent,approvalPct,gapPct,medGap,exactUsable,exactMedBill,exactMedApproval,exactGapPct,lastExact,lastProc,lastEvidence,dist,variance,restriction,risk,conf,score,businessScore,avgBill,avgTotalBill,avgApproval,avgApprovalPct,avgGapPct,avgGap,exactAvgBill,exactAvgApproval,avgVariance};
  }

  function businessDominates(a,b) {
    // Sanity gate: if A has at least the same evidence quality, higher ATS,
    // higher absolute approval AND no worse deduction, A cannot rank below B.
    if((a.ev?.rank??0) < (b.ev?.rank??0)) return false;
    if(a.avgBill==null || b.avgBill==null || a.avgApproval==null || b.avgApproval==null || a.avgGapPct==null || b.avgGapPct==null) return false;
    const noWorse=a.avgBill>=b.avgBill && a.avgApproval>=b.avgApproval && a.avgGapPct<=b.avgGapPct;
    const strictlyBetter=a.avgBill>b.avgBill || a.avgApproval>b.avgApproval || a.avgGapPct<b.avgGapPct;
    return noWorse && strictlyBetter;
  }

  function sortResults(results,sortBy) {
    const arr=results.slice();
    if(sortBy==='distance') return arr.sort((a,b)=>(a.dist??9999)-(b.dist??9999) || (b.businessScore??-999)-(a.businessScore??-999));
    if(sortBy==='deduction') return arr.sort((a,b)=>(a.avgGapPct??999)-(b.avgGapPct??999) || (b.businessScore??-999)-(a.businessScore??-999));
    if(sortBy==='recent') return arr.sort((a,b)=>(b.lastExact?.getTime()||b.lastProc?.getTime()||0)-(a.lastExact?.getTime()||a.lastProc?.getTime()||0));
    if(sortBy==='ats') return arr.sort((a,b)=>(b.avgBill??-1)-(a.avgBill??-1) || (b.businessScore??-999)-(a.businessScore??-999));
    if(sortBy==='approval-amount') return arr.sort((a,b)=>(b.avgApproval??-1)-(a.avgApproval??-1) || (b.businessScore??-999)-(a.businessScore??-999));
    if(sortBy==='approval') return arr.sort((a,b)=>(b.avgApprovalPct??-1)-(a.avgApprovalPct??-1) || (b.businessScore??-999)-(a.businessScore??-999));
    return arr.sort((a,b)=>{
      if(businessDominates(a,b)) return -1;
      if(businessDominates(b,a)) return 1;
      return (b.businessScore??-999)-(a.businessScore??-999)
        || (b.avgApproval??-1)-(a.avgApproval??-1)
        || (b.avgBill??-1)-(a.avgBill??-1)
        || (b.usable?.length??0)-(a.usable?.length??0);
    });
  }

  function initMap() {
    if(!window.L) return;
    state.map=L.map('map',{zoomControl:true}).setView([28.46,77.03],10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(state.map);
  }
  function clearMap() { state.markers.forEach(m=>m.remove()); state.markers=[]; }
  function numberedIcon(n,color='#1473e6') {
    return L.divIcon({className:'numbered-marker',html:`<div style="background:${color}"><span>${n}</span></div>`,iconSize:[30,36],iconAnchor:[15,36],popupAnchor:[0,-34]});
  }
  function drawMap(results,pin) {
    if(!state.map) return;
    clearMap(); const points=[]; const uc=pinCoord(pin);
    if(uc){ const m=L.marker(uc,{icon:numberedIcon('⌂','#e5484d')}).addTo(state.map).bindPopup(`<b>Patient pincode ${esc(pin)}</b>`);state.markers.push(m);points.push(uc); }
    results.slice(0,5).forEach((r,i)=>{
      const c=pinCoord(r.h.pinCode); if(!c) return;
      const color=i===0?'#11a879':'#1473e6';
      const m=L.marker(c,{icon:numberedIcon(i+1,color)}).addTo(state.map).bindPopup(`<b>#${i+1} ${esc(r.h.hospitalName)}</b><br>${r.dist!=null?r.dist.toFixed(1)+' km from '+esc(pin):'Distance unavailable'}`);
      state.markers.push(m); points.push(c);
    });
    if(points.length>1) state.map.fitBounds(points,{padding:[30,30]});
    else if(points.length===1) state.map.setView(points[0],12);
    setTimeout(()=>state.map.invalidateSize(),50);
  }

  function setSelect(el,items,placeholder,valueFn=x=>x,labelFn=x=>x) {
    el.innerHTML=`<option value="">${esc(placeholder)}</option>`+items.map(item=>`<option value="${esc(valueFn(item))}">${esc(labelFn(item))}</option>`).join('');
  }

  function setTarget() {
    const p=selectedProcedure();
    $('target').value=p.target.toLocaleString('en-IN');
    $('target-note').textContent=p.note;
  }
  function targetValue() {
    const n=Number(String($('target').value||'').replace(/[^0-9.]/g,''));
    return Number.isFinite(n)&&n>0?n:selectedProcedure().target;
  }

  function renderKpis() {
    $('kpi-partners').textContent=state.hospitals.length.toLocaleString('en-IN');
    $('kpi-active').textContent=state.hospitals.filter(h=>h.status==='Active').length.toLocaleString('en-IN');
    $('kpi-cases').textContent=state.cases.length.toLocaleString('en-IN');
    $('kpi-unmatched').textContent=state.unmatchedCases.toLocaleString('en-IN');
  }

  function resultVarianceClass(v) {
    if(v==null) return '';
    if(v>=0) return 'good';
    if(v>=-10) return 'warn';
    return 'bad';
  }

  function targetOutcomeText(r) {
    const target=state.lastSearch?.target;
    if(r.avgBill==null || !target) return 'No usable bill';
    const diff=r.avgBill-target;
    return diff>=0 ? `${fmtMoney(diff)} above target` : `${fmtMoney(Math.abs(diff))} below target`;
  }

  function evidenceTag(r) {
    const n=r.ev.rank===3?'Exact':r.ev.rank===2?'Insurer':'Procedure';
    return `<span class="evidence-tag e${r.ev.rank}">${n} evidence</span>`;
  }

  function renderResults(rawResults) {
    const sorted=sortResults(rawResults,$('sort-by').value);
    state.currentResults=sorted;
    $('export-btn').disabled=!sorted.length;
    const shown=sorted.slice(0,5);
    const hardExcluded=state.lastSearch?.hardExcluded||0;
    $('result-subtitle').textContent=sorted.length
      ? `${sorted.length} eligible partner hospitals · showing ${Math.min(5,sorted.length)} best options${hardExcluded?` · ${hardExcluded} restricted option${hardExcluded===1?'':'s'} excluded`:''}.`
      : `No eligible partner hospital found${hardExcluded?` · ${hardExcluded} restricted option${hardExcluded===1?'':'s'} excluded`:''}.`;

    if(!sorted.length){
      $('recommendations').innerHTML='<div class="empty-state">No partner hospital passed the current City + Status + Insurer + TPA filters. Try widening distance or reviewing restricted hospitals.</div>';
      $('deduction-table').innerHTML='<div class="detail-empty">No eligible hospitals for this search.</div>';
      $('hospital-detail').innerHTML='<div class="detail-empty">No hospital selected.</div>';
      $('detail-wrap').classList.remove('open');
      drawMap([], $('pincode').value.trim()); return;
    }

    const insurer=state.lastSearch?.insurer||'';
    const tpa=state.lastSearch?.tpa||'';
    $('recommendations').innerHTML=shown.map((r,i)=>{
      const distance=r.dist==null?'Distance —':`${r.dist.toFixed(1)} km`;
      const riskClass=r.risk.key==='severe'?'high':r.risk.key;
      const insurerShort=insurer.replace(/(General|Health) Insurance.*/i,'').trim() || insurer;
      const tpaShort=/in[- ]?house|self/i.test(tpa)?'In-House / Self':tpa.replace(/Insurance TPA.*/i,'').trim() || tpa;
      const latestExactRow=r.ev.exact.slice().sort((a,b)=>(b.dod?.getTime()||0)-(a.dod?.getTime()||0))[0] || null;
      return `<article class="rec-card ${i===0?'selected':''} ${r.avgGapPct!=null&&r.avgGapPct>=CFG.DEDUCTION_HIGH_PCT?'deduction-alert':''}" data-index="${i}">
        <div class="rank ${i===0?'top':''}">${i+1}</div>
        <div class="rec-hospital">
          <div class="hospital-name">${esc(r.h.hospitalName)}</div>
          <div class="subline">${esc(cityLabelFromKey(r.h.cityKey))} · PIN ${esc(r.h.pinCode)} · ${distance}</div>
          <div class="empanel-inline"><span class="empanel-main">✓ EMPANELLED</span><span class="payer-ok">Insurer YES</span><span class="payer-ok">TPA YES</span></div>
          <div class="chip-row"><span class="chip ok">${esc(r.h.status)}</span>${evidenceTag(r)}${r.restriction.severity!=='none'&&r.restriction.severity!=='info'?`<span class="chip ${r.restriction.severity==='hard'?'bad':'warn'}">Restriction review</span>`:''}</div>
          <div class="subline" title="${esc(insurer)} / ${esc(tpa)}">${esc(insurerShort)} · ${esc(tpaShort)}</div>
        </div>
        <div class="metric"><span>${r.ev.rank===3?'Exact-combo ':r.ev.rank===2?'Insurer-match ':'Procedure-history '}${r.useBase?'avg base ATS':'avg bill / ATS'}</span><strong>${fmtMoney(r.avgBill)}</strong><div class="subline ${resultVarianceClass(r.avgBill!=null&&state.lastSearch?.target?(r.avgBill-state.lastSearch.target)/state.lastSearch.target*100:null)}">${targetOutcomeText(r)}</div></div>
        <div class="metric"><span>${r.ev.rank===3?'Exact-combo ':r.ev.rank===2?'Insurer-match ':'Procedure-history '}avg approval</span><strong>${fmtMoney(r.avgApproval)}</strong><div class="subline">${r.avgApprovalPct==null?'—':r.avgApprovalPct.toFixed(0)+'% avg realization'}</div></div>
        <div class="metric"><span>Avg deduction</span><strong class="risk-${riskClass}">${r.avgGapPct==null?'—':r.avgGapPct.toFixed(1)+'%'}</strong><div class="subline">${fmtMoney(r.avgGap)}</div></div>
        <div class="history-lines"><strong>Exact combo: ${r.ev.exact.length}${latestExactRow?.ipd?` · IPD ${esc(latestExactRow.ipd)}`:''}</strong><small>Last exact: ${fmtDate(r.lastExact)} · Confidence ${esc(r.conf)}</small><small>Planning basis: ${esc(r.ev.level)} · n=${r.rows.length}</small></div>
      </article>`;
    }).join('');

    document.querySelectorAll('.rec-card').forEach(card=>card.addEventListener('click',()=>{
      document.querySelectorAll('.rec-card').forEach(x=>x.classList.remove('selected'));
      card.classList.add('selected');
      showDetail(shown[Number(card.dataset.index)]);
      $('detail-wrap').classList.add('open');
      $('detail-wrap').setAttribute('aria-hidden','false');
    }));

    renderDeductionWatch(sorted);
    $('detail-wrap').classList.remove('open');
    $('detail-wrap').setAttribute('aria-hidden','true');
    $('hospital-detail').innerHTML='<div class="detail-empty">Click any recommended hospital to see detailed evidence.</div>';
    drawMap(shown,$('pincode').value.trim());
  }

  function recentExactRows(r) {
    return r.ev.exact.slice().sort((a,b)=>(b.dod?.getTime()||0)-(a.dod?.getTime()||0)).slice(0,10);
  }
  function recentPlanningRows(r) {
    return r.rows.filter(c=>c.dod).sort((a,b)=>b.dod-a.dod).slice(0,5);
  }
  function sourceBillStatus(c) {
    if(c.bill!=null) return fmtMoney(c.bill);
    const raw=String(c.billRaw||'').trim();
    if(raw && raw.includes('#')) return 'Unavailable in source (##########)';
    if(raw) return `Unavailable (${raw})`;
    return 'Missing in source';
  }

  function showDetail(r) {
    if(!r) return;
    $('detail-title').textContent=`${r.h.hospitalName}`;
    const exactRecent=recentExactRows(r);
    const planningRecent=recentPlanningRows(r);
    const comments=[r.h.insComments&&`Insurance: ${r.h.insComments}`,r.h.cityComments&&`City: ${r.h.cityComments}`,r.h.doctorComments&&`Doctors: ${r.h.doctorComments}`].filter(Boolean).join('\n');
    const compQuality=r.proc.separateComponent
      ? (r.useBase?`${r.proc.componentLabel} separation available in enough historical rows; target fit uses estimated base bill.`:`${r.proc.componentLabel} is intended separately, but historical device capture is incomplete; target fit currently uses total bill and is lower-confidence.`)
      : (r.medComponent!=null?`Median captured device/implant billed: ${fmtMoney(r.medComponent)}.`:'');
    const selectedInsurer=state.lastSearch?.insurer||'';
    const selectedTpa=state.lastSearch?.tpa||'';
    const insurerPanel=Object.entries(r.h.insurerRaw||{}).map(([name,val])=>{
      const yes=String(val||'').trim().toLowerCase()==='yes';
      const selected=insurerCanon(name)===insurerCanon(selectedInsurer);
      return `<div class="panel-row ${selected?'selected-payer':''}"><span>${esc(name)}</span><b class="${yes?'yes':'no'}">${yes?'Yes':(String(val||'').trim()||'—')}</b></div>`;
    }).join('');
    const tpaPanel=Object.entries(r.h.tpaRaw||{}).map(([name,val])=>{
      const yes=String(val||'').trim().toLowerCase()==='yes';
      const selected=!/in[- ]?house|self/i.test(selectedTpa) && tpaCanon(name)===tpaCanon(selectedTpa);
      return `<div class="panel-row ${selected?'selected-payer':''}"><span>${esc(name)}</span><b class="${yes?'yes':'no'}">${yes?'Yes':(String(val||'').trim()||'—')}</b></div>`;
    }).join('');

    $('hospital-detail').innerHTML=`
      <div class="detail-section">
        <div class="detail-kpi"><span>${r.useBase?'Average Estimated Base ATS':'Average Bill / ATS'}</span><strong>${fmtMoney(r.avgBill)}</strong><small>Median ${fmtMoney(r.medBill)}${r.medTotalBill!=null&&r.useBase?` · total-bill median ${fmtMoney(r.medTotalBill)}`:''}</small></div>
        <div class="detail-kpi"><span>Average Approval</span><strong>${fmtMoney(r.avgApproval)}</strong><small>${r.avgApprovalPct==null?'Approval % unavailable':r.avgApprovalPct.toFixed(1)+'% average realization'} · median ${fmtMoney(r.medApproval)}</small></div>
        <div class="detail-kpi ${r.avgGapPct!=null&&r.avgGapPct>=20?'danger-kpi':''}"><span>Average Deduction</span><strong>${fmtMoney(r.avgGap)}</strong><small>${r.avgGapPct==null?'—':r.avgGapPct.toFixed(1)+'% of bill · '+riskFromPct(r.avgGapPct).label}</small></div>
        <div class="detail-kpi"><span>Last Exact Match</span><strong>${fmtDate(r.lastExact)}</strong><small>${r.lastExact?daysAgo(r.lastExact)+' days ago':'No exact insurer + TPA case'}</small></div>
        <div class="detail-kpi"><span>Last Procedure Case</span><strong>${fmtDate(r.lastProc)}</strong><small>${r.lastProc?daysAgo(r.lastProc)+' days ago':'No procedure history'}</small></div>
      </div>

      <div class="info-grid">
        <div class="info-panel">
          <h3>Decision evidence</h3>
          <div class="mini-row"><span>Evidence level</span><strong>${esc(r.ev.level)}</strong></div>
          <div class="mini-row"><span>Exact insurer + TPA cases</span><strong>${r.ev.exact.length}</strong></div>
          <div class="mini-row"><span>Exact cases with usable bill + approval</span><strong>${r.exactUsable.length}</strong></div>
          <div class="mini-row"><span>Planning evidence basis</span><strong>${esc(r.ev.level)}</strong></div>
          <div class="mini-row"><span>Planning evidence cases</span><strong>${r.rows.length}</strong></div>
          <div class="mini-row"><span>Usable planning bill + approval pairs</span><strong>${r.usable.length}</strong></div>
          <div class="mini-row"><span>Confidence</span><strong>${esc(r.conf)}</strong></div>
          <div class="mini-row"><span>Approx distance</span><strong>${r.dist==null?'—':r.dist.toFixed(1)+' km'}</strong></div>
          ${r.medComponent!=null?`<div class="mini-row"><span>Median captured ${esc(r.proc.componentLabel||'implant/device')}</span><strong>${fmtMoney(r.medComponent)}</strong></div>`:''}
        </div>
        <div class="info-panel">
          <h3>Current partner status</h3>
          <div class="mini-row"><span>Status</span><strong>${esc(r.h.status)}</strong></div>
          <div class="mini-row"><span>MOP</span><strong>${esc(r.h.mop)}</strong></div>
          <div class="mini-row"><span>City</span><strong>${esc(cityLabelFromKey(r.h.cityKey))}</strong></div>
          <div class="mini-row"><span>Pincode</span><strong>${esc(r.h.pinCode)}</strong></div>
          <div class="mini-row"><span>Restriction status</span><strong class="restriction-${r.restriction.severity}">${esc(r.restriction.label)}</strong></div>
          <div class="mini-row"><span>Business outcome index</span><strong>${Math.round(r.businessScore)}</strong></div>
        </div>
      </div>


      <div class="empanelment-master">
        <div class="empanel-list">
          <h3>Insurer Empanelment</h3>
          <div class="selected-summary"><span>Selected insurer</span><strong>✓ ${esc(selectedInsurer)} — YES</strong></div>
          <div class="panel-scroll">${insurerPanel}</div>
        </div>
        <div class="empanel-list">
          <h3>TPA Empanelment</h3>
          <div class="selected-summary"><span>Selected TPA</span><strong>✓ ${esc(selectedTpa)} — YES</strong></div>
          <div class="panel-scroll">${/in[- ]?house|self/i.test(selectedTpa)?`<div class="panel-row selected-payer"><span>In-House / Self</span><b class="yes">Yes</b></div>`:''}${tpaPanel}</div>
        </div>
      </div>

            ${compQuality?`<div class="device-note"><strong>Component handling:</strong> ${esc(compQuality)}</div>`:''}
      ${comments?`<div class="warning-box ${r.restriction.severity==='hard'?'warning-hard':''}"><strong>Current operational comments — review before giving this option:</strong>\n${esc(comments)}</div>`:''}

      <div class="recent-block exact-block">
        <h3>Exact same procedure + hospital + insurer + TPA</h3>
        <div class="exact-summary">${r.ev.exact.length?`${r.ev.exact.length} exact historical case${r.ev.exact.length===1?'':'s'} found. IPD numbers below are from ASP Data.`:'No exact historical case found for this insurer + TPA combination.'}</div>
        ${exactRecent.length?`<div class="recent-table exact-table"><div class="recent-head"><span>IPD</span><span>Date</span><span>Insurer / TPA</span><span>Bill</span><span>Approval</span><span>Gap</span></div>${exactRecent.map(c=>{
          const gp=c.bill&&c.approval!=null?Math.max(0,c.bill-c.approval)/c.bill*100:null;
          const billMissing=c.bill==null;
          return `<div class="recent-row ${billMissing?'source-missing-row':''}"><span><strong>${esc(c.ipd||'—')}</strong><small>ASP row ${c.sourceRow}</small></span><span>${fmtDate(c.dod)}</span><span>${esc(c.insurer)}<small>${esc(c.tpa||'—')}</small></span><span class="${billMissing?'source-missing':''}">${esc(sourceBillStatus(c))}</span><span>${fmtMoney(c.approval)}</span><span class="${gp!=null&&gp>=20?'danger-text':''}">${gp==null?'—':gp.toFixed(0)+'%'}</span></div>`;
        }).join('')}</div>`:'<div class="detail-empty compact">No exact insurer + TPA case.</div>'}
        ${r.ev.exact.some(c=>c.bill==null)?`<div class="source-warning"><strong>Why some Bill Amounts are blank:</strong> the ASP source itself contains <code>##########</code> in Bill Amount for those IPDs, so the dashboard cannot recover a number that is not present in the source feed.</div>`:''}
      </div>

      ${r.ev.rank<3?`<div class="recent-block fallback-block">
        <h3>Fallback planning evidence used for ranking</h3>
        <div class="exact-summary">Exact-combo billing evidence was insufficient, so ranking uses <strong>${esc(r.ev.level)}</strong>. This is a benchmark only, not the exact insurer + TPA history.</div>
        ${planningRecent.length?`<div class="recent-table"><div class="recent-head fallback-head"><span>IPD</span><span>Date</span><span>Insurer / TPA</span><span>Bill</span><span>Approval</span><span>Gap</span></div>${planningRecent.map(c=>{
          const gp=c.bill&&c.approval!=null?Math.max(0,c.bill-c.approval)/c.bill*100:null;
          return `<div class="recent-row fallback-row"><span><strong>${esc(c.ipd||'—')}</strong></span><span>${fmtDate(c.dod)}</span><span>${esc(c.insurer)}<small>${esc(c.tpa||'—')}</small></span><span>${fmtMoney(c.bill)}</span><span>${fmtMoney(c.approval)}</span><span class="${gp!=null&&gp>=20?'danger-text':''}">${gp==null?'—':gp.toFixed(0)+'%'}</span></div>`;
        }).join('')}</div>`:'<div class="detail-empty compact">No fallback planning rows.</div>'}
      </div>`:''}`;
  }

  function renderDeductionWatch(results) {
    const rows=results.filter(r=>r.avgGapPct!=null).sort((a,b)=>b.avgGapPct-a.avgGapPct).slice(0,8);
    if(!rows.length){$('deduction-table').innerHTML='<div class="detail-empty compact">No usable bill/approval pairs for this search.</div>';return;}
    $('deduction-table').innerHTML=`<div class="risk-list">${rows.map(r=>{
      const riskClass=r.risk.key==='severe'?'high':r.risk.key;
      return `<div class="risk-row ${r.avgGapPct>=20?'risk-row-alert':''}"><strong>${esc(r.h.hospitalName)}</strong><span>${fmtMoney(r.avgTotalBill??r.avgBill)}</span><span>${fmtMoney(r.avgApproval)}</span><span><b>${fmtMoney(r.avgGap)}</b><em class="risk-badge ${riskClass}">${r.avgGapPct.toFixed(0)}%</em></span></div>`;
    }).join('')}</div>`;
  }

  function hospitalCoverage(h) {
    const vals=[...Object.values(h.insurerRaw),...Object.values(h.tpaRaw)];
    if(!vals.length) return 0;
    return Math.round(vals.filter(v=>String(v).toLowerCase()==='yes').length/vals.length*100);
  }

  function renderHospitalTable(filter='') {
    const q=canonText(filter);
    const filtered=state.hospitals.filter(h=>!q || canonText([h.hospitalName,h.cityRaw,h.pinCode,h.area].join(' ')).includes(q));
    $('table-summary').textContent=`Showing ${Math.min(filtered.length,500)} of ${filtered.length} matching partner hospitals`;
    $('hospital-table-body').innerHTML=filtered.slice(0,500).map(h=>{
      const cov=hospitalCoverage(h);
      return `<tr>
        <td><strong>${esc(h.hospitalName)}</strong><br><span class="muted">${esc(h.area)}</span></td>
        <td>${esc(cityLabelFromKey(h.cityKey))}</td><td>${esc(h.pinCode||'—')}</td>
        <td><span class="status ${h.status==='Active'?'active':h.status==='On Hold'?'hold':'inactive'}">${esc(h.status)}</span></td>
        <td>${esc(h.mop)}</td>
        <td><div class="coverage-bar"><div class="bar"><i style="width:${cov}%"></i></div><strong>${cov}%</strong></div></td>
        <td class="comment-cell">${esc(h.insComments||'—')}</td><td class="comment-cell">${esc(h.cityComments||'—')}</td>
      </tr>`;
    }).join('');
  }

  function performSearch() {
    const city=$('city').value, insurer=$('insurer').value, tpa=$('tpa').value;
    if(!city||!insurer||!tpa){
      $('recommendations').innerHTML='<div class="empty-state">City, insurer and TPA are required.</div>'; return;
    }
    const proc=selectedProcedure(), target=targetValue();
    const pin=$('pincode').value.trim(); const uc=pinCoord(pin);
    const radius=$('radius').value?Number($('radius').value):null;
    const includeRestricted=$('include-restricted').checked;
    let hardExcluded=0;

    const candidates=[];
    for(const h of state.hospitals){
      if($('active-only').checked && h.status!=='Active') continue;
      if(h.cityKey!==city) continue;
      if(!panelYes(h,'insurer',insurer)) continue;
      if(!panelYes(h,'tpa',tpa)) continue;
      const r=buildRecommendation(h,proc,insurer,tpa,target,uc);
      if(uc && radius!=null && r.dist!=null && r.dist>radius) continue;
      if(r.restriction.severity==='hard' && !includeRestricted){ hardExcluded++; continue; }
      candidates.push(r);
    }

    state.lastSearch={city,insurer,tpa,proc,target,pin,radius,hardExcluded};
    $('eligibility-foot').textContent=`Eligibility: Sheet 1 partner + ${$('active-only').checked?'active + ':''}insurer panel + TPA panel${uc&&radius?` + within ${radius} km when coordinates are available`:''}.`;
    $('map-caption').textContent=uc?`Approx distance from ${pin}`:'Add pincode for distance ranking';
    renderResults(candidates);
  }

  function exportOptions() {
    if(!state.currentResults.length || !state.lastSearch) return;
    const s=state.lastSearch;
    const rows=[['Rank','Hospital','City','Pincode','Approx Distance km','Evidence','Comparable Cases','Last Exact Match','Last Procedure Case','Average Bill / ATS','Average Approval','Average Approval %','Average Deduction','Average Deduction %','Target','Target Variance %','Confidence','Current Restriction']];
    state.currentResults.slice(0,5).forEach((r,i)=>rows.push([
      i+1,r.h.hospitalName,cityLabelFromKey(r.h.cityKey),r.h.pinCode,r.dist==null?'':r.dist.toFixed(1),r.ev.level,r.rows.length,fmtDate(r.lastExact),fmtDate(r.lastProc),
      r.avgBill==null?'':Math.round(r.avgBill),r.avgApproval==null?'':Math.round(r.avgApproval),r.avgApprovalPct==null?'':r.avgApprovalPct.toFixed(1),r.avgGap==null?'':Math.round(r.avgGap),r.avgGapPct==null?'':r.avgGapPct.toFixed(1),s.target,r.avgVariance==null?'':r.avgVariance.toFixed(1),r.conf,r.restriction.label
    ]));
    const csv=rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`Hexa_Hospital_Options_${s.proc.label.replace(/\W+/g,'_')}_${cityLabelFromKey(s.city).replace(/\W+/g,'_')}.csv`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function resetPlanner() {
    $('city').selectedIndex=0; $('pincode').value=''; $('radius').value='25'; $('procedure').selectedIndex=0; setTarget(); $('insurer').selectedIndex=0; $('tpa').selectedIndex=0;
    $('active-only').checked=true; $('include-restricted').checked=false; $('sort-by').value='best';
    state.currentResults=[]; state.lastSearch=null; $('export-btn').disabled=true;
    $('recommendations').innerHTML='<div class="empty-state">Choose filters and click <strong>Find Hospitals</strong>.</div>';
    $('deduction-table').innerHTML='<div class="detail-empty">Run a search to identify deduction-heavy hospitals.</div>';
    $('hospital-detail').innerHTML='<div class="detail-empty">Historical economics, exact-match recency, device information and current comments will appear here.</div>';
    $('result-subtitle').textContent='Select case details to rank 4–5 suitable hospitals.'; $('pin-hint').textContent='Adds approximate distance from patient pincode.'; clearMap();
  }

  function populateControls() {
    const cities=[...new Set(state.hospitals.map(h=>h.cityKey).filter(Boolean))].sort((a,b)=>cityLabelFromKey(a).localeCompare(cityLabelFromKey(b)));
    setSelect($('city'),cities,'Select city',x=>x,x=>cityLabelFromKey(x));
    $('procedure').innerHTML=TARGET_PROCEDURES.map(p=>`<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
    setTarget();
    setSelect($('insurer'),state.insurers.slice().sort((a,b)=>a.localeCompare(b)),'Select insurer');
    const tpas=[CFG.SELF_TPA_LABEL,...state.tpas.filter(t=>tpaCanon(t)!==tpaCanon(CFG.SELF_TPA_LABEL)).sort((a,b)=>a.localeCompare(b))];
    setSelect($('tpa'),tpas,'Select TPA');
  }

  function bindEvents() {
    $('find-btn').addEventListener('click',performSearch);
    $('reset-btn').addEventListener('click',resetPlanner);
    $('procedure').addEventListener('change',setTarget);
    $('hospital-search').addEventListener('input',e=>renderHospitalTable(e.target.value));
    $('sort-by').addEventListener('change',()=>state.currentResults.length&&renderResults(state.currentResults));
    $('export-btn').addEventListener('click',exportOptions);
    $('refresh-btn').addEventListener('click',()=>loadData(true));
    $('detail-close').addEventListener('click',()=>{ $('detail-wrap').classList.remove('open'); $('detail-wrap').setAttribute('aria-hidden','true'); });
    $('detail-wrap').addEventListener('click',e=>{ if(e.target===$('detail-wrap')){ $('detail-wrap').classList.remove('open'); $('detail-wrap').setAttribute('aria-hidden','true'); } });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ $('detail-wrap').classList.remove('open'); $('detail-wrap').setAttribute('aria-hidden','true'); } });
    $('pincode').addEventListener('input',()=>{
      const pin=$('pincode').value.replace(/\D/g,'').slice(0,6); $('pincode').value=pin;
      if(!pin) $('pin-hint').textContent='Adds approximate distance from patient pincode.';
      else if(pin.length<6) $('pin-hint').textContent='Enter a 6-digit pincode.';
      else if(pinCoord(pin)) $('pin-hint').textContent='✓ Pincode coordinate available for approximate distance.';
      else $('pin-hint').textContent='Coordinate not found in the pincode dictionary; recommendations will still work without distance.';
    });
    document.querySelectorAll('[data-scroll]').forEach(btn=>btn.addEventListener('click',()=>document.getElementById(btn.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'})));
  }

  async function loadData(manual=false) {
    const sync=$('sync-pill'); const refresh=$('refresh-btn');
    const hadData=!!state.loadedAt;
    const previous={
      city:$('city').value,procedure:$('procedure').value,insurer:$('insurer').value,tpa:$('tpa').value,
      pincode:$('pincode').value,radius:$('radius').value,target:$('target').value,active:$('active-only').checked,restricted:$('include-restricted').checked,sort:$('sort-by').value
    };
    sync.textContent=manual?'Refreshing…':hadData?'Auto-refreshing…':'Loading live data…'; refresh.disabled=true;
    try{
      const [hospitalRows,aspRows]=await Promise.all([fetchCSV(CFG.HOSPITAL_CSV),fetchCSV(CFG.ASP_CSV)]);
      state.hospitals=parseHospitalNetwork(hospitalRows);
      state.cases=parseAsp(aspRows);
      linkAspCasesToPartners();
      state.loadedAt=now();
      renderKpis(); populateControls(); renderHospitalTable($('hospital-search').value);
      if(hadData){
        if([...$('city').options].some(o=>o.value===previous.city)) $('city').value=previous.city;
        if([...$('procedure').options].some(o=>o.value===previous.procedure)) $('procedure').value=previous.procedure;
        if([...$('insurer').options].some(o=>o.value===previous.insurer)) $('insurer').value=previous.insurer;
        if([...$('tpa').options].some(o=>o.value===previous.tpa)) $('tpa').value=previous.tpa;
        $('pincode').value=previous.pincode; $('radius').value=previous.radius; $('target').value=previous.target;
        $('active-only').checked=previous.active; $('include-restricted').checked=previous.restricted; $('sort-by').value=previous.sort;
      }
      sync.textContent=`✓ Live · ${state.loadedAt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`;
      if(hadData && state.lastSearch) performSearch(); else if(!hadData) resetPlanner();
    }catch(err){
      console.error('[Hexa Network Intelligence] data load failed',err);
      sync.textContent='⚠ Live data load failed';
      $('recommendations').innerHTML='<div class="empty-state">Unable to load the published Google Sheet data. Please refresh or check the Sheet publish settings.</div>';
    }finally{refresh.disabled=false;}
  }

  initMap(); bindEvents(); loadData(false);
  setInterval(()=>loadData(false),CFG.REFRESH_MS);
})();
