# LesCopains - Plateforme de Communication Sécurisée

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-22_LTS-brightgreen)
![PostgreSQL](https://img.shields.io/badge/postgresql-17-blue)

**Alternative moderne et sécurisée à Discord**, avec chiffrement de bout en bout, latence minimale, et architecture optimisée pour des ressources limitées.

---

## 🚀 Fonctionnalités

### ✅ Communication Temps Réel
- **Serveurs & Salons** : Organisation hiérarchique comme Discord
- **Messages textuels** : Mentions, réactions, threads, épingles
- **Salons vocaux** : Audio HD, mute, volume individuel
- **Partage d'écran** : Qualité 1080p, annotations
- **Messages privés** : 1:1 et groupes

### 🔒 Sécurité & Confidentialité
- **E2EE strict** : Signal Protocol pour messages privés
- **WebRTC E2EE** : Insertable Streams pour audio/vidéo
- **Zero-knowledge** : Le serveur ne peut pas lire les messages chiffrés
- **Vérification identité** : QR codes, Safety Numbers

### ⚡ Performance
- **Latence** : <50ms messages texte, <80ms audio
- **Légèreté** : Frontend 15KB, RAM minimum 4GB
- **HTTP/3** : QUIC pour vitesse maximale
- **Optimisations** : Code splitting, lazy loading, compression

### 🐳 Déploiement
- **Docker Compose** : Stack complète en une commande
- **Mises à jour auto** : `pull_policy: always` + Watchtower optionnel
- **Production-ready** : Healthchecks, logging, monitoring

---

## 📋 Pré-requis

### Serveur
- **OS** : Linux (Ubuntu 22.04 LTS / Debian 12)
- **RAM** : 4GB minimum (8GB recommandé)
- **CPU** : 2 cores (4 cores pour >100 users)
- **Stockage** : 20GB SSD
- **Réseau** : IPv4 publique, ports 80, 443, 40000-40100

### Logiciels
- **Docker** : 24.0+
- **Docker Compose** : 2.20+ (plugin v2)
- **Domaine** : DNS pointant vers votre serveur

---

## 🛠️ Installation Rapide

### 1. Installer Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Installer Docker Compose v2
sudo apt install docker-compose-plugin
```

### 2. Cloner le projet

```bash
git clone https://github.com/yourorg/lescopains.git
cd lescopains
```

### 3. Configurer

```bash
# Créer les dossiers de données
mkdir -p data/{postgres,redis,uploads}

# Générer des secrets forts
export JWT_SECRET=$(openssl rand -base64 32)
export DB_PASSWORD=$(openssl rand -base64 24)
export REDIS_PASSWORD=$(openssl rand -base64 24)
export SERVER_SIGNING_KEY=$(openssl rand -base64 32)

echo "JWT_SECRET=$JWT_SECRET"
echo "DB_PASSWORD=$DB_PASSWORD"
echo "REDIS_PASSWORD=$REDIS_PASSWORD"
echo "SERVER_SIGNING_KEY=$SERVER_SIGNING_KEY"
```

**Éditer `docker-compose.yml`** :
1. Ligne 31 : Remplacer `DOMAIN: lescopains.example.com` par votre domaine
2. Ligne 33 : Remplacer `ACME_EMAIL: admin@example.com`
3. Lignes 156, 213 : Remplacer `RTC_ANNOUNCED_IP: YOUR_PUBLIC_IP_HERE` par votre IP publique
4. Remplacer tous les `CHANGE_ME_*` par les secrets générés ci-dessus

### 4. Lancer

```bash
docker compose up -d
```

### 5. Vérifier

```bash
# Statut des services
docker compose ps

# Logs en temps réel
docker compose logs -f

# Tester l'API
curl https://votre-domaine.com/health
# Réponse attendue : {"status":"ok","timestamp":"2025-11-09T..."}
```

---

## 📚 Architecture

Voir [ARCHITECTURE.md](./ARCHITECTURE.md) pour la documentation complète.

```
┌─────────────┐
│   Internet  │
└──────┬──────┘
       │
  ┌────▼─────┐
  │  Caddy   │ HTTP/3 + Auto-HTTPS
  │  Proxy   │
  └────┬─────┘
       │
   ┌───┴────────────────┐
   │                    │
┌──▼────┐        ┌──────▼──────┐
│Backend│        │  Signaling  │
│Fastify│        │  Socket.IO  │
└───┬───┘        └──────┬──────┘
    │                   │
    └────┬──────────────┘
         │
    ┌────▼─────┐
    │PostgreSQL│
    │  Redis   │
    │mediasoup │
    └──────────┘
```

### Stack Technologique

| Composant | Technologie | Version | Justification |
|-----------|-------------|---------|---------------|
| Backend | Node.js + Fastify | 22 LTS + 5.x | Performance, TypeScript natif |
| Frontend | SvelteKit | 2.x | Bundle 70% plus léger que React |
| Database | PostgreSQL | 17 | ACID, JSON natif, fiabilité |
| WebRTC | mediasoup | 3.15 | Latence <80ms, E2EE natif |
| WebSocket | Socket.IO | 4.8 | Auto-reconnexion, rooms |
| E2EE | libsignal-client | 0.57 | Signal Protocol officiel |
| Proxy | Caddy | 2.8 | HTTP/3, auto-HTTPS, simple |
| Cache | Redis | 7.4 | Présence, sessions, pub/sub |

---

## 🔧 Configuration Avancée

### Variables d'Environnement Clés

**Backend (`docker-compose.yml` lignes 64-94)** :
```yaml
DATABASE_URL: postgresql://user:pass@postgres:5432/db
JWT_SECRET: <32+ caractères aléatoires>
JWT_ACCESS_EXPIRY: 15m
JWT_REFRESH_EXPIRY: 7d
RATE_LIMIT_MAX: 100
MAX_FILE_SIZE: 10485760 # 10MB
```

**Signaling (lignes 132-161)** :
```yaml
RTC_ANNOUNCED_IP: <votre IP publique>
RTC_MIN_PORT: 40000
RTC_MAX_PORT: 40100
WS_PING_INTERVAL: 30000
PRESENCE_TTL: 60
```

**mediasoup (lignes 193-221)** :
```yaml
MEDIASOUP_NUM_WORKERS: 2 # Auto-détecte CPU cores
ENABLE_SIMULCAST: "true"
MAX_PARTICIPANTS_PER_ROOM: 50
```

### Mises à Jour Automatiques

**Méthode 1 : pull_policy (activé par défaut)**
```yaml
services:
  backend:
    pull_policy: always # Pull la dernière image à chaque `docker compose up`
```

**Méthode 2 : Watchtower (optionnel)**

Décommenter les lignes 276-304 dans `docker-compose.yml` :
```yaml
watchtower:
  image: containrrr/watchtower:latest
  environment:
    WATCHTOWER_POLL_INTERVAL: 3600 # Check toutes les heures
    WATCHTOWER_CLEANUP: "true"
```

**Redémarrer pour mettre à jour** :
```bash
docker compose down && docker compose pull && docker compose up -d
```

### Firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw allow 40000:40100/udp
sudo ufw enable
```

---

## 🧪 Tests & Validation

### Tester la latence

**Messages texte** :
```javascript
// Dans la console du frontend
const start = Date.now();
socket.emit('message:send', { content: 'test' }, () => {
  console.log('Latency:', Date.now() - start, 'ms');
});
// Objectif : <50ms
```

**Audio WebRTC** :
```javascript
const stats = await peerConnection.getStats();
stats.forEach(report => {
  if (report.type === 'candidate-pair' && report.state === 'succeeded') {
    console.log('RTT:', report.currentRoundTripTime * 1000, 'ms');
  }
});
// Objectif : <100ms
```

### Vérifier E2EE

1. User A envoie un message "Secret"
2. Inspecter la base de données :
   ```bash
   docker compose exec postgres psql -U lescopains -c "SELECT content FROM dm_messages LIMIT 1;"
   ```
   → Le contenu doit être du ciphertext (base64), pas "Secret"

3. User B reçoit et déchiffre → Affiche "Secret"
4. Comparer les Safety Numbers entre A et B

### Tests de charge

**Artillery** :
```yaml
# artillery-test.yml
config:
  target: 'https://votre-domaine.com'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - flow:
      - post:
          url: '/api/messages'
          json:
            channelId: '{{ channelId }}'
            content: 'Load test'
```

```bash
docker run --rm -v $(pwd):/scripts artilleryio/artillery:latest run /scripts/artillery-test.yml
```

---

## 📊 Monitoring

### Logs

```bash
# Tous les services
docker compose logs -f

# Service spécifique
docker compose logs -f backend

# Dernières 100 lignes
docker compose logs --tail=100 signaling
```

### Ressources

```bash
# CPU/RAM en temps réel
docker stats

# Santé des services
docker compose ps
```

### Healthchecks

Tous les services exposent `/health` :
```bash
curl http://localhost:3000/health # Backend
curl http://localhost:3001/health # Signaling
curl http://localhost:3003/health # mediasoup
```

---

## 🔄 Maintenance

### Backup Base de Données

```bash
# Dump PostgreSQL
docker compose exec postgres pg_dump -U lescopains lescopains > backup_$(date +%Y%m%d).sql

# Restaurer
docker compose exec -T postgres psql -U lescopains lescopains < backup_20251109.sql
```

### Backup Complet

```bash
# Arrêter les services
docker compose down

# Backup data
tar -czf backup_data_$(date +%Y%m%d).tar.gz data/

# Redémarrer
docker compose up -d
```

### Nettoyage Docker

```bash
# Supprimer images inutilisées
docker image prune -a

# Supprimer volumes orphelins
docker volume prune

# Libérer espace
docker system prune -a --volumes
```

---

## 🐛 Dépannage

### Problème : Caddy ne démarre pas

**Cause** : Port 80/443 déjà utilisé

```bash
# Vérifier
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443

# Arrêter Apache/Nginx
sudo systemctl stop apache2
sudo systemctl stop nginx
```

### Problème : Backend ne se connecte pas à PostgreSQL

**Vérifier** :
```bash
docker compose logs postgres
docker compose exec postgres psql -U lescopains -c "\l"
```

**Solution** : Attendre que PostgreSQL soit prêt (healthcheck)

### Problème : WebRTC ne fonctionne pas

**Vérifier IP publique** :
```bash
curl ifconfig.me
```

**Mettre à jour `docker-compose.yml`** :
```yaml
RTC_ANNOUNCED_IP: <IP affichée>
```

**Vérifier firewall** :
```bash
sudo ufw status
sudo ufw allow 40000:40100/udp
```

### Problème : Latence élevée

**Vérifier** :
```bash
docker stats # CPU >80% ?
docker compose logs mediasoup | grep "WARNING"
```

**Solutions** :
- Augmenter `MEDIASOUP_NUM_WORKERS`
- Réduire `MAX_PARTICIPANTS_PER_ROOM`
- Upgrader serveur (plus de CPU/RAM)

---

## 📖 Documentation Complète

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** : Stack technique détaillée, justifications
- **[API.md](./backend/API.md)** : Routes REST, schémas, exemples
- **[E2EE.md](./docs/E2EE.md)** : Protocole Signal, gestion clés, multi-devices
- **[WEBRTC.md](./docs/WEBRTC.md)** : Workflow WebRTC, insertable streams
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** : Guide de contribution

---

## 🤝 Contribution

Les contributions sont bienvenues ! Voir [CONTRIBUTING.md](./CONTRIBUTING.md).

### Développement Local

```bash
# Cloner
git clone https://github.com/yourorg/lescopains.git
cd lescopains

# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

---

## 📜 Licence

MIT License - Voir [LICENSE](./LICENSE)

---

## 🙏 Remerciements

- **Signal Foundation** : libsignal-client
- **Versatica** : mediasoup
- **Fastify Team** : Framework ultra-performant
- **Svelte Team** : Meilleur DX frontend

---

## 📞 Support

- **Issues** : https://github.com/yourorg/lescopains/issues
- **Discussions** : https://github.com/yourorg/lescopains/discussions
- **Email** : support@lescopains.example.com

---

**Construit avec ❤️ par la communauté open source**
