import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Fonction pour vérifier si yt-dlp est disponible
async function isYtDlpAvailable(): Promise<boolean> {
  const possiblePaths = [
    'yt-dlp', // Dans le PATH
    '/root/.local/bin/yt-dlp', // Pip user install (Docker)
    '/usr/local/bin/yt-dlp', // Pip system install / Homebrew sur Intel Mac
    '/opt/homebrew/bin/yt-dlp', // Homebrew sur Apple Silicon
    '/usr/bin/yt-dlp', // Linux standard (apt)
  ];

  for (const ytDlpPath of possiblePaths) {
    try {
      await execAsync(`${ytDlpPath} --version`, { timeout: 5000 });
      console.log(`✅ yt-dlp trouvé à: ${ytDlpPath}`);
      return true;
    } catch {
      // Continue à essayer les autres chemins
    }
  }
  
  // Dernière tentative : utiliser 'which' pour trouver yt-dlp
  try {
    const { stdout } = await execAsync('which yt-dlp', { timeout: 5000 });
    const foundPath = stdout.trim();
    if (foundPath) {
      await execAsync(`${foundPath} --version`, { timeout: 5000 });
      console.log(`✅ yt-dlp trouvé à: ${foundPath}`);
      return true;
    }
  } catch {
    // Ignorer
  }
  
  return false;
}

// Fonction pour trouver le chemin de yt-dlp
async function findYtDlpPath(): Promise<string | null> {
  const possiblePaths = [
    'yt-dlp', // Dans le PATH
    '/root/.local/bin/yt-dlp', // Pip user install (Docker)
    '/usr/local/bin/yt-dlp', // Pip system install / Homebrew sur Intel Mac
    '/opt/homebrew/bin/yt-dlp', // Homebrew sur Apple Silicon
    '/usr/bin/yt-dlp', // Linux standard (apt)
  ];

  for (const ytDlpPath of possiblePaths) {
    try {
      await execAsync(`${ytDlpPath} --version`, { timeout: 5000 });
      return ytDlpPath;
    } catch {
      // Continue à essayer les autres chemins
    }
  }
  
  // Dernière tentative : utiliser 'which' pour trouver yt-dlp
  try {
    const { stdout } = await execAsync('which yt-dlp', { timeout: 5000 });
    const foundPath = stdout.trim();
    if (foundPath) {
      await execAsync(`${foundPath} --version`, { timeout: 5000 });
      return foundPath;
    }
  } catch {
    // Ignorer
  }
  
  return null;
}

// Fonction pour mettre à jour yt-dlp (en arrière-plan, ne bloque pas)
async function updateYtDlpIfNeeded(ytDlpPath: string): Promise<void> {
  try {
    // Vérifier si yt-dlp peut être mis à jour (ne bloque pas si ça échoue)
    execAsync(`${ytDlpPath} -U`, { timeout: 30000 }).catch(() => {
      // Ignorer les erreurs de mise à jour, ce n'est pas critique
    });
  } catch {
    // Ignorer silencieusement
  }
}

// Fonction pour récupérer les informations d'un format spécifique
async function getFormatInfo(ytDlpPath: string, url: string, formatId: string, playerClient: string): Promise<{ hasAudio: boolean; height: number | null } | null> {
  try {
    const { stdout } = await execAsync(
      `"${ytDlpPath}" --dump-json --extractor-args "youtube:player_client=${playerClient}" --no-playlist "${url}"`,
      { timeout: 30000 }
    );
    const videoInfo = JSON.parse(stdout);
    const formats = videoInfo.formats || [];
    const format = formats.find((f: any) => f.format_id === formatId);
    
    if (format) {
      return {
        hasAudio: format.acodec && format.acodec !== 'none',
        height: format.height || null,
      };
    }
  } catch (error) {
    console.warn('⚠️ Impossible de récupérer les infos du format, utilisation de la stratégie par défaut');
  }
  return null;
}

