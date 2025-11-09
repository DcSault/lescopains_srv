#!/bin/bash

# ==============================================================================
# LesCopains - Script de Démarrage Rapide
# ==============================================================================
# Usage: ./quick-start.sh
# ==============================================================================

set -e

echo "🎮 LesCopains - Démarrage Rapide"
echo "=================================="
echo ""

# Vérifier que Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé."
    echo "Installez Docker : curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose v2 n'est pas installé."
    echo "Installez : sudo apt install docker-compose-plugin"
    exit 1
fi

echo "✅ Docker et Docker Compose détectés"
echo ""

# Créer les dossiers nécessaires
echo "📁 Création des dossiers de données..."
mkdir -p data/{postgres,redis,uploads}
chmod -R 755 data
echo "✅ Dossiers créés"
echo ""

# Générer les secrets
echo "🔐 Génération des secrets..."
export JWT_SECRET=$(openssl rand -base64 32)
export DB_PASSWORD=$(openssl rand -base64 24)
export REDIS_PASSWORD=$(openssl rand -base64 24)
export SERVER_SIGNING_KEY=$(openssl rand -base64 32)

# Sauvegarder les secrets
cat > .secrets <<EOF
# Secrets générés le $(date)
# CONSERVEZ CE FICHIER EN LIEU SÛR !

JWT_SECRET=$JWT_SECRET
DB_PASSWORD=$DB_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
SERVER_SIGNING_KEY=$SERVER_SIGNING_KEY
EOF
chmod 600 .secrets

echo "✅ Secrets générés et sauvegardés dans .secrets"
echo ""

# Demander le domaine
read -p "🌐 Votre domaine (ex: lescopains.example.com) : " DOMAIN
if [ -z "$DOMAIN" ]; then
    DOMAIN="localhost"
fi

read -p "📧 Email pour Let's Encrypt (ex: admin@example.com) : " ACME_EMAIL
if [ -z "$ACME_EMAIL" ]; then
    ACME_EMAIL="admin@example.com"
fi

# Obtenir l'IP publique
echo "🌍 Détection de l'IP publique..."
PUBLIC_IP=$(curl -s ifconfig.me)
if [ -z "$PUBLIC_IP" ]; then
    read -p "❓ IP publique non détectée. Entrez-la manuellement : " PUBLIC_IP
fi
echo "✅ IP publique : $PUBLIC_IP"
echo ""

# Configurer docker-compose.yml
echo "⚙️  Configuration de docker-compose.yml..."
cp docker-compose.yml docker-compose.yml.bak

sed -i "s/lescopains.example.com/$DOMAIN/g" docker-compose.yml
sed -i "s/admin@example.com/$ACME_EMAIL/g" docker-compose.yml
sed -i "s/YOUR_PUBLIC_IP_HERE/$PUBLIC_IP/g" docker-compose.yml
sed -i "s/CHANGE_ME_STRONG_PASSWORD_DB/$DB_PASSWORD/g" docker-compose.yml
sed -i "s/CHANGE_ME_STRONG_PASSWORD_REDIS/$REDIS_PASSWORD/g" docker-compose.yml
sed -i "s/CHANGE_ME_STRONG_JWT_SECRET_MIN_32_CHARS_RANDOM/$JWT_SECRET/g" docker-compose.yml
sed -i "s/CHANGE_ME_SERVER_SIGNING_KEY_BASE64/$SERVER_SIGNING_KEY/g" docker-compose.yml

echo "✅ docker-compose.yml configuré (backup dans docker-compose.yml.bak)"
echo ""

# Demander si on veut configurer le firewall
read -p "🔥 Configurer le firewall automatiquement ? (y/n) : " CONFIG_FIREWALL
if [ "$CONFIG_FIREWALL" = "y" ]; then
    if command -v ufw &> /dev/null; then
        echo "Configuration UFW..."
        sudo ufw allow 80/tcp comment 'HTTP'
        sudo ufw allow 443/tcp comment 'HTTPS'
        sudo ufw allow 443/udp comment 'HTTP/3 QUIC'
        sudo ufw allow 40000:40100/udp comment 'WebRTC'
        sudo ufw --force enable
        echo "✅ Firewall configuré"
    else
        echo "⚠️  UFW non installé, firewall non configuré"
    fi
fi
echo ""

# Pull des images
echo "🐳 Téléchargement des images Docker..."
docker compose pull
echo "✅ Images téléchargées"
echo ""

# Démarrer les services
echo "🚀 Démarrage des services..."
docker compose up -d
echo "✅ Services démarrés"
echo ""

# Attendre que les services soient prêts
echo "⏳ Attente du démarrage complet (30s)..."
sleep 30

# Vérifier la santé des services
echo "🏥 Vérification de la santé des services..."
docker compose ps
echo ""

# Tester le backend
echo "🧪 Test du backend..."
if curl -f http://localhost:3000/health &> /dev/null; then
    echo "✅ Backend OK"
else
    echo "❌ Backend KO - Vérifiez les logs : docker compose logs backend"
fi
echo ""

# Afficher le résumé
echo "=================================="
echo "🎉 Installation terminée !"
echo "=================================="
echo ""
echo "📋 Résumé :"
echo "  - Domaine : $DOMAIN"
echo "  - IP publique : $PUBLIC_IP"
echo "  - Secrets sauvegardés dans .secrets"
echo ""
echo "🌐 URLs :"
echo "  - Frontend : https://$DOMAIN"
echo "  - API : https://$DOMAIN/api/health"
echo "  - WebSocket : wss://$DOMAIN/ws"
echo ""
echo "📚 Commandes utiles :"
echo "  - Voir les logs : docker compose logs -f"
echo "  - Arrêter : docker compose down"
echo "  - Redémarrer : docker compose restart"
echo "  - Mettre à jour : docker compose pull && docker compose up -d"
echo ""
echo "📖 Documentation :"
echo "  - Architecture : README.md"
echo "  - Déploiement : DEPLOYMENT.md"
echo "  - E2EE : docs/E2EE.md"
echo ""
echo "🔒 IMPORTANT : Sauvegardez le fichier .secrets en lieu sûr !"
echo ""
