import React, { useState, useEffect } from 'react';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ============================================================
// CONFIGURACIÓN DE FIREBASE (la misma de tu proyecto original)
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD1zUmhiUVDv-ZYyJF7vTwGaS1AO9t9jiE",
  authDomain: "alexhub-eefdf.firebaseapp.com",
  databaseURL: "https://alexhub-eefdf-default-rtdb.firebaseio.com",
  projectId: "alexhub-eefdf",
  storageBucket: "alexhub-eefdf.firebasestorage.app",
  messagingSenderId: "463204402982",
  appId: "1:463204402982:web:fe740a662fbfd50452a3e7"
};

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

setPersistence(auth, browserLocalPersistence).catch(console.error);

// ============================================================
// ⚠️ PON AQUÍ TU API KEY DE YOUTUBE DATA API v3 (gratis)
// Cómo obtenerla: https://console.cloud.google.com/apis/credentials
// ============================================================
const YT_API_KEY = "AIzaSyDJeGQOIWp9mM6e8JAf5BgeRq9KFbliz0o";

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = () =>
    signInWithPopup(auth, googleProvider).catch(console.error);

  const handleLogout = () => signOut(auth).catch(console.error);

  if (loading) return <div style={s.loading}>Cargando...</div>;
  if (!user) return <LoginScreen onLogin={handleLogin} />;
  return <YouTubeApp user={user} onLogout={handleLogout} />;
}

// ============================================================
// PANTALLA DE LOGIN
// ============================================================
function LoginScreen({ onLogin }) {
  return (
    <div style={s.centerScreen}>
      <h1 style={s.logoTitle}>▶ YouTube-NoADs</h1>
      <p style={s.subtitle}>Inicia sesión para continuar</p>
      <button onClick={onLogin} style={s.redBtn}>
        Iniciar sesión con Google
      </button>
    </div>
  );
}

