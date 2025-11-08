# Guide : Comment obtenir des tokens PO pour YouTube

## Qu'est-ce qu'un token PO ?

Les tokens PO (Proof of Origin) sont des paramètres que YouTube exige pour accéder aux formats vidéo haute qualité (1080p, 720p, etc.). Sans ces tokens, les requêtes peuvent échouer avec une erreur HTTP 403 ou être limitées aux formats basse qualité (360p).

## Méthodes pour obtenir des tokens PO

### Méthode 1 : yt-session-generator (Recommandée - Utilisée par Cobalt)

**Description** : Service Docker qui génère automatiquement des tokens PO et `visitor_data`.

**Avantages** :

- Génération automatique et continue
- Service dédié qui se met à jour automatiquement
- Utilisé par Cobalt (bien testé)

**Inconvénients** :

- Nécessite Docker
- Nécessite un service séparé à maintenir

**Installation** :

1. Ajouter le service dans `docker-compose.yml` :

```yaml
services:
  yt-session-generator:
    image: ghcr.io/imputnet/yt-session-generator:webserver
    init: true
    restart: unless-stopped
    container_name: yt-session-generator
    ports:
      - 8080:8080
```

2. Le service expose une API sur `http://localhost:8080/token` qui retourne :

```json
{
  "potoken": "votre_po_token_ici",
  "visitor_data": "votre_visitor_data_ici",
  "updated": 1234567890
}
```

3. Utiliser dans notre code :

```typescript
// Récupérer le token depuis le service
const response = await fetch("http://localhost:8080/token");
const { potoken, visitor_data } = await response.json();

// Utiliser avec yt-dlp
// Note: yt-dlp ne supporte pas directement visitor_data,
// mais on peut utiliser le po_token
```

### Méthode 2 : youtube-po-token-generator (NPM Package)

**Description** : Package Node.js qui génère des tokens PO sans navigateur réel.

**Avantages** :

- Simple à utiliser
- Pas besoin de Docker
- Intégration facile dans Node.js

**Inconvénients** :

- Nécessite une dépendance supplémentaire
- Peut nécessiter des mises à jour régulières

**Installation** :

```bash
npm install youtube-po-token-generator
```

**Utilisation** :

```typescript
import { generateToken } from "youtube-po-token-generator";

// Générer un token
const { visitorData, poToken } = await generateToken();

// Utiliser avec yt-dlp
// Le poToken peut être utilisé avec --extractor-args
```

### Méthode 3 : Extraction manuelle depuis le navigateur

**Description** : Extraire le token PO depuis les requêtes réseau du navigateur.

**Avantages** :

- Pas de dépendance externe
- Contrôle total

**Inconvénients** :

- Manuelle (pas automatisée)
- Nécessite de renouveler régulièrement
- Complexe

**Étapes** :

1. Ouvrir YouTube Music ou une vidéo YouTube dans un navigateur (sans être connecté)
2. Ouvrir la console développeur (F12)
3. Aller dans l'onglet "Network" et filtrer par `v1/player`
4. Lancer une vidéo
5. Dans la requête `player`, trouver `serviceIntegrityDimensions.poToken`
6. Copier la valeur du token

**Utilisation avec yt-dlp** :

```bash
yt-dlp --extractor-args "youtube:player_client=android;po_token=android.gvs+VOTRE_PO_TOKEN" URL_VIDEO
```

### Méthode 4 : youtube-trusted-session-generator (Python)

**Description** : Script Python qui génère les tokens PO.

**Avantages** :

- Génération automatique
- Peut être exécuté via Docker

**Inconvénients** :

- Nécessite Python ou Docker
- Nécessite Chromium/Chrome

**Installation** :

```bash
pip install youtube-trusted-session-generator
```

**Utilisation** :

```bash
youtube-trusted-session-generator
```

## Utilisation avec yt-dlp

Une fois que vous avez un token PO, vous pouvez l'utiliser avec yt-dlp :

### Pour le client Android :

```bash
yt-dlp --extractor-args "youtube:player_client=android;po_token=android.gvs+VOTRE_PO_TOKEN" URL_VIDEO
```

### Pour le client Web :

```bash
yt-dlp --extractor-args "youtube:player_client=web;po_token=VOTRE_PO_TOKEN" URL_VIDEO
```

### Pour le client iOS :

```bash
yt-dlp --extractor-args "youtube:player_client=ios;po_token=VOTRE_PO_TOKEN" URL_VIDEO
```

## Intégration dans notre code

### Option 1 : Service externe (yt-session-generator)

```typescript
async function getPoToken(): Promise<string | null> {
  try {
    const response = await fetch("http://localhost:8080/token");
    const data = await response.json();
    return data.potoken || null;
  } catch (error) {
    console.warn("⚠️ Impossible de récupérer le token PO:", error);
    return null;
  }
}

// Dans downloadWithYtDlp
const poToken = await getPoToken();
if (poToken) {
  args.push(
    "--extractor-args",
    `youtube:player_client=${playerClient};po_token=${poToken}`
  );
} else {
  args.push("--extractor-args", `youtube:player_client=${playerClient}`);
}
```

### Option 2 : Package NPM (youtube-po-token-generator)

```typescript
import { generateToken } from "youtube-po-token-generator";

async function getPoToken(): Promise<string | null> {
  try {
    const { poToken } = await generateToken();
    return poToken || null;
  } catch (error) {
    console.warn("⚠️ Impossible de générer le token PO:", error);
    return null;
  }
}
```

## Recommandations

1. **Pour la production** : Utiliser `yt-session-generator` (service Docker)

   - Plus fiable
   - Génération automatique
   - Mise à jour continue

2. **Pour le développement** : Utiliser `youtube-po-token-generator` (NPM)

   - Plus simple à configurer
   - Pas besoin de Docker
   - Facile à tester

3. **Pour tester rapidement** : Extraction manuelle
   - Pas de dépendance
   - Rapide pour tester

## Limitations

- Les tokens PO peuvent expirer et doivent être renouvelés régulièrement
- YouTube peut détecter et bloquer l'utilisation abusive des tokens
- Certains tokens peuvent ne fonctionner que pour certains clients (android, web, ios)

## Ressources

- [Guide officiel yt-dlp PO Token](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)
- [yt-session-generator GitHub](https://github.com/imputnet/yt-session-generator)
- [youtube-po-token-generator NPM](https://www.npmjs.com/package/youtube-po-token-generator)
- [youtube-trusted-session-generator PyPI](https://pypi.org/project/youtube-trusted-session-generator/)
