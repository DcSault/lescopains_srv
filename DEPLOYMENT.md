# Guide de Déploiement - LesCopains

## 📦 Déploiement Complet en Production

### Pré-requis Serveur

**Minimum** :
- OS : Ubuntu 22.04 LTS ou Debian 12
- RAM : 4GB
- CPU : 2 cores
- Stockage : 20GB SSD
- Réseau : IPv4 publique fixe

**Recommandé** :
- RAM : 8GB
- CPU : 4 cores
- Stockage : 50GB SSD NVMe

### Étape 1 : Installation Docker

```bash
# Mettre à jour le système
sudo apt update && sudo apt upgrade -y

# Installer Docker
curl -fsSL https://get.docker.com | sh

# Ajouter votre user au groupe docker
sudo usermod -aG docker $USER
newgrp docker

# Installer Docker Compose v2 (plugin)
sudo apt install docker-compose-plugin

# Vérifier l'installation
docker --version
docker compose version
```

### Étape 2 : Configuration DNS

Configurez votre domaine (ex: `lescopains.example.com`) pour pointer vers l'IP publique de votre serveur :

```
Type A : lescopains.example.com → 203.0.113.42
```

Vérifiez la propagation :
```bash
nslookup lescopains.example.com
dig lescopains.example.com +short
```

### Étape 3 : Cloner le Projet

```bash
cd /opt
git clone https://github.com/yourorg/lescopains.git
cd lescopains
```

### Étape 4 : Créer les Dossiers de Données

```bash
mkdir -p data/{postgres,redis,uploads}
chmod -R 755 data
```

### Étape 5 : Générer les Secrets

```bash
# Générer des secrets forts
export JWT_SECRET=$(openssl rand -base64 32)
export DB_PASSWORD=$(openssl rand -base64 24)
export REDIS_PASSWORD=$(openssl rand -base64 24)
export SERVER_SIGNING_KEY=$(openssl rand -base64 32)

# Afficher pour copier
echo "JWT_SECRET=$JWT_SECRET"
echo "DB_PASSWORD=$DB_PASSWORD"
echo "REDIS_PASSWORD=$REDIS_PASSWORD"
echo "SERVER_SIGNING_KEY=$SERVER_SIGNING_KEY"

# Sauvegarder dans un fichier sécurisé
cat > /opt/lescopains/.secrets <<EOF
JWT_SECRET=$JWT_SECRET
DB_PASSWORD=$DB_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
SERVER_SIGNING_KEY=$SERVER_SIGNING_KEY
EOF

chmod 600 /opt/lescopains/.secrets
```

### Étape 6 : Configurer docker-compose.yml

Éditez le fichier `docker-compose.yml` :

```bash
nano docker-compose.yml
```

**Modifications obligatoires** :

1. **Ligne 31** - Domaine :
   ```yaml
   DOMAIN: votre-domaine.com
   ```

2. **Ligne 33** - Email Let's Encrypt :
   ```yaml
   ACME_EMAIL: admin@votre-domaine.com
   ```

3. **Ligne 52 et partout** - Mots de passe PostgreSQL :
   ```yaml
   DATABASE_URL: postgresql://lescopains:VOTRE_DB_PASSWORD@postgres:5432/lescopains
   ```

4. **Ligne 58 et partout** - Mot de passe Redis :
   ```yaml
   REDIS_PASSWORD: VOTRE_REDIS_PASSWORD
   ```

5. **Ligne 62** - JWT Secret :
   ```yaml
   JWT_SECRET: VOTRE_JWT_SECRET
   ```

6. **Ligne 68** - Server Signing Key :
   ```yaml
   SERVER_SIGNING_KEY: VOTRE_SERVER_SIGNING_KEY
   ```

7. **Lignes 156 et 213** - IP publique :
   ```bash
   # Obtenir votre IP publique
   curl ifconfig.me
   ```
   ```yaml
   RTC_ANNOUNCED_IP: VOTRE_IP_PUBLIQUE
   ```

**Automatiser avec sed** :

```bash
# Variables
export DOMAIN="lescopains.example.com"
export ACME_EMAIL="admin@example.com"
export PUBLIC_IP=$(curl -s ifconfig.me)

# Remplacements
sed -i "s/lescopains.example.com/$DOMAIN/g" docker-compose.yml
sed -i "s/admin@example.com/$ACME_EMAIL/g" docker-compose.yml
sed -i "s/YOUR_PUBLIC_IP_HERE/$PUBLIC_IP/g" docker-compose.yml
sed -i "s/CHANGE_ME_STRONG_PASSWORD_DB/$DB_PASSWORD/g" docker-compose.yml
sed -i "s/CHANGE_ME_STRONG_PASSWORD_REDIS/$REDIS_PASSWORD/g" docker-compose.yml
sed -i "s/CHANGE_ME_STRONG_JWT_SECRET_MIN_32_CHARS_RANDOM/$JWT_SECRET/g" docker-compose.yml
sed -i "s/CHANGE_ME_SERVER_SIGNING_KEY_BASE64/$SERVER_SIGNING_KEY/g" docker-compose.yml
```

