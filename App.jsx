// YouTube-NoADs
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
 * YOUTUBE-NOADS V13.5 - MEGA BUILD 2026 (LIMIT & PLAN EDITION)
 * ============================================================================
 * - AUTH PERSISTENCE ENGINE
 * - DB SANITIZATION LAYER
 * - XL CINEMA ENGINE (YouTube)
 * - DYNAMIC CPU/NETWORK MONITORING
 * - PLAN-BASED VIDEO DURATION LIMITER (max 5 min si excede)
 * - ADMIN CAN ASSIGN PLANS TO EMAILS (WITH 25s UPDATE DELAY)
 * - CONSOLE WITH GRAPHS, TERMINAL & FILES (package.json)
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
    VERSION: "13.5.0-MEGA"
  },
  DEFAULT_SERVER_SETTINGS: {
    autoplay: true,
    volume: 80,
    theme: '#ff0000',
    region: 'ES',
    restrictedMode: false,
    quality: 'auto',
    notifications: true
  },
  PLANS: {
    free: {
      name: 'Free',
      price: '0,00 €',
      networkMB: 25,
      cpuPercent: 25,
      settingsLimited: true
    },
    starter: {
      name: 'Starter',
      price: '0,50 €',
      networkMB: 50,
      cpuPercent: 45,
      settingsLimited: false
    },
    amateur: {
      name: 'Amateur',
      price: '1,50 €',
      networkMB: 150,
      cpuPercent: 75,
      settingsLimited: false
    },
    completo: {
      name: 'Completo',
      price: '4,50 €',
      networkMB: 512,
      cpuPercent: 100,
      settingsLimited: false
    }
  }
};

const PACKAGE_JSON_CONTENT = `{
  "name": "youtube-noads-server",
  "version": "13.5.0",
  "description": "Servidor de streaming sin anuncios",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "axios": "^1.4.0",
    "firebase": "^10.7.1",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "author": "Alex Hub Ultra",
  "license": "ISC"
}`;

// --- INICIALIZACIÓN DE SERVICIOS ---
const app = initializeApp(ALEX_CONFIG.FIREBASE);
const db = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// --- GLOBALES PARA MONITOREO REAL (actualizados constantemente) ---
let frameTimes = [];
let lastFrameTime = performance.now();
let networkUsageTotal = 0;
let cpuUsagePercent = 0;

function trackFrame() {
  const now = performance.now();
  const delta = now - lastFrameTime;
  frameTimes.push(delta);
  if (frameTimes.length > 60) frameTimes.shift();
  const avgFrameTime = frameTimes.reduce((a,b) => a+b, 0) / frameTimes.length;
  cpuUsagePercent = Math.min(100, (avgFrameTime / 16.67) * 100);
  lastFrameTime = now;
  requestAnimationFrame(trackFrame);
}

function accumulateNetworkUsage() {
  const resources = performance.getEntriesByType('resource');
  let total = 0;
  resources.forEach(r => {
    if (r.transferSize) total += r.transferSize;
  });
  networkUsageTotal = total / (1024 * 1024); // MB
}

if (typeof window !== 'undefined') {
  requestAnimationFrame(trackFrame);
  setInterval(accumulateNetworkUsage, 2000);
}

// --- FUNCIONES AUXILIARES ---
function parseISO8601Duration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