// ============================================================
// APP DE YOUTUBE (post-login)
// ============================================================
function YouTubeApp({ user, onLogout }) {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Al entrar, carga los videos más populares
  useEffect(() => {
    loadTrending();
  }, []);

  const loadTrending = async () => {
    setLoading(true);
    setError("");
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&maxResults=24&regionCode=ES&key=${YT_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      setVideos(data.items || []);
    } catch (err) {
      setError("Error cargando videos: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSelectedVideo(null);
    setLoading(true);
    setError("");
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=24&q=${encodeURIComponent(
        query
      )}&type=video&key=${YT_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      setVideos(data.items || []);
    } catch (err) {
      setError("Error buscando: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.ytRoot}>
      {/* Header */}
      <header style={s.header}>
        <div
          style={s.logoArea}
          onClick={() => {
            setSelectedVideo(null);
            loadTrending();
          }}
        >
          <span style={s.logoIcon}>▶</span>
          <span style={s.logoText}>YouTube-NoADs</span>
        </div>

        <form onSubmit={handleSearch} style={s.searchForm}>
          <input
            style={s.searchInput}
            type="text"
            placeholder="Buscar en YouTube..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" style={s.searchBtn}>🔍</button>
        </form>

        <div style={s.userArea}>
          <img src={user.photoURL} alt="avatar" style={s.avatar} />
          <span style={s.userName}>{user.displayName || user.email}</span>
          <button onClick={onLogout} style={s.logoutBtn}>Salir</button>
        </div>
      </header>

      {/* Contenido */}
      <main style={s.main}>
        {selectedVideo ? (
          <VideoPlayer
            videoId={selectedVideo}
            onBack={() => setSelectedVideo(null)}
          />
        ) : (
          <>
            {loading && <p style={s.info}>Cargando...</p>}
            {error && <p style={{ ...s.info, color: "#ff4444" }}>{error}</p>}
            {!loading && !error && videos.length === 0 && (
              <p style={s.info}>No hay videos. Haz una búsqueda.</p>
            )}
            <div style={s.grid}>
              {videos.map((v) => {
                const videoId =
                  v.id?.videoId || (typeof v.id === "string" ? v.id : null);
                const snippet = v.snippet;
                if (!videoId || !snippet) return null;
                return (
                  <div
                    key={videoId}
                    style={s.card}
                    onClick={() => setSelectedVideo(videoId)}
                  >
                    <div style={s.thumbWrap}>
                      <img
                        src={snippet.thumbnails?.medium?.url}
                        alt={snippet.title}
                        style={s.thumb}
                      />
                    </div>
                    <div style={s.cardInfo}>
                      <h3 style={s.cardTitle}>{snippet.title}</h3>
                      <p style={s.cardChannel}>{snippet.channelTitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ============================================================
// REPRODUCTOR
// ============================================================
function VideoPlayer({ videoId, onBack }) {
  return (
    <div style={s.playerWrap}>
      <button onClick={onBack} style={s.backBtn}>← Volver</button>
      <div style={s.iframeWrap}>
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title="YouTube video"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={s.iframe}
        />
      </div>
    </div>
  );
}

// ============================================================
// ESTILOS
// ============================================================
const s = {
  loading: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f0f0f",
    color: "#fff",
    fontFamily: "Arial, sans-serif",
  },
  centerScreen: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f0f0f",
    color: "#fff",
    fontFamily: "Arial, sans-serif",
    padding: 20,
  },
  logoTitle: { fontSize: "2.5rem", color: "#ff0000", margin: 0 },
  subtitle: { color: "#aaa", marginTop: 10, marginBottom: 30 },
  redBtn: {
    padding: "12px 28px",
    fontSize: "1rem",
    background: "#ff0000",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: "bold",
  },
  ytRoot: {
    minHeight: "100vh",
    background: "#0f0f0f",
    color: "#fff",
    fontFamily: "Arial, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "10px 20px",
    background: "#202020",
    borderBottom: "1px solid #333",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  logoArea: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    userSelect: "none",
  },
  logoIcon: { color: "#ff0000", fontSize: "1.6rem", fontWeight: "bold" },
  logoText: { fontSize: "1.2rem", fontWeight: "bold" },
  searchForm: { display: "flex", flex: 1, maxWidth: 600, margin: "0 auto" },
  searchInput: {
    flex: 1,
    padding: "8px 14px",
    background: "#121212",
    border: "1px solid #333",
    borderRadius: "20px 0 0 20px",
    color: "#fff",
    outline: "none",
    fontSize: "0.95rem",
  },
  searchBtn: {
    padding: "8px 18px",
    background: "#333",
    border: "1px solid #333",
    borderLeft: "none",
    borderRadius: "0 20px 20px 0",
    cursor: "pointer",
    color: "#fff",
  },
  userArea: { display: "flex", alignItems: "center", gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: "50%" },
  userName: { fontSize: "0.9rem", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  logoutBtn: {
    padding: "6px 12px",
    background: "transparent",
    border: "1px solid #555",
    color: "#fff",
    borderRadius: 6,
    cursor: "pointer",
  },
  main: { padding: 20, maxWidth: 1400, margin: "0 auto" },
  info: { textAlign: "center", padding: 40, color: "#aaa" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 20,
  },
  card: { cursor: "pointer", borderRadius: 8, overflow: "hidden", background: "#181818", transition: "transform 0.15s" },
  thumbWrap: { width: "100%", aspectRatio: "16/9", background: "#000" },
  thumb: { width: "100%", height: "100%", objectFit: "cover" },
  cardInfo: { padding: 10 },
  cardTitle: { fontSize: "0.95rem", margin: 0, lineHeight: 1.3, maxHeight: "2.6em", overflow: "hidden" },
  cardChannel: { color: "#aaa", fontSize: "0.85rem", marginTop: 6, margin: 0 },
  playerWrap: { padding: 10 },
  backBtn: {
    padding: "8px 16px",
    marginBottom: 12,
    background: "#333",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  iframeWrap: { width: "100%", aspectRatio: "16/9", background: "#000", borderRadius: 8, overflow: "hidden" },
  iframe: { width: "100%", height: "100%", border: "none" },
};

export default App;
