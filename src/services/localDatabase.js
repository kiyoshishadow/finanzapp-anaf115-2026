// Interfaz de datos que usan los módulos de FinanzApp.
// Las operaciones y los permisos se verifican en el servidor.
async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo completar la operación.');
    error.status = response.status;
    throw error;
  }
  return data;
}

const body = (value) => JSON.stringify(value);
export const db = { remote: true };
export const auth = { remote: true };
export const collection = (_db, nombre) => ({ nombre });
export const doc = (_db, nombre, id) => ({ nombre, id });
export const query = (ref, ...filtros) => ({ ...ref, filtros });
export const where = (campo, operador, valor) => ({ tipo: 'where', campo, operador, valor });
export const orderBy = (campo, direccion = 'asc') => ({ tipo: 'orderBy', campo, direccion });

export async function getDocs(ref) {
  const result = await request('/api/data/' + encodeURIComponent(ref.nombre));
  let rows = result.items;
  for (const filter of ref.filtros || []) {
    if (filter.tipo === 'where' && filter.operador === '==') {
      rows = rows.filter((row) => row[filter.campo] === filter.valor);
    } else if (filter.tipo === 'where') {
      throw new Error('Filtro no admitido.');
    }
    if (filter.tipo === 'orderBy') {
      const direction = filter.direccion === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => String(a[filter.campo] ?? '').localeCompare(String(b[filter.campo] ?? '')) * direction);
    }
  }
  return {
    docs: rows.map((row) => ({
      id: row.id,
      data: () => ({ ...row, timestamp: row.timestamp ? { toDate: () => new Date(row.timestamp) } : undefined }),
    })),
  };
}

export const addDoc = (ref, data) => request('/api/data/' + encodeURIComponent(ref.nombre), { method: 'POST', body: body(data) });
export const updateDoc = (ref, data) => request('/api/data/' + encodeURIComponent(ref.nombre) + '/' + encodeURIComponent(ref.id), { method: 'PATCH', body: body(data) });
export const deleteDoc = (ref) => request('/api/data/' + encodeURIComponent(ref.nombre) + '/' + encodeURIComponent(ref.id), { method: 'DELETE' });

// El servidor registra las operaciones en la misma transacción de escritura.
export const registrarAuditoria = async () => {};
export const obtenerUsuarios = async () => (await request('/api/users')).users;
export const guardarUsuariosLocal = (users) => request('/api/users', { method: 'PATCH', body: body({ users }) });
export const cambiarContrasenaUsuario = (id, password) => request('/api/users/' + encodeURIComponent(id) + '/password', { method: 'PATCH', body: body({ password }) });
export const registrarUsuarioLocal = (email, password, nombre, rol) => request('/api/users', { method: 'POST', body: body({ email, password, nombre, rol }) });
export const obtenerRespaldo = () => request('/api/backup');
export const restaurarRespaldo = (backup) => request('/api/backup', { method: 'POST', body: body(backup) });

export async function obtenerSesion() {
  try { return (await request('/api/auth/me')).user; }
  catch (error) { if (error.status === 401) return null; throw error; }
}
export async function cerrarSesion() {
  try { await request('/api/auth/logout', { method: 'POST' }); }
  catch (error) { if (error.status !== 401) throw error; }
}
export async function signInWithEmailAndPassword(_auth, email, password) {
  return request('/api/auth/login', { method: 'POST', body: body({ email, password }) });
}
