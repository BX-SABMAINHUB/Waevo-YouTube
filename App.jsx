import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getDatabase, ref, onValue, set, remove, serverTimestamp, update, push, get, query as dbQuery, limitToLast 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/**
 * ============================================================================
 * ALEX HUB ULTRA V13.5 - MEGA BUILD 2026
 * ============================================================================
 * TOTAL REPAIR: 
 * - AUTH PERSISTENCE ENGINE (Fixes "Missing Initial State")
 * - DB SANITIZATION LAYER (Fixes "Database Error" on any @domain)
 * - XL CINEMA ENGINE (Twitch, YouTube, Vidsrc)
 * - PANIC PROTOCOL V5 (Deep Link + Tab Self-Destruct)
 * ============================================================================
 */

// --- NÚCLEO DE CONFIGURACIÓN ---
const ALEX_CONFIG = {
  FIREBASE: {
    apiKey: "AIzaSyD1zUmhiUVDv-ZYyJF7vTwGaS1AO9t9jiE",
    authDomain: "alexhub-eefdf.firebaseapp.com",
    databaseURL: "https://alexhub-eefdf-default-rtdb.firebaseio.com",
    projectId: "alexhub-eefdf",
    storageBucket: "alexhub-eefdf.firebasestorage.app",
    messagingSenderId: "463204402982",
    appId: "1:463204402982:web:fe740a662fbfd50452a3e7"
  },
  API: {
    YOUTUBE: "AIzaSyDIImeaSboJvAsi6EChn8IugdLrh3nG9_4",
    ADMIN_PASS: "Alex2706",
    VERSION: "13.5.0-MEGA",
    PANIC_URL: "https://managebac.com",
    PANIC_APP: "managebac://"
  }
};

