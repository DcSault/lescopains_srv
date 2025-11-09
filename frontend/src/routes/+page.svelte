<script lang="ts">
  import { onMount } from 'svelte';
  import { io } from 'socket.io-client';
  
  let connected = $state(false);
  let messages = $state<string[]>([]);
  
  const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api';
  const WS_URL = import.meta.env.PUBLIC_WS_URL || 'ws://localhost:3001/ws';
  
  onMount(() => {
    // Test connexion API
    fetch(`${API_URL.replace('/api', '')}/health`)
      .then(res => res.json())
      .then(data => {
        console.log('Backend health:', data);
        connected = true;
      })
      .catch(err => {
        console.error('Backend connection failed:', err);
      });
      
    // WebSocket connection (exemple)
    const socket = io(WS_URL);
    
    socket.on('connect', () => {
      console.log('WebSocket connected');
      messages = [...messages, 'WebSocket connected'];
    });
    
    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      messages = [...messages, 'WebSocket disconnected'];
    });
    
    return () => {
      socket.disconnect();
    };
  });
</script>

<div class="container">
  <header>
    <h1>🎮 LesCopains</h1>
    <p>Plateforme de communication sécurisée - E2EE</p>
  </header>
  
  <main>
    <div class="status">
      <div class="status-indicator" class:connected>
        {connected ? '🟢' : '🔴'}
      </div>
      <span>
        {connected ? 'Connecté au backend' : 'Connexion au backend...'}
      </span>
    </div>
    
    <div class="features">
      <h2>Fonctionnalités</h2>
      <ul>
        <li>✅ Chiffrement de bout en bout (Signal Protocol)</li>
        <li>✅ Salons vocaux HD</li>
        <li>✅ Partage d'écran</li>
        <li>✅ Messages privés sécurisés</li>
        <li>✅ Serveurs & rôles</li>
        <li>✅ Latence <50ms</li>
      </ul>
    </div>
    
    <div class="tech-stack">
      <h2>Stack Technique 2025</h2>
      <div class="stack-grid">
        <div class="stack-item">
          <strong>Frontend</strong>
          <span>SvelteKit 2.x</span>
        </div>
        <div class="stack-item">
          <strong>Backend</strong>
          <span>Node.js 22 + Fastify</span>
        </div>
        <div class="stack-item">
          <strong>Database</strong>
          <span>PostgreSQL 17</span>
        </div>
        <div class="stack-item">
          <strong>WebRTC</strong>
          <span>mediasoup 3.15</span>
        </div>
        <div class="stack-item">
          <strong>E2EE</strong>
          <span>libsignal-client</span>
        </div>
        <div class="stack-item">
          <strong>Proxy</strong>
          <span>Caddy HTTP/3</span>
        </div>
      </div>
    </div>
    
    {#if messages.length > 0}
      <div class="messages">
        <h3>Événements</h3>
        <ul>
          {#each messages as msg}
            <li>{msg}</li>
          {/each}
        </ul>
      </div>
    {/if}
    
    <div class="cta">
      <a href="/login" class="button">Se connecter</a>
      <a href="/register" class="button secondary">Créer un compte</a>
    </div>
  </main>
  
  <footer>
    <p>LesCopains v1.0.0 - Open Source MIT License</p>
    <p>Construit avec ❤️ en 2025</p>
  </footer>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    min-height: 100vh;
  }
  
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  header {
    text-align: center;
    margin-bottom: 3rem;
  }
  
  h1 {
    font-size: 3.5rem;
    margin: 0;
    background: linear-gradient(to right, #fff, #e0e7ff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  header p {
    font-size: 1.25rem;
    opacity: 0.9;
  }
  
  main {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }
  
  .status {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
  }
  
  .status-indicator {
    font-size: 1.5rem;
  }
  
  .features {
    margin: 2rem 0;
  }
  
  .features ul {
    list-style: none;
    padding: 0;
  }
  
  .features li {
    padding: 0.5rem 0;
    font-size: 1.1rem;
  }
  
  .tech-stack {
    margin: 2rem 0;
  }
  
  .stack-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }
  
  .stack-item {
    background: rgba(255, 255, 255, 0.1);
    padding: 1rem;
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .stack-item strong {
    color: #fbbf24;
  }
  
  .messages {
    margin: 2rem 0;
    background: rgba(0, 0, 0, 0.2);
    padding: 1rem;
    border-radius: 0.5rem;
  }
  
  .messages ul {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0 0;
  }
  
  .messages li {
    padding: 0.25rem 0;
    font-family: monospace;
    font-size: 0.9rem;
  }
  
  .cta {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 2rem;
  }
  
  .button {
    padding: 1rem 2rem;
    border-radius: 0.5rem;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    transition: all 0.2s;
    background: white;
    color: #667eea;
  }
  
  .button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }
  
  .button.secondary {
    background: transparent;
    border: 2px solid white;
    color: white;
  }
  
  footer {
    text-align: center;
    margin-top: 3rem;
    opacity: 0.8;
  }
  
  footer p {
    margin: 0.5rem 0;
  }
</style>
