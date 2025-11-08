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
    const allVideoFormats = formats.filter((f: any) => 
      f.vcodec && f.vcodec !== 'none' && f.height && (!f.acodec || f.acodec === 'none')
    );
    
    if (allVideoFormats.length > 0) {
      allVideoFormats.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      const bestAvailable = allVideoFormats[0];
      console.warn(`⚠️ Format disponible le plus élevé: ${bestAvailable.format_id} (${bestAvailable.height}p) - ATTENTION: Qualité inférieure à ${minHeight}p`);
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
  
  console.log(`🔧 Exécution de yt-dlp (cela peut prendre quelques minutes)...`);
  console.log(`📋 URL traitée: ${urlOnly}`);
  console.log(`📁 Dossier de sortie: ${tempDir}`);
  console.log(`📝 Nom de fichier final: ${finalFileName}`);
  console.log(`🎯 Qualité sélectionnée: ${quality || 'best'}`);
  console.log(`🌐 Client YouTube utilisé: ${playerClient}`);
  
  // Récupérer les formats disponibles AVANT de télécharger
  console.log('🔍 Récupération des formats disponibles avec le client', playerClient, '...');
  let availableFormats: any[] = [];
  let videoInfo: any = null;
  let formatsRetrieved = false;
  try {
    const { stdout } = await execAsync(
      `"${ytDlpPath}" --dump-json --extractor-args "youtube:player_client=${playerClient}" --no-playlist "${urlOnly}"`,
      { timeout: 30000 }
    );
    videoInfo = JSON.parse(stdout);
    availableFormats = videoInfo.formats || [];
    formatsRetrieved = availableFormats.length > 0;
    if (formatsRetrieved) {
      console.log(`✅ ${availableFormats.length} formats disponibles`);
    } else {
      console.warn('⚠️ Aucun format disponible dans la réponse JSON');
    }
  } catch (error: any) {
    console.warn('⚠️ Impossible de récupérer les formats disponibles avec --dump-json');
    // Ne pas abandonner, on utilisera une syntaxe stricte dans les arguments yt-dlp
  }
  
  // Si "best" est sélectionné, trouver le meilleur format disponible
  let actualQuality = quality;
  let formatInfo: { hasAudio: boolean; height: number | null } | null = null;
  
  if (quality === 'best' || !quality) {
    console.log('🔍 Recherche du meilleur format disponible (priorité 1080p, minimum 720p)...');
    // Utiliser une fonction qui force une qualité minimale de 720p
    if (formatsRetrieved && availableFormats.length > 0) {
      const bestFormatId = findBestFormatFromList(availableFormats, format, 720);
      if (bestFormatId) {
        actualQuality = bestFormatId;
        console.log(`✅ Meilleur format trouvé: ${actualQuality}`);
      } else {
        console.warn('⚠️ Aucun format de bonne qualité trouvé dans la liste, utilisation de la stratégie par défaut');
      }
    } else {
      // Si on n'a pas pu récupérer les formats, laisser yt-dlp choisir avec une syntaxe stricte
      console.warn('⚠️ Impossible de lister les formats, utilisation d\'une syntaxe stricte (minimum 720p, préfère 1080p)');
      actualQuality = 'best'; // Sera géré par la syntaxe stricte dans les args
    }
  } else if (quality && formatsRetrieved && availableFormats.length > 0) {
    // Vérifier si le format demandé est disponible
    const requestedFormat = availableFormats.find((f: any) => f.format_id === quality);
    if (!requestedFormat) {
      console.warn(`⚠️ Format ${quality} non disponible avec le client ${playerClient}, recherche du meilleur format disponible...`);
      const bestFormatId = findBestFormatFromList(availableFormats, format, 720);
      if (bestFormatId) {
        actualQuality = bestFormatId;
        console.log(`✅ Format de remplacement trouvé: ${actualQuality}`);
      }
    } else {
      // Vérifier aussi la résolution du format demandé
      const formatHeight = requestedFormat.height;
      if (formatHeight && formatHeight < 720) {
        console.warn(`⚠️ Format ${quality} disponible mais résolution faible (${formatHeight}p), recherche d'un meilleur format...`);
        const bestFormatId = findBestFormatFromList(availableFormats, format, 720);
        if (bestFormatId) {
          actualQuality = bestFormatId;
          console.log(`✅ Format de meilleure qualité trouvé: ${actualQuality}`);
        } else {
          console.log(`✅ Utilisation du format demandé ${quality} (${formatHeight}p)`);
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
    args.push('--extractor-args', `youtube:player_client=${playerClient}`);
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
            // Priorité: format demandé + audio, puis meilleur format de même résolution, puis meilleur format >= 720p
            args.push('-f', `${actualQuality}+bestaudio/bestvideo[height=${minHeight}]+bestaudio/bestvideo[height>=${Math.max(minHeight, 720)}]+bestaudio/best[height>=${Math.max(minHeight, 720)}]`);
          } else {
            // Pas d'info de hauteur, utiliser le format + bestaudio avec fallback minimum 720p, idéalement 1080p
            args.push('-f', `${actualQuality}+bestaudio/bestvideo[height>=1080]+bestaudio/bestvideo[height>=720]+bestaudio/best[height>=720]`);
          }
        }
      } else {
        // Fallback: utiliser une qualité minimale de 720p, préférer 1080p
        // Essayer d'abord 1080p, puis 720p minimum
        args.push('-f', 'bestvideo[height>=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height>=1080]+bestaudio/bestvideo[height>=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height>=720]+bestaudio/best[height>=720][ext=mp4]/best[height>=720]');
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

    if (!url || !format) {
      console.error('❌ Paramètres manquants');
      return NextResponse.json(
        { error: 'URL et format requis' },
        { status: 400 }
      );
    }

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

    // Essayer d'utiliser yt-dlp en premier (plus fiable)
    const ytDlpAvailable = await isYtDlpAvailable();
    console.log('🔧 yt-dlp disponible:', ytDlpAvailable);
    
    if (ytDlpAvailable) {
      try {
        console.log('📦 Utilisation de yt-dlp...');
        const videoTitle = info.videoDetails.title;
        let filePath: string, fileName: string;
        
        // Liste des clients à essayer dans l'ordre de préférence
        // Android en premier car c'est souvent le plus fiable actuellement
        const clients = ['android', 'tv', 'ios', 'web'];
        let lastError: Error | null = null;
        let downloadResult: { filePath: string; fileName: string } | null = null;
        
        for (const client of clients) {
          try {
            console.log(`🔄 Tentative avec le client ${client}...`);
            downloadResult = await downloadWithYtDlp(url, format, tempDir, videoTitle, quality, client);
            console.log(`✅ Succès avec le client ${client}`);
            break;
          } catch (error: any) {
            // Si le format n'est pas disponible, essayer avec "best" pour ce client
            if (error.message === 'FORMAT_NOT_AVAILABLE' && quality && quality !== 'best') {
              console.warn(`⚠️ Format ${quality} non disponible avec ${client}, tentative avec meilleur format disponible...`);
              try {
                downloadResult = await downloadWithYtDlp(url, format, tempDir, videoTitle, 'best', client);
                console.log(`✅ Succès avec le client ${client} (format automatique)`);
                break;
              } catch (fallbackError: any) {
                console.warn(`⚠️ Client ${client} a échoué même avec format automatique: ${fallbackError.message?.substring(0, 100)}`);
                lastError = fallbackError;
                continue;
              }
            } else {
              console.warn(`⚠️ Client ${client} a échoué: ${error.message?.substring(0, 100)}`);
              lastError = error;
              // Continuer avec le client suivant
              continue;
            }
          }
        }
        
        if (!downloadResult) {
          throw lastError || new Error('Tous les clients YouTube ont échoué');
        }
        
        filePath = downloadResult.filePath;
        fileName = downloadResult.fileName;
        console.log('✅ Fichier téléchargé:', fileName);
        
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
        if (safeFileName.endsWith(`.${format}_`)) {
          safeFileName = safeFileName.slice(0, -1);
        }
        
        // Nettoyer les caractères spéciaux pour l'en-tête HTTP (garder les espaces et caractères normaux)
        // Utiliser un format compatible avec tous les navigateurs
        const asciiFileName = safeFileName.replace(/[^\x20-\x7E]/g, '_'); // Garder seulement ASCII imprimable
        
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': format === 'mp3' ? 'audio/mpeg' : 'video/mp4',
            // Utiliser les deux formats : simple (pour compatibilité) et UTF-8 (pour caractères spéciaux)
            'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(safeFileName)}`,
          },
        });
      } catch (error) {
        console.error('❌ Erreur avec yt-dlp, utilisation de ytdl-core:', error);
        // Continuer avec ytdl-core
      }
    }

    // Fallback sur ytdl-core
    console.log('📦 Utilisation de ytdl-core...');

    if (format === 'mp4') {
      console.log('🎬 Format MP4 demandé');
      
      // Chercher d'abord un format combiné (vidéo + audio) en MP4
      let formats = ytdl.filterFormats(info.formats, (format) => {
        return format.hasVideo && format.hasAudio && format.container === 'mp4';
      });

      console.log(`📊 Formats MP4 avec vidéo+audio: ${formats.length}`);

      // Si aucun format MP4 combiné, chercher n'importe quel format combiné
      if (formats.length === 0) {
        formats = ytdl.filterFormats(info.formats, (format) => {
          return format.hasVideo && format.hasAudio;
        });
        console.log(`📊 Formats disponibles avec vidéo+audio (tous formats): ${formats.length}`);
      }

      // Si toujours rien, utiliser le meilleur format disponible
      if (formats.length === 0) {
        formats = info.formats.filter((format) => format.hasVideo);
        console.log(`📊 Formats vidéo disponibles: ${formats.length}`);
      }

      if (formats.length > 0) {
        // Utiliser le format de meilleure qualité disponible
        const bestFormat = formats[0];
        const fileExtension = bestFormat.container || 'mp4';
        console.log('✅ Format sélectionné:', bestFormat.qualityLabel || bestFormat.quality, `(${fileExtension})`);
        const outputPath = path.join(tempDir, `${title}.${fileExtension}`);

        console.log('📥 Début du téléchargement du stream...');
        const stream = ytdl.downloadFromInfo(info, { format: bestFormat });
        const writeStream = fs.createWriteStream(outputPath);
        
        // Gestion des erreurs du stream
        let streamError: Error | null = null;
        stream.on('error', (error: any) => {
          console.error('❌ Erreur du stream:', error);
          streamError = error;
          writeStream.destroy();
        });
        
        stream.pipe(writeStream);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error('❌ Timeout du téléchargement (5 minutes)');
            stream.destroy();
            writeStream.destroy();
            reject(new Error('Timeout: le téléchargement a pris trop de temps (limite: 5 minutes)'));
          }, 300000); // 5 minutes de timeout

          writeStream.on('finish', () => {
            clearTimeout(timeout);
            if (streamError) {
              reject(streamError);
              return;
            }
            console.log('✅ Stream terminé');
            resolve();
          });
          writeStream.on('error', (error) => {
            clearTimeout(timeout);
            console.error('❌ Erreur du writeStream:', error);
            reject(error);
          });
        }).catch((error) => {
          // Vérifier si c'est une erreur 403
          if (streamError && (streamError as any).statusCode === 403) {
            throw new Error('YouTube bloque l\'accès (403). Solution: installez yt-dlp avec "brew install yt-dlp" (macOS) ou "pip install yt-dlp" (Linux/Windows)');
          }
          // Vérifier aussi dans l'erreur directe
          if ((error as any).statusCode === 403 || error.message?.includes('403')) {
            throw new Error('YouTube bloque l\'accès (403). Solution: installez yt-dlp avec "brew install yt-dlp" (macOS) ou "pip install yt-dlp" (Linux/Windows)');
          }
          throw error;
        });

        console.log('✅ Fichier écrit, lecture du buffer...');
        const fileBuffer = fs.readFileSync(outputPath);
        const fileSize = fileBuffer.length;
        console.log(`✅ Fichier lu: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
        fs.unlinkSync(outputPath);
        console.log('✅ Fichier envoyé');

        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': fileExtension === 'mp4' ? 'video/mp4' : 'video/webm',
            'Content-Disposition': `attachment; filename="${title}.${fileExtension}"`,
          },
        });
      }

      // Si pas de format combiné, séparer vidéo et audio
      const videoFormats = ytdl.filterFormats(info.formats, 'videoonly');
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');

      if (videoFormats.length === 0 || audioFormats.length === 0) {
        return NextResponse.json(
          { error: 'Format vidéo non disponible' },
          { status: 400 }
        );
      }

      const videoFormat = videoFormats.find(f => f.hasVideo) || videoFormats[0];
      const audioFormat = audioFormats.find(f => f.hasAudio) || audioFormats[0];

      const videoPath = path.join(tempDir, `${title}_video.${videoFormat.container}`);
      const audioPath = path.join(tempDir, `${title}_audio.${audioFormat.container}`);
      const outputPath = path.join(tempDir, `${title}.mp4`);

      try {
        const videoStream = ytdl.downloadFromInfo(info, { format: videoFormat });
        const videoWriteStream = fs.createWriteStream(videoPath);
        videoStream.pipe(videoWriteStream);

        const audioStream = ytdl.downloadFromInfo(info, { format: audioFormat });
        const audioWriteStream = fs.createWriteStream(audioPath);
        audioStream.pipe(audioWriteStream);

        await Promise.all([
          new Promise<void>((resolve, reject) => {
            videoWriteStream.on('finish', () => resolve());
            videoWriteStream.on('error', reject);
          }),
          new Promise<void>((resolve, reject) => {
            audioWriteStream.on('finish', () => resolve());
            audioWriteStream.on('error', reject);
          }),
        ]);

        // Essayer de fusionner avec ffmpeg
        try {
          await execAsync(
            `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest "${outputPath}" -y`
          );
          const fileBuffer = fs.readFileSync(outputPath);
          [videoPath, audioPath, outputPath].forEach(file => {
            if (fs.existsSync(file)) fs.unlinkSync(file);
          });

          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Disposition': `attachment; filename="${title}.mp4"`,
            },
          });
        } catch {
          // Si ffmpeg n'est pas disponible, retourner la vidéo seule
          const fileBuffer = fs.readFileSync(videoPath);
          [videoPath, audioPath, outputPath].forEach(file => {
            if (fs.existsSync(file)) fs.unlinkSync(file);
          });

          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Disposition': `attachment; filename="${title}.${videoFormat.container}"`,
            },
          });
        }
      } catch (error) {
        [videoPath, audioPath, outputPath].forEach(file => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        });
        throw error;
      }
    } else if (format === 'mp3') {
      console.log('🎵 Format MP3 demandé');
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');

      console.log(`📊 Formats audio disponibles: ${audioFormats.length}`);

      if (audioFormats.length === 0) {
        console.error('❌ Aucun format audio disponible');
        return NextResponse.json(
          { error: 'Format audio non disponible' },
          { status: 400 }
        );
      }

        const audioFormat = audioFormats.find(f => f.hasAudio) || audioFormats[0];
      console.log('✅ Format audio sélectionné:', audioFormat.container, audioFormat.audioBitrate);
      const audioPath = path.join(tempDir, `${title}_audio.${audioFormat.container}`);
      const outputPath = path.join(tempDir, `${title}.mp3`);

      try {
        console.log('📥 Début du téléchargement audio...');
        const audioStream = ytdl.downloadFromInfo(info, { format: audioFormat });
        const audioWriteStream = fs.createWriteStream(audioPath);
        
        // Gestion des erreurs du stream
        let streamError: Error | null = null;
        audioStream.on('error', (error: any) => {
          console.error('❌ Erreur du stream audio:', error);
          streamError = error;
          audioWriteStream.destroy();
        });
        
        audioStream.pipe(audioWriteStream);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error('❌ Timeout du téléchargement audio');
            audioStream.destroy();
            audioWriteStream.destroy();
            reject(new Error('Timeout: le téléchargement audio a pris trop de temps'));
          }, 300000); // 5 minutes

          audioWriteStream.on('finish', () => {
            clearTimeout(timeout);
            if (streamError) {
              reject(streamError);
              return;
            }
            console.log('✅ Stream audio terminé');
            resolve();
          });
          audioWriteStream.on('error', (error) => {
            clearTimeout(timeout);
            console.error('❌ Erreur du writeStream audio:', error);
            reject(error);
          });
        }).catch((error) => {
          // Vérifier si c'est une erreur 403
          if (streamError && (streamError as any).statusCode === 403) {
            throw new Error('YouTube bloque l\'accès (403). Solution: installez yt-dlp avec "brew install yt-dlp" (macOS) ou "pip install yt-dlp" (Linux/Windows)');
          }
          // Vérifier aussi dans l'erreur directe
          if ((error as any).statusCode === 403 || error.message?.includes('403')) {
            throw new Error('YouTube bloque l\'accès (403). Solution: installez yt-dlp avec "brew install yt-dlp" (macOS) ou "pip install yt-dlp" (Linux/Windows)');
          }
          throw error;
        });

        // Essayer de convertir en MP3 avec ffmpeg
        try {
          console.log('🔄 Conversion en MP3 avec ffmpeg...');
          await execAsync(
            `ffmpeg -i "${audioPath}" -acodec libmp3lame -ab 192k "${outputPath}" -y`
          );
          const fileBuffer = fs.readFileSync(outputPath);
          fs.unlinkSync(audioPath);
          fs.unlinkSync(outputPath);
          console.log('✅ Conversion MP3 réussie');

          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Disposition': `attachment; filename="${title}.mp3"`,
            },
          });
        } catch (ffmpegError) {
          console.warn('⚠️ ffmpeg non disponible, retour de l\'audio original');
          // Si ffmpeg n'est pas disponible, retourner l'audio original
          const fileBuffer = fs.readFileSync(audioPath);
          fs.unlinkSync(audioPath);

          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': 'audio/webm',
              'Content-Disposition': `attachment; filename="${title}.${audioFormat.container}"`,
            },
          });
        }
      } catch (error) {
        [audioPath, outputPath].forEach(file => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        });
        throw error;
      }
    } else {
      return NextResponse.json(
        { error: 'Format non supporté' },
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