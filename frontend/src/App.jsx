import { useEffect, useState } from 'react'
import { Routes, Route, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { api } from './api'

const cls = (s) => s.replace(/\s/g, '')
const level = (n) => (n >= 70 ? 'High' : n >= 50 ? 'Medium' : 'Low')
const Pill = ({ v }) => <span className={`pill ${cls(v)}`}>{v}</span>
const useAuth = () => {
  const [u, setU] = useState(() => JSON.parse(localStorage.getItem('rn_user') || 'null'))
  return [u, (x) => { x ? localStorage.setItem('rn_user', JSON.stringify(x)) : localStorage.removeItem('rn_user'); setU(x) }]
}

function Nav({ user, setUser }) {
  const nav = useNavigate()
  return (
    <div className="nav">
      <b>♡ ReliefNet</b>
      <NavLink to="/" end>Home</NavLink><NavLink to="/request">Request Help</NavLink><NavLink to="/donate">Donations</NavLink>
      <NavLink to="/volunteer">Volunteers</NavLink><NavLink to="/track">Track</NavLink>
      {user && <><NavLink to="/staff">Review</NavLink><NavLink to="/records">Records</NavLink><NavLink to="/delivery">Delivery</NavLink><NavLink to="/manage">Manage</NavLink></>}
      <span className="sp" />
      {user ? <><span>{user.name}</span><button className="btn sm w" onClick={() => { setUser(null); nav('/') }}>Logout</button></>
        : <button className="btn sm w" onClick={() => nav('/login')}>Staff login</button>}
    </div>
  )
}

function Home() {
  const tiles = [['🆘', 'Request Help', 'Get assistance for your needs', '/request'], ['💙', 'Donate', 'Support people in need', '/donate'], ['🤝', 'Volunteer', 'Give your time & skills', '/volunteer'], ['📍', 'Track Your Request', 'Check your status', '/track']]
  return (<>
    <div className="hero"><h1>Together<br />We Rebuild Lives</h1><p>Support for those affected by natural disasters. Food, shelter, and hope — when it matters most.</p>
      <div className="row"><Link className="btn" to="/request">Request Help</Link><Link className="btn out" to="/donate">Donate</Link></div></div>
    <div className="wrap grid g4">{tiles.map(([i, t, d, to]) => <Link key={t} to={to} className="card tile"><div className="ic">{i}</div><b>{t}</b><div className="sub">{d}</div></Link>)}</div>
  </>)
}

function RequestHelp() {
  const nav = useNavigate()
  const [f, setF] = useState({ name: '', phone: '', email: '', location: '', type: 'Food', info: '', agree: false })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const submit = async () => {
    if (!f.name || !/^0\d{9}$/.test(f.phone) || !f.location || !f.agree) return setErr('Enter your name, a 10-digit phone number (07X XXX XXXX), location, and tick the consent box.')
    const r = await api.sendRequest(f); nav('/urgency', { state: { req: r } })
  }
  return (
    <div className="wrap"><h1>Request Help</h1><p className="sub">Fill in the details below so we can assist you.</p>
      <div className="grid g2"><div className="card">
        <label>Full name *</label><input value={f.name} onChange={set('name')} placeholder="Enter your full name" />
        <label>Phone number *</label><input value={f.phone} onChange={set('phone')} placeholder="07X XXX XXXX" />
        <label>Email (for approval notice)</label><input value={f.email} onChange={set('email')} placeholder="you@example.com" />
        <label>Location *</label><select value={f.location} onChange={set('location')}><option value="">Select your location</option>{['Galle', 'Matara', 'Kalutara', 'Hambantota', 'Colombo', 'Ratnapura'].map(x => <option key={x}>{x}</option>)}</select>
        <label>Type of help needed *</label><select value={f.type} onChange={set('type')}><option>Food</option><option>Shelter</option><option>Other</option></select>
        <label>Additional information</label><textarea rows="4" value={f.info} onChange={set('info')} placeholder="e.g. number of children, medical needs, flood affected, no food for 2 days" />
        <label style={{ fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.agree} onChange={set('agree')} /> I agree to share my information for assistance purposes.</label>
        {err && <p className="err">{err}</p>}
        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={submit}>Submit Request</button>
      </div><div className="card tile"><div className="ic">💙</div><b>Your request matters</b><p className="sub">We are here to help in your time of need.</p></div></div></div>)
}

function Urgency() {
  const { state } = useLocation(); const r = state?.req
  if (!r) return <Navigate to="/request" />
  const lv = level(r.score), col = lv === 'High' ? '#dc2626' : lv === 'Medium' ? '#f59e0b' : '#16a34a'
  return (
    <div className="wrap"><h1>AI Urgency Assessment</h1><p className="sub">Request #REQ-{String(r.id).padStart(5, '0')} was received. Keep this number to track your request. Our AI analyses it and gives a priority score.</p>
      <div className="card stat" style={{ gap: 30, flexWrap: 'wrap' }}>
        <div className="ring" style={{ background: `conic-gradient(${col} ${r.score * 3.6}deg,#e5e7eb 0)` }}><div style={{ background: '#fff', width: 118, height: 118, borderRadius: '50%', display: 'grid', placeItems: 'center' }}>{r.score}<small style={{ fontSize: 12 }}>/100</small></div></div>
        <div><span className={`pill ${lv}`} style={{ fontSize: 18 }}>{lv} Priority</span><p>{lv === 'High' ? 'This request needs immediate attention.' : 'This request will be reviewed in order of priority.'}</p></div></div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card"><b>Key factors detected</b><table><tbody>{r.factors.map(x => <tr key={x.label}><td>{x.label}</td><td style={{ color: 'var(--ok)' }}>+{x.points}</td></tr>)}</tbody></table></div>
        <div className="card"><b>AI suggestion</b><p className="sub">{r.factors.length ? 'Priority based on: ' + r.factors.map(x => x.label.toLowerCase()).join(', ') + '.' : 'No urgent factors found.'}</p></div></div>
      <div className="banner">This score is a recommendation. Final decision will be made by the staff (Coordinator).</div></div>)
}

function Login({ setUser }) {
  const nav = useNavigate(); const [f, setF] = useState({ username: '', password: '' }); const [e, setE] = useState('')
  return (<div className="wrap" style={{ maxWidth: 420 }}><div className="card"><h1>Staff login</h1><p className="sub">Authorized staff only.</p>
    <label>Username</label><input value={f.username} onChange={x => setF({ ...f, username: x.target.value })} />
    <label>Password</label><input type="password" value={f.password} onChange={x => setF({ ...f, password: x.target.value })} />
    {e && <p className="err">{e}</p>}<button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => api.login(f).then(u => { setUser(u); nav('/staff') }).catch(() => setE('Wrong username or password.'))}>Log in</button></div></div>)
}

function Staff({ user }) {
  const nav = useNavigate(); const [rows, setRows] = useState([]); const [tab, setTab] = useState('All'); const [q, setQ] = useState('')
  const load = () => api.requests('All', q).then(setRows); useEffect(() => { if (user) load().catch(() => {}) }, [q])
  if (!user) return <Navigate to="/login" />
  const shown = rows.filter(r => tab === 'All' || level(r.score) === tab)
  const act = async (id, s) => { try { await api.setStatus(id, s); nav('/email') } catch { load() } }
  return (<div className="wrap"><h1>Pending Requests</h1><p className="sub">Review AI scores and approve or reject requests.</p>
    <div className="tabs">{['All', 'High', 'Medium', 'Low'].map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t} ({t === 'All' ? rows.length : rows.filter(r => level(r.score) === t).length})</button>)}
      <input style={{ maxWidth: 260, marginLeft: 'auto' }} placeholder="Search by name, ID or location..." value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="card" style={{ overflowX: 'auto' }}><table><thead><tr><th>ID</th><th>Name</th><th>Location</th><th>AI score</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {shown.map(r => <tr key={r.id}><td>#REQ-{String(r.id).padStart(5, '0')}</td><td>{r.name}</td><td>{r.location}</td><td><b>{r.score}</b> <Pill v={level(r.score)} /></td><td><Pill v={r.status} /></td>
        <td>{r.status === 'Pending' ? <><button className="btn sm g" onClick={() => act(r.id, 'Approved')}>Approve</button> <button className="btn sm r" onClick={() => act(r.id, 'Rejected')}>Reject</button></> : '—'}</td></tr>)}
      {!shown.length && <tr><td colSpan="6" className="sub">No requests yet. Submit one from the Request Help page.</td></tr>}</tbody></table></div></div>)
}

