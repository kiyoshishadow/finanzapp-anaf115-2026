import React, { useEffect, useMemo, useState } from 'react';
import { db, collection, getDocs, registrarAuditoria } from '../../services/localDatabase';
import './Reportes.css';

const hoy = new Date().toISOString().slice(0, 10);
const inicioAnio = `${new Date().getFullYear()}-01-01`;
const Reportes = ({ usuario }) => {
  const [movimientos, setMovimientos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [desde, setDesde] = useState(inicioAnio);
  const [hasta, setHasta] = useState(hoy);
  const [periodo, setPeriodo] = useState('mes');
  const [categoria, setCategoria] = useState('todas');
  useEffect(() => {
    Promise.all([getDocs(collection(db, 'transacciones')), getDocs(collection(db, 'categorias'))]).then(([t, c]) => {
      setMovimientos(t.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.estado !== 'anulada'));
      setCategorias(c.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.activa));
    });
  }, []);
  const filtrados = useMemo(() => movimientos.filter((m) => m.fecha >= desde && m.fecha <= hasta && (categoria === 'todas' || m.categoria === categoria)), [movimientos, desde, hasta, categoria]);
  const resumen = useMemo(() => {
    const ingresos = filtrados.filter((m) => m.tipo === 'venta').reduce((s, m) => s + Number(m.monto || 0), 0);
    const gastos = filtrados.filter((m) => m.tipo === 'compra').reduce((s, m) => s + Number(m.monto || 0), 0);
    return { ingresos, gastos, resultado: ingresos - gastos, porcentaje: ingresos > 0 ? (gastos / ingresos) * 100 : 0 };
  }, [filtrados]);
  const grupos = useMemo(() => {
    const mapa = {};
    filtrados.forEach((m) => {
      const d = new Date(`${m.fecha}T12:00:00`);
      const key = periodo === 'dia' ? m.fecha : periodo === 'mes' ? m.fecha.slice(0, 7) : m.fecha.slice(0, 4);
      if (!mapa[key]) mapa[key] = { key, label: periodo === 'dia' ? d.toLocaleDateString('es-SV', { day: '2-digit', month: 'short' }) : periodo === 'mes' ? d.toLocaleDateString('es-SV', { month: 'short', year: '2-digit' }) : key, ingresos: 0, gastos: 0 };
      mapa[key][m.tipo === 'venta' ? 'ingresos' : 'gastos'] += Number(m.monto || 0);
    });
    return Object.values(mapa).sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
  }, [filtrados, periodo]);
  const moneda = (n) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(n || 0);
  const exportarCSV = () => {
    const rows = [['Fecha', 'Tipo', 'Documento', 'Tercero', 'Categoría', 'Concepto', 'Base', 'IVA', 'Total'], ...filtrados.map((m) => [m.fecha, m.tipo, m.nFactura, m.tipo === 'venta' ? m.cliente : m.proveedor, m.categoria || '', m.descripcion || '', m.monto, m.iva, m.total])];
    const csv = rows.map((r) => r.map((x) => `"${String(x ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })); link.download = `FinanzApp-reporte-${desde}-${hasta}.csv`; link.click(); URL.revokeObjectURL(link.href);
    registrarAuditoria(usuario, 'Exportación de reporte', `Período ${desde} a ${hasta}; ${filtrados.length} movimientos.`);
  };
  const maximo = Math.max(1, ...grupos.flatMap((g) => [g.ingresos, g.gastos]));
  return <section className="fin-reportes">
    <header className="fin-report-head"><div><span className="fin-eyebrow">ANÁLISIS FINANCIERO</span><h1>Reportes</h1><p>Consulta ingresos, gastos y resultado para el período seleccionado.</p></div><button className="fin-primary" onClick={exportarCSV}>Descargar CSV</button></header>
    <div className="fin-report-filters"><label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label><label>Hasta<input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} /></label><label>Presentación<select value={periodo} onChange={(e) => setPeriodo(e.target.value)}><option value="dia">Diaria</option><option value="mes">Mensual</option><option value="anio">Anual</option></select></label><label>Categoría<select value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="todas">Todas las categorías</option>{categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre} ({c.tipo})</option>)}</select></label></div>
    <div className="fin-report-kpis"><article><span>Ingresos</span><strong>{moneda(resumen.ingresos)}</strong><small>Base antes de IVA</small></article><article><span>Gastos</span><strong>{moneda(resumen.gastos)}</strong><small>Base antes de IVA</small></article><article className={resumen.resultado >= 0 ? 'positivo' : 'negativo'}><span>Resultado financiero</span><strong>{moneda(resumen.resultado)}</strong><small>Ingresos menos gastos</small></article><article><span>Porcentaje de gastos</span><strong>{resumen.ingresos > 0 ? `${resumen.porcentaje.toFixed(1)}%` : '—'}</strong><small>{resumen.ingresos > 0 ? 'Gastos ÷ ingresos' : 'Registra ingresos para calcularlo'}</small></article></div>
    <div className="fin-report-card"><div className="fin-report-card-head"><div><h2>Comparativo financiero</h2><p>{grupos.length ? `Hasta 12 períodos · ${filtrados.length} operaciones` : 'No hay movimientos para estos filtros.'}</p></div><div className="fin-legend"><span className="ing">Ingresos</span><span className="gas">Gastos</span></div></div>{grupos.length ? <div className="fin-chart" role="img" aria-label="Gráfico comparativo de ingresos y gastos"><div className="fin-chart-y"><span>{moneda(maximo)}</span><span>{moneda(maximo / 2)}</span><span>$0</span></div><div className="fin-chart-bars">{grupos.map((g) => <div className="fin-chart-group" key={g.key}><div className="fin-bars"><span className="fin-bar ingreso" title={`Ingresos: ${moneda(g.ingresos)}`} style={{ height: `${Math.max(g.ingresos ? 3 : 0, (g.ingresos / maximo) * 100)}%` }}></span><span className="fin-bar gasto" title={`Gastos: ${moneda(g.gastos)}`} style={{ height: `${Math.max(g.gastos ? 3 : 0, (g.gastos / maximo) * 100)}%` }}></span></div><small>{g.label}</small></div>)}</div></div> : <div className="fin-report-empty">Ajusta las fechas o registra operaciones para ver el gráfico.</div>}</div>
    <div className="fin-report-card"><div className="fin-report-card-head"><div><h2>Detalle de operaciones</h2><p>Los registros anulados no se incluyen en los cálculos.</p></div></div><div className="fin-report-table-wrap"><table className="fin-report-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Documento</th><th>Detalle</th><th>Categoría</th><th>Base</th><th>IVA</th><th>Total</th></tr></thead><tbody>{filtrados.length ? filtrados.sort((a,b)=>b.fecha.localeCompare(a.fecha)).map((m)=><tr key={m.id}><td>{new Date(`${m.fecha}T12:00:00`).toLocaleDateString('es-SV')}</td><td><span className={`fin-type ${m.tipo}`}>{m.tipo === 'venta' ? 'Ingreso' : 'Gasto'}</span></td><td>{m.nFactura}</td><td>{m.tipo === 'venta' ? m.cliente : m.proveedor}</td><td>{m.categoria || 'Sin categoría'}</td><td>{moneda(m.monto)}</td><td>{moneda(m.iva)}</td><td>{moneda(m.total)}</td></tr>):<tr><td colSpan="8" className="fin-report-empty">No se encontraron operaciones para los filtros elegidos.</td></tr>}</tbody><tfoot><tr><th colSpan="5">Totales del período</th><th>{moneda(filtrados.reduce((s,m)=>s+(Number(m.monto)||0),0))}</th><th>{moneda(filtrados.reduce((s,m)=>s+(Number(m.iva)||0),0))}</th><th>{moneda(filtrados.reduce((s,m)=>s+(Number(m.total)||0),0))}</th></tr></tfoot></table></div></div>
  </section>;
};
export default Reportes;