// Fonction pour trouver le meilleur format à partir d'une liste de formats
function findBestFormatFromList(formats: any[], format: 'mp3' | 'mp4', minHeight: number = 720): string | null {
  console.log(`🔍 Recherche du meilleur format (minimum ${minHeight}p) parmi ${formats.length} formats...`);
  
  // Logger les formats disponibles pour debug
  if (format === 'mp4') {
    const videoFormats = formats.filter((f: any) => f.vcodec && f.vcodec !== 'none' && f.height);
    const heights = videoFormats.map((f: any) => f.height).filter((h: any) => h).sort((a: number, b: number) => b - a);
    console.log(`📊 Résolutions disponibles: ${heights.slice(0, 10).join('p, ')}p...`);
  }
  
  if (format === 'mp3') {
    // Pour MP3, trouver le meilleur format audio
    const audioFormats = formats.filter((f: any) => 
      f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
    );
    if (audioFormats.length > 0) {
      // Trier par bitrate audio (meilleur en premier)
      audioFormats.sort((a: any, b: any) => (b.abr || 0) - (a.abr || 0));
      const best = audioFormats[0];
      console.log(`✅ Format audio trouvé: ${best.format_id} (${best.abr || 'N/A'} kbps)`);
      return best.format_id;
    }
  } else {
    // Pour MP4, trouver le meilleur format vidéo
    // Préférer les formats combinés (vidéo+audio)
    // Commencer par 1080p, puis 720p minimum
    
    // Essayer d'abord 1080p
    let combinedFormats = formats.filter((f: any) => 
      f.vcodec && f.vcodec !== 'none' && 
      f.acodec && f.acodec !== 'none' && 
      f.height && f.height >= 1080
    );
    
    if (combinedFormats.length > 0) {
      combinedFormats.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      const bestCombined = combinedFormats[0];
      console.log(`✅ Format combiné 1080p+ trouvé: ${bestCombined.format_id} (${bestCombined.height}p)`);
      return bestCombined.format_id;
    }
    
    // Essayer 720p minimum
    combinedFormats = formats.filter((f: any) => 
      f.vcodec && f.vcodec !== 'none' && 
      f.acodec && f.acodec !== 'none' && 
      f.height && f.height >= minHeight
    );
    
    if (combinedFormats.length > 0) {
      combinedFormats.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      const bestCombined = combinedFormats[0];
      console.log(`✅ Format combiné ${minHeight}p+ trouvé: ${bestCombined.format_id} (${bestCombined.height}p)`);
      return bestCombined.format_id;
    }
    
    // Si pas de format combiné, trouver le meilleur format vidéo seul (1080p d'abord)
    let videoFormats = formats.filter((f: any) => 
      f.vcodec && f.vcodec !== 'none' && 
      f.height && f.height >= 1080 && 
      (!f.acodec || f.acodec === 'none')
    );
    
    if (videoFormats.length > 0) {
      videoFormats.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      const bestVideo = videoFormats[0];
      console.log(`✅ Format vidéo 1080p+ trouvé: ${bestVideo.format_id} (${bestVideo.height}p, nécessite combinaison avec audio)`);
      return bestVideo.format_id;
    }
    
    // Essayer 720p minimum pour vidéo seule
    videoFormats = formats.filter((f: any) => 
      f.vcodec && f.vcodec !== 'none' && 
      f.height && f.height >= minHeight && 
      (!f.acodec || f.acodec === 'none')
    );
    
    if (videoFormats.length > 0) {
      videoFormats.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      const bestVideo = videoFormats[0];
      console.log(`✅ Format vidéo ${minHeight}p+ trouvé: ${bestVideo.format_id} (${bestVideo.height}p, nécessite combinaison avec audio)`);
      return bestVideo.format_id;
    }
    
    // Si vraiment aucun format de bonne qualité, accepter le meilleur disponible (mais log un warning)
    console.warn(`⚠️ Aucun format >= ${minHeight}p trouvé, recherche du meilleur format disponible...`);
    
    // Essayer d'abord les formats combinés de toute qualité
    const allCombinedFormats = formats.filter((f: any) => 
      f.vcodec && f.vcodec !== 'none' && 
      f.acodec && f.acodec !== 'none' && 
      f.height
    );
    
    if (allCombinedFormats.length > 0) {
      allCombinedFormats.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      const bestAvailable = allCombinedFormats[0];
      console.warn(`⚠️ Format combiné disponible le plus élevé: ${bestAvailable.format_id} (${bestAvailable.height}p) - ATTENTION: Qualité inférieure à ${minHeight}p`);
      return bestAvailable.format_id;
    }
    
    // Sinon, formats vidéo seul de toute qualité
    const allVideoFormats = formats.filter((f: any) => 
      f.vcodec && f.vcodec !== 'none' && f.height && (!f.acodec || f.acodec === 'none')
    );
    
    if (allVideoFormats.length > 0) {
      allVideoFormats.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      const bestAvailable = allVideoFormats[0];
      console.warn(`⚠️ Format vidéo disponible le plus élevé: ${bestAvailable.format_id} (${bestAvailable.height}p) - ATTENTION: Qualité inférieure à ${minHeight}p`);
      return bestAvailable.format_id;
    }
  }
  return null;
}