function Delivery({ user }) {
  const [tab, setTab] = useState('Food Package'); const [rows, setRows] = useState([]); const load = () => api.deliveries().then(setRows); useEffect(() => { if (user) load().catch(() => {}) }, [])
  if (!user) return <Navigate to="/login" />
  const list = rows.filter(d => tab === 'Food Package' ? d.aidType === 'Food Package' : d.aidType === 'Shelter')
  const n = (s) => rows.filter(d => d.status === s).length
  return (<div className="wrap"><h1>Aid Delivery</h1><p className="sub">Track and manage food and shelter assistance.</p>
    <div className="tabs">{['Food Package', 'Shelter'].map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'Shelter' ? 'Shelter Support' : 'Food Packages'}</button>)}</div>
    <div className="grid g3">{[['Total packages', rows.length], ['Delivered', n('Delivered')], ['Pending', n('Pending')]].map(([a, b]) => <div className="card" key={a}><span className="sub">{a}</span><b style={{ display: 'block', fontSize: 28 }}>{b}</b></div>)}</div>
    <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}><b>Recent deliveries</b><table><thead><tr><th>ID</th><th>Beneficiary</th><th>Aid type</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>
      {list.map(d => <tr key={d.id}><td>#DEL-{String(d.id).padStart(5, '0')}</td><td>{d.beneficiary}</td><td>{d.aidType}</td><td><Pill v={d.status} /></td><td>{d.date}</td>
        <td>{d.status !== 'Delivered' && <button className="btn sm" onClick={() => api.setDelivery(d.id, d.status === 'Pending' ? 'In Progress' : 'Delivered').then(load)}>{d.status === 'Pending' ? 'Start' : 'Mark delivered'}</button>}</td></tr>)}</tbody></table></div></div>)
}

