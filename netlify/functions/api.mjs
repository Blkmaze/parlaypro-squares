// ParlayPro Squares API - ASCII only
const SITE_ID    = "658f40e1-9d0f-4072-80a5-d6d0eb35d77e";
const STORE      = "sq3";
const LOCK_KEY   = "__board_lock__";
const ADMIN_PIN  = process.env.ADMIN_PIN  || "2826";
const MASTER_PIN = process.env.MASTER_PIN || "0614";
const ORIGIN     = "https://parlaypro-squares.netlify.app";

function corsHeaders(req) {
  var origin = req.headers.get("origin") || "";
  var allowed = origin === ORIGIN || origin === "http://localhost:8888";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowed ? origin : ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "X-Content-Type-Options": "nosniff"
  };
}
function json(req, data, status) {
  return new Response(JSON.stringify(data), { status: status||200, headers: corsHeaders(req) });
}
function validPin(p) { return p === ADMIN_PIN || p === MASTER_PIN; }
function sanitizeGameId(raw) {
  if (typeof raw !== "string") return null;
  var c = raw.replace(/[^A-Za-z0-9_\-]/g,"").slice(0,64);
  return c.length>=3 ? c : null;
}
function sanitizeInitials(raw) {
  if (typeof raw !== "string") return null;
  var c = raw.replace(/[^A-Za-z0-9]/g,"").toUpperCase().slice(0,4);
  return c.length>=2 ? c : null;
}
function sanitizeSport(raw) {
  var allowed=["ncaam","ncaaw","nba","wnba","nhl","mlb","nfl","mls"];
  return allowed.indexOf(raw)!==-1 ? raw : "nba";
}
async function blobGet(token,key) {
  var r = await fetch("https://api.netlify.com/api/v1/blobs/"+SITE_ID+"/"+STORE+"/"+encodeURIComponent(key),{headers:{Authorization:"Bearer "+token}});
  if(!r.ok) return null;
  var t = await r.text();
  try{return JSON.parse(t);}catch(e){return null;}
}
async function blobSet(token,key,value) {
  var r = await fetch("https://api.netlify.com/api/v1/blobs/"+SITE_ID+"/"+STORE+"/"+encodeURIComponent(key),{method:"PUT",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(value)});
  if(!r.ok) throw new Error("Blob write failed: "+r.status);
}
var empty=function(){return{owners:{},pending:{},rowNums:null,colNums:null,numbersLocked:false};};

