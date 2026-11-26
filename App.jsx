// App.jsx - Versión simplificada: Solo Login
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

// --- Configuración de Firebase (extraída del código original) ---
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD1zUmhiUVDv-ZYyJF7vTwGaS1AO9t9jiE",
  authDomain: "alexhub-eefdf.firebaseapp.com",
  databaseURL: "https://alexhub-eefdf-default-rtdb.firebaseio.com",
  projectId: "alexhub-eefdf",
  storageBucket: "alexhub-eefdf.firebasestorage.app",
  messagingSenderId: "463204402982",
  appId: "1:463204402982:web:fe740a662fbfd50452a3e7"
};

// Inicializar Firebase
const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Configurar persistencia de sesión
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Error configurando persistencia:", error);
});

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = () => {
    signInWithPopup(auth, googleProvider).catch((error) => {
      console.error("Error en el login:", error);
    });
  };

  const handleLogout = () => {
    signOut(auth).catch((error) => {
      console.error("Error al cerrar sesión:", error);
    });
  };

  if (loading) {
    return <div style={styles.loading}>Cargando...</div>;
  }

  // --- Pantalla de LOGIN ---
  if (!user) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>YouTube-NoADs</h1>
        <p style={styles.subtitle}>Inicia sesión para continuar</p>
        <button onClick={handleLogin} style={styles.button}>
          Iniciar sesión con Google
        </button>
      </div>
    );
  }

  // --- Pantalla post-login (opcional, solo para mostrar que se ha autenticado) ---
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>¡Bienvenido!</h1>
      <p style={styles.subtitle}>Has iniciado sesión como: {user.email}</p>
      <button onClick={handleLogout} style={styles.button}>
        Cerrar sesión
      </button>
    </div>
  );
}

// Estilos mínimos en línea para no depender de CSS externo
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#0f0f0f',
    color: '#fff',
    fontFamily: 'Arial, sans-serif',
    padding: '20px',
    textAlign: 'center',
  },
  title: {
    fontSize: '2.5rem',
    marginBottom: '10px',
    color: '#ff0000',
  },
  subtitle: {
    fontSize: '1.2rem',
    marginBottom: '30px',
    color: '#aaa',
  },
  button: {
    padding: '12px 24px',
    fontSize: '1rem',
    backgroundColor: '#ff0000',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#0f0f0f',
    color: '#fff',
    fontFamily: 'Arial, sans-serif',
  },
};

export default App;