### Étape 7 : Configurer le Firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw allow 443/udp comment 'HTTP/3 QUIC'
sudo ufw allow 40000:40100/udp comment 'WebRTC'
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw enable

# Vérifier
sudo ufw status
```

**Firewalld (CentOS/RHEL)** :
```bash
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=443/udp
sudo firewall-cmd --permanent --add-port=40000-40100/udp
sudo firewall-cmd --reload
```

### Étape 8 : Démarrer les Services

```bash
cd /opt/lescopains

# Pull des images (première fois)
docker compose pull

# Démarrer en arrière-plan
docker compose up -d

# Vérifier les logs
docker compose logs -f

# Vérifier que tout tourne
docker compose ps
```

**Sortie attendue** :
```
NAME                    STATUS              PORTS
lescopains-backend      Up (healthy)        3000/tcp
lescopains-caddy        Up                  80/tcp, 443/tcp, 443/udp
lescopains-frontend     Up                  3002/tcp
lescopains-mediasoup    Up (healthy)        3003/tcp, 40000-40100/udp
lescopains-postgres     Up (healthy)        5432/tcp
lescopains-redis        Up (healthy)        6379/tcp
lescopains-signaling    Up (healthy)        3001/tcp
```

### Étape 9 : Tests de Validation

```bash
# Test backend
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}

# Test frontend
curl http://localhost:3002
# → HTML de la page d'accueil

# Test HTTPS (après ~1min pour Let's Encrypt)
curl https://votre-domaine.com/health
# → {"status":"ok",...}

# Vérifier les certificats SSL
echo | openssl s_client -connect votre-domaine.com:443 -servername votre-domaine.com 2>/dev/null | openssl x509 -noout -dates
```

### Étape 10 : Créer un Utilisateur de Test

```bash
# Via API
curl -X POST https://votre-domaine.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@example.com",
    "password": "SecurePassword123!"
  }'
```

---

## 🔄 Mises à Jour Automatiques

### Méthode 1 : pull_policy: always (Activé par défaut)

À chaque redémarrage, Docker Compose pull automatiquement les dernières images :

```bash
# Redémarrer pour mettre à jour
docker compose down
docker compose pull
docker compose up -d
```

### Méthode 2 : Activer Watchtower

Décommenter les lignes 276-304 dans `docker-compose.yml` :

```yaml
watchtower:
  image: containrrr/watchtower:latest
  # ... (configuration)
```

Puis :
```bash
docker compose up -d watchtower
```

Watchtower vérifiera automatiquement toutes les heures et redémarrera les containers si de nouvelles images sont disponibles.

---

## 🔧 Maintenance

### Logs

```bash
# Logs en temps réel
docker compose logs -f

# Logs d'un service spécifique
docker compose logs -f backend

# 100 dernières lignes
docker compose logs --tail=100 caddy

# Depuis une date
docker compose logs --since 2025-11-09T10:00:00
```

### Backup Base de Données

```bash
# Dump PostgreSQL
docker compose exec postgres pg_dump -U lescopains lescopains > backup_$(date +%Y%m%d_%H%M%S).sql

# Restaurer
docker compose exec -T postgres psql -U lescopains lescopains < backup_20251109_120000.sql
```

### Backup Complet

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/lescopains"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Arrêter les services
cd /opt/lescopains
docker compose stop

# Backup des données
tar -czf $BACKUP_DIR/data_$DATE.tar.gz data/

# Dump PostgreSQL
docker compose exec postgres pg_dump -U lescopains lescopains > $BACKUP_DIR/db_$DATE.sql

# Redémarrer
docker compose start

# Garder seulement les 7 derniers backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete

echo "Backup terminé : $BACKUP_DIR"
```

Ajouter au crontab :
```bash
crontab -e
# Backup quotidien à 3h du matin
0 3 * * * /opt/lescopains/backup.sh >> /var/log/lescopains-backup.log 2>&1
```

### Monitoring

**Vérifier la santé** :
```bash
docker compose ps
```

**Ressources** :
```bash
docker stats
```

**Espace disque** :
```bash
df -h
du -sh /opt/lescopains/data/*
```

**Nettoyer Docker** :
```bash
# Supprimer images inutilisées
docker image prune -a

# Supprimer volumes orphelins
docker volume prune

# Nettoyage complet
docker system prune -a --volumes
```

---

## 🐛 Dépannage

### Problème : Caddy ne démarre pas (Port 80/443 occupé)

```bash
# Vérifier ce qui utilise le port
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443

# Arrêter Apache/Nginx
sudo systemctl stop apache2
sudo systemctl stop nginx
sudo systemctl disable apache2
sudo systemctl disable nginx

# Redémarrer Caddy
docker compose restart caddy
```

