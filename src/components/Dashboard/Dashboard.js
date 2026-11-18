import React, { useEffect, useMemo, useState } from 'react';
import { db, collection, getDocs } from '../../services/localDatabase';
import './Dashboard.css';

const hoy = new Date().toISOString().slice(0, 10);
const Dashboard = ({ usuario, onNavigate }) => {
  const [movimientos, setMovimientos] = useState([]);
  const [desde, setDesde] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
  const [hasta, setHasta] = useState(hoy);
  const [cargando, setCargando] = useState(true);
  useEffect(() => { Promise.all([getDocs(collection(db, 'transacciones')), getDocs(collection(db, 'cuentas'))]).then(([t]) => setMovimientos(t.docs.map((d) => ({ id: d.id, ...d.data() })))).finally(() => setCargando(false)); }, []);
  const visibles = useMemo(() => movimientos.filter((m) => m.estado !== 'anulada' && m.fecha >= desde && m.fecha <= hasta), [movimientos, desde, hasta]);
  const ingresos = visibles.filter((m) => m.tipo === 'venta').reduce((s, m) => s + Number(m.monto || 0), 0);
  const gastos = visibles.filter((m) => m.tipo === 'compra').reduce((s, m) => s + Number(m.monto || 0), 0);
  const resultado = ingresos - gastos; const porcentaje = ingresos > 0 ? gastos / ingresos * 100 : null;
  const recientes = [...visibles].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6);
  const moneda = (n) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(n || 0);
  return <section className="fin-dashboard">
    <header className="fin-dashboard-head"><div><span className="fin-eyebrow">RESUMEN FINANCIERO</span><h1>Hola, {usuario?.nombre || 'bienvenido'}</h1><p>Consulta el movimiento financiero del período.</p></div><button className="fin-primary" onClick={() => onNavigate('reportes')}>Ver reportes</button></header>
    <div className="fin-dashboard-filter"><strong>Período</strong><label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label><label>Hasta<input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} /></label><span>{visibles.length} operaciones activas</span></div>
    <div className="fin-dashboard-kpis"><article className="ingreso"><span>Ingresos</span><strong>{moneda(ingresos)}</strong><small>Base antes de IVA</small></article><article className="gasto"><span>Gastos</span><strong>{moneda(gastos)}</strong><small>Base antes de IVA</small></article><article className={resultado >= 0 ? 'positivo' : 'negativo'}><span>Resultado financiero</span><strong>{moneda(resultado)}</strong><small>Ingresos menos gastos</small></article><article><span>Porcentaje de gastos</span><strong>{porcentaje === null ? '—' : `${porcentaje.toFixed(1)}%`}</strong><small>{porcentaje === null ? 'Sin ingresos en el período' : 'Gastos ÷ ingresos'}</small></article></div>
    <div className="fin-dashboard-layout"><div className="fin-dashboard-card fin-activity"><div className="fin-dashboard-card-head"><div><h2>Operaciones recientes</h2><p>Movimientos del período seleccionado.</p></div><button onClick={() => onNavigate('diario')}>Abrir libro diario →</button></div>{cargando ? <div className="fin-dashboard-empty">Cargando operaciones…</div> : recientes.length ? <div className="fin-activity-table-wrap"><table className="fin-activity-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Documento</th><th>Cliente o proveedor</th><th>Categoría</th><th>Total</th></tr></thead><tbody>{recientes.map((m) => <tr key={m.id}><td>{new Date(`${m.fecha}T12:00:00`).toLocaleDateString('es-SV')}</td><td><span className={`fin-chip ${m.tipo}`}>{m.tipo === 'venta' ? 'Ingreso' : 'Gasto'}</span></td><td>{m.nFactura}</td><td>{m.tipo === 'venta' ? m.cliente : m.proveedor}</td><td>{m.categoria || 'Sin categoría'}</td><td><strong>{moneda(m.total)}</strong></td></tr>)}</tbody></table></div> : <div className="fin-dashboard-empty">No hay operaciones activas en esas fechas. Registra un ingreso o un gasto para comenzar.</div>}</div>
    <aside className="fin-dashboard-card fin-quick"><h2>Accesos rápidos</h2><button onClick={() => onNavigate('ventas')}><span>＋</span><div><strong>Registrar ingreso</strong><small>Venta y otros ingresos</small></div><b>→</b></button><button onClick={() => onNavigate('compras')}><span>−</span><div><strong>Registrar gasto</strong><small>Compra y costos operativos</small></div><b>→</b></button><button onClick={() => onNavigate('reportes')}><span>↗</span><div><strong>Analizar resultados</strong><small>Filtros, gráficos y exportación</small></div><b>→</b></button>{usuario?.rol === 'Administrador' && <button onClick={() => onNavigate('administracion')}><span>⚙</span><div><strong>Administrar sistema</strong><small>Usuarios, categorías y copias</small></div><b>→</b></button>}</aside></div>
  </section>;
};
export default Dashboard;
