import {useEffect,useState} from "react";
import {MapContainer,TileLayer,CircleMarker,Popup,useMapEvents} from "react-leaflet";
import "leaflet/dist/leaflet.css";import "./styles.css";
const API=import.meta.env.VITE_API_URL||"http://localhost:4000";
async function api(path,o={}){const h={Authorization:"Bearer "+localStorage.getItem("c360t")};let body=o.body;
if(body&&!(body instanceof FormData)){h["Content-Type"]="application/json";body=JSON.stringify(body)}
const r=await fetch(API+"/api"+path,{method:o.method||"GET",headers:h,body}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.statusText);return j}
const CATS=["pothole","garbage","water","drainage","streetlight","sanitation","other"],WARDS={9:"Aundh",12:"Kothrud",15:"Shivajinagar",18:"Kasba Peth",21:"Hadapsar"};
const done=c=>["resolved","verified"].includes(c.status),late=c=>!done(c)&&new Date(c.due_at)<new Date();
const col=c=>late(c)?"#dc2626":done(c)?"#6b7280":c.status=="in_progress"?"#e69100":"#2563eb";
const Pill=({t})=><span className="p">{String(t).replace("_"," ")}</span>;
function Pick({onPick}){useMapEvents({click:e=>onPick(e.latlng)});return null}
function CMap({items=[],pick,onPick,h=340}){return <MapContainer center={[18.5204,73.8567]} zoom={12} style={{height:h}}>
<TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/>
{onPick&&<Pick onPick={onPick}/>}
{items.map(c=><CircleMarker key={c.id} center={[c.lat,c.lng]} radius={9} pathOptions={{color:col(c)}}><Popup><b>{c.id}</b><br/>{c.category}: {c.description}<br/>{c.status}</Popup></CircleMarker>)}
{pick&&<CircleMarker center={[pick.lat,pick.lng]} radius={11} pathOptions={{color:"#0f9d62"}}/>}</MapContainer>}

function Login({onDone}){const [ph,setPh]=useState(""),[otp,setOtp]=useState(""),[step,setStep]=useState(0),[e,setE]=useState("");
const post=async(p,b)=>{const r=await fetch(API+"/api/auth/"+p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}),j=await r.json();if(!r.ok)throw new Error(j.error);return j};
const go=async()=>{setE("");try{if(!step){await post("send",{phone:ph});setStep(1)}else{const j=await post("verify",{phone:ph,otp});localStorage.setItem("c360t",j.token);onDone(j.user)}}catch(x){setE(x.message)}};
return <div className="card login"><h2>CIVIC360</h2><p className="m">Pune Municipal Corporation · demo</p>
{step?<><label>Enter the OTP sent to +91 {ph}</label><input value={otp} onChange={x=>setOtp(x.target.value)} maxLength={4} inputMode="numeric" placeholder="4-digit OTP"/><p className="m">Demo OTP: 1234</p></>
:<><label>Mobile number</label><input value={ph} onChange={x=>setPh(x.target.value)} maxLength={10} inputMode="numeric" placeholder="10-digit number"/></>}
<p style={{color:"#dc2626"}}>{e}</p><button className="btn" style={{width:"100%"}} onClick={go}>{step?"Verify and continue":"Send OTP"}</button></div>}

function Citizen(){const [l,setL]=useState([]),[f,setF]=useState({category:"pothole",description:"",ward:12,address:""}),[pos,setPos]=useState(null),[files,setFiles]=useState([]),[busy,setB]=useState(false);
const load=()=>api("/complaints").then(setL);useEffect(()=>{load()},[]);
const gps=()=>navigator.geolocation.getCurrentPosition(p=>setPos({lat:p.coords.latitude,lng:p.coords.longitude}),()=>alert("Allow location access, or tap the map to pin the spot"));
async function submit(){if(!pos)return alert("Tap the map or use GPS to pin the location");const fd=new FormData();Object.entries({...f,...pos}).forEach(([k,v])=>fd.append(k,v));files.forEach(x=>fd.append("photos",x));
setB(true);try{await api("/complaints",{method:"POST",body:fd});setF({...f,description:""});setFiles([]);setPos(null);load()}catch(e){alert(e.message)}setB(false)}
return <><div className="card"><h3>Report an issue</h3>
<label>Category</label><select value={f.category} onChange={e=>setF({...f,category:e.target.value})}>{CATS.map(c=><option key={c}>{c}</option>)}</select>
<label>Describe the problem</label><textarea value={f.description} onChange={e=>setF({...f,description:e.target.value})}/>
<label>Ward</label><select value={f.ward} onChange={e=>setF({...f,ward:e.target.value})}>{Object.entries(WARDS).map(([k,v])=><option key={k} value={k}>Ward {k} · {v}</option>)}</select>
<label>Address or landmark</label><input value={f.address} onChange={e=>setF({...f,address:e.target.value})}/>
<label>Photos</label><input type="file" accept="image/*" multiple onChange={e=>setFiles([...e.target.files])}/>
<label>Location: tap the map to drop a pin</label><button onClick={gps}>📍 Use my GPS</button>
<CMap items={l} pick={pos} onPick={setPos} h={280}/>
<button className="btn" disabled={busy} onClick={submit} style={{marginTop:10}}>{busy?"Submitting…":"Submit complaint"}</button></div>
<h3>Complaints</h3>{l.map(c=><div className="card" key={c.id}><b>{c.category}: {c.description}</b><div className="m">{c.id} · Ward {c.ward} · {c.address}</div>
<Pill t={c.priority}/><Pill t={c.status}/>{c.duplicate_of&&<Pill t={"dup of "+c.duplicate_of}/>}
<div className="th">{[...(c.photos||[]),...(c.after_photos||[])].map(u=><img key={u} src={u}/>)}</div>
<button onClick={()=>api(`/complaints/${c.id}/upvote`,{method:"POST"}).then(load)}>▲ {c.votes}</button>
{done(c)&&!c.rating&&[1,2,3,4,5].map(n=><button key={n} onClick={()=>api(`/complaints/${c.id}/rate`,{method:"POST",body:{rating:n}}).then(load)}>★</button>)}
{c.rating&&<span> Rated {c.rating}★</span>}</div>)}</>}

