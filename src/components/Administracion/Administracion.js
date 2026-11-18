import React, { useEffect, useState } from 'react';
import {
  obtenerUsuarios, guardarUsuariosLocal, registrarUsuarioLocal,
  db, collection, getDocs, addDoc, updateDoc, doc, registrarAuditoria,
  obtenerRespaldo, restaurarRespaldo, cambiarContrasenaUsuario
} from '../../services/localDatabase';
import './Administracion.css';

const Administracion = ({ usuario }) => {
  const [pestana, setPestana] = useState('usuarios');
  const [usuarios, setUsuarios] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [bitacora, setBitacora] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [nuevoUsuario, setNuevoUsuario] = useState({ nombre: '', email: '', password: '', rol: 'Empleado' });
  const [nuevaCategoria, setNuevaCategoria] = useState({ nombre: '', tipo: 'gasto' });

  const cargar = async () => {
    const [u, c, l] = await Promise.all([
      obtenerUsuarios(), getDocs(collection(db, 'categorias')), getDocs(collection(db, 'bitacora'))
    ]);
    setUsuarios(u);
    setCategorias(c.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre)));
    setBitacora(l.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
  };
  useEffect(() => { cargar(); }, []);

  const crearUsuario = async (e) => {
    e.preventDefault();
    try {
      const creado = await registrarUsuarioLocal(nuevoUsuario.email, nuevoUsuario.password, nuevoUsuario.nombre, nuevoUsuario.rol);
      registrarAuditoria(usuario, 'Alta de usuario', `${creado.nombre} (${creado.email}), rol ${creado.rol}`);
      setNuevoUsuario({ nombre: '', email: '', password: '', rol: 'Empleado' });
      await cargar(); setMensaje('Usuario agregado. La contraseña se almacenó protegida con hash.');
    } catch (error) { setMensaje(error.message); }
  };
  const cambiarUsuario = async (u, cambio) => {
    const actualizado = { ...u, ...cambio };
    const lista = usuarios.map((x) => x.id === u.id ? actualizado : x);
    await guardarUsuariosLocal(lista);
    registrarAuditoria(usuario, cambio.activo === false ? 'Desactivación de usuario' : 'Cambio de usuario', `${u.email}: ${cambio.rol || (cambio.activo === false ? 'cuenta desactivada' : 'cuenta activada')}`);
    await cargar();
  };
  const restablecerContrasena = async (u) => {
    const password = window.prompt(`Escribe la nueva contraseña para ${u.email} (mínimo 8 caracteres):`);
    if (!password) return;
    try {
      await cambiarContrasenaUsuario(u.id, password);
      await registrarAuditoria(usuario, 'Cambio de contraseña', `Se actualizó la credencial de ${u.email}.`);
      setMensaje(`Contraseña actualizada para ${u.email}.`);
    } catch (error) { setMensaje(error.message); }
  };
  const crearCategoria = async (e) => {
    e.preventDefault();
    if (categorias.some((c) => c.tipo === nuevaCategoria.tipo && c.nombre.trim().toLocaleLowerCase() === nuevaCategoria.nombre.trim().toLocaleLowerCase())) {
      setMensaje('Ya existe una categoría con ese nombre y tipo.'); return;
    }
    const ref = await addDoc(collection(db, 'categorias'), { nombre: nuevaCategoria.nombre.trim(), tipo: nuevaCategoria.tipo, activa: true, fechaCreacion: new Date().toISOString() });
    registrarAuditoria(usuario, 'Alta de categoría', `${nuevaCategoria.tipo}: ${nuevaCategoria.nombre.trim()}`);
    setNuevaCategoria({ ...nuevaCategoria, nombre: '' }); await cargar(); setMensaje(`Categoría agregada (${ref.id}).`);
  };
  const cambiarCategoria = async (c) => {
    await updateDoc(doc(db, 'categorias', c.id), { activa: !c.activa });
    registrarAuditoria(usuario, c.activa ? 'Desactivación de categoría' : 'Activación de categoría', c.nombre);
    await cargar();
  };
  const exportar = async () => {
    const datos = await obtenerRespaldo();
    const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
    const enlace = document.createElement('a'); enlace.href = url; enlace.download = `FinanzApp-respaldo-${new Date().toISOString().slice(0, 10)}.json`; enlace.click(); URL.revokeObjectURL(url);
    registrarAuditoria(usuario, 'Exportación de respaldo', 'Se descargó una copia de los datos contables.'); await cargar();
  };
  const importar = async (e) => {
    const archivo = e.target.files?.[0]; if (!archivo) return;
    if (!window.confirm('La restauración reemplazará los datos contables actuales. ¿Deseas continuar?')) { e.target.value = ''; return; }
    try { await restaurarRespaldo(JSON.parse(await archivo.text())); window.location.reload(); }
    catch (error) { setMensaje(error.message || 'No se pudo restaurar el respaldo.'); }
  };

  return <section className="fin-admin">
    <header className="fin-admin-head"><div><span className="fin-eyebrow">CONTROL DEL SISTEMA</span><h1>Administración</h1><p>Usuarios, categorías, actividad y copias de seguridad.</p></div><span className="fin-role-pill">{usuario?.rol || 'Administrador'}</span></header>
    <nav className="fin-tabs" aria-label="Secciones de administración">
      {[['usuarios','Usuarios'],['categorias','Categorías'],['bitacora','Bitácora'],['respaldo','Respaldo']].map(([key,label]) => <button key={key} className={pestana === key ? 'activo' : ''} onClick={() => { setPestana(key); setMensaje(''); }}>{label}</button>)}
    </nav>
    {mensaje && <div className="fin-feedback" role="status">{mensaje}</div>}
    {pestana === 'usuarios' && <>
      <form className="fin-admin-card fin-user-form" onSubmit={crearUsuario}>
        <div className="fin-card-heading"><div><h2>Agregar usuario</h2><p>Las contraseñas nuevas se guardan con PBKDF2 y sal aleatoria.</p></div></div>
        <div className="fin-form-grid"><label>Nombre<input required value={nuevoUsuario.nombre} onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })} /></label><label>Correo<input required type="email" placeholder="nombre@ues.edu.sv" value={nuevoUsuario.email} onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })} /></label><label>Contraseña (8 caracteres mínimo)<input required minLength="8" type="password" value={nuevoUsuario.password} onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })} /></label><label>Rol<select value={nuevoUsuario.rol} onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })}><option>Administrador</option><option>Contador</option><option>Empleado</option><option>Usuario</option></select></label></div>
        <button className="fin-primary" type="submit">Crear cuenta</button>
      </form>
      <div className="fin-admin-card"><div className="fin-card-heading"><div><h2>Cuentas de acceso</h2><p>{usuarios.length} usuarios registrados. Cada cuenta usa su propia contraseña.</p></div></div><div className="fin-table-wrap"><table className="fin-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Administrar</th></tr></thead><tbody>{usuarios.map((u) => <tr key={u.id}><td>{u.nombre}</td><td>{u.email}</td><td><select aria-label={`Rol de ${u.email}`} value={u.rol} disabled={u.id === usuario?.uid || !u.activo} onChange={(e) => cambiarUsuario(u, { rol: e.target.value })}><option>Administrador</option><option>Contador</option><option>Empleado</option><option>Usuario</option></select></td><td><span className={`fin-status ${u.activo ? 'on' : 'off'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span></td><td><div className="fin-user-actions"><button className="fin-text-button" onClick={() => restablecerContrasena(u)}>Cambiar contraseña</button><button className="fin-text-button" disabled={u.id === usuario?.uid} onClick={() => cambiarUsuario(u, { activo: !u.activo })}>{u.activo ? 'Desactivar' : 'Activar'}</button></div></td></tr>)}</tbody></table></div><p className="fin-help">La cuenta con la que has iniciado sesión no se puede desactivar desde aquí.</p></div>
    </>}
    {pestana === 'categorias' && <>
      <form className="fin-admin-card fin-category-form" onSubmit={crearCategoria}><div className="fin-card-heading"><div><h2>Nueva categoría financiera</h2><p>Organiza ingresos y gastos para facilitar los informes.</p></div></div><div className="fin-form-grid"><label>Nombre<input required maxLength="60" value={nuevaCategoria.nombre} onChange={(e) => setNuevaCategoria({ ...nuevaCategoria, nombre: e.target.value })} /></label><label>Tipo<select value={nuevaCategoria.tipo} onChange={(e) => setNuevaCategoria({ ...nuevaCategoria, tipo: e.target.value })}><option value="ingreso">Ingreso</option><option value="gasto">Gasto</option></select></label></div><button className="fin-primary" type="submit">Agregar categoría</button></form>
      <div className="fin-admin-card"><div className="fin-card-heading"><div><h2>Catálogo de categorías</h2><p>Las categorías con movimientos se desactivan para conservar el historial.</p></div></div><div className="fin-category-grid">{categorias.map((c) => <article className="fin-category-item" key={c.id}><span className={`fin-category-dot ${c.tipo}`}></span><div><strong>{c.nombre}</strong><small>{c.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} · {c.activa ? 'Disponible' : 'Inactiva'}</small></div><button className="fin-text-button" onClick={() => cambiarCategoria(c)}>{c.activa ? 'Desactivar' : 'Activar'}</button></article>)}</div></div>
    </>}
    {pestana === 'bitacora' && <div className="fin-admin-card"><div className="fin-card-heading"><div><h2>Registro de actividad</h2><p>Últimas acciones importantes del sistema.</p></div></div>{bitacora.length ? <div className="fin-audit-list">{bitacora.map((l) => <article key={l.id}><span className="fin-audit-mark"></span><div><strong>{l.accion}</strong><p>{l.detalle}</p><small>{l.usuario} · {l.rol} · {new Date(l.fecha).toLocaleString('es-SV')}</small></div></article>)}</div> : <div className="fin-empty">Aún no hay acciones registradas.</div>}</div>}
    {pestana === 'respaldo' && <div className="fin-admin-card fin-backup-card"><div className="fin-backup-icon">↗</div><h2>Copias de seguridad</h2><p>Descarga los movimientos, cuentas y categorías en un archivo JSON.</p><button className="fin-primary" onClick={exportar}>Descargar respaldo</button><label className="fin-import-button">Restaurar desde archivo<input type="file" accept="application/json,.json" onChange={importar} /></label><div className="fin-backup-note"><strong>Antes de restaurar:</strong> la copia importada reemplazará los datos contables actuales. Exporta un respaldo reciente para poder regresar a ellos.</div></div>}
  </section>;
};

export default Administracion;
