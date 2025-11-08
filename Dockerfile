# Dockerfile pour héberger l'application avec yt-dlp et ffmpeg

FROM node:20-slim

# Installer les dépendances système nécessaires
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Installer yt-dlp via le script officiel (méthode recommandée)
# Cela évite les problèmes avec pip et les environnements gérés
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Vérifier les installations
RUN yt-dlp --version && ffmpeg -version

# Créer le répertoire de l'application
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm ci

# Copier le reste de l'application
COPY . .

# Construire l'application
RUN npm run build

# Créer le dossier temp
RUN mkdir -p temp && chmod 777 temp

# Exposer le port
EXPOSE 3000

# Variables d'environnement
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Démarrer l'application
CMD ["npm", "start"]