// Fonction pour trouver le meilleur format disponible avec un client spécifique
async function findBestFormat(ytDlpPath: string, url: string, format: 'mp3' | 'mp4', playerClient: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `"${ytDlpPath}" --dump-json --extractor-args "youtube:player_client=${playerClient}" --no-playlist "${url}"`,
      { timeout: 30000 }
    );
    const videoInfo = JSON.parse(stdout);
    const formats = videoInfo.formats || [];
    return findBestFormatFromList(formats, format);
  } catch (error) {
    console.warn('⚠️ Impossible de récupérer les formats disponibles:', error);
  }
  return null;
}

// Fonction pour récupérer un token PO (Proof of Origin) pour YouTube
// Les tokens PO sont nécessaires pour accéder aux formats haute qualité (1080p, 720p)
async function getPoToken(): Promise<string | null> {
  // Option 1: Récupérer depuis un service externe (yt-session-generator)
  // Définir YT_SESSION_SERVER dans les variables d'environnement
  const ytSessionServer = process.env.YT_SESSION_SERVER;
  
  if (ytSessionServer) {
    try {
      const url = ytSessionServer.endsWith('/token') 
        ? ytSessionServer 
        : `${ytSessionServer.replace(/\/$/, '')}/token`;
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(5000) // Timeout de 5 secondes
      });
      
      if (response.ok) {
        const data = await response.json();
        const poToken = data.potoken || data.poToken || data.po_token;
        if (poToken) {
          console.log('✅ Token PO récupéré depuis le service externe');
          return poToken;
        }
      }
    } catch (error: any) {
      console.warn('⚠️ Impossible de récupérer le token PO depuis le service:', error.message?.substring(0, 100));
    }
  }
  
  // Option 2: Utiliser un token PO défini dans les variables d'environnement
  const envPoToken = process.env.YT_PO_TOKEN;
  if (envPoToken) {
    console.log('✅ Token PO récupéré depuis les variables d\'environnement');
    return envPoToken;
  }
  
  // Aucun token PO disponible
  return null;
}

