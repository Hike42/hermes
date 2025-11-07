# Dockerfile pour héberger l'application avec yt-dlp et ffmpeg

FROM node:20-slim

# Installer les dépendances système nécessaires
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Installer yt-dlp
RUN pip3 install --no-cache-dir yt-dlp

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
