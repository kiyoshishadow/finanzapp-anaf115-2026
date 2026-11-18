import React, { useEffect, useState } from 'react';
import './App.css';
import Login from './components/Login/Login';
import Dashboard from './components/Dashboard/Dashboard';
import CatalogoCuentas from './components/CatalogoCuentas/CatalogoCuentas';
import LibroVentas from './components/LibroVentas/LibroVentas';
import LibroCompras from './components/LibroCompras/LibroCompras';
import LibroDiario from './components/LibroDiario/LibroDiario';
import LibroMayor from './components/LibroMayor/LibroMayor';
import Reportes from './components/Reportes/Reportes';
import Administracion from './components/Administracion/Administracion';
import { obtenerSesion, cerrarSesion } from './services/localDatabase';

const secciones = [
  { key: 'dashboard', label: 'Resumen', icon: '⌂' },
  { key: 'catalogo', label: 'Plan de cuentas', icon: '▤' },
  { key: 'ventas', label: 'Ingresos', icon: '↗' },
  { key: 'compras', label: 'Gastos', icon: '↙' },
  { key: 'diario', label: 'Libro diario', icon: '≡' },
  { key: 'mayor', label: 'Libro mayor', icon: '▥' },
  { key: 'reportes', label: 'Reportes', icon: '▦' }
];

function App() {
  const [usuario, setUsuario] = useState(null);
  const [paginaActual, setPaginaActual] = useState('dashboard');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [errorSesion, setErrorSesion] = useState(null);

  useEffect(() => {
    const verificarSesion = async () => {
      setCargandoSesion(true);
      setErrorSesion(null);
      try {
        const user = await obtenerSesion();
        if (user) {
          setUsuario(user);
        }
      } catch (error) {
        setErrorSesion('No se pudo restaurar la sesión. Inicie sesión de nuevo.');
      } finally {
        setCargandoSesion(false);
      }
    };
    verificarSesion();
  }, []);

  const handleLogin = (success, user) => {
    if (success && user) {
      setUsuario(user);
      setPaginaActual('dashboard');
    }
  };

  const handleLogout = async () => {
    await cerrarSesion();
    setUsuario(null);
    setPaginaActual('dashboard');
    setMenuAbierto(false);
  };
  const irA = (key) => { if (key === 'administracion' && usuario?.rol !== 'Administrador') return; setPaginaActual(key); setMenuAbierto(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const contenido = () => {
    switch (paginaActual) {
      case 'catalogo': return <CatalogoCuentas usuario={usuario} />;
      case 'ventas': return <LibroVentas usuario={usuario} />;
      case 'compras': return <LibroCompras usuario={usuario} />;
      case 'diario': return <LibroDiario usuario={usuario} />;
      case 'mayor': return <LibroMayor usuario={usuario} />;
      case 'reportes': return <Reportes usuario={usuario} />;
      case 'administracion': return usuario?.rol === 'Administrador' ? <Administracion usuario={usuario} /> : <Dashboard usuario={usuario} onNavigate={irA} />;
      default: return <Dashboard usuario={usuario} onNavigate={irA} />;
    }
  };
  if (cargandoSesion) return <div className="app-cargando" role="status" aria-label="Verificando sesión"><div className="spinner"></div><p>Verificando sesión…</p></div>;
  if (errorSesion) return <div className="app-error" role="alert"><p>{errorSesion}</p><button onClick={() => window.location.reload()}>Reintentar</button></div>;
  if (!usuario) return <Login onLogin={handleLogin} />;
  return <div className="app">
    <aside className="navegacion-principal">
      <div className="contenedor-navegacion">
        <div className="marca-app"><button className="btn-marca" onClick={() => irA('dashboard')}><span className="icono-marca">F</span><span className="texto-marca">FinanzApp</span></button><span className="marca-subtitulo">CONTROL FINANCIERO</span></div>
        <div className="menu-desktop">{secciones.map((item) => <button key={item.key} className={`btn-nav ${paginaActual === item.key ? 'btn-nav-activo' : ''}`} onClick={() => irA(item.key)}><span className="fin-nav-icon">{item.icon}</span><span>{item.label}</span></button>)}{usuario.rol === 'Administrador' && <button className={`btn-nav ${paginaActual === 'administracion' ? 'btn-nav-activo' : ''}`} onClick={() => irA('administracion')}><span className="fin-nav-icon">⚙</span><span>Administración</span></button>}</div>
        <div className="controles-usuario">
          <div className="info-cuenta-sidebar"><div className="avatar-usuario">{(usuario.nombre || usuario.email).slice(0, 1).toUpperCase()}</div><span className="fin-user-copy"><strong>{usuario.nombre || usuario.email.split('@')[0]}</strong><small>{usuario.rol}</small></span></div>
          <button type="button" className="btn-salir-sidebar" onClick={handleLogout}><span aria-hidden="true">↪</span> Cerrar sesión</button>
        </div>
        <div className="acciones-mobile">
          <button className="btn-salir-mobile" onClick={handleLogout} aria-label="Cerrar sesión">Salir <span aria-hidden="true">↪</span></button>
          <button className="btn-menu-mobile" aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setMenuAbierto(!menuAbierto)}>{menuAbierto ? '×' : '☰'}</button>
        </div>
      </div>
      {menuAbierto && <div className="menu-mobile">{secciones.map((item) => <button key={item.key} className={`btn-nav-mobile ${paginaActual === item.key ? 'btn-nav-mobile-activo' : ''}`} onClick={() => irA(item.key)}><span>{item.icon}</span>{item.label}</button>)}{usuario.rol === 'Administrador' && <button className={`btn-nav-mobile ${paginaActual === 'administracion' ? 'btn-nav-mobile-activo' : ''}`} onClick={() => irA('administracion')}><span>⚙</span>Administración</button>}<button className="btn-cerrar-sesion-mobile" onClick={handleLogout}>Cerrar sesión</button></div>}
    </aside>
    <main className="contenido-principal">{contenido()}</main>
    <footer className="footer-app"><div className="contenedor-footer"><div className="info-footer"><div className="marca-footer"><h3>FinanzApp</h3><p>Sistema de control financiero</p></div><div className="descripcion-footer">Proyecto académico ANAF115 · El Salvador</div></div><div className="derechos-footer"><span>Douglas Josué Siguenza Corena · SC22041 | Katherine Patricia Méndez Lucero · ML21026</span><span>Karla Stefany Menéndez Román · MR17054 | Raúl Enrique Herrera Bernal · HH22035</span></div></div></footer>
  </div>;
}
export default App;