// Fonction pour télécharger avec yt-dlp
async function downloadWithYtDlp(url: string, format: 'mp3' | 'mp4', tempDir: string, videoTitle?: string, quality?: string, playerClient: string = 'web'): Promise<{ filePath: string; fileName: string }> {
  const ytDlpPath = await findYtDlpPath();
  if (!ytDlpPath) {
    throw new Error('yt-dlp non trouvé');
  }
  
  // Essayer de mettre à jour yt-dlp en arrière-plan (non bloquant)
  updateYtDlpIfNeeded(ytDlpPath).catch(() => {});

  // Nettoyer l'URL pour éviter de télécharger toute la playlist
  const urlOnly = url.split('&list=')[0].split('&start_radio=')[0];
  
  // Utiliser un nom de fichier simple avec timestamp pour éviter les problèmes
  // yt-dlp va créer un fichier, on va le renommer après avec un nom propre
  const timestamp = Date.now();
  const outputTemplate = path.join(tempDir, `download_${timestamp}.%(ext)s`);
  
  // Créer un nom de fichier propre à partir du titre de la vidéo
  let cleanFileName = 'video';
  if (videoTitle) {
    cleanFileName = videoTitle
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Enlever les caractères interdits
      .replace(/\s+/g, ' ') // Normaliser les espaces
      .trim()
      .substring(0, 100); // Limiter la longueur
  }
  const finalFileName = `${cleanFileName}.${format}`;
  
  // Récupérer un token PO si disponible (nécessaire pour les formats haute qualité)
  const poToken = await getPoToken();
  
  console.log(`🔧 Exécution de yt-dlp (cela peut prendre quelques minutes)...`);
  console.log(`📋 URL traitée: ${urlOnly}`);
  console.log(`📁 Dossier de sortie: ${tempDir}`);
  console.log(`📝 Nom de fichier final: ${finalFileName}`);
  console.log(`🎯 Qualité sélectionnée: ${quality || 'best'}`);
  console.log(`🌐 Client YouTube utilisé: ${playerClient}`);
  if (poToken) {
    console.log(`🔑 Token PO disponible (nécessaire pour formats haute qualité)`);
  } else {
    console.log(`⚠️ Aucun token PO disponible (formats haute qualité peuvent être limités)`);
    console.log(`💡 Pour activer les tokens PO, configurez YT_SESSION_SERVER ou YT_PO_TOKEN`);
  }
  console.log(`💡 Le client iOS est généralement plus fiable pour les formats haute qualité (basé sur l'analyse de Cobalt)`);
  
  // Récupérer les formats disponibles AVANT de télécharger
  console.log('🔍 Récupération des formats disponibles avec le client', playerClient, '...');
  let availableFormats: any[] = [];
  let videoInfo: any = null;
  let formatsRetrieved = false;
  
  try {
    // Essayer d'abord avec --dump-json
    const { stdout } = await execAsync(
      `"${ytDlpPath}" --dump-json --extractor-args "youtube:player_client=${playerClient}" --no-playlist "${urlOnly}"`,
      { timeout: 30000 }
    );
    videoInfo = JSON.parse(stdout);
    availableFormats = videoInfo.formats || [];
    formatsRetrieved = availableFormats.length > 0;
    if (formatsRetrieved) {
      console.log(`✅ ${availableFormats.length} formats disponibles avec --dump-json`);
    } else {
      console.warn('⚠️ Aucun format disponible dans la réponse JSON');
    }
  } catch (error: any) {
    console.warn('⚠️ Impossible de récupérer les formats avec --dump-json');
  }
  
  // TOUJOURS utiliser --list-formats pour voir TOUS les formats disponibles
  // YouTube peut masquer les formats haute qualité dans --dump-json mais les montrer dans --list-formats
  let allAvailableFormatIds: string[] = [];
  let hasHighQualityFormats = false;
  let maxHeightFound = 0;
  
  try {
    console.log('🔍 Liste complète des formats avec --list-formats (y compris ceux qui nécessitent des tokens PO)...');
    const { stdout: listStdout } = await execAsync(
      `"${ytDlpPath}" --list-formats --extractor-args "youtube:player_client=${playerClient}" --no-playlist "${urlOnly}"`,
      { timeout: 30000 }
    );
    
    // Parser la sortie de --list-formats
    // Format: "ID  EXT   RESOLUTION  FPS │ FILESIZE   TBR PROTO │ VCODEC  VBR ACODEC      ABR"
    const lines = listStdout.split('\n');
    const formatInfos: Array<{id: string, height: number, hasAudio: boolean}> = [];
    
    for (const line of lines) {
      // Chercher les lignes de formats vidéo
      if (/^\s*\d+\s+/.test(line)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const formatId = parts[0];
          const resolution = parts[2]; // Format: "1080p", "720p", "360p", etc.
          const heightMatch = resolution.match(/(\d+)p/);
          const height = heightMatch ? parseInt(heightMatch[1]) : 0;
          
          // Vérifier si c'est un format vidéo (contient video ou a une résolution)
          const hasVideo = height > 0 || line.toLowerCase().includes('video');
          const hasAudio = line.toLowerCase().includes('audio') || (!line.toLowerCase().includes('videoonly'));
          
          if (hasVideo && height > 0) {
            formatInfos.push({ id: formatId, height, hasAudio: hasAudio || !line.toLowerCase().includes('videoonly') });
            allAvailableFormatIds.push(formatId);
            
            if (height > maxHeightFound) {
              maxHeightFound = height;
            }
            
            if (height >= 720) {
              hasHighQualityFormats = true;
            }
          }
        }
      }
    }
    
    if (formatInfos.length > 0) {
      // Trier par hauteur (meilleure qualité en premier)
      formatInfos.sort((a, b) => b.height - a.height);
      const bestFormat = formatInfos[0];
      
      console.log(`📊 ${formatInfos.length} formats trouvés avec --list-formats`);
      console.log(`📊 Meilleure résolution disponible: ${bestFormat.height}p (format ID: ${bestFormat.id})`);
      
      if (hasHighQualityFormats) {
        const highQualityFormats = formatInfos.filter(f => f.height >= 720);
        console.log(`✅ ${highQualityFormats.length} formats haute qualité (>= 720p) trouvés: ${highQualityFormats.slice(0, 5).map(f => `${f.id} (${f.height}p)`).join(', ')}`);
        console.log(`🎯 Ces formats existent mais peuvent nécessiter des tokens PO ou être masqués dans --dump-json`);
      } else {
        console.warn(`⚠️ Aucun format >= 720p trouvé dans --list-formats (max: ${maxHeightFound}p)`);
      }
    }
  } catch (listError: any) {
    console.warn('⚠️ Impossible de lister les formats avec --list-formats:', listError.message?.substring(0, 100));
    // Si --list-formats échoue, on assume qu'il peut y avoir des formats haute qualité non listés
    console.warn('⚠️ En cas d\'échec, on utilisera quand même une syntaxe agressive pour chercher les formats haute qualité');
  }
  
  // Si "best" est sélectionné, trouver le meilleur format disponible
  let actualQuality = quality;
  let formatInfo: { hasAudio: boolean; height: number | null } | null = null;
  
  if (quality === 'best' || !quality) {
    console.log('🔍 Recherche du meilleur format disponible (priorité 1080p, minimum 720p)...');
    
    // CRITIQUE: Pour "best", TOUJOURS utiliser la syntaxe agressive
    // Même si --list-formats ne montre que 360p, les formats 1080p/720p PEUVENT exister
    // YouTube peut les masquer complètement mais yt-dlp peut parfois y accéder avec la bonne syntaxe
    // Ne JAMAIS utiliser un format basse qualité de --dump-json quand quality='best'
    
    if (hasHighQualityFormats) {
      console.log('✅ Formats haute qualité (>= 720p) détectés avec --list-formats');
      console.log('⚠️ YouTube masque ces formats dans --dump-json mais ils sont disponibles pour le téléchargement');
    } else {
      console.warn('⚠️ --list-formats ne montre que des formats <= 360p');
      console.warn('⚠️ MAIS les formats 1080p/720p peuvent exister et être masqués par YouTube');
      console.warn('⚠️ YouTube peut masquer les formats haute qualité dans --list-formats aussi (tokens PO requis)');
    }
    
    console.log('🎯 Utilisation d\'une syntaxe TRÈS agressive pour forcer la recherche des formats 1080p/720p');
    console.log('🎯 yt-dlp peut parfois accéder à ces formats même s\'ils ne sont pas listés');
    actualQuality = 'best'; // TOUJOURS utiliser la syntaxe agressive pour 'best'
  } else if (quality && formatsRetrieved && availableFormats.length > 0) {
    // Vérifier si le format demandé est disponible
    const requestedFormat = availableFormats.find((f: any) => f.format_id === quality);
    if (!requestedFormat) {
      console.warn(`⚠️ Format ${quality} non disponible avec le client ${playerClient}, recherche du meilleur format disponible...`);
      // Essayer d'abord >= 720p, sinon accepter le meilleur disponible
      let bestFormatId = findBestFormatFromList(availableFormats, format, 720);
      if (!bestFormatId) {
        console.warn('⚠️ Aucun format >= 720p disponible, utilisation du meilleur format disponible...');
        bestFormatId = findBestFormatFromList(availableFormats, format, 0);
      }
      if (bestFormatId) {
        actualQuality = bestFormatId;
        console.log(`✅ Format de remplacement trouvé: ${actualQuality}`);
      }
    } else {
      // Vérifier aussi la résolution du format demandé
      const formatHeight = requestedFormat.height;
      if (formatHeight && formatHeight < 720) {
        console.warn(`⚠️ Format ${quality} disponible mais résolution faible (${formatHeight}p), recherche d'un meilleur format...`);
        let bestFormatId = findBestFormatFromList(availableFormats, format, 720);
        if (!bestFormatId) {
          console.warn('⚠️ Aucun format >= 720p disponible, utilisation du format demandé ou meilleur disponible...');
          bestFormatId = findBestFormatFromList(availableFormats, format, 0);
          // Si le meilleur disponible est pire que le format demandé, utiliser le format demandé
          if (bestFormatId) {
            const bestFormat = availableFormats.find((f: any) => f.format_id === bestFormatId);
            if (bestFormat && bestFormat.height < formatHeight) {
              console.log(`✅ Utilisation du format demandé ${quality} (${formatHeight}p) - meilleur que le meilleur disponible`);
            } else {
              actualQuality = bestFormatId;
              console.log(`✅ Format de meilleure qualité trouvé: ${actualQuality}`);
            }
          } else {
            console.log(`✅ Utilisation du format demandé ${quality} (${formatHeight}p)`);
          }
        } else {
          actualQuality = bestFormatId;
          console.log(`✅ Format de meilleure qualité trouvé: ${actualQuality}`);
        }
      } else {
        console.log(`✅ Format ${quality} disponible (${formatHeight || 'N/A'}p)`);
      }
    }
  }
  
  // Récupérer les informations du format sélectionné
  if (format === 'mp4' && actualQuality && actualQuality !== 'best') {
    if (formatsRetrieved && availableFormats.length > 0) {
      const selectedFormat = availableFormats.find((f: any) => f.format_id === actualQuality);
      if (selectedFormat) {
        formatInfo = {
          hasAudio: selectedFormat.acodec && selectedFormat.acodec !== 'none',
          height: selectedFormat.height || null,
        };
        console.log(`📊 Format sélectionné: ${formatInfo.hasAudio ? 'combiné' : 'vidéo seul'}, hauteur: ${formatInfo.height || 'N/A'}p`);
      }
    } else {
      // Essayer de récupérer les infos du format même si la liste complète a échoué
      formatInfo = await getFormatInfo(ytDlpPath, urlOnly, actualQuality, playerClient);
      if (formatInfo) {
        console.log(`📊 Format sélectionné: ${formatInfo.hasAudio ? 'combiné' : 'vidéo seul'}, hauteur: ${formatInfo.height || 'N/A'}p`);
      }
    }
  }
  
  // Utiliser spawn au lieu de exec pour avoir un meilleur contrôle et voir la progression
  return new Promise((resolve, reject) => {
    // Construire les arguments directement
    const args: string[] = [];
    
    // Options de compatibilité YouTube essentielles
    // Si on a un token PO, l'ajouter aux arguments extractor
    let extractorArgs = `youtube:player_client=${playerClient}`;
    if (poToken) {
      // Pour le client Android, le format est: android.gvs+TOKEN
      // Pour les autres clients, on peut utiliser directement le token
      if (playerClient === 'android') {
        extractorArgs += `;po_token=android.gvs+${poToken}`;
      } else {
        extractorArgs += `;po_token=${poToken}`;
      }
      console.log('🔑 Utilisation du token PO pour accéder aux formats haute qualité');
    }
    args.push('--extractor-args', extractorArgs);
    // Ajouter des options de compatibilité supplémentaires
    args.push('--no-playlist', '--progress', '--newline', '--no-mtime');
    
    if (format === 'mp3') {
      // Pour MP3, extraire l'audio et convertir en MP3
      if (actualQuality && actualQuality !== 'best') {
        // Utiliser le format ID trouvé
        args.push('-f', actualQuality, '-x', '--audio-format', 'mp3', '--audio-quality', '192K');
      } else {
        // Fallback: laisser yt-dlp choisir le meilleur format audio
        args.push('-x', '--audio-format', 'mp3', '--audio-quality', '192K');
      }
    } else {
      // Pour MP4, télécharger directement en MP4
      if (actualQuality && actualQuality !== 'best') {
        if (formatInfo && formatInfo.hasAudio) {
          // Format combiné (vidéo+audio) : utiliser directement
          args.push('-f', actualQuality);
          } else {
            // Format vidéo seul : combiner avec le meilleur audio
            // Utiliser une syntaxe qui préserve la qualité vidéo demandée
            if (formatInfo && formatInfo.height) {
              const minHeight = formatInfo.height;
              // Essayer le format spécifique + bestaudio, fallback vers formats de même résolution ou supérieure
              // Si la qualité est faible, accepter aussi les formats de qualité inférieure pour le fallback
              if (minHeight >= 720) {
                args.push('-f', `${actualQuality}+bestaudio/bestvideo[height=${minHeight}]+bestaudio/bestvideo[height>=${minHeight}]+bestaudio/best[height>=720]`);
              } else {
                // Qualité faible, accepter ce qui est disponible
                args.push('-f', `${actualQuality}+bestaudio/best`);
              }
            } else {
              // Pas d'info de hauteur, utiliser le format + bestaudio avec fallback flexible
              args.push('-f', `${actualQuality}+bestaudio/bestvideo[height>=1080]+bestaudio/bestvideo[height>=720]+bestaudio/best`);
            }
          }
      } else {
        // Fallback: stratégie TRÈS agressive pour trouver les formats haute qualité
        // Utiliser une syntaxe simplifiée qui peut mieux fonctionner
        // Essayer d'abord les formats combinés (plus rapides), puis vidéo+audio séparés
        console.log('🎯 Utilisation d\'une syntaxe yt-dlp TRÈS agressive pour forcer l\'accès aux formats haute qualité');
        console.log('💡 Basé sur l\'analyse de Cobalt: priorité aux formats combinés (plus rapides), puis vidéo+audio séparés');
        args.push('-f', 
          // 1. Formats combinés 1080p (préférés - plus rapides, comme Cobalt)
          'best[height>=1080]/' +
          'bestvideo[height>=1080]+bestaudio/' +
          // 2. Formats combinés 720p
          'best[height>=720]/' +
          'bestvideo[height>=720]+bestaudio/' +
          // 3. Fallback: meilleur format disponible (même < 720p) - seulement en dernier recours
          'best'
        );
      }
    }
    
    // Ajouter le template de sortie et l'URL en dernier
    args.push('-o', outputTemplate, urlOnly);
    
    console.log(`🚀 Lancement: ${ytDlpPath} ${args.join(' ')}`);
    
    const ytDlpProcess = spawn(ytDlpPath, args, {
      cwd: tempDir,
      shell: false,
      env: {
        ...process.env,
        // Forcer l'utilisation de Python 3 si disponible
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      },
    });
    
    let stdout = '';
    let stderr = '';
    let lastProgress = Date.now();
    let progressTimeout: NodeJS.Timeout;
    
    ytDlpProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      stdout += output;
      // Afficher la progression toutes les 2 secondes
      const now = Date.now();
      if (now - lastProgress > 2000) {
        const lines = output.split('\n').filter((l: string) => l.trim());
        const progressLine = lines.find((l: string) => l.includes('%') || l.includes('Downloading') || l.includes('Extracting'));
        if (progressLine) {
          console.log(`📊 ${progressLine.trim()}`);
        }
        lastProgress = now;
      }
    });
    
    ytDlpProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString();
      stderr += output;
      // Afficher les erreurs/warnings et la progression
      if (output.includes('ERROR')) {
        console.error(`❌ ${output.trim()}`);
      } else if (output.includes('WARNING')) {
        console.warn(`⚠️ ${output.trim()}`);
      } else if (output.includes('%') || output.includes('Downloading') || output.includes('Extracting')) {
        // La progression peut aussi être sur stderr
        const now = Date.now();
        if (now - lastProgress > 2000) {
          console.log(`📊 ${output.trim()}`);
          lastProgress = now;
        }
      }
    });
    
    ytDlpProcess.on('close', (code: number) => {
      clearTimeout(progressTimeout);
      
      if (code !== 0) {
        console.error('❌ yt-dlp a échoué avec le code:', code);
        console.error('stderr:', stderr.substring(0, 1000));
        console.error('stdout:', stdout.substring(0, 1000));
        
        // Si le format n'est pas disponible, créer une erreur spéciale
        if (stderr.includes('Requested format is not available') || stderr.includes('format is not available')) {
          reject(new Error('FORMAT_NOT_AVAILABLE'));
        } else {
          reject(new Error(`yt-dlp a échoué (code ${code}): ${stderr.substring(0, 300) || stdout.substring(0, 300)}`));
        }
        return;
      }
      
      console.log('✅ yt-dlp terminé avec succès');
      
      // Attendre un peu pour s'assurer que le fichier est écrit
      setTimeout(() => {
        // Trouver le fichier téléchargé (il devrait commencer par download_timestamp)
        const files = fs.readdirSync(tempDir);
        const downloadedFile = files.find(f => f.startsWith(`download_${timestamp}`));
        
        if (!downloadedFile) {
          console.error('❌ Fichiers disponibles:', files);
          reject(new Error(`Fichier téléchargé non trouvé. Fichiers présents: ${files.join(', ')}`));
          return;
        }
        
        console.log(`📁 Fichier téléchargé: ${downloadedFile}`);
        
        const filePath = path.join(tempDir, downloadedFile);
        
        // Vérifier l'extension du fichier téléchargé
        const actualExt = path.extname(downloadedFile).toLowerCase().replace('.', '');
        if (actualExt !== format && actualExt !== `${format}_`) {
          console.warn(`⚠️ Extension attendue: ${format}, extension réelle: ${actualExt}`);
        }
        
        resolve({ filePath, fileName: finalFileName });
      }, 1000);
    });
    
    ytDlpProcess.on('error', (error: Error) => {
      clearTimeout(progressTimeout);
      console.error('❌ Erreur lors du lancement de yt-dlp:', error);
      reject(error);
    });
    
    // Afficher un message de progression toutes les 30 secondes
    progressTimeout = setInterval(() => {
      console.log('⏳ yt-dlp est toujours en cours d\'exécution...');
    }, 30000);
    
    // Timeout de 10 minutes
    setTimeout(() => {
      clearInterval(progressTimeout);
      ytDlpProcess.kill();
      reject(new Error('Timeout: yt-dlp a pris trop de temps (10 minutes)'));
    }, 600000);
  });
}

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;
  
  try {
    const { url, format, quality } = await request.json();

    console.log('📥 Début du téléchargement:', { url, format, quality });

    if (!url) {
      console.error('❌ URL manquante');
      return NextResponse.json(
        { error: 'URL requise' },
        { status: 400 }
      );
    }

    // Forcer le format MP3 uniquement
    const audioFormat: 'mp3' = 'mp3';
    const audioQuality = 'best';

    console.log('🎵 Téléchargement audio uniquement (MP3)');

    if (!ytdl.validateURL(url)) {
      console.error('❌ URL invalide:', url);
      return NextResponse.json(
        { error: 'URL YouTube invalide' },
        { status: 400 }
      );
    }

    // Créer le dossier temporaire
    tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    console.log('📋 Récupération des informations de la vidéo...');
    // Récupérer les informations de la vidéo d'abord
    let info;
    try {
      info = await ytdl.getInfo(url);
      console.log('✅ Informations récupérées:', info.videoDetails.title);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des infos:', error);
      return NextResponse.json(
        { error: `Impossible de récupérer les informations de la vidéo: ${error instanceof Error ? error.message : 'Erreur inconnue'}` },
        { status: 500 }
      );
    }

    const title = info.videoDetails.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);

    // Utiliser yt-dlp pour télécharger l'audio (MP3 uniquement)
    const ytDlpAvailable = await isYtDlpAvailable();
    console.log('🔧 yt-dlp disponible:', ytDlpAvailable);
    
    if (!ytDlpAvailable) {
      return NextResponse.json(
        { error: 'yt-dlp non disponible. Veuillez installer yt-dlp.' },
        { status: 500 }
      );
    }

    try {
      console.log('📦 Téléchargement audio avec yt-dlp...');
      const videoTitle = info.videoDetails.title;
      
      // Utiliser le client iOS (le plus fiable pour l'audio selon Cobalt)
      const client = 'ios';
      console.log(`🔄 Téléchargement avec le client ${client}...`);
      
      const downloadResult = await downloadWithYtDlp(
        url, 
        audioFormat, 
        tempDir, 
        videoTitle, 
        audioQuality, 
        client
      );
      
      const filePath = downloadResult.filePath;
      const fileName = downloadResult.fileName;
      console.log('✅ Fichier audio téléchargé:', fileName);
      
      // Attendre un peu pour s'assurer que le fichier est complètement écrit
      await new Promise(resolve => setTimeout(resolve, 500));
        
        if (!fs.existsSync(filePath)) {
          throw new Error('Le fichier téléchargé n\'existe pas');
        }
        
        const fileBuffer = fs.readFileSync(filePath);
        const fileSize = fileBuffer.length;
        console.log(`✅ Fichier lu: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
        
        // Nettoyer le fichier temporaire
        fs.unlinkSync(filePath);
        
        console.log('✅ Téléchargement terminé avec yt-dlp');
        
        // Le nom de fichier est déjà nettoyé, s'assurer que l'extension est correcte
        let safeFileName = fileName;
        if (safeFileName.endsWith(`.mp3_`)) {
          safeFileName = safeFileName.slice(0, -1);
        }
        // S'assurer que le fichier a l'extension .mp3
        if (!safeFileName.endsWith('.mp3')) {
          safeFileName = safeFileName.replace(/\.[^.]*$/, '') + '.mp3';
        }
        
        // Nettoyer les caractères spéciaux pour l'en-tête HTTP (garder les espaces et caractères normaux)
        // Utiliser un format compatible avec tous les navigateurs
        const asciiFileName = safeFileName.replace(/[^\x20-\x7E]/g, '_'); // Garder seulement ASCII imprimable
        
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': 'audio/mpeg', // MP3 uniquement
            // Utiliser les deux formats : simple (pour compatibilité) et UTF-8 (pour caractères spéciaux)
            'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(safeFileName)}`,
          },
        });
      } catch (error) {
        console.error('❌ Erreur avec yt-dlp:', error);
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        return NextResponse.json(
          { error: `Erreur lors du téléchargement audio: ${errorMessage}` },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('❌ Erreur lors du téléchargement:', error);
    
    // Nettoyer les fichiers temporaires en cas d'erreur
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        const files = fs.readdirSync(tempDir);
        files.forEach(file => {
          const filePath = path.join(tempDir!, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      } catch (cleanupError) {
        console.error('Erreur lors du nettoyage:', cleanupError);
      }
    }
    
    let errorMessage = error instanceof Error ? error.message : 'Erreur lors du téléchargement';
    
    // Améliorer les messages d'erreur 403
    if (errorMessage.includes('403') || (error as any)?.statusCode === 403) {
      errorMessage = 'YouTube bloque l\'accès (403). Cette erreur est courante avec ytdl-core qui est obsolète.\n\n💡 Solution recommandée: Installez yt-dlp:\n- macOS: brew install yt-dlp\n- Linux: pip install yt-dlp ou sudo apt install yt-dlp\n- Windows: pip install yt-dlp\n\nAprès installation, redémarrez le serveur et réessayez.';
    }
    
    console.error('💥 Message d\'erreur:', errorMessage);
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}