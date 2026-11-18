import React, { useState } from 'react';
import { auth, signInWithEmailAndPassword, cerrarSesion } from '../../services/localDatabase';
import './Login.css';

const perfiles = [
  { rol: 'Administrador', correo: 'admin@finanzapp.test', inicial: 'A' },
  { rol: 'Contador', correo: 'contador@finanzapp.test', inicial: 'C' },
  { rol: 'Empleado', correo: 'empleado@finanzapp.test', inicial: 'E' },
  { rol: 'Usuario', correo: 'usuario@finanzapp.test', inicial: 'U' }
];

const Login = ({ onLogin }) => {
  const [rol, setRol] = useState('Administrador');
  const [cred, setCred] = useState({ email: '', password: '' });
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);
  const correoSugerido = perfiles.find((perfil) => perfil.rol === rol)?.correo || 'nombre@ues.edu.sv';

  const ingresar = async (e) => {
    e?.preventDefault();
    setMensaje('');
    setCargando(true);
    try {
      const result = await signInWithEmailAndPassword(auth, cred.email, cred.password);
      if (result.user.rol !== rol) {
        await cerrarSesion();
        throw new Error(`Esta cuenta tiene el perfil ${result.user.rol}. Selecciónalo para continuar.`);
      }
      onLogin(true, result.user);
    } catch (error) {
      setMensaje(error.message || 'No se pudo completar el acceso.');
    } finally {
      setCargando(false);
    }
  };

  return <main className="fin-login">
    <div className="fin-login-art">
      <div className="fin-login-brand"><span>F</span><strong>FinanzApp</strong></div>
      <div className="fin-login-message">
        <span>FINANZAS CLARAS, DECISIONES SEGURAS</span>
        <h1>Todo el control financiero de tu negocio, en un solo lugar.</h1>
        <p>Registra ingresos y gastos, revisa resultados y conserva el historial de cada operación.</p>
        <div className="fin-login-art-note"><span>01</span><div><strong>Orden contable</strong><small>Ingresos, gastos, cuentas y reportes conectados.</small></div></div>
      </div>
      <div className="fin-login-ornament"></div>
    </div>
    <div className="fin-login-main">
      <section className="fin-login-card">
        <div className="fin-login-small-brand">FinanzApp <span>ANAF115 · 2026</span></div>
        <h2>Bienvenido de nuevo</h2>
        <p className="fin-login-lead">Selecciona tu perfil e ingresa tus credenciales.</p>
        <div className="fin-role-picker" role="group" aria-label="Seleccionar perfil de acceso">
          {perfiles.map((perfil) => <button key={perfil.rol} type="button" className={rol === perfil.rol ? 'fin-role-option selected' : 'fin-role-option'} aria-pressed={rol === perfil.rol} onClick={() => { setRol(perfil.rol); setMensaje(''); }}>
            <span>{perfil.inicial}</span>{perfil.rol}
          </button>)}
        </div>
        <form onSubmit={ingresar} className="fin-login-form">
          <label>Correo electrónico<input required type="email" autoComplete="username" placeholder={correoSugerido} value={cred.email} onChange={(e) => setCred({ ...cred, email: e.target.value })} /></label>
          <label>Contraseña<input required type="password" autoComplete="current-password" value={cred.password} onChange={(e) => setCred({ ...cred, password: e.target.value })} /></label>
          {mensaje && <div className="fin-login-alert" role="alert">{mensaje}</div>}
          <button className="fin-login-submit" disabled={cargando}>{cargando ? 'Un momento…' : 'Iniciar sesión'}</button>
        </form>
        <p className="fin-login-footer">Acceso protegido · FinanzApp</p>
      </section>
    </div>
  </main>;
};

export default Login;
