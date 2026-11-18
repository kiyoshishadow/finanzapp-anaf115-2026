import React, { useEffect, useState } from 'react';
import { db, collection, getDocs, query, where, addDoc, updateDoc, doc, registrarAuditoria } from '../../services/localDatabase';
import './LibroTransacciones.css';

const blank = (tipo) => ({ fecha: new Date().toISOString().slice(0, 10), cliente: '', proveedor: '', nFactura: '', descripcion: '', categoria: '', monto: '', iva: 0, total: 0, tipoGasto: tipo === 'venta' ? 'Venta' : 'Servicio' });
const LibroTransacciones = ({ tipo, usuario }) => {
  const esVenta = tipo === 'venta'; const nombre = esVenta ? 'Ventas' : 'Compras';
  const [registros, setRegistros] = useState([]); const [categorias, setCategorias] = useState([]);
  const [form, setForm] = useState(blank(tipo)); const [editando, setEditando] = useState('');
  const [notificacion, setNotificacion] = useState(''); const [mostrarAnuladas, setMostrarAnuladas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const soloLectura = usuario?.rol === 'Usuario';
  const cargar = async () => {
    setCargando(true);
    const [t, c] = await Promise.all([getDocs(query(collection(db, 'transacciones'), where('tipo', '==', tipo))), getDocs(collection(db, 'categorias'))]);
    setRegistros(t.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.fecha.localeCompare(a.fecha)));
    setCategorias(c.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.activa && x.tipo === (esVenta ? 'ingreso' : 'gasto')));
    setCargando(false);
  };
  useEffect(() => { cargar(); }, [tipo]);
  useEffect(() => { if (!form.categoria && categorias.length) setForm((f) => ({ ...f, categoria: categorias[0].nombre })); }, [categorias, form.categoria]);
  const cambia = (campo, valor) => {
    setForm((f) => {
      const siguiente = { ...f, [campo]: valor };
      if (campo === 'monto') { const base = Number(valor) || 0; siguiente.iva = Number((base * .13).toFixed(2)); siguiente.total = Number((base + siguiente.iva).toFixed(2)); }
      return siguiente;
    });
  };
  const limpiar = () => { setForm({ ...blank(tipo), categoria: categorias[0]?.nombre || '' }); setEditando(''); };
  const guardar = async (e) => {
    e.preventDefault();
    const base = Number(form.monto);
    if (!Number.isFinite(base) || base <= 0) { setNotificacion('El monto debe ser mayor que cero.'); return; }
    if (!form.categoria || !categorias.some((c) => c.nombre === form.categoria)) { setNotificacion('Selecciona una categoría activa.'); return; }
    if (registros.some((r) => r.id !== editando && r.estado !== 'anulada' && r.nFactura.trim().toLowerCase() === form.nFactura.trim().toLowerCase())) { setNotificacion('Ya existe un documento con ese número.'); return; }
    const data = { ...form, cliente: esVenta ? form.cliente.trim() : '', proveedor: esVenta ? '' : form.proveedor.trim(), nFactura: form.nFactura.trim(), descripcion: form.descripcion.trim(), monto: base, iva: Number((base * .13).toFixed(2)), total: Number((base * 1.13).toFixed(2)), tipo, estado: 'activa', tipoGasto: esVenta ? 'Venta' : form.categoria === 'Mercadería' ? 'Compra' : 'Servicio', timestamp: new Date().toISOString() };
    try {
      if (editando) { await updateDoc(doc(db, 'transacciones', editando), data); registrarAuditoria(usuario, `Edición de ${esVenta ? 'ingreso' : 'gasto'}`, `${data.nFactura} · ${data.categoria} · $${data.total.toFixed(2)}`); setNotificacion(`${nombre.slice(0, -1)} actualizada.`); }
      else { await addDoc(collection(db, 'transacciones'), { ...data, creadoPor: usuario?.email || 'Usuario' }); registrarAuditoria(usuario, `Registro de ${esVenta ? 'ingreso' : 'gasto'}`, `${data.nFactura} · ${data.categoria} · $${data.total.toFixed(2)}`); setNotificacion(`${nombre.slice(0, -1)} registrada.`); }
      limpiar(); await cargar();
    } catch (error) { setNotificacion('No se pudo guardar el movimiento. Inténtalo de nuevo.'); }
  };
  const editar = (r) => { setEditando(r.id); setForm({ ...r, monto: String(r.monto) }); setNotificacion('Editando el movimiento seleccionado.'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const anular = async (r) => { if (!window.confirm(`¿Anular el documento ${r.nFactura}? Se conservará en el historial.`)) return; await updateDoc(doc(db, 'transacciones', r.id), { estado: 'anulada', anuladaEn: new Date().toISOString() }); registrarAuditoria(usuario, `Anulación de ${esVenta ? 'ingreso' : 'gasto'}`, `${r.nFactura} · ${r.categoria}`); await cargar(); setNotificacion('Movimiento anulado y conservado en el historial.'); };
  const reactivar = async (r) => { await updateDoc(doc(db, 'transacciones', r.id), { estado: 'activa', anuladaEn: null }); registrarAuditoria(usuario, 'Reactivación de movimiento', r.nFactura); await cargar(); };
  const visibles = registros.filter((r) => mostrarAnuladas || r.estado !== 'anulada');
  const moneda = (n) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
  return <section className="fin-book">
    <header className="fin-book-head"><div><span className="fin-eyebrow">REGISTRO FINANCIERO</span><h1>Libro de {nombre.toLowerCase()}</h1><p>{esVenta ? 'Controla los ingresos con su categoría, base imponible e IVA.' : 'Controla los gastos operativos por categoría y período.'}</p></div><span className="fin-count-pill">{registros.filter((r) => r.estado !== 'anulada').length} activos</span></header>
    {!soloLectura && <form className="fin-book-form" onSubmit={guardar}><div className="fin-book-form-head"><div><h2>{editando ? 'Editar movimiento' : `Registrar ${esVenta ? 'ingreso' : 'gasto'}`}</h2><p>El IVA se calcula automáticamente al 13%.</p></div>{editando && <button type="button" className="fin-cancel-edit" onClick={limpiar}>Cancelar edición</button>}</div><div className="fin-book-grid"><label>Fecha<input type="date" required value={form.fecha} onChange={(e) => cambia('fecha', e.target.value)} /></label><label>N.º de documento<input required maxLength="40" value={form.nFactura} onChange={(e) => cambia('nFactura', e.target.value)} placeholder={esVenta ? 'FE-0003' : 'FC-0103'} /></label><label>{esVenta ? 'Cliente' : 'Proveedor'}<input required maxLength="100" value={esVenta ? form.cliente : form.proveedor} onChange={(e) => cambia(esVenta ? 'cliente' : 'proveedor', e.target.value)} /></label><label>Categoría<select required value={form.categoria} onChange={(e) => cambia('categoria', e.target.value)}><option value="">Selecciona una categoría</option>{categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}</select></label><label className="fin-wide-field">Concepto<input maxLength="180" value={form.descripcion} onChange={(e) => cambia('descripcion', e.target.value)} placeholder="Detalle de la operación" /></label><label>Monto antes de IVA<input required type="number" min="0.01" step="0.01" value={form.monto} onChange={(e) => cambia('monto', e.target.value)} /></label><div className="fin-total-field"><span>IVA 13%</span><strong>{moneda(form.iva)}</strong><span>Total</span><strong>{moneda(form.total)}</strong></div></div>{notificacion && <p className="fin-book-message" role="status">{notificacion}</p>}<button className="fin-primary" type="submit">{editando ? 'Guardar cambios' : `Guardar ${esVenta ? 'ingreso' : 'gasto'}`}</button></form>}
    {soloLectura && notificacion && <p className="fin-book-message" role="status">{notificacion}</p>}
    <div className="fin-book-list"><div className="fin-book-list-head"><div><h2>Movimientos</h2><p>{visibles.length} documentos en el período registrado</p></div><label className="fin-check-anulados"><input type="checkbox" checked={mostrarAnuladas} onChange={(e) => setMostrarAnuladas(e.target.checked)} /> Mostrar anulados</label></div>{cargando ? <div className="fin-book-empty">Cargando registros...</div> : <div className="fin-book-table-wrap"><table className="fin-book-table"><thead><tr><th>Fecha</th><th>Documento</th><th>{esVenta ? 'Cliente' : 'Proveedor'}</th><th>Categoría</th><th>Base</th><th>IVA</th><th>Total</th><th>Estado</th>{!soloLectura && <th>Acciones</th>}</tr></thead><tbody>{visibles.length ? visibles.map((r) => <tr key={r.id} className={r.estado === 'anulada' ? 'fin-row-annulled' : ''}><td>{new Date(`${r.fecha}T12:00:00`).toLocaleDateString('es-SV')}</td><td><strong>{r.nFactura}</strong><small>{r.descripcion}</small></td><td>{esVenta ? r.cliente : r.proveedor}</td><td>{r.categoria || 'Sin categoría'}</td><td>{moneda(r.monto)}</td><td>{moneda(r.iva)}</td><td><strong>{moneda(r.total)}</strong></td><td><span className={`fin-status ${r.estado === 'anulada' ? 'off' : 'on'}`}>{r.estado === 'anulada' ? 'Anulado' : 'Activo'}</span></td>{!soloLectura && <td>{r.estado === 'anulada' ? <button className="fin-text-button" onClick={() => reactivar(r)}>Reactivar</button> : <div className="fin-actions"><button className="fin-text-button" onClick={() => editar(r)}>Editar</button><button className="fin-text-button danger" onClick={() => anular(r)}>Anular</button></div>}</td>}</tr>) : <tr><td colSpan={soloLectura ? 8 : 9} className="fin-book-empty">Todavía no hay movimientos registrados.</td></tr>}</tbody></table></div>}</div>
  </section>;
};
export default LibroTransacciones;
