# Installation de yt-dlp (Solution recommandée)

L'erreur 403 est causée par YouTube qui bloque les accès. `yt-dlp` est l'outil le plus fiable pour contourner ces restrictions.

## 🍎 macOS

### Option 1: Homebrew (recommandé)
```bash
brew install yt-dlp
```

### Option 2: pip
```bash
pip3 install yt-dlp
```

## 🐧 Linux

### Option 1: pip
```bash
pip install yt-dlp
# ou
pip3 install yt-dlp
```

### Option 2: Package manager
```bash
# Ubuntu/Debian
sudo apt install yt-dlp

# Fedora
sudo dnf install yt-dlp

# Arch Linux
sudo pacman -S yt-dlp
```

## 🪟 Windows

### Option 1: pip
```bash
pip install yt-dlp
```

### Option 2: Téléchargement direct
1. Téléchargez depuis https://github.com/yt-dlp/yt-dlp/releases
2. Extrayez l'exécutable
3. Ajoutez-le à votre PATH

## ✅ Vérification

Après installation, vérifiez que yt-dlp est disponible :

```bash
yt-dlp --version
```

Si la commande fonctionne, vous verrez la version installée.

## 🔄 Redémarrer le serveur

Après installation, **redémarrez votre serveur Next.js** :

```bash
# Arrêtez le serveur (Ctrl+C)
# Puis relancez-le
npm run dev
```

L'application détectera automatiquement yt-dlp et l'utilisera en priorité.

## 🆘 Problèmes courants

### "Command not found"
- Vérifiez que yt-dlp est dans votre PATH
- Sur macOS avec Homebrew, exécutez: `echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc` puis `source ~/.zshrc`

### Permission denied
- Utilisez `sudo` si nécessaire (Linux)
- Sur macOS, évitez `sudo` avec Homebrew

### Version obsolète
- Mettez à jour: `brew upgrade yt-dlp` (macOS) ou `pip install --upgrade yt-dlp`
