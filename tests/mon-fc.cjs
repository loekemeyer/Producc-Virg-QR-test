const path=require("path");let chromium;
try{({chromium}=require("/opt/node22/lib/node_modules/playwright"));}catch(e){({chromium}=require("playwright"));}
(async()=>{
  const root="/home/user/Produccion-Virgilio";
  const b=await chromium.launch();const p=await b.newPage({viewport:{width:1600,height:900}});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.goto("file://"+path.join(root,"index.html"),{waitUntil:"domcontentloaded"});
  const r=await p.evaluate(()=>{
    window.fetchFacturadosHoy=function(){return Promise.resolve();};
    window.fetchFacturadosTodos=function(){return Promise.resolve();};
    const mk=(tanda,fr,fd,m3,np)=>({tanda,_key:tanda,m3,fechaEntregaRaw:fr,fechaEntrega:fd,opIsSi:true,pedidos:[{np}]});
    const sheet=new Map([
      ["C10A",mk("C10A","2026-07-25","25/07",5,"111")], // en ventana, terminada
      ["C20A",mk("C20A","2026-08-10","10/08",8,"222")], // FUERA de ventana, terminada
      ["C30A",mk("C30A","2026-07-25","25/07",3,"333")], // en ventana, pendiente
      ["C40A",mk("C40A","2026-08-11","11/08",4,"444")]  // FUERA de ventana, pendiente
    ]);
    const done={picking:"done",separado:"done",doneTodayP:false,doneTodayA:false,pickLegajo:"55",sepLegajo:"55"};
    const none={picking:null,separado:null,doneTodayP:false,doneTodayA:false,pickLegajo:null,sepLegajo:null};
    const status=new Map([["C10A",done],["C20A",done],["C30A",none],["C40A",none]]);
    const targetDates=["2026-07-25"];  // ventana = solo el 25/07
    let threw=null;
    try{ renderMonitor(sheet,status,[],targetDates,[],[],null,null,null,null,"2026-07-24","2026-07-23"); }
    catch(e){ threw=e.message; }
    const html=document.getElementById("monitorContent").innerHTML;
    const fc=(html.match(/monitor-fc-table[\s\S]*/)||[""])[0];
    const main=(html.match(/monitor-table[\s\S]*?<\/table>/)||[""])[0];
    const beyond=(html.match(/beyond-card[\s\S]*?<\/div>\s*<\/div>/)||[""])[0];
    return {
      threw,
      fc_tieneC10:/C10A/.test(fc), fc_tieneC20_fuera:/C20A/.test(fc),
      main_tieneC30:/C30A/.test(main), main_noC20:!/C20A/.test(main),
      beyond_tieneC40:/C40A/.test(html), beyond_noC20:!(beyond.indexOf("C20A")>=0)
    };
  });
  const pass=!r.threw && r.fc_tieneC10 && r.fc_tieneC20_fuera && r.main_tieneC30 && r.main_noC20 && r.beyond_tieneC40 && r.beyond_noC20 && errs.length===0;
  console.log("mon-fc:",JSON.stringify(r));
  console.log("pageerrors:",errs.length?errs.join("|"):"none");
  console.log(pass?"OK":"FAIL");
  await b.close();process.exit(pass?0:1);
})();