// --- INICIALIZACIÓN DE SERVICIOS ---
const app = initializeApp(ALEX_CONFIG.FIREBASE);
const db = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export default function AlexHubUltraV13() {
  // ==========================================
  // ESTADOS MAESTROS (SEGURIDAD Y SESIÓN)
  // ==========================================
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessGranted, setAccessGranted] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);

  // ==========================================
  // ESTADOS DE DATOS (REALTIME)
  // ==========================================
  const [data, setData] = useState({
    whitelist: {},
    blacklist: {},
    premium: {},
    logs: [],
    stats: { users: 0, bans: 0 }
  });

  // ==========================================
  // ESTADOS DE UI Y NAVEGACIÓN
  // ==========================================
  const [ui, setUi] = useState({
    mode: 'youtube',
    searchQuery: '',
    results: [],
    activeMedia: null,
    loading: false,
    showAdminLogin: false,
    isAdminOpen: false,
    adminTab: 'users',
    notifications: [],
    theme: '#ff0000'
  });

  // --- REFS PARA DOMINIO Y PÁNICO ---
  const videoRef = useRef(null);
  const adminPassRef = useRef(null);

  // ==========================================
  // 1. ENGINE: SANITIZACIÓN DE DB (FIX TOTAL)
  // ==========================================
  /**
   * Esta función es el corazón de la reparación. 
   * Firebase no permite "." o "@" en las llaves. 
   * Esta función los traduce a códigos seguros.
   */
  const sanitizeEmail = (email) => {
    if (!email || typeof email !== 'string') return "invalid_user";
    return email.toLowerCase()
      .trim()
      .replace(/\./g, '_d_')
      .replace(/@/g, '_a_')
      .replace(/#/g, '_h_')
      .replace(/\$/g, '_s_')
      .replace(/\[/g, '_lb_')
      .replace(/\]/g, '_rb_');
  };

  // ==========================================
  // 2. ENGINE: SISTEMA DE AUTENTICACIÓN
  // ==========================================
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Fix: Unable to process request due to missing initial state
        await setPersistence(auth, browserLocalPersistence);
        
        onAuthStateChanged(auth, (currentUser) => {
          if (currentUser) {
            setUser(currentUser);
            verifyAccessProtocol(currentUser.email);
          } else {
            setUser(null);
            setAccessGranted(false);
            setAuthLoading(false);
          }
        });
      } catch (error) {
        console.error("Auth Init Error:", error);
      }
    };

    initAuth();
    syncDatabase();
  }, []);

  const syncDatabase = () => {
    const refs = {
      whitelist: ref(db, 'whitelist'),
      blacklist: ref(db, 'blacklist'),
      premium: ref(db, 'premium'),
      logs: dbQuery(ref(db, 'logs'), limitToLast(100))
    };

    onValue(refs.whitelist, (s) => setData(p => ({...p, whitelist: s.val() || {}})));
    onValue(refs.blacklist, (s) => setData(p => ({...p, blacklist: s.val() || {}})));
    onValue(refs.logs, (s) => {
      const logData = s.val() ? Object.values(s.val()).reverse() : [];
      setData(p => ({...p, logs: logData}));
    });
  };

  const verifyAccessProtocol = (email) => {
    const key = sanitizeEmail(email);
    
    // Check Blacklist First
    onValue(ref(db, `blacklist/${key}`), (snap) => {
      if (snap.exists()) {
        setIsBanned(true);
        setAccessGranted(false);
        setAuthLoading(false);
      } else {
        setIsBanned(false);
        // Check Whitelist (Supports any domain: @gmail, @lamiranda.eu, etc.)
        onValue(ref(db, `whitelist/${key}`), (wSnap) => {
          if (wSnap.exists() || email === "alex.admin@pro.com") {
            setAccessGranted(true);
            addLog(`Acceso concedido: ${email}`);
          } else {
            setAccessGranted(false);
            setLoginError(`EL CORREO ${email} NO ESTÁ AUTORIZADO.`);
          }
          setAuthLoading(false);
        });
      }
    });
  };

  // ==========================================
  // 3. ENGINE: PROTOCOLO DE PÁNICO V5
  // ==========================================
  const triggerPanic = useCallback(() => {
    // 1. Intento de apertura de App Nativa
    window.location.href = ALEX_CONFIG.API.PANIC_APP;
    
    // 2. Camuflaje inmediato
    setTimeout(() => {
      window.location.replace("https://www.google.com/search?q=managebac+login");
      // 3. Intento de cierre de pestaña
      window.close();
    }, 150);
  }, []);

  // ==========================================
  // 4. ENGINE: CONTROL ADMINISTRATIVO
  // ==========================================
  const handleAdminAuth = (e) => {
    e.preventDefault();
    const input = adminPassRef.current.value;
    if (input === ALEX_CONFIG.API.ADMIN_PASS) {
      setAdminAuthenticated(true);
      setUi(p => ({...p, isAdminOpen: true, showAdminLogin: false}));
      pushNotification("ACCESO MAESTRO VALIDADO", "success");
      addLog("ADMIN: Acceso al panel de control");
    } else {
      pushNotification("CONTRASEÑA INCORRECTA", "error");
      addLog(`FALLO ADMIN: Intento con pass: ${input}`);
    }
  };

  const modifyUserStatus = async (table, email, action) => {
    if (!email || !email.includes('@')) {
      return pushNotification("EMAIL NO VÁLIDO", "error");
    }

    const key = sanitizeEmail(email);
    const targetRef = ref(db, `${table}/${key}`);

    try {
      if (action === 'add') {
        await set(targetRef, {
          email: email.toLowerCase().trim(),
          addedBy: user.email,
          at: serverTimestamp(),
          key: key
        });
        pushNotification(`USUARIO AÑADIDO A ${table.toUpperCase()}`, "success");
      } else {
        await remove(targetRef);
        pushNotification(`USUARIO ELIMINADO DE ${table.toUpperCase()}`, "info");
      }
      addLog(`ADMIN: ${action} en ${table} para ${email}`);
    } catch (err) {
      console.error(err);
      pushNotification("ERROR DE BASE DE DATOS", "error");
    }
  };

  const addLog = (msg) => {
    const newLog = push(ref(db, 'logs'));
    set(newLog, {
      msg,
      u: user?.email || 'Sistema',
      t: new Date().toISOString()
    });
  };

  // ==========================================
  // 5. ENGINE: MULTIMEDIA XL
  // ==========================================
    const searchMedia = async (e) => {
    if (e) e.preventDefault();
    if (!ui.searchQuery) return;

    setUi(p => ({...p, loading: true, results: []})); // Limpiamos resultados previos
    try {
      if (ui.mode === 'youtube') {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&q=${encodeURIComponent(ui.searchQuery)}&type=video&key=${ALEX_CONFIG.API.YOUTUBE}`;
        const response = await fetch(url);
        const resData = await response.json();
        
        if (resData.items) {
          setUi(p => ({...p, results: resData.items, activeMedia: null}));
        } else {
          pushNotification("NO SE ENCONTRARON VIDEOS", "error");
        }
      } else {
        // Para otros modos (Twitch, Movies, etc) simplemente activamos el modo cinema
        setUi(p => ({...p, activeMedia: ui.searchQuery || 'default'}));
      }
    } catch (err) {
      pushNotification("ERROR DE CONEXIÓN API", "error");
    }
    setUi(p => ({...p, loading: false}));
  };

  const pushNotification = (text, type) => {
    const id = Date.now();
    setUi(p => ({...p, notifications: [...p.notifications, {id, text, type}]}));
    setTimeout(() => {
      setUi(p => ({...p, notifications: p.notifications.filter(n => n.id !== id)}));
    }, 4000);
  };

  // ==========================================
  // RENDER: PANTALLA DE CARGA
  // ==========================================
  if (authLoading) return (
    <div style={Styles.FullCenter}>
      <div className="alex-loader"></div>
      <h1 style={Styles.GlitchTitle}>ALEX HUB ULTRA</h1>
      <p style={{letterSpacing: '5px', color: '#333'}}>SISTEMA INICIANDO...</p>
    </div>
  );

  // ==========================================
  // RENDER: PANTALLA DE BANEO
  // ==========================================
  if (isBanned) return (
    <div style={Styles.BannedOverlay}>
      <div style={Styles.BannedBox}>
        <h1 style={{fontSize: '70px', margin: 0}}>TERMINAL BAN</h1>
        <p>Tu cuenta ha sido revocada permanentemente por Alex.</p>
        <button onClick={() => signOut(auth)} style={Styles.MainBtn}>SALIR</button>
      </div>
    </div>
  );

  return (
    <div style={Styles.AppBody}>
      
      {/* CAPA DE NOTIFICACIONES */}
      <div style={Styles.NotifLayer}>
        {ui.notifications.map(n => (
          <div key={n.id} style={{...Styles.NotifPill, borderLeft: `5px solid ${n.type === 'error' ? '#ff0000' : '#00ff41'}`}}>
            {n.text}
          </div>
        ))}
      </div>

      {/* BOTÓN DE PÁNICO (MASTER) */}
      <button onClick={triggerPanic} style={Styles.PanicButton}>PÁNICO</button>

      {/* FLUJO DE LOGIN / DASHBOARD */}
      {!accessGranted ? (
        <div style={Styles.LoginScreen}>
          <div style={Styles.LoginCard}>
            <h1 style={Styles.MainTitle}>ALEX HUB <span style={{color: ui.theme}}>ULTRA</span></h1>
            <p style={Styles.VersionText}>V {ALEX_CONFIG.API.VERSION}</p>

            <div style={{margin: '50px 0'}}>
              {!user ? (
                <button onClick={() => signInWithPopup(auth, googleProvider)} style={Styles.GoogleBtn}>
                  <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" width="20" alt="G" />
                  ENTRAR CON GOOGLE
                </button>
              ) : (
                <div style={Styles.PendingBox}>
                  <p>HOLA, {user.displayName}</p>
                  <p style={{color: '#ff0000', fontSize: '12px'}}>{loginError || "ESPERANDO WHITELIST..."}</p>
                  <button onClick={() => signOut(auth)} style={Styles.LogoutMini}>CAMBIAR CUENTA</button>
                </div>
              )}
            </div>

            <button onClick={() => setUi(p => ({...p, showAdminLogin: true}))} style={Styles.AlexBtn}>
              ACCESO ADMINISTRADOR
            </button>
          </div>
        </div>
      ) : (
        /* --- DASHBOARD PRINCIPAL --- */
        <>
          <nav style={Styles.Navbar}>
            <div style={Styles.NavBrand}>
              <div style={Styles.LogoIcon}>A</div>
              <div>
                <div style={{fontWeight: '900', fontSize: '20px'}}>ALEX HUB</div>
                <div style={{fontSize: '9px', color: ui.theme, letterSpacing: '2px'}}>ULTRA V13.5</div>
              </div>
            </div>

            <div style={Styles.NavTabs}>
              {['youtube', 'twitch', 'movies', 'xbox', 'radio'].map(m => (
                <button 
                  key={m} 
                  onClick={() => setUi(p => ({...p, mode: m, activeMedia: null}))}
                  style={ui.mode === m ? {...Styles.Tab, background: ui.theme, color: '#fff'} : Styles.Tab}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>

            <form onSubmit={searchMedia} style={Styles.SearchContainer}>
              <input 
                style={Styles.SearchInput} 
                placeholder={`Buscar en ${ui.mode}...`} 
                value={ui.searchQuery}
                onChange={e => setUi(p => ({...p, searchQuery: e.target.value}))}
              />
              <button type="submit" style={Styles.SearchBtn}>🔍</button>
            </form>

            <div style={Styles.NavUser}>
               <img src={user.photoURL} style={Styles.UserAvatar} alt="u" />
               <button onClick={() => setUi(p => ({...p, showAdminLogin: true}))} style={Styles.AdminCircle}>A</button>
            </div>
          </nav>

          <main style={Styles.Content}>
            {ui.loading && <div className="alex-loader" style={{margin: '50px auto'}}></div>}

            {ui.mode === 'youtube' && !ui.activeMedia && (
              <div style={Styles.MediaGrid}>
                {ui.results.map((v, i) => (
                  <div key={i} style={Styles.MediaCard} onClick={() => setUi(p => ({...p, activeMedia: v.id.videoId}))}>
                    <div style={Styles.ThumbWrap}>
                      <img src={v.snippet.thumbnails.high.url} style={Styles.Thumb} alt="t" />
                      <div style={Styles.PlayOverlay}>REPRODUCIR XL</div>
                    </div>
                    <div style={Styles.CardData}>
                      <h4 style={Styles.CardTitle}>{v.snippet.title}</h4>
                      <p style={Styles.CardSub}>{v.snippet.channelTitle}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
                        {(ui.activeMedia || ui.mode !== 'youtube') && (
              <div style={Styles.CinemaFrame}>
                <iframe 
                  src={
                    ui.mode === 'youtube' 
                      ? `https://www.youtube-nocookie.com/embed/${ui.activeMedia}?autoplay=1&modestbranding=1&rel=0` 
                      : ui.mode === 'twitch' 
                      ? `https://player.twitch.tv/?channel=${ui.searchQuery.replace(/\s+/g, '') || 'ibai'}&parent=${window.location.hostname}&autoplay=true` 
                      : ui.mode === 'movies' 
                      ? `https://vidsrc.to/embed/movie/${ui.searchQuery || 'tt0111161'}` 
                      : ui.mode === 'xbox' 
                      ? "https://www.xbox.com/play" 
                      : "https://www.radio.net/embed/los40"
                  }
                  style={Styles.IframeXL}
                  allow="autoplay; aria-live; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  frameBorder="0"
                  allowFullScreen
                />
                <button 
                  onClick={() => setUi(p => ({...p, activeMedia: null}))} 
                  style={Styles.CloseCinema}
                >
                  {ui.mode === 'youtube' ? 'CERRAR VIDEO' : 'VOLVER AL HUB'}
                </button>
              </div>
            )}
          </main>
        </>
      )}

      {/* MODAL DE LOGIN ADMIN */}
      {ui.showAdminLogin && (
        <div style={Styles.ModalOverlay}>
          <div style={Styles.AdminLoginCard}>
            <h2>SEGURIDAD NIVEL 1</h2>
            <p>INGRESE LA CLAVE ALEX</p>
            <form onSubmit={handleAdminAuth}>
              <input 
                type="password" 
                ref={adminPassRef} 
                style={Styles.PassInput} 
                autoFocus 
                placeholder="••••••••"
              />
              <div style={{display: 'flex', gap: '10px', justifyContent: 'center'}}>
                <button type="submit" style={Styles.MainBtn}>ENTRAR</button>
                <button type="button" onClick={() => setUi(p => ({...p, showAdminLogin: false}))} style={Styles.CancelBtn}>CANCELAR</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PANEL COMMAND CENTER (ADMIN) */}
      {ui.isAdminOpen && (
        <div style={Styles.CommandCenter}>
          <div style={Styles.AdminHeader}>
            <h1 style={{color: ui.theme, margin: 0}}>ALEX HUB | COMMAND CENTER</h1>
            <div style={{display: 'flex', gap: '15px'}}>
               <button onClick={() => setUi(p => ({...p, adminTab: 'users'}))} style={ui.adminTab === 'users' ? Styles.AdminTabAct : Styles.AdminTab}>USUARIOS</button>
               <button onClick={() => setUi(p => ({...p, adminTab: 'logs'}))} style={ui.adminTab === 'logs' ? Styles.AdminTabAct : Styles.AdminTab}>REGISTROS</button>
               <button onClick={() => setUi(p => ({...p, isAdminOpen: false}))} style={Styles.ExitAdmin}>X</button>
            </div>
          </div>
          
          <div style={Styles.AdminBody}>
            {ui.adminTab === 'users' ? (
              <div style={Styles.AdminGrid}>
                {/* COLUMNA WHITELIST */}
                <div style={Styles.AdminCol}>
                  <h3>✅ CORREOS VERIFICADOS (@GMAIL, @LAMIRANDA...)</h3>
                  <div style={Styles.AdminActions}>
                    <input id="addWhite" placeholder="ejemplo@lamiranda.eu" style={Styles.AdmInput} />
                    <button onClick={() => modifyUserStatus('whitelist', document.getElementById('addWhite').value, 'add')} style={Styles.AddBtn}>AÑADIR</button>
                  </div>
                  <div style={Styles.UserList}>
                    {Object.values(data.whitelist).map(u => (
                      <div key={u.key} style={Styles.UserItem}>
                        <span>{u.email}</span>
                        <button onClick={() => modifyUserStatus('whitelist', u.email, 'remove')} style={Styles.DelBtn}>QUITAR</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* COLUMNA BLACKLIST */}
                <div style={Styles.AdminCol}>
                  <h3>🚫 BANEADOS (EXPULSIÓN TOTAL)</h3>
                  <div style={Styles.AdminActions}>
                    <input id="addBlack" placeholder="usuario@gmail.com" style={Styles.AdmInput} />
                    <button onClick={() => modifyUserStatus('blacklist', document.getElementById('addBlack').value, 'add')} style={Styles.BanBtn}>BANEAR</button>
                  </div>
                  <div style={Styles.UserList}>
                    {Object.values(data.blacklist).map(u => (
                      <div key={u.key} style={Styles.UserItem}>
                        <span>{u.email}</span>
                        <button onClick={() => modifyUserStatus('blacklist', u.email, 'remove')} style={Styles.UnbanBtn}>PERDONAR</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={Styles.LogContainer}>
                {data.logs.map((l, i) => (
                  <div key={i} style={Styles.LogLine}>
                    <span style={{color: '#555'}}>[{new Date(l.t).toLocaleTimeString()}]</span>
                    <span style={{color: ui.theme}}> {l.u}:</span> {l.msg}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// ARQUITECTURA DE ESTILOS (SISTEMA DE DISEÑO)
// ==========================================
const Styles = {
  AppBody: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#000', color: '#fff', fontFamily: "'Inter', sans-serif", overflow: 'hidden' },
  FullCenter: { height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000' },
  GlitchTitle: { fontSize: '40px', fontWeight: '900', letterSpacing: '10px', margin: '20px 0' },
  
  // LOGIN
  LoginScreen: { height: '100vh', background: 'radial-gradient(circle at center, #111 0%, #000 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  LoginCard: { background: 'rgba(5,5,5,0.8)', padding: '80px', borderRadius: '50px', border: '1px solid #1a1a1a', textAlign: 'center', backdropFilter: 'blur(20px)', boxShadow: '0 50px 100px rgba(0,0,0,0.9)' },
  MainTitle: { fontSize: '60px', fontWeight: '900', margin: 0, letterSpacing: '-2px' },
  VersionText: { fontSize: '10px', color: '#333', letterSpacing: '5px', marginTop: '10px' },
  GoogleBtn: { display: 'flex', alignItems: 'center', gap: '15px', background: '#fff', color: '#000', border: 'none', padding: '20px 40px', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', transition: '0.3s' },
  AlexBtn: { background: 'none', border: '1px solid #222', color: '#444', padding: '12px 25px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px' },
  PendingBox: { background: '#0a0a0a', padding: '20px', borderRadius: '20px', border: '1px solid #111' },
  LogoutMini: { background: 'none', border: 'none', color: '#555', cursor: 'pointer', textDecoration: 'underline', fontSize: '11px' },

  // NAV
  Navbar: { height: '90px', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #111', display: 'flex', alignItems: 'center', padding: '0 40px', justifyContent: 'space-between', zIndex: 100 },
  NavBrand: { display: 'flex', alignItems: 'center', gap: '15px' },
  LogoIcon: { background: '#ff0000', width: '45px', height: '45px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '24px' },
  NavTabs: { display: 'flex', gap: '10px' },
  Tab: { background: '#0a0a0a', border: 'none', color: '#555', padding: '12px 20px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', transition: '0.3s' },
  SearchContainer: { flex: 1, maxWidth: '500px', margin: '0 40px', position: 'relative' },
  SearchInput: { width: '100%', background: '#050505', border: '1px solid #222', borderRadius: '15px', padding: '15px 25px', color: '#fff', outline: 'none' },
  SearchBtn: { position: 'absolute', right: '15px', top: '12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' },
  NavUser: { display: 'flex', alignItems: 'center', gap: '20px' },
  UserAvatar: { width: '45px', height: '45px', borderRadius: '50%', border: '2px solid #111' },
  AdminCircle: { width: '45px', height: '45px', borderRadius: '50%', background: '#111', border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },

  // PANIC
  PanicButton: { position: 'fixed', bottom: '40px', right: '40px', background: '#ff0000', color: '#fff', border: 'none', width: '120px', height: '120px', borderRadius: '50%', fontWeight: '900', cursor: 'pointer', zIndex: 100000, boxShadow: '0 0 50px rgba(255,0,0,0.5)', animation: 'pulse 2s infinite' },

  // CONTENT
  Content: { flex: 1, overflowY: 'auto', padding: '40px' },
  MediaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '30px' },
  MediaCard: { background: '#050505', borderRadius: '25px', overflow: 'hidden', border: '1px solid #111', cursor: 'pointer', transition: '0.3s' },
  ThumbWrap: { position: 'relative', width: '100%', aspectRatio: '16/9' },
  Thumb: { width: '100%', height: '100%', objectFit: 'cover' },
  PlayOverlay: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: '0.3s', fontWeight: '900' },
  CardData: { padding: '20px' },
  CardTitle: { margin: '0 0 10px 0', fontSize: '15px', height: '40px', overflow: 'hidden' },
  CardSub: { color: '#444', fontSize: '12px', margin: 0 },

  // CINEMA
  CinemaFrame: { width: '100%', height: '82vh', background: '#000', borderRadius: '40px', overflow: 'hidden', position: 'relative', border: '1px solid #222' },
  IframeXL: { width: '100%', height: '100%', border: 'none' },
  CloseCinema: { position: 'absolute', top: '30px', right: '30px', background: '#ff0000', color: '#fff', border: 'none', padding: '15px 30px', borderRadius: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' },

  // ADMIN UI
  CommandCenter: { position: 'fixed', inset: '30px', background: '#050505', borderRadius: '40px', zIndex: 1000, display: 'flex', flexDirection: 'column', border: '1px solid #333', boxShadow: '0 0 200px #000' },
  AdminHeader: { padding: '30px 50px', borderBottom: '1px solid #111', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  AdminBody: { flex: 1, padding: '40px', overflowY: 'auto' },
  AdminGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' },
  AdminCol: { background: '#0a0a0a', padding: '30px', borderRadius: '30px', border: '1px solid #111' },
  AdminActions: { display: 'flex', gap: '10px', marginBottom: '25px' },
  AdmInput: { flex: 1, background: '#000', border: '1px solid #222', borderRadius: '12px', padding: '12px', color: '#fff' },
  UserList: { display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' },
  UserItem: { background: '#050505', padding: '15px', borderRadius: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #111' },
  
  // BUTTONS
  AddBtn: { background: '#00ff41', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' },
  BanBtn: { background: '#ff0000', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' },
  DelBtn: { background: '#111', color: '#555', border: 'none', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer' },
  UnbanBtn: { background: '#00ff41', color: '#000', border: 'none', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer' },
  ExitAdmin: { background: '#fff', color: '#000', border: 'none', width: '40px', height: '40px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' },
  
  // LOGS
  LogContainer: { background: '#000', padding: '30px', borderRadius: '25px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #111' },
  LogLine: { padding: '8px 0', borderBottom: '1px solid #080808' },

  // NOTIFS
  NotifLayer: { position: 'fixed', top: '30px', right: '30px', zIndex: 1000000, display: 'flex', flexDirection: 'column', gap: '10px' },
  NotifPill: { background: '#0a0a0a', color: '#fff', padding: '15px 30px', borderRadius: '12px', fontWeight: 'bold', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' },
  
  // PASS MODAL
  ModalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50000 },
  AdminLoginCard: { background: '#0a0a0a', padding: '60px', borderRadius: '40px', border: '1px solid #222', textAlign: 'center' },
  PassInput: { width: '300px', background: '#000', border: '1px solid #333', padding: '20px', borderRadius: '15px', color: '#fff', fontSize: '30px', textAlign: 'center', margin: '30px 0', outline: 'none' },
  MainBtn: { background: '#ff0000', color: '#fff', border: 'none', padding: '15px 40px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' },
  CancelBtn: { background: 'none', color: '#444', border: 'none', padding: '15px', cursor: 'pointer' },
  BannedOverlay: { height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  BannedBox: { textAlign: 'center', color: '#ff0000', border: '2px solid #ff0000', padding: '60px', borderRadius: '40px' }
};

// --- GLOBAL STYLES & ANIMATIONS ---
if (typeof document !== 'undefined') {
  const styleTag = document.createElement('style');
  styleTag.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
    body { margin: 0; background: #000; -webkit-font-smoothing: antialiased; }
    .alex-loader { width: 60px; height: 60px; border: 5px solid #111; border-top-color: #ff0000; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0% { transform: scale(1); box-shadow: 0 0 0px rgba(255,0,0,0); } 50% { transform: scale(1.05); box-shadow: 0 0 50px rgba(255,0,0,0.5); } 100% { transform: scale(1); box-shadow: 0 0 0px rgba(255,0,0,0); } }
    .MediaCard:hover { transform: translateY(-10px); border-color: #ff0000; }
    .MediaCard:hover .PlayOverlay { opacity: 1; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-thumb { background: #222; border-radius: 10px; }
    ::-webkit-scrollbar-track { background: #000; }
  `;
  document.head.appendChild(styleTag);
}