export default async function handler(req,context) {
  var url=new URL(req.url);
  var path=url.pathname;
  var method=req.method.toUpperCase();
  if(method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders(req)});
  var body={};
  if(method==="POST"){try{var raw=await req.text();body=JSON.parse(raw);}catch(e){body={};}}
  var token=process.env.NETLIFY_TOKEN;

  if(path==="/api/scores"&&method==="GET"){
    var SPORTS={ncaam:"https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard",ncaaw:"https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard",nba:"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",wnba:"https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard",nhl:"https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard",mlb:"https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",nfl:"https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",mls:"https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard"};
    var sport=sanitizeSport(url.searchParams.get("sport"));
    var date=(url.searchParams.get("date")||"").replace(/[^0-9]/g,"").slice(0,8);
    var espnUrl=date?SPORTS[sport]+"?dates="+date:SPORTS[sport];
    try{
      var res=await fetch(espnUrl);
      var edata=await res.json();
      var games=(edata.events||[]).map(function(e){
        var c=e.competitions&&e.competitions[0];
        var home=c&&c.competitors&&c.competitors.find(function(t){return t.homeAway==="home";});
        var away=c&&c.competitors&&c.competitors.find(function(t){return t.homeAway==="away";});
        var s=c&&c.status&&c.status.type;
        var odds=c&&c.odds&&c.odds[0];
        return{id:e.id,name:e.name,home:home&&home.team&&home.team.abbreviation||"",homeFull:home&&home.team&&home.team.displayName||"",homeLogo:home&&home.team&&home.team.logo||"",homeScore:home&&home.score||"0",away:away&&away.team&&away.team.abbreviation||"",awayFull:away&&away.team&&away.team.displayName||"",awayLogo:away&&away.team&&away.team.logo||"",awayScore:away&&away.score||"0",status:s&&s.completed?"FINAL":s&&s.inProgress?"LIVE":"SCHEDULED",clock:c&&c.status&&c.status.displayClock||"",period:c&&c.status&&c.status.period||0,time:e.date?new Date(e.date).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/New_York"})+" ET":"",date:e.date?new Date(e.date).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:"America/New_York"}):"",spread:odds&&odds.spread||null,total:odds&&odds.overUnder||null,awayML:odds&&odds.awayTeamOdds&&odds.awayTeamOdds.moneyLine||null,homeML:odds&&odds.homeTeamOdds&&odds.homeTeamOdds.moneyLine||null,spreadFav:odds&&odds.homeTeamOdds&&odds.homeTeamOdds.favorite?"home":"away"};
      });
      return json(req,{sport:sport,games:games});
    }catch(e){return json(req,{error:"Server error"},500);}
  }

  if(path==="/api/squares"&&method==="GET"){
    var gameId=sanitizeGameId(url.searchParams.get("gameId"));
    if(!gameId) return json(req,{error:"Invalid gameId"},400);
    if(!token) return json(req,empty());
    try{var data=await blobGet(token,gameId)||empty();return json(req,data);}catch(e){return json(req,empty());}
  }

  if(path==="/api/auto-assign"&&method==="POST"){
    if(!token) return json(req,{error:"Server error"},500);
    var gameId=sanitizeGameId(body.gameId);
    var initials=sanitizeInitials(body.initials);
    var qty=parseInt(body.qty,10);
    var isPending=!!body.pending;
    var payMethod=["cash","cashapp","paypal"].indexOf(body.payMethod)!==-1?body.payMethod:"unknown";
    var amount=typeof body.amount==="string"?body.amount.replace(/[^0-9.]/g,"").slice(0,8):"?";
    if(!gameId) return json(req,{error:"Invalid gameId"},400);
    if(!initials) return json(req,{error:"Invalid initials"},400);
    if(!qty||qty<1||qty>10) return json(req,{error:"Qty must be 1-10"},400);
    try{
      var data=await blobGet(token,gameId)||empty();
      var owners=data.owners||{};var pending=data.pending||{};
      var open=[];for(var i=0;i<100;i++){if(owners[i]===undefined&&pending[i]===undefined)open.push(i);}
      if(!open.length) return json(req,{error:"No open squares"},409);
      for(var i=open.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var tmp=open[i];open[i]=open[j];open[j]=tmp;}
      var assigned=open.slice(0,Math.min(qty,open.length));
      if(isPending){assigned.forEach(function(idx){pending[idx]={initials:initials,payMethod:payMethod,amount:amount};});data.pending=pending;}
      else{assigned.forEach(function(idx){owners[idx]=initials;});data.owners=owners;}
      await blobSet(token,gameId,data);
      return json(req,{ok:true,indices:assigned,initials:initials});
    }catch(e){return json(req,{error:"Server error"},500);}
  }

  if(path==="/api/claim-square"&&method==="POST"){
    if(!token) return json(req,{error:"Server error"},500);
    var gameId=sanitizeGameId(body.gameId);
    var initials=sanitizeInitials(body.initials);
    var indices=Array.isArray(body.indices)?body.indices.filter(function(i){return Number.isInteger(i)&&i>=0&&i<100;}):[];
    var isPending=!!body.pending;
    var payMethod=["cash","cashapp","paypal"].indexOf(body.payMethod)!==-1?body.payMethod:"unknown";
    var amount=typeof body.amount==="string"?body.amount.replace(/[^0-9.]/g,"").slice(0,8):"?";
    if(!gameId) return json(req,{error:"Invalid gameId"},400);
    if(!initials) return json(req,{error:"Invalid initials"},400);
    if(!indices.length) return json(req,{error:"No valid indices"},400);
    try{
      var data=await blobGet(token,gameId)||empty();
      var owners=data.owners||{};var pending=data.pending||{};
      var conflicts=indices.filter(function(i){return owners[i]!==undefined||pending[i]!==undefined;});
      if(conflicts.length) return json(req,{error:"Already taken: "+conflicts.join(", ")},409);
      if(isPending){indices.forEach(function(i){pending[i]={initials:initials,payMethod:payMethod,amount:amount};});data.pending=pending;}
      else{indices.forEach(function(i){owners[i]=initials;});data.owners=owners;}
      await blobSet(token,gameId,data);
      return json(req,{ok:true,claimed:indices,initials:initials});
    }catch(e){return json(req,{error:"Server error"},500);}
  }

  if(path==="/api/init-numbers"&&method==="POST"){
    if(!token) return json(req,{error:"Server error"},500);
    var gameId=sanitizeGameId(body.gameId);
    var rowNums=Array.isArray(body.rowNums)&&body.rowNums.length===10?body.rowNums:null;
    var colNums=Array.isArray(body.colNums)&&body.colNums.length===10?body.colNums:null;
    if(!gameId||!rowNums||!colNums) return json(req,{error:"Missing fields"},400);
    try{
      var data=await blobGet(token,gameId)||empty();
      if(!data.rowNums){data.rowNums=rowNums;data.colNums=colNums;await blobSet(token,gameId,data);return json(req,{ok:true,stored:true,rowNums:rowNums,colNums:colNums});}
      return json(req,{ok:true,stored:false,rowNums:data.rowNums,colNums:data.colNums});
    }catch(e){return json(req,{error:"Server error"},500);}
  }

  if(path==="/api/lock-numbers"&&method==="POST"){
    if(!token) return json(req,{error:"Server error"},500);
    var gameId=sanitizeGameId(body.gameId);var pin=typeof body.pin==="string"?body.pin.slice(0,8):"";
    if(!gameId||!pin) return json(req,{error:"Missing fields"},400);
    if(!validPin(pin)) return json(req,{error:"Invalid PIN"},403);
    try{
      var data=await blobGet(token,gameId)||empty();
      if(body.rowNums) data.rowNums=body.rowNums;if(body.colNums) data.colNums=body.colNums;
      data.numbersLocked=true;await blobSet(token,gameId,data);return json(req,{ok:true});
    }catch(e){return json(req,{error:"Server error"},500);}
  }

  if(path==="/api/reset-squares"&&method==="POST"){
    if(!token) return json(req,{error:"Server error"},500);
    var gameId=sanitizeGameId(body.gameId);var pin=typeof body.pin==="string"?body.pin.slice(0,8):"";
    if(!gameId||!pin) return json(req,{error:"Missing fields"},400);
    if(!validPin(pin)) return json(req,{error:"Invalid PIN"},403);
    try{await blobSet(token,gameId,{owners:{},pending:{},rowNums:null,colNums:null,numbersLocked:false,resetAt:Date.now()});return json(req,{ok:true});}
    catch(e){return json(req,{error:"Server error"},500);}
  }

  if(path==="/api/confirm-pending"&&method==="POST"){
    if(!token) return json(req,{error:"Server error"},500);
    var gameId=sanitizeGameId(body.gameId);var pin=typeof body.pin==="string"?body.pin.slice(0,8):"";
    if(!gameId) return json(req,{error:"Missing gameId"},400);
    if(!validPin(pin)) return json(req,{error:"Invalid PIN"},403);
    try{
      var data=await blobGet(token,gameId)||empty();
      var owners=data.owners||{};var pending=data.pending||{};var confirmed=[];
      var indices=Array.isArray(body.indices)?body.indices:Object.keys(pending).map(Number);
      indices.forEach(function(i){var p=pending[i];if(p){owners[i]=p.initials;delete pending[i];confirmed.push(i);}});
      data.owners=owners;data.pending=pending;await blobSet(token,gameId,data);
      return json(req,{ok:true,confirmed:confirmed});
    }catch(e){return json(req,{error:"Server error"},500);}
  }

  if(path==="/api/reject-pending"&&method==="POST"){
    if(!token) return json(req,{error:"Server error"},500);
    var gameId=sanitizeGameId(body.gameId);var pin=typeof body.pin==="string"?body.pin.slice(0,8):"";
    if(!gameId||!pin) return json(req,{error:"Missing fields"},400);
    if(!validPin(pin)) return json(req,{error:"Invalid PIN"},403);
    try{
      var data=await blobGet(token,gameId)||empty();var pending=data.pending||{};
      var indices=Array.isArray(body.indices)?body.indices:Object.keys(pending).map(Number);
      indices.forEach(function(i){delete pending[i];});data.pending=pending;
      await blobSet(token,gameId,data);return json(req,{ok:true});
    }catch(e){return json(req,{error:"Server error"},500);}
  }

  if(path==="/api/board-lock"&&method==="GET"){
    if(!token) return json(req,{locked:false});
    try{var ld=await blobGet(token,LOCK_KEY);return json(req,ld||{locked:false});}
    catch(e){return json(req,{locked:false});}
  }

  if(path==="/api/board-lock"&&method==="POST"){
    if(!token) return json(req,{error:"Server error"},500);
    var pin=typeof body.pin==="string"?body.pin.slice(0,8):"";
    if(!validPin(pin)) return json(req,{error:"Wrong PIN"},401);
    try{
      if(body.action==="unlock"){
        await blobSet(token,LOCK_KEY,{locked:false});
        return json(req,{ok:true,locked:false});
      }
      var ldata={locked:true,sport:String(body.sport||"").slice(0,20),date:String(body.date||"").slice(0,10),gameId:String(body.gameId||"").slice(0,64),label:String(body.label||"").slice(0,80),lockedAt:Date.now()};
      await blobSet(token,LOCK_KEY,ldata);
      return json(req,{ok:true,...ldata});
    }catch(e){return json(req,{error:e.message||"Lock failed"},500);}
  }

  return json(req,{error:"Not found"},404);
}




