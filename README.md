# YouTube Downloader

Outil moderne et minimaliste pour télécharger des vidéos YouTube au format MP3 ou MP4.

## 🚀 Fonctionnalités

- 📥 Téléchargement de vidéos YouTube en MP4
- 🎵 Extraction audio en MP3
- 🎨 Interface utilisateur moderne et intuitive
- 🌙 Support du mode sombre
- ✅ Validation des URLs YouTube
- 📊 Indicateur de progression en temps réel
- 🎬 **Affichage des informations de la vidéo** (titre, auteur, durée, miniature)
- 🎯 **Sélection de qualité** (plusieurs qualités disponibles pour MP3 et MP4)
- 🔄 Récupération automatique des informations avant téléchargement
- 🚀 Utilisation de yt-dlp pour une meilleure compatibilité

## 📋 Prérequis

- Node.js 18+ 
- npm ou yarn
- **Optionnel mais recommandé** : 
  - [yt-dlp](https://github.com/yt-dlp/yt-dlp) pour une meilleure compatibilité
  - [ffmpeg](https://ffmpeg.org/) pour la conversion MP3 et la fusion audio/vidéo

### Installation de yt-dlp (recommandé)

**macOS :**
```bash
brew install yt-dlp
```

**Linux :**
```bash
pip install yt-dlp
# ou
sudo apt install yt-dlp
```

**Windows :**
```bash
pip install yt-dlp
```

### Installation de ffmpeg (optionnel)

**macOS :**
```bash
brew install ffmpeg
```

**Linux :**
```bash
sudo apt install ffmpeg
```

**Windows :**
Téléchargez depuis [ffmpeg.org](https://ffmpeg.org/download.html)

## 🛠️ Installation

1. Clonez le repository ou naviguez dans le dossier :
```bash
cd youtube-downloader
```

2. Installez les dépendances :
```bash
npm install
```

## 🎯 Utilisation

1. Lancez le serveur de développement :
```bash
npm run dev
```

2. Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur

3. Collez l'URL de la vidéo YouTube que vous souhaitez télécharger
   - Les informations de la vidéo s'afficheront automatiquement après quelques secondes

4. Choisissez le format (MP3 ou MP4)

5. **(Nouveau)** Sélectionnez la qualité souhaitée (ou "Meilleure qualité" par défaut)

6. Cliquez sur "Télécharger"

## 📦 Build pour la production

```bash
npm run build
npm start
```

## 🌐 Déploiement en ligne (Gratuit)

### Option 1 : Railway (Recommandé - 5 minutes)

1. **Créez un repository GitHub** et poussez votre code
2. **Allez sur** https://railway.app
3. **Connectez-vous** avec GitHub
4. **Cliquez sur "New Project"** → "Deploy from GitHub repo"
5. **Sélectionnez votre repository**
6. **Railway déploiera automatiquement** votre application avec yt-dlp et ffmpeg !

**C'est tout !** Railway générera une URL publique automatiquement.

📖 **Guide détaillé** : Voir [DEPLOY_QUICK_START.md](./DEPLOY_QUICK_START.md)

### Option 2 : Render

1. Allez sur https://render.com
2. Créez un nouveau "Web Service"
3. Connectez votre repository GitHub
4. Render utilisera automatiquement le Dockerfile

⚠️ **Note** : Render met en veille les applications gratuites après 15 minutes d'inactivité.

### Option 3 : Fly.io

1. Installez Fly CLI : `curl -L https://fly.io/install.sh | sh`
2. Lancez : `fly launch`
3. Déployez : `fly deploy`

📖 **Guide complet** : Voir [DEPLOY.md](./DEPLOY.md)

## ⚠️ Notes importantes

- **Rights d'auteur** : Cet outil est destiné à un usage éducatif uniquement. Respectez les droits d'auteur des créateurs de contenu.
- **yt-dlp** : Si yt-dlp n'est pas installé, l'application utilisera `@distube/ytdl-core` qui peut avoir des limitations.
- **ffmpeg** : Sans ffmpeg, certains formats peuvent ne pas être disponibles (par exemple, MP3 nécessite ffmpeg pour la conversion).

## 🐛 Débogage

Si le téléchargement reste bloqué ou ne fonctionne pas :

1. **Vérifiez les logs du serveur** : Le serveur affiche des logs détaillés dans la console avec des emojis pour suivre le processus :
   - 📥 Début du téléchargement
   - 📋 Récupération des informations
   - 📦 Utilisation de ytdl-core/yt-dlp
   - ✅ Succès
   - ❌ Erreurs

2. **Vérifiez que yt-dlp est installé** (recommandé) :
   ```bash
   yt-dlp --version
   ```

3. **Vérifiez que ffmpeg est installé** (pour MP3) :
   ```bash
   ffmpeg -version
   ```

4. **Timeouts** :
   - Le téléchargement a un timeout de 5 minutes côté serveur
   - Le client a un timeout de 6 minutes
   - Pour les très longues vidéos, cela peut échouer

5. **Formats disponibles** : Certaines vidéos peuvent avoir des restrictions. L'application essaiera automatiquement différents formats.

6. **Erreurs communes** :
   - "URL YouTube invalide" : Vérifiez que l'URL est correcte
   - "Timeout" : La vidéo est trop longue ou la connexion est lente
   - "Format non disponible" : La vidéo peut avoir des restrictions de téléchargement

## 🔧 Technologies utilisées

- [Next.js](https://nextjs.org/) - Framework React
- [TypeScript](https://www.typescriptlang.org/) - Typage statique
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [@distube/ytdl-core](https://github.com/distubejs/ytdl-core) - Bibliothèque de téléchargement YouTube
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Alternative plus robuste (optionnelle)

## 📝 Licence

Ce projet est à des fins éducatives uniquement.