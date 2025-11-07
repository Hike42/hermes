# Guide de déploiement - YouTube Downloader

Ce guide vous explique comment déployer l'application YouTube Downloader gratuitement en ligne.

## 🚂 Option 1 : Railway (Recommandé)

Railway est la solution la plus simple et offre un plan gratuit généreux.

### Étapes de déploiement

1. **Créer un compte Railway**
   - Allez sur https://railway.app
   - Créez un compte avec GitHub (gratuit)

2. **Créer un nouveau projet**
   - Cliquez sur "New Project"
   - Sélectionnez "Deploy from GitHub repo"
   - Connectez votre repository GitHub (ou créez-en un nouveau)

3. **Configuration automatique**
   - Railway détectera automatiquement le Dockerfile
   - L'application sera construite et déployée automatiquement

4. **Variables d'environnement (optionnel)**
   - Railway gérera automatiquement les variables nécessaires
   - Pas de configuration supplémentaire requise

5. **Accéder à l'application**
   - Railway générera une URL publique automatiquement
   - L'URL sera disponible dans les paramètres du projet

### Avantages Railway
- ✅ Installation automatique de yt-dlp et ffmpeg via Dockerfile
- ✅ Plan gratuit généreux (500 heures/mois)
- ✅ Déploiement automatique depuis GitHub
- ✅ URL HTTPS automatique
- ✅ Très facile à utiliser

---

## 🎨 Option 2 : Render

Render offre également un plan gratuit avec quelques limitations.

### Étapes de déploiement

1. **Créer un compte Render**
   - Allez sur https://render.com
   - Créez un compte gratuit

2. **Créer un nouveau Web Service**
   - Cliquez sur "New +" → "Web Service"
   - Connectez votre repository GitHub

3. **Configuration**
   - **Name**: youtube-downloader
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free

4. **Important pour Render**
   - Render nécessite que vous utilisiez un Dockerfile pour installer yt-dlp et ffmpeg
   - Le Dockerfile est déjà configuré dans le projet

5. **Déployer**
   - Cliquez sur "Create Web Service"
   - Render construira et déploiera l'application

### Limitations Render (plan gratuit)
- ⚠️ L'application se met en veille après 15 minutes d'inactivité
- ⚠️ Le premier démarrage peut être lent (cold start)

---

## 🚀 Option 3 : Fly.io

Fly.io permet un contrôle plus granulaire mais nécessite plus de configuration.

### Étapes de déploiement

1. **Installer Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Créer un compte**
   ```bash
   fly auth signup
   ```

3. **Initialiser l'application**
   ```bash
   cd /Users/baptiste/Work/youtube-downloader
   fly launch
   ```

4. **Configurer fly.toml** (créé automatiquement)
   - Fly.io utilisera le Dockerfile automatiquement

5. **Déployer**
   ```bash
   fly deploy
   ```

### Avantages Fly.io
- ✅ Installation de yt-dlp et ffmpeg via Dockerfile
- ✅ Plan gratuit généreux
- ✅ Pas de mise en veille

---

## 📝 Préparation avant déploiement

### 1. Créer un repository GitHub (si pas déjà fait)

```bash
cd /Users/baptiste/Work/youtube-downloader
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/VOTRE_USERNAME/youtube-downloader.git
git push -u origin main
```

### 2. Vérifier que le Dockerfile est présent

Le Dockerfile est déjà créé et configuré pour installer yt-dlp et ffmpeg.

### 3. (Optionnel) Tester localement avec Docker

```bash
docker build -t youtube-downloader .
docker run -p 3000:3000 youtube-downloader
```

---

## 🔧 Configuration recommandée

### Variables d'environnement (optionnel)

Vous pouvez ajouter ces variables dans les paramètres de votre plateforme :

- `NODE_ENV=production`
- `PORT=3000`

### Limites importantes

⚠️ **Attention** : Les plateformes gratuites ont des limitations :
- **Timeout de requête** : Généralement 30-60 secondes (Railway/Render)
- **Taille des fichiers** : Limités par la mémoire disponible
- **Utilisation CPU/RAM** : Limites sur les plans gratuits

**Conseil** : Pour les très longues vidéos, vous pourriez atteindre les limites. Les vidéos de moins de 10 minutes fonctionnent généralement bien.

---

## 🎯 Recommandation finale

**Utilisez Railway** :
- ✅ Le plus simple
- ✅ Déploiement en quelques clics
- ✅ Installation automatique de yt-dlp et ffmpeg
- ✅ Plan gratuit généreux
- ✅ Documentation excellente

### Quick Start avec Railway

1. Allez sur https://railway.app
2. Créez un compte
3. "New Project" → "Deploy from GitHub repo"
4. Sélectionnez votre repo
5. C'est tout ! 🎉

---

## 🐛 Dépannage

### L'application ne démarre pas
- Vérifiez les logs dans la console de votre plateforme
- Assurez-vous que yt-dlp et ffmpeg sont bien installés
- Vérifiez que le port est correctement configuré

### Erreurs de téléchargement
- Vérifiez les logs de l'application
- Certaines vidéos peuvent être protégées
- Les timeouts peuvent être atteints pour les très longues vidéos

### Problèmes de mémoire
- Les plans gratuits ont des limites de RAM
- Réduisez la qualité de téléchargement si nécessaire
