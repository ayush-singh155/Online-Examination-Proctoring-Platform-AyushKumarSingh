// api.js - Helper for API calls
const API = '/api';

export async function api(path, opts = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) };
  const res = await fetch(API + path, { ...opts, headers });
  if (!res.ok) throw new Error((await res.json()).error || 'API error');
  return res.json();
}