function Task({c,reload}){const [bf,setBf]=useState([]),[af,setAf]=useState([]);
const checkin=()=>navigator.geolocation.getCurrentPosition(()=>api(`/complaints/${c.id}/checkin`,{method:"POST"}).then(reload),()=>alert("Allow location access to check in"));
async function fin(){if(c.status!="in_progress")return alert("Check in at the location first");if(!af.length)return alert("Add an after photo");const fd=new FormData();bf.forEach(x=>fd.append("before",x));af.forEach(x=>fd.append("after",x));await api(`/complaints/${c.id}/complete`,{method:"POST",body:fd});reload()}
return <div className="card"><b>{c.category}: {c.description}</b><div className="m">{c.id} · {c.address}</div><Pill t={c.priority}/><Pill t={c.status}/>
<p><a href={`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">🧭 Navigate</a></p>
{!done(c)&&<><button onClick={checkin}>📍 GPS check-in</button><label>Before photos</label><input type="file" accept="image/*" capture="environment" multiple onChange={e=>setBf([...e.target.files])}/><label>After photos (proof)</label><input type="file" accept="image/*" capture="environment" multiple onChange={e=>setAf([...e.target.files])}/><button className="btn" onClick={fin}>Mark complete</button></>}</div>}
function Officer(){const [l,setL]=useState([]);const load=()=>api("/complaints?assigned=1").then(setL);useEffect(()=>{load()},[]);
const q=l.filter(c=>!done(c));return <><div className="sg"><div className="card"><b>{q.length}</b>Open</div><div className="card"><b>{q.filter(late).length}</b>Overdue</div><div className="card"><b>{l.length-q.length}</b>Done</div></div>
<CMap items={q} h={260}/><h3>My tasks</h3>{l.map(c=><Task key={c.id} c={c} reload={load}/>)}{!l.length&&<p className="m">No tasks assigned yet.</p>}</>}

function Admin(){const [l,setL]=useState([]),[o,setO]=useState([]);const load=()=>api("/complaints").then(setL);useEffect(()=>{load();api("/officers").then(setO)},[]);
const act=(p,b)=>api(p,{method:"POST",body:b}).then(load),n=l.length||1,d=l.filter(done).length;
return <><div className="sg"><div className="card"><b>{l.length}</b>Total</div><div className="card"><b>{l.filter(c=>c.status=="open"||c.status=="assigned").length}</b>Open</div><div className="card"><b>{l.filter(c=>c.status=="in_progress").length}</b>In progress</div><div className="card"><b>{d}</b>Resolved ({Math.round(d/n*100)}%)</div><div className="card"><b style={{color:"#dc2626"}}>{l.filter(late).length}</b>Overdue</div></div>
<div className="card"><b>Live complaints map</b><CMap items={l}/></div>
<div className="card tw"><table><thead><tr><th>ID</th><th>Issue</th><th>Ward</th><th>Priority</th><th>Status</th><th>Officer</th><th></th></tr></thead><tbody>{l.map(c=><tr key={c.id}><td>{c.id}</td><td>{c.category}: {c.description}{c.duplicate_of&&<div><Pill t={"dup of "+c.duplicate_of}/><button onClick={()=>act(`/complaints/${c.id}/merge`)}>Merge</button></div>}</td><td>{c.ward}</td><td><Pill t={c.priority}/></td><td><Pill t={c.status}/></td>
<td>{!done(c)?<select value={c.assigned_to||""} onChange={e=>act(`/complaints/${c.id}/assign`,{officer_id:e.target.value})}><option value="">Unassigned</option>{o.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>:c.assignee?.name}</td>
<td>{c.status=="resolved"&&<button className="btn" onClick={()=>act(`/complaints/${c.id}/verify`)}>Verify</button>}</td></tr>)}</tbody></table></div></>}

export default function App(){const [u,setU]=useState(()=>{try{return JSON.parse(localStorage.getItem("c360u"))}catch{return null}}),[tab,setTab]=useState("citizen");
const login=x=>{localStorage.setItem("c360u",JSON.stringify(x));setU(x)},out=()=>{localStorage.clear();setU(null)};
if(!u)return <Login onDone={login}/>;
const tabs=u.role=="admin"?["citizen","officer","admin"]:u.role=="officer"?["citizen","officer"]:["citizen"];
return <><header className="top"><b>CIVIC360</b><span className="p">Pune Municipal Corporation · demo</span><nav>{tabs.map(t=><button key={t} className={tab==t?"on":""} onClick={()=>setTab(t)}>{{citizen:"Citizen",officer:"Field officer",admin:"Admin"}[t]}</button>)}<button onClick={out}>Log out</button></nav></header>
<main>{tab=="citizen"?<Citizen/>:tab=="officer"?<Officer/>:<Admin/>}</main></>}