function EmailPage({ user }) {
  const [m, setM] = useState(null); useEffect(() => { if (user) api.emails().then(x => setM(x[0])).catch(() => {}) }, [])
  if (!user) return <Navigate to="/login" />
  return (<div className="wrap"><h1>Email Sent</h1><p className="sub">Confirmation message has been sent to the requester.</p>
    <div className="grid g2"><div className="card">{m ? <><h3 style={{ color: 'var(--ok)' }}>{m.subject}</h3><p className="sub">To: {m.to || '(no email given)'}</p><pre style={{ whiteSpace: 'pre-wrap', font: 'inherit' }}>{m.body}</pre></> : <p>No emails yet.</p>}
      <Link className="btn" to="/staff" style={{ display: 'block', textAlign: 'center' }}>Back to Dashboard</Link></div>
      <div className="card tile"><div className="ic">✉️</div><b>Email sent successfully</b><p className="sub">A confirmation email has been sent to the requester.</p></div></div></div>)
}

function Records({ user }) {
  const [rows, setRows] = useState([]); const [q, setQ] = useState(''); const [s, setS] = useState('All'); const [p, setP] = useState(1)
  useEffect(() => { if (user) api.requests(s, q).then(x => { setRows(x); setP(1) }).catch(() => {}) }, [q, s])
  if (!user) return <Navigate to="/login" />
  const pages = Math.max(1, Math.ceil(rows.length / 5))
  return (<div className="wrap"><h1>Request Records</h1><p className="sub">View all past and current requests.</p>
    <div className="tabs"><input style={{ maxWidth: 300 }} placeholder="Search by name, ID or location..." value={q} onChange={e => setQ(e.target.value)} />
      <select style={{ maxWidth: 160 }} value={s} onChange={e => setS(e.target.value)}>{['All', 'Pending', 'Approved', 'Rejected'].map(x => <option key={x}>{x}</option>)}</select></div>
    <div className="card" style={{ overflowX: 'auto' }}><table><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead><tbody>
      {rows.slice((p - 1) * 5, p * 5).map(r => <tr key={r.id}><td>#REQ-{String(r.id).padStart(5, '0')}</td><td>{r.name}</td><td>{r.type}</td><td><Pill v={level(r.score)} /></td><td><Pill v={r.status} /></td><td>{r.date}</td></tr>)}
      {!rows.length && <tr><td colSpan="6" className="sub">No records found.</td></tr>}</tbody></table>
      <div className="tabs" style={{ justifyContent: 'center', marginTop: 14 }}>{Array.from({ length: pages }, (_, i) => <button key={i} className={p === i + 1 ? 'on' : ''} onClick={() => setP(i + 1)}>{i + 1}</button>)}</div></div></div>)
}

function Track() {
  const [f, setF] = useState({ id: '', phone: '' }); const [r, setR] = useState(null); const [e, setE] = useState('')
  const go = () => {
    setE(''); setR(null); const id = parseInt(f.id.replace(/\D/g, ''), 10)
    if (!id || !f.phone) return setE('Enter your request number and phone number.')
    api.track({ id, phone: f.phone }).then(setR).catch(() => setE('No request found. Check the number and the phone number you used.'))
  }
  return (<div className="wrap" style={{ maxWidth: 520 }}><h1>Track Your Request</h1><p className="sub">Use the request number shown after you submitted.</p>
    <div className="card"><label>Request number</label><input value={f.id} onChange={x => setF({ ...f, id: x.target.value })} placeholder="e.g. 45 or REQ-00045" />
      <label>Phone number</label><input value={f.phone} onChange={x => setF({ ...f, phone: x.target.value })} placeholder="07X XXX XXXX" />
      {e && <p className="err">{e}</p>}<button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={go}>Check status</button>
      {r && <p style={{ marginTop: 14 }}>#REQ-{String(r.id).padStart(5, '0')} · {r.type} · {r.date}<br />Status: <Pill v={r.status} /></p>}</div></div>)
}

function Donate() {
  const [f, setF] = useState({ name: '', amount: '' }); const [ok, setOk] = useState(false)
  const items = [['🥫', 'Food Supplies', 'Rice, canned food, water, etc.'], ['🧼', 'Hygiene Kits', 'Soap, sanitary items, etc.'], ['👕', 'Other Supplies', 'Clothing, blankets, extras.']]
  return (<div><div className="hero" style={{ minHeight: 220 }}><h1 style={{ fontSize: 40 }}>Make a Difference</h1><p>Your support brings hope to those in need.</p></div>
    <div className="wrap"><div className="grid g3">{items.map(([i, t, d]) => <div className="card tile" key={t}><div className="ic">{i}</div><b>{t}</b><p className="sub">{d}</p></div>)}</div>
      <div className="card" style={{ marginTop: 16 }}><b>Donate now</b><label>Your name</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /><label>Amount or items</label><input value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="$50 or 20 blankets" />
        <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => f.name && f.amount && api.addDonor({ name: f.name, amount: f.amount }).then(() => { setOk(true); setF({ name: '', amount: '' }) })}>Donate Now</button>
        {ok && <p style={{ color: 'var(--ok)' }}>Thank you! Your donation was recorded.</p>}</div>
      <h3>Other ways to support</h3><div className="grid g3">{['Monthly Giving', 'Corporate Donations', 'In-Kind Donations'].map(x => <div className="card" key={x}>{x}</div>)}</div></div></div>)
}

function Volunteer() {
  const [f, setF] = useState({ name: '', skills: 'Logistics' }); const [ok, setOk] = useState(false)
  const roles = [['Food Distribution', 'Help with food packages'], ['Shelter Support', 'Assist at temporary shelters'], ['Logistics', 'Transport and delivery'], ['Other Support', 'Admin, communications, etc.']]
  return (<div><div className="hero" style={{ minHeight: 240 }}><h1 style={{ fontSize: 40 }}>Be a Volunteer</h1><p>Your time and skills can make a real difference.</p></div>
    <div className="wrap"><div className="grid g2"><div className="card"><b>Register now</b><label>Full name</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <label>Skills</label><select value={f.skills} onChange={e => setF({ ...f, skills: e.target.value })}>{['Logistics', 'Medical', 'Distribution', 'General'].map(x => <option key={x}>{x}</option>)}</select>
      <button className="btn" style={{ marginTop: 14 }} onClick={() => f.name && api.addVolunteer(f).then(() => { setOk(true); setF({ ...f, name: '' }) })}>Register Now</button>{ok && <p style={{ color: 'var(--ok)' }}>Registered. We will contact you soon.</p>}</div>
      <div className="card"><b>Available roles</b>{roles.map(([t, d]) => <p key={t}><b>{t}</b><br /><span className="sub">{d}</span></p>)}</div></div></div></div>)
}

function Manage({ user }) {
  const [tab, setTab] = useState('Donors'); const [d, setD] = useState([]); const [v, setV] = useState([]); useEffect(() => { if (user) { api.donors().then(setD).catch(() => {}); api.volunteers().then(setV).catch(() => {}) } }, [])
  if (!user) return <Navigate to="/login" />
  return (<div className="wrap"><h1>Donor & Volunteer Management</h1><p className="sub">Manage donors, volunteers and their activities.</p>
    <div className="tabs">{['Donors', 'Volunteers'].map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="card" style={{ overflowX: 'auto' }}>{tab === 'Donors'
      ? <table><thead><tr><th>Name</th><th>Amount / items</th><th>Date</th><th>Status</th></tr></thead><tbody>{d.map(x => <tr key={x.id}><td>{x.name}</td><td>{x.amount}</td><td>{x.date}</td><td><Pill v={x.status} /></td></tr>)}</tbody></table>
      : <table><thead><tr><th>Name</th><th>Skills</th><th>Status</th></tr></thead><tbody>{v.map(x => <tr key={x.id}><td>{x.name}</td><td>{x.skills}</td><td><Pill v={x.status} /></td></tr>)}</tbody></table>}</div></div>)
}

export default function App() {
  const [user, setUser] = useAuth()
  return (<><Nav user={user} setUser={setUser} /><Routes>
    <Route path="/" element={<Home />} /><Route path="/request" element={<RequestHelp />} /><Route path="/urgency" element={<Urgency />} />
    <Route path="/login" element={<Login setUser={setUser} />} /><Route path="/staff" element={<Staff user={user} />} />
    <Route path="/delivery" element={<Delivery user={user} />} /><Route path="/email" element={<EmailPage user={user} />} /><Route path="/records" element={<Records user={user} />} /><Route path="/track" element={<Track />} />
    <Route path="/donate" element={<Donate />} /><Route path="/volunteer" element={<Volunteer />} /><Route path="/manage" element={<Manage user={user} />} />
  </Routes></>)
}
