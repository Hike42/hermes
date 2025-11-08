# 🚀 Déploiement Rapide - Railway (5 minutes)

Railway est la solution la plus simple pour déployer cette application gratuitement.

## 📋 Prérequis

1. Un compte GitHub (gratuit)
2. Un compte Railway (gratuit)

## 🎯 Étapes de déploiement

### 1. Créer un repository GitHub

```bash
cd /Users/baptiste/Work/youtube-downloader
git init
git add .
git commit -m "Initial commit - YouTube Downloader"
```

Ensuite, créez un nouveau repository sur GitHub et poussez votre code :

```bash
git remote add origin https://github.com/VOTRE_USERNAME/youtube-downloader.git
git branch -M main
git push -u origin main
```

### 2. Déployer sur Railway

1. **Allez sur Railway** : https://railway.app
2. **Connectez-vous** avec votre compte GitHub
3. **Cliquez sur "New Project"**
4. **Sélectionnez "Deploy from GitHub repo"**
5. **Autorisez Railway** à accéder à votre GitHub (si demandé)
6. **Sélectionnez votre repository** `youtube-downloader`
7. **Railway va automatiquement** :
   - Détecter le Dockerfile
   - Installer yt-dlp et ffmpeg
   - Construire et déployer l'application

### 3. Obtenir l'URL publique

1. Dans votre projet Railway, cliquez sur votre service
2. Allez dans l'onglet **"Settings"**
3. Cliquez sur **"Generate Domain"** pour obtenir une URL publique
4. Votre application est maintenant en ligne ! 🎉

## ✅ Vérification

1. Visitez l'URL générée par Railway
2. Testez avec une vidéo YouTube
3. Tout devrait fonctionner !

## 🔧 Configuration optionnelle

### Variables d'environnement (si nécessaire)

Dans Railway → Settings → Variables :
- `NODE_ENV=production` (déjà configuré)
- `PORT=3000` (déjà configuré automatiquement)

## 💰 Coûts

- **Plan gratuit** : 500 heures/mois
- **Crédits gratuits** : $5 par mois
- Pour un usage personnel, c'est largement suffisant !

## 🐛 Dépannage

### L'application ne démarre pas
- Vérifiez les logs dans Railway → Deployments → Logs
- Assurez-vous que le Dockerfile est bien présent

### Erreurs de téléchargement
- Vérifiez que yt-dlp et ffmpeg sont installés (visible dans les logs de build)
- Certaines vidéos peuvent être protégées

### Timeout
- Les vidéos très longues (>10 minutes) peuvent causer des timeouts
- Réduisez la qualité si nécessaire

---

## 🎉 C'est tout !

Votre application est maintenant en ligne et fonctionnelle !