### Problème : Backend ne peut pas se connecter à PostgreSQL

```bash
# Vérifier que PostgreSQL est prêt
docker compose logs postgres

# Tester la connexion
docker compose exec postgres psql -U lescopains -c "\l"

# Si nécessaire, recréer la DB
docker compose down -v
docker compose up -d
```

### Problème : WebRTC ne fonctionne pas (pas d'audio/vidéo)

1. **Vérifier l'IP publique** :
   ```bash
   curl ifconfig.me
   ```

2. **Vérifier la configuration dans docker-compose.yml** :
   ```yaml
   RTC_ANNOUNCED_IP: <votre vraie IP publique>
   ```

3. **Vérifier le firewall** :
   ```bash
   sudo ufw status | grep 40000
   # Doit montrer : 40000:40100/udp ALLOW Anywhere
   ```

4. **Tester depuis le client** :
   - Ouvrir la console développeur (F12)
   - Vérifier les erreurs WebRTC
   - Tester sur https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

### Problème : Certificat SSL non généré

```bash
# Vérifier les logs Caddy
docker compose logs caddy | grep -i acme

# Vérifier que le domaine pointe bien vers votre serveur
nslookup votre-domaine.com

# Vérifier que le port 80 est accessible de l'extérieur
curl http://votre-domaine.com/health

# Forcer le renouvellement
docker compose restart caddy
```

### Problème : Latence élevée

```bash
# Vérifier les ressources
docker stats

# Si CPU >80% : Augmenter le nombre de workers mediasoup
# docker-compose.yml ligne 206 :
MEDIASOUP_NUM_WORKERS: 4

# Si RAM >90% : Augmenter la RAM du serveur
# Ou réduire MAX_PARTICIPANTS_PER_ROOM (ligne 222)

# Redémarrer
docker compose restart mediasoup
```

---

## 📊 Métriques de Performance

### Objectifs

| Métrique | Objectif | Commande de test |
|----------|----------|------------------|
| Latence messages texte | <50ms | Console frontend `socket.emit` |
| Latence audio WebRTC | <100ms | `peerConnection.getStats()` |
| CPU serveur | <60% | `docker stats` |
| RAM utilisée | <70% | `free -h` |
| Temps de réponse API | <200ms | `curl -w "%{time_total}" https://...` |

### Tests de Charge

**Apache Bench** :
```bash
# 1000 requêtes, 10 concurrentes
ab -n 1000 -c 10 https://votre-domaine.com/health
```

**Artillery** :
```bash
npm install -g artillery

# Créer artillery.yml
artillery quick --count 100 --num 10 https://votre-domaine.com/api/auth/login
```

---

## 🔐 Sécurité Supplémentaire

### Fail2Ban (Protection DDoS)

```bash
sudo apt install fail2ban

# Configurer
sudo nano /etc/fail2ban/jail.local
```

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[docker-caddy]
enabled = true
filter = docker-caddy
logpath = /opt/lescopains/caddy/access.log
maxretry = 10
```

### Authentification 2FA (TODO dans le code)

À implémenter dans `backend/src/routes/auth.ts` avec `speakeasy` ou `otplib`.

### Rate Limiting Avancé

Le rate limiting est déjà configuré dans le backend (100 req/min). Pour ajuster :

```yaml
# docker-compose.yml ligne 74
RATE_LIMIT_MAX: 50 # Réduire à 50
```

---

## 🚀 Optimisations Avancées

### 1. CDN pour Assets Statiques

Configurer Cloudflare devant Caddy :
- DNS → Cloudflare
- Proxy activé (orange cloud)
- SSL/TLS : Full (Strict)
- Cache avatars, images

### 2. PostgreSQL Read Replicas

Pour >1000 users simultanés, ajouter un replica PostgreSQL.

### 3. Redis Cluster

Pour scaling horizontal, remplacer Redis simple par un cluster.

### 4. Serveurs Dédiés pour Composants

- Serveur 1 : Caddy + Frontend
- Serveur 2 : Backend + PostgreSQL
- Serveur 3 : Signaling + mediasoup + Redis

---

## ✅ Checklist de Déploiement

- [ ] DNS configuré et propagé
- [ ] Secrets générés et sauvegardés
- [ ] `docker-compose.yml` modifié (domaine, IP, mots de passe)
- [ ] Firewall configuré (80, 443, 40000-40100)
- [ ] Services démarrés (`docker compose up -d`)
- [ ] Healthchecks passent (`docker compose ps`)
- [ ] SSL actif (`curl https://...`)
- [ ] Utilisateur de test créé
- [ ] WebRTC testé (audio/vidéo fonctionne)
- [ ] Backup configuré (cron)
- [ ] Monitoring en place

---

**Besoin d'aide ?** Ouvrez une issue sur GitHub ou consultez la [documentation complète](./ARCHITECTURE.md).
