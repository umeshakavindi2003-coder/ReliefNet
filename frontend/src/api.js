const B = 'http://localhost:5000/api'
const token = () => JSON.parse(localStorage.getItem('rn_user') || 'null')?.token

async function call(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' }
  const t = token(); if (t) headers.Authorization = 'Bearer ' + t
  const r = await fetch(B + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (r.status === 401 && t) { localStorage.removeItem('rn_user'); window.location.href = '/login' } // expired token
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}

export const api = {
  login: (d) => fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
  sendRequest: (d) => call('/requests', 'POST', d),
  track: (d) => call('/requests/track', 'POST', d),
  requests: (status = 'All', q = '') => call(`/requests?status=${status}&q=${encodeURIComponent(q)}`),
  setStatus: (id, status) => call(`/requests/${id}/status`, 'PUT', { status }),
  deliveries: () => call('/deliveries'),
  setDelivery: (id, status) => call(`/deliveries/${id}`, 'PUT', { status }),
  emails: () => call('/emails'),
  donors: () => call('/donors'),
  addDonor: (d) => call('/donors', 'POST', d).catch(() => null),
  volunteers: () => call('/volunteers'),
  addVolunteer: (d) => call('/volunteers', 'POST', d).catch(() => null),
}
