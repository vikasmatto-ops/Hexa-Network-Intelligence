// Business targets for the KYP hospital planner.
// Edit target amounts here without touching the ranking engine.
window.HEXA_TARGETS = [
  { id:'sleeve', label:'Sleeve Bariatric', target:500000, note:'Target ₹5L', keywords:['sleeve','bariatric','obesity'], match:(p,r)=>/sleeve gastrectomy/i.test(p) && !/endoscopic/i.test(p) },
  { id:'tummy', label:'Tummy Tuck', target:400000, note:'Target ₹4L', keywords:['tummy','abdominoplasty','aesthetic'], match:(p,r)=>/tummy tuck|abdominoplasty/i.test(p) },
  { id:'piles', label:'Piles', target:80000, note:'Target ₹80k', keywords:['piles','haemorrhoid','hemorrhoid','procto'], match:(p,r)=>/piles|haemorrhoid|hemorrhoid/i.test(p) },
  { id:'gynae', label:'Gynaecomastia', target:80000, note:'Target ₹80k', keywords:['gynaecomastia','gynecomastia','male breast','aesthetic'], match:(p,r)=>/gynaecomastia|gynecomastia|male breast reduction/i.test(p) },
  { id:'circ', label:'Circumcision', target:40000, note:'Target ₹40k', keywords:['circumcision','balanoposthitis'], match:(p,r)=>/circumcision|balanoposthitis/i.test(p) },
  { id:'hernia', label:'Hernia', target:120000, note:'Target ₹1.2L base. Mesh / tacker should be reviewed separately.', keywords:['hernia','laparo','mesh','tacker'], separateComponent:true, componentLabel:'Mesh / tacker', match:(p,r)=>/hernia/i.test(p) && !/scola/i.test(r+' '+p) },
  { id:'scola', label:'SCOLA', target:250000, note:'Target ₹2.5L base. Mesh / tacker to hospital separately.', keywords:['scola','hernia','mesh','tacker'], separateComponent:true, componentLabel:'Mesh / tacker', match:(p,r)=>/scola/i.test(r+' '+p) },
  { id:'var-bil', label:'Varicose Veins — Bilateral', target:100000, note:'Target ₹1L base. Laser component should be reviewed separately.', keywords:['vascular','varicose','evla','evlt','laser'], separateComponent:true, componentLabel:'Laser / device', match:(p,r)=>/(varicose|evla|evlt|endovenous laser)/i.test(p) && /(bilateral|b\/l)/i.test(p+' '+r) && !/venaseal/i.test(p) },
  { id:'vena-uni', label:'VenaSeal — Unilateral', target:250000, note:'Target ₹2.5L unilateral. Device history is shown separately when captured.', keywords:['vascular','venaseal'], componentLabel:'VenaSeal device', match:(p,r)=>/venaseal/i.test(p) && !/(bilateral|b\/l)/i.test(p+' '+r) },
  { id:'vena-bi', label:'VenaSeal — Bilateral', target:500000, note:'Target ₹5L bilateral. Device history is shown separately when captured.', keywords:['vascular','venaseal'], componentLabel:'VenaSeal device', match:(p,r)=>/venaseal/i.test(p) && /(bilateral|b\/l)/i.test(p+' '+r) }
];