export default function YouTubeNoADs() {
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
    theme: '#ff0000',
    showServerSettings: false,
    showConsole: false,
    showPlans: false,
    serverId: '',
    serverSettings: { ...ALEX_CONFIG.DEFAULT_SERVER_SETTINGS },
    serverSettingsLoading: true,
    currentPlan: 'free',
    planData: ALEX_CONFIG.PLANS.free,
    // admin server lookup (solo detalles, sin plan)
    currentLookupId: null,
    serverDetails: null,
    serverOwnerEmail: null,
    // plan assignment to email
    pendingPlanEmail: null,
    showPlanAssignment: false,
    // plan update UI
    updatingPlan: false,
    updateCountdown: 25,
  });

  // Métricas dinámicas forzadas a estado para re-render
  const [metrics, setMetrics] = useState({ cpu: 0, network: 0 });
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics({ cpu: cpuUsagePercent, network: networkUsageTotal });
    }, 1000); // actualizado cada segundo para gráficos fluidos
    return () => clearInterval(interval);
  }, []);

  // --- ESTADOS DE LA CONSOLA DE LOGS ---
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [consoleStatus, setConsoleStatus] = useState('stopped'); // 'stopped' | 'starting' | 'running'
  const [consoleLoadingDots, setConsoleLoadingDots] = useState('');
  const [consoleTab, setConsoleTab] = useState('monitor'); // 'monitor', 'terminal', 'files'

  // --- REFS ---
  const videoRef = useRef(null);
  const adminPassRef = useRef(null);
  const adminServerIdRef = useRef(null);

  // ==========================================
  // 1. ENGINE: SANITIZACIÓN DE DB
  // ==========================================
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

  useEffect(() => {
    if (!user || !accessGranted) return;
    loadUserData();
  }, [user, accessGranted]);

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
    onValue(ref(db, `blacklist/${key}`), (snap) => {
      if (snap.exists()) {
        setIsBanned(true);
        setAccessGranted(false);
        setAuthLoading(false);
      } else {
        setIsBanned(false);
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
  // 3. ENGINE: CARGA DE DATOS DEL USUARIO
  // ==========================================
  const loadUserData = async () => {
    if (!user) return;
    const emailKey = sanitizeEmail(user.email);
    setUi(p => ({ ...p, serverSettingsLoading: true }));

    try {
      const userServerRef = ref(db, `userServers/${emailKey}`);
      const serverSnap = await get(userServerRef);
      let serverId;
      if (serverSnap.exists()) {
        serverId = serverSnap.val().serverId;
      } else {
        serverId = generateServerId();
        await set(userServerRef, { serverId, email: user.email });
        await set(ref(db, `serverToUser/${serverId}`), emailKey);
      }

      const serverSettingsRef = ref(db, `servers/${serverId}`);
      const settingsSnap = await get(serverSettingsRef);
      let settings;
      if (settingsSnap.exists()) {
        settings = settingsSnap.val();
      } else {
        settings = { ...ALEX_CONFIG.DEFAULT_SERVER_SETTINGS };
        await set(serverSettingsRef, settings);
      }

      const planRef = ref(db, `userPlans/${emailKey}`);
      const planSnap = await get(planRef);
      let currentPlan = 'free';
      if (planSnap.exists()) {
        currentPlan = planSnap.val();
      } else {
        await set(planRef, 'free');
      }

      setUi(p => ({
        ...p,
        serverId,
        serverSettings: settings,
        serverSettingsLoading: false,
        currentPlan,
        planData: ALEX_CONFIG.PLANS[currentPlan] || ALEX_CONFIG.PLANS.free
      }));

    } catch (err) {
      console.error("Error loading user data:", err);
      setUi(p => ({ ...p, serverSettingsLoading: false }));
    }
  };

  const generateServerId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) {
      if (i > 0 && i % 3 === 0) id += '-';
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  };

  const updateServerSetting = async (key, value) => {
    if (ui.planData.settingsLimited && key !== 'theme') {
      pushNotification("Tu plan Free tiene ajustes limitados. Mejora para desbloquear.", "error");
      return;
    }
    const newSettings = { ...ui.serverSettings, [key]: value };
    setUi(p => ({ ...p, serverSettings: newSettings }));
    if (ui.serverId) {
      await set(ref(db, `servers/${ui.serverId}`), newSettings);
      pushNotification(`Ajuste "${key}" actualizado`, "success");
      addLog(`SERVER: Cambio de ${key} a ${value}`);
    }
  };

  // ==========================================
  // 4. ENGINE: ADMINISTRACIÓN (USUARIOS, SERVIDORES, PLANES)
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
        // Si se añade a la whitelist, pedir plan para ese email
        if (table === 'whitelist') {
          setUi(p => ({ ...p, pendingPlanEmail: email.toLowerCase().trim(), showPlanAssignment: true }));
        }
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

  const lookupServer = async (serverIdInput) => {
    if (!serverIdInput) return pushNotification("Introduce un Server ID", "error");
    const snap = await get(ref(db, `servers/${serverIdInput}`));
    if (snap.exists()) {
      const details = snap.val();
      const userSnap = await get(ref(db, `serverToUser/${serverIdInput}`));
      let ownerEmail = null;
      if (userSnap.exists()) {
        ownerEmail = userSnap.val();
      }
      setUi(p => ({...p, serverDetails: details, currentLookupId: serverIdInput, serverOwnerEmail: ownerEmail}));
      pushNotification(`Servidor ${serverIdInput} encontrado`, "success");
      addLog(`ADMIN: Consultó servidor ${serverIdInput}`);
    } else {
      pushNotification(`Servidor ${serverIdInput} no encontrado`, "error");
    }
  };

  const startPlanUpdate = (planKey) => {
    if (!ui.pendingPlanEmail) {
      pushNotification("No hay email pendiente para asignar plan", "error");
      return;
    }
    setUi(p => ({ ...p, updatingPlan: true, updateCountdown: 25, selectedPlanForUpdate: planKey, showPlanAssignment: false }));
  };

  // Efecto para manejar la cuenta atrás de 25 segundos
  useEffect(() => {
    if (!ui.updatingPlan) return;
    if (ui.updateCountdown <= 0) {
      const planKey = ui.selectedPlanForUpdate;
      const email = ui.pendingPlanEmail;
      const emailKey = sanitizeEmail(email);
      const updatePlan = async () => {
        await set(ref(db, `userPlans/${emailKey}`), planKey);
        pushNotification(`Plan ${ALEX_CONFIG.PLANS[planKey].name} asignado a ${email}`, "success");
        addLog(`ADMIN: Plan ${planKey} aplicado a ${email}`);
        // Si es el usuario actual, actualizar UI
        if (user && sanitizeEmail(user.email) === emailKey) {
          setUi(p => ({
            ...p,
            currentPlan: planKey,
            planData: ALEX_CONFIG.PLANS[planKey],
            updatingPlan: false,
            selectedPlanForUpdate: null,
            pendingPlanEmail: null
          }));
        } else {
          setUi(p => ({
            ...p,
            updatingPlan: false,
            selectedPlanForUpdate: null,
            pendingPlanEmail: null
          }));
        }
      };
      updatePlan();
      return;
    }
    const timer = setTimeout(() => {
      setUi(p => ({ ...p, updateCountdown: p.updateCountdown - 1 }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [ui.updatingPlan, ui.updateCountdown]);

  // --- MANEJO DE LA CONSOLA DE LOGS (INICIO 15s) ---
  const startConsole = () => {
    setConsoleStatus('starting');
    setConsoleLogs([]);
    // Animación de puntos
    const dotsInterval = setInterval(() => {
      setConsoleLoadingDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    
    const installationSteps = [
      '[SYSTEM] Preparando instalación de dependencias...',
      '[SYSTEM] Leyendo package.json...',
      '[NPM] Instalando express@4.18.2...',
      '[NPM] Instalando socket.io@4.6.1...',
      '[NPM] Instalando axios@1.4.0...',
      '[NPM] Instalando firebase@10.7.1...',
      '[NPM] Instalando cors@2.8.5...',
      '[NPM] Instalando dotenv@16.3.1...',
      '[NPM] Instalando uuid@9.0.0...',
      '[NPM] Instalando nodemon@3.0.1 (dev)...',
      '[NPM] Todas las dependencias instaladas correctamente.',
      '[SYSTEM] Compilando módulos...',
      '[SYSTEM] Iniciando servidor...',
      '[SERVICES] Servidor activo en puerto 3000.',
      '[CONSOLE] Consola de monitorización activada.'
    ];
    const totalSteps = installationSteps.length;
    const maxTime = 15000; // 15 segundos
    const stepDelay = maxTime / totalSteps;
    let step = 0;
    
    const addLogInterval = setInterval(() => {
      if (step < totalSteps) {
        const time = new Date().toLocaleTimeString();
        setConsoleLogs(prev => [...prev, { time, msg: installationSteps[step] }]);
        step++;
      } else {
        clearInterval(addLogInterval);
      }
    }, stepDelay);
    
    setTimeout(() => {
      clearInterval(dotsInterval);
      clearInterval(addLogInterval);
      setConsoleLoadingDots('');
      setConsoleStatus('running');
      // Asegurar que todos los logs se hayan añadido
      if (step < totalSteps) {
        const remaining = installationSteps.slice(step);
        const time = new Date().toLocaleTimeString();
        setConsoleLogs(prev => [...prev, ...remaining.map(msg => ({ time, msg }))]);
      }
      pushNotification("Consola iniciada correctamente", "success");
      addLog("USER: Inició la consola de monitorización");
    }, maxTime);
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
  // 5. ENGINE: BÚSQUEDA Y REPRODUCCIÓN CON LÍMITES
  // ==========================================
  const searchMedia = async (e) => {
    if (e) e.preventDefault();
    if (!ui.searchQuery) return;
    setUi(p => ({...p, loading: true, results: []}));
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&q=${encodeURIComponent(ui.searchQuery)}&type=video&key=${ALEX_CONFIG.API.YOUTUBE}`;
      const response = await fetch(url);
      const resData = await response.json();
      if (resData.items) {
        setUi(p => ({...p, results: resData.items, activeMedia: null}));
      } else {
        pushNotification("NO SE ENCONTRARON VIDEOS", "error");
      }
    } catch (err) {
      pushNotification("ERROR DE CONEXIÓN API", "error");
    }
    setUi(p => ({...p, loading: false}));
  };

  const handleVideoSelect = async (videoId) => {
    // Bloquear si la consola no está activa
    if (consoleStatus !== 'running') {
      pushNotification("Debes iniciar la consola primero. Ve a la pestaña Consola y haz clic en START.", "error");
      return;
    }
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${ALEX_CONFIG.API.YOUTUBE}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        const durationIso = data.items[0].contentDetails.duration;
        const durationSec = parseISO8601Duration(durationIso);

        const exceeded = cpuUsagePercent > ui.planData.cpuPercent || networkUsageTotal > ui.planData.networkMB;
        if (exceeded && durationSec > 300) {
          pushNotification("Tu plan ha excedido los límites. Solo puedes ver vídeos de 5 minutos o menos. Mejora tu plan para eliminar restricciones.", "error");
          return;
        }
      }
    } catch (err) {
      console.error("Error obteniendo duración del vídeo", err);
    }
    setUi(p => ({...p, activeMedia: videoId}));
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
      <h1 style={Styles.GlitchTitle}>YouTube-NoADs</h1>
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

  // --- Helpers para gráficos circulares ---
  const CircularProgress = ({ value, max, color, label }) => {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const percent = Math.min((value / max) * 100, 100);
    const offset = circumference - (percent / 100) * circumference;
    return (
      <div style={{ textAlign: 'center', width: '160px', margin: '0 auto' }}>
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#1a1a1a" strokeWidth="10" />
          <circle
            cx="70" cy="70" r={radius} fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 70 70)"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div style={{ marginTop: '-90px', fontSize: '22px', fontWeight: 'bold', color }}>{percent.toFixed(1)}%</div>
        <div style={{ marginTop: '60px', fontSize: '12px', color: '#888' }}>{label}</div>
      </div>
    );
  };

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

      {/* FLUJO DE LOGIN / DASHBOARD */}
      {!accessGranted ? (
        <div style={Styles.LoginScreen}>
          <div style={Styles.LoginCard}>
            <h1 style={Styles.MainTitle}>YouTube-NoADs <span style={{color: ui.theme}}>ULTRA</span></h1>
            <p style={Styles.VersionText}>V {ALEX_CONFIG.API.VERSION}</p>

            <div style={{margin: '50px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px'}}>
              {!user ? (
                <div style={{display: 'flex', gap: '15px'}}>
                  <button onClick={() => signInWithPopup(auth, googleProvider)} style={Styles.GoogleBtn}>
                    <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" width="20" alt="G" />
                    ENTRAR CON GOOGLE
                  </button>
                  <button onClick={() => setUi(p => ({...p, showPlans: true}))} style={Styles.PlansBtn}>
                    VER PLANES
                  </button>
                </div>
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
                <div style={{fontWeight: '900', fontSize: '20px'}}>YouTube-NoADs</div>
                <div style={{fontSize: '9px', color: ui.theme, letterSpacing: '2px'}}>ULTRA V13.5</div>
              </div>
            </div>

            <div style={Styles.NavTabs}>
              <button 
                onClick={() => setUi(p => ({...p, mode: 'youtube', showServerSettings: false, showConsole: false}))}
                style={!ui.showServerSettings && !ui.showConsole ? {...Styles.Tab, background: ui.theme, color: '#fff'} : Styles.Tab}
              >
                YOUTUBE
              </button>
              <button 
                onClick={() => setUi(p => ({...p, showServerSettings: true, showConsole: false}))}
                style={ui.showServerSettings ? {...Styles.Tab, background: ui.theme, color: '#fff'} : Styles.Tab}
              >
                SERVER SETTINGS
              </button>
              <button 
                onClick={() => setUi(p => ({...p, showConsole: true, showServerSettings: false}))}
                style={ui.showConsole ? {...Styles.Tab, background: ui.theme, color: '#fff'} : Styles.Tab}
              >
                CONSOLE
              </button>
            </div>

            <form onSubmit={searchMedia} style={Styles.SearchContainer}>
              <input 
                style={Styles.SearchInput} 
                placeholder="Buscar en YouTube..." 
                value={ui.searchQuery}
                onChange={e => setUi(p => ({...p, searchQuery: e.target.value}))}
              />
              <button type="submit" style={Styles.SearchBtn}>🔍</button>
            </form>

            <div style={Styles.NavUser}>
               <img src={user.photoURL} style={Styles.UserAvatar} alt="u" />
               <button onClick={() => signOut(auth)} style={Styles.LogoutBtn}>Cerrar sesión</button>
               <button onClick={() => setUi(p => ({...p, showAdminLogin: true}))} style={Styles.AdminCircle}>A</button>
            </div>
          </nav>

          <main style={Styles.Content}>
            {ui.loading && <div className="alex-loader" style={{margin: '50px auto'}}></div>}

            {/* MODO YOUTUBE */}
            {!ui.showServerSettings && !ui.showConsole && (
              <>
                {!ui.activeMedia ? (
                  <div style={Styles.MediaGrid}>
                    {ui.results.map((v, i) => (
                      <div key={i} style={Styles.MediaCard} onClick={() => handleVideoSelect(v.id.videoId)}>
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
                ) : (
                  <div style={Styles.CinemaFrame}>
                    <iframe 
                      src={`https://www.youtube-nocookie.com/embed/${ui.activeMedia}?autoplay=1&modestbranding=1&rel=0`}
                      style={Styles.IframeXL}
                      allow="autoplay; aria-live; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      frameBorder="0"
                      allowFullScreen
                    />
                    <button 
                      onClick={() => setUi(p => ({...p, activeMedia: null}))} 
                      style={Styles.CloseCinema}
                    >
                      CERRAR VIDEO
                    </button>
                  </div>
                )}
              </>
            )}

            {/* MODO SERVER SETTINGS */}
            {ui.showServerSettings && (
              <div style={Styles.SettingsPanel}>
                <h2 style={Styles.SettingsTitle}>⚙️ SERVER SETTINGS</h2>
                {ui.serverSettingsLoading ? (
                  <div className="alex-loader" style={{margin: '50px auto'}}></div>
                ) : (
                  <>
                    <div style={Styles.SettingsGrid}>
                      <div style={Styles.SettingItem}>
                        <label>Autoplay</label>
                        <select value={ui.serverSettings.autoplay} onChange={(e) => updateServerSetting('autoplay', e.target.value === 'true')}>
                          <option value="true">Activado</option>
                          <option value="false">Desactivado</option>
                        </select>
                      </div>
                      <div style={Styles.SettingItem}>
                        <label>Volumen por defecto</label>
                        <input type="range" min="0" max="100" value={ui.serverSettings.volume} onChange={(e) => updateServerSetting('volume', parseInt(e.target.value))} />
                        <span>{ui.serverSettings.volume}%</span>
                      </div>
                      <div style={Styles.SettingItem}>
                        <label>Tema de color</label>
                        <input type="color" value={ui.serverSettings.theme} onChange={(e) => updateServerSetting('theme', e.target.value)} />
                      </div>
                      <div style={Styles.SettingItem}>
                        <label>Región</label>
                        <select value={ui.serverSettings.region} onChange={(e) => updateServerSetting('region', e.target.value)}>
                          <option value="ES">España</option>
                          <option value="MX">México</option>
                          <option value="AR">Argentina</option>
                          <option value="US">Estados Unidos</option>
                        </select>
                      </div>
                      <div style={Styles.SettingItem}>
                        <label>Modo Restringido</label>
                        <select value={ui.serverSettings.restrictedMode} onChange={(e) => updateServerSetting('restrictedMode', e.target.value === 'true')}>
                          <option value="false">Desactivado</option>
                          <option value="true">Activado</option>
                        </select>
                      </div>
                      <div style={Styles.SettingItem}>
                        <label>Calidad predeterminada</label>
                        <select value={ui.serverSettings.quality} onChange={(e) => updateServerSetting('quality', e.target.value)}>
                          <option value="auto">Automática</option>
                          <option value="hd1080">1080p</option>
                          <option value="hd720">720p</option>
                          <option value="large">480p</option>
                        </select>
                      </div>
                      <div style={Styles.SettingItem}>
                        <label>Notificaciones</label>
                        <select value={ui.serverSettings.notifications} onChange={(e) => updateServerSetting('notifications', e.target.value === 'true')}>
                          <option value="true">Activadas</option>
                          <option value="false">Desactivadas</option>
                        </select>
                      </div>
                    </div>
                    <div style={Styles.ServerIdBox}>
                      <p>SERVER ID: <span style={{fontWeight: 'bold', color: ui.theme}}>{ui.serverId}</span></p>
                      <small style={{color: '#666'}}>Este código identifica tu servidor único. Úsalo para consultas administrativas.</small>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* MODO CONSOLE */}
            {ui.showConsole && (
              <div style={Styles.ConsolePanel}>
                <h2 style={Styles.SettingsTitle}>📊 CONSOLE DE RENDIMIENTO</h2>
                <p style={{color: '#888', marginBottom: '30px'}}>Plan actual: <strong style={{color: ui.theme}}>{ui.planData.name} ({ui.planData.price})</strong></p>
                
                {/* PESTAÑAS DE LA CONSOLA */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #222', paddingBottom: '10px' }}>
                  {['monitor', 'terminal', 'files'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setConsoleTab(tab)}
                      style={consoleTab === tab ? {...Styles.Tab, background: ui.theme, color: '#fff'} : Styles.Tab}
                    >
                      {tab === 'monitor' ? 'Monitor' : tab === 'terminal' ? 'Terminal' : 'Files'}
                    </button>
                  ))}
                </div>

                {/* CONTENIDO SEGÚN PESTAÑA */}
                {consoleTab === 'monitor' && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '80px', marginBottom: '40px', flexWrap: 'wrap' }}>
                    <CircularProgress 
                      value={metrics.cpu} 
                      max={ui.planData.cpuPercent} 
                      color={metrics.cpu > ui.planData.cpuPercent ? '#ff0000' : '#00ff41'} 
                      label="CPU" 
                    />
                    <CircularProgress 
                      value={metrics.network} 
                      max={ui.planData.networkMB} 
                      color={metrics.network > ui.planData.networkMB ? '#ff0000' : '#00ff41'} 
                      label="Network (MB)" 
                    />
                  </div>
                )}

                {consoleTab === 'terminal' && (
                  <div style={Styles.TerminalContainer}>
                    <div style={Styles.TerminalHeader}>
                      <span>🖥️ CONSOLA DE SERVICIO</span>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {consoleStatus === 'running' && <span style={{ color: '#00ff41', fontSize: '12px' }}>● ACTIVO</span>}
                        {consoleStatus === 'starting' && <span style={{ color: '#ffaa00', fontSize: '12px' }}>● INICIANDO{consoleLoadingDots}</span>}
                        {consoleStatus === 'stopped' && <span style={{ color: '#ff0000', fontSize: '12px' }}>● DETENIDO</span>}
                        <button 
                          onClick={startConsole} 
                          style={Styles.StartBtn}
                          disabled={consoleStatus === 'starting'}
                        >
                          {consoleStatus === 'running' ? 'REINICIAR' : 'START'}
                        </button>
                      </div>
                    </div>
                    <div style={Styles.TerminalBody}>
                      {consoleStatus === 'starting' && (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                          <div className="alex-loader" style={{ margin: '0 auto 20px' }}></div>
                          <p style={{ color: '#ffaa00', fontFamily: 'monospace' }}>Iniciando servicios del sistema{consoleLoadingDots}</p>
                        </div>
                      )}
                      {consoleStatus === 'stopped' && (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#555', fontFamily: 'monospace' }}>
                          Consola detenida. Presione START para iniciar los servicios.
                        </div>
                      )}
                      {consoleStatus === 'running' && consoleLogs.map((log, i) => (
                        <div key={i} style={Styles.LogEntry}>
                          <span style={{ color: '#666', marginRight: '10px' }}>[{log.time}]</span>
                          <span style={{ color: '#00ff41' }}>{log.msg}</span>
                        </div>
                      ))}
                      {consoleStatus === 'running' && (
                        <div style={{ color: '#00ff41', fontFamily: 'monospace' }}>root@youtube-noads:~$ <span className="console-cursor">▋</span></div>
                      )}
                    </div>
                  </div>
                )}

                {consoleTab === 'files' && (
                  <div style={Styles.FilesContainer}>
                    <h4 style={{ color: '#aaa', marginBottom: '15px' }}>📁 Archivos del servidor</h4>
                    <div style={Styles.FileList}>
                      <div style={Styles.FileItem}>
                        <span>📄 package.json</span>
                        <span style={{ color: '#555', fontSize: '11px' }}> (solo lectura)</span>
                      </div>
                    </div>
                    <div style={Styles.FileViewer}>
                      <pre style={{ color: '#00ff41', fontFamily: 'monospace', fontSize: '13px', background: '#000', padding: '20px', borderRadius: '10px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                        {PACKAGE_JSON_CONTENT}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </>
      )}

      {/* OVERLAY DE ACTUALIZACIÓN DE PLAN (25 segundos) */}
      {ui.updatingPlan && (
        <div style={Styles.ModalOverlay}>
          <div style={Styles.UpdateCard}>
            <h2 style={{color: ui.theme, fontSize: '32px'}}>ACTUALIZANDO PLAN</h2>
            <div className="alex-loader" style={{margin: '30px auto'}}></div>
            <p style={{fontSize: '48px', fontWeight: 'bold', color: '#fff'}}>{ui.updateCountdown}s</p>
            <p style={{color: '#888', marginTop: '10px'}}>Aplicando {ALEX_CONFIG.PLANS[ui.selectedPlanForUpdate]?.name} a {ui.pendingPlanEmail}...</p>
          </div>
        </div>
      )}

      {/* MODAL DE PLANES */}
      {ui.showPlans && (
        <div style={Styles.ModalOverlay} onClick={() => setUi(p => ({...p, showPlans: false}))}>
          <div style={Styles.PlansCard} onClick={e => e.stopPropagation()}>
            <h2 style={Styles.PlansTitle}>PLANES DISPONIBLES</h2>
            <p style={{color: '#888', marginBottom: '30px'}}>Selecciona el plan que mejor se adapte a ti. Para contratar, acude a nuestro servidor de soporte.</p>
            <div style={Styles.PlansGrid}>
              {Object.entries(ALEX_CONFIG.PLANS).map(([key, plan]) => (
                <div key={key} style={{
                  ...Styles.PlanItem,
                  borderColor: key === ui.currentPlan ? ui.theme : '#222'
                }}>
                  <div style={Styles.PlanName}>{plan.name}</div>
                  <div style={Styles.PlanPrice}>{plan.price}</div>
                  <ul style={Styles.PlanFeatures}>
                    <li>{plan.networkMB} MB de red</li>
                    <li>{plan.cpuPercent}% de CPU</li>
                    <li>{plan.settingsLimited ? 'Ajustes limitados' : 'Ajustes completos'}</li>
                  </ul>
                  {key === ui.currentPlan && <div style={Styles.CurrentPlanBadge}>PLAN ACTUAL</div>}
                </div>
              ))}
            </div>
            <button onClick={() => setUi(p => ({...p, showPlans: false}))} style={Styles.CancelBtn}>CERRAR</button>
          </div>
        </div>
      )}

      {/* MODAL DE ASIGNACIÓN DE PLAN TRAS AÑADIR CORREO */}
      {ui.showPlanAssignment && (
        <div style={Styles.ModalOverlay}>
          <div style={Styles.PlanAssignmentCard}>
            <h2 style={{color: ui.theme, marginBottom: '20px'}}>Selecciona un plan para {ui.pendingPlanEmail}</h2>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'center', marginBottom: '25px'}}>
              {Object.entries(ALEX_CONFIG.PLANS).map(([key, plan]) => (
                <div key={key} style={{
                  ...Styles.PlanSelectorOption,
                  borderColor: key === ui.currentPlan ? ui.theme : '#333',
                  background: key === ui.currentPlan ? '#1a1a1a' : '#0a0a0a'
                }}>
                  <div style={Styles.PlanName}>{plan.name}</div>
                  <div style={Styles.PlanPrice}>{plan.price}</div>
                  <button 
                    onClick={() => startPlanUpdate(key)} 
                    style={Styles.SelectPlanBtn}
                  >
                    ASIGNAR
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setUi(p => ({...p, showPlanAssignment: false, pendingPlanEmail: null}))} style={Styles.CancelBtn}>
              CANCELAR
            </button>
          </div>
        </div>
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
            <h1 style={{color: ui.theme, margin: 0}}>YouTube-NoADs | COMMAND CENTER</h1>
            <div style={{display: 'flex', gap: '15px'}}>
               <button onClick={() => setUi(p => ({...p, adminTab: 'users'}))} style={ui.adminTab === 'users' ? Styles.AdminTabAct : Styles.AdminTab}>USUARIOS</button>
               <button onClick={() => setUi(p => ({...p, adminTab: 'logs'}))} style={ui.adminTab === 'logs' ? Styles.AdminTabAct : Styles.AdminTab}>REGISTROS</button>
               <button onClick={() => setUi(p => ({...p, adminTab: 'servers'}))} style={ui.adminTab === 'servers' ? Styles.AdminTabAct : Styles.AdminTab}>SERVIDORES</button>
               <button onClick={() => setUi(p => ({...p, isAdminOpen: false}))} style={Styles.ExitAdmin}>X</button>
            </div>
          </div>
          
          <div style={Styles.AdminBody}>
            {ui.adminTab === 'users' ? (
              <div style={Styles.AdminGrid}>
                <div style={Styles.AdminCol}>
                  <h3>✅ CORREOS VERIFICADOS</h3>
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
                <div style={Styles.AdminCol}>
                  <h3>🚫 BANEADOS</h3>
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
            ) : ui.adminTab === 'logs' ? (
              <div style={Styles.LogContainer}>
                {data.logs.map((l, i) => (
                  <div key={i} style={Styles.LogLine}>
                    <span style={{color: '#555'}}>[{new Date(l.t).toLocaleTimeString()}]</span>
                    <span style={{color: ui.theme}}> {l.u}:</span> {l.msg}
                  </div>
                ))}
              </div>
            ) : (
              <div style={Styles.AdminServerTab}>
                <h3>🔍 CONSULTAR SERVIDOR POR ID</h3>
                <div style={Styles.AdminActions}>
                  <input ref={adminServerIdRef} placeholder="Ej: WY-ISM-KEM-KDM" style={Styles.AdmInput} />
                  <button onClick={() => lookupServer(adminServerIdRef.current.value)} style={Styles.AddBtn}>BUSCAR</button>
                </div>
                {ui.serverDetails && (
                  <div style={Styles.ServerDetailsBox}>
                    <h4>Servidor: {ui.currentLookupId}</h4>
                    <div style={Styles.DetailsGrid}>
                      {Object.entries(ui.serverDetails).map(([key, value]) => (
                        <div key={key} style={Styles.DetailItem}>
                          <span style={{color: '#888'}}>{key}:</span>
                          <span>{typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value.toString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// ARQUITECTURA DE ESTILOS
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
  PlansBtn: { background: 'none', border: '2px solid #ff0000', color: '#ff0000', padding: '20px 40px', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', fontSize: '16px', transition: '0.3s' },
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
  NavUser: { display: 'flex', alignItems: 'center', gap: '15px' },
  UserAvatar: { width: '45px', height: '45px', borderRadius: '50%', border: '2px solid #111' },
  AdminCircle: { width: '45px', height: '45px', borderRadius: '50%', background: '#111', border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  LogoutBtn: { background: '#222', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' },

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

  // SETTINGS PANEL
  SettingsPanel: { maxWidth: '800px', margin: '0 auto', padding: '30px', background: '#050505', borderRadius: '30px', border: '1px solid #111' },
  SettingsTitle: { fontSize: '28px', marginBottom: '30px', color: '#fff' },
  SettingsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', marginBottom: '40px' },
  SettingItem: { display: 'flex', flexDirection: 'column', gap: '10px', background: '#0a0a0a', padding: '20px', borderRadius: '15px' },
  ServerIdBox: { textAlign: 'center', padding: '25px', background: '#000', borderRadius: '15px', border: '1px solid #222', marginTop: '20px' },

  // CONSOLE
  ConsolePanel: { maxWidth: '900px', margin: '0 auto', padding: '30px', background: '#050505', borderRadius: '30px', border: '1px solid #111' },
  TerminalContainer: { marginTop: '20px', background: '#0a0a0a', borderRadius: '15px', border: '1px solid #222', overflow: 'hidden' },
  TerminalHeader: { background: '#111', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', fontFamily: 'monospace' },
  StartBtn: { background: '#00ff41', color: '#000', border: 'none', padding: '8px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'monospace' },
  TerminalBody: { padding: '20px', maxHeight: '300px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '13px', background: '#000', minHeight: '150px' },
  LogEntry: { padding: '4px 0', borderBottom: '1px solid #0a0a0a' },
  FilesContainer: { marginTop: '20px' },
  FileList: { marginBottom: '15px' },
  FileItem: { background: '#0a0a0a', padding: '10px 15px', borderRadius: '8px', marginBottom: '5px', fontFamily: 'monospace', color: '#ccc' },
  FileViewer: { marginTop: '10px' },

  // PLANS
  PlansCard: { background: '#0a0a0a', padding: '60px', borderRadius: '40px', border: '1px solid #222', maxWidth: '900px', width: '100%', textAlign: 'center' },
  PlansTitle: { fontSize: '32px', marginBottom: '10px' },
  PlansGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', marginBottom: '30px' },
  PlanItem: { background: '#111', border: '2px solid #222', borderRadius: '20px', padding: '25px', textAlign: 'center', position: 'relative' },
  PlanName: { fontSize: '20px', fontWeight: '900', marginBottom: '10px' },
  PlanPrice: { fontSize: '24px', color: '#ff0000', marginBottom: '15px' },
  PlanFeatures: { listStyle: 'none', padding: 0, margin: 0, textAlign: 'left', color: '#aaa', fontSize: '14px', lineHeight: '1.8' },
  CurrentPlanBadge: { position: 'absolute', top: '-10px', right: '-10px', background: '#ff0000', color: '#fff', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' },

  // PLAN ASSIGNMENT MODAL
  PlanAssignmentCard: { background: '#0a0a0a', padding: '50px', borderRadius: '40px', border: '1px solid #222', textAlign: 'center', maxWidth: '700px', width: '100%' },
  PlanSelectorOption: { background: '#111', border: '2px solid #333', borderRadius: '15px', padding: '20px', textAlign: 'center', width: '150px' },
  SelectPlanBtn: { background: '#ff0000', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' },

  // UPDATE OVERLAY
  UpdateCard: { background: '#0a0a0a', padding: '60px', borderRadius: '40px', border: '1px solid #222', textAlign: 'center', maxWidth: '500px', width: '100%' },

  // ADMIN UI
  CommandCenter: { position: 'fixed', inset: '30px', background: '#050505', borderRadius: '40px', zIndex: 1000, display: 'flex', flexDirection: 'column', border: '1px solid #333', boxShadow: '0 0 200px #000' },
  AdminHeader: { padding: '30px 50px', borderBottom: '1px solid #111', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  AdminTabAct: { background: '#ff0000', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' },
  AdminTab: { background: '#111', color: '#555', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' },
  AdminBody: { flex: 1, padding: '40px', overflowY: 'auto' },
  AdminGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' },
  AdminCol: { background: '#0a0a0a', padding: '30px', borderRadius: '30px', border: '1px solid #111' },
  AdminActions: { display: 'flex', gap: '10px', marginBottom: '25px' },
  AdmInput: { flex: 1, background: '#000', border: '1px solid #222', borderRadius: '12px', padding: '12px', color: '#fff' },
  UserList: { display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' },
  UserItem: { background: '#050505', padding: '15px', borderRadius: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #111' },
  
  AddBtn: { background: '#00ff41', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' },
  BanBtn: { background: '#ff0000', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' },
  DelBtn: { background: '#111', color: '#555', border: 'none', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer' },
  UnbanBtn: { background: '#00ff41', color: '#000', border: 'none', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer' },
  ExitAdmin: { background: '#fff', color: '#000', border: 'none', width: '40px', height: '40px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' },
  
  LogContainer: { background: '#000', padding: '30px', borderRadius: '25px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #111' },
  LogLine: { padding: '8px 0', borderBottom: '1px solid #080808' },

  // ADMIN SERVER TAB
  AdminServerTab: { padding: '20px', background: '#0a0a0a', borderRadius: '20px' },
  ServerDetailsBox: { marginTop: '30px', background: '#000', padding: '25px', borderRadius: '20px', border: '1px solid #222' },
  DetailsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '20px' },
  DetailItem: { display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#111', borderRadius: '10px' },

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
    select, input[type="range"], input[type="color"] {
      background: #111;
      border: 1px solid #333;
      color: #fff;
      border-radius: 8px;
      padding: 8px;
      cursor: pointer;
    }
    select option { background: #000; }
    .console-cursor {
      animation: blink 1s step-end infinite;
    }
    @keyframes blink {
      50% { opacity: 0; }
    }
  `;
  document.head.appendChild(styleTag);
}
