import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;
  let audioPath: string | null = null;
  let outputPath: string | null = null;

  try {
    const { url } = await request.json();

    console.log('📥 Début du téléchargement audio MP3:', url);

    if (!url) {
      return NextResponse.json(
        { error: 'URL requise' },
        { status: 400 }
      );
    }

    if (!ytdl.validateURL(url)) {
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

    // Récupérer les informations de la vidéo
    console.log('📋 Récupération des informations...');
    const info = await ytdl.getInfo(url);
    console.log('✅ Informations récupérées:', info.videoDetails.title);

    // Obtenir les formats audio disponibles
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    console.log(`📊 ${audioFormats.length} formats audio disponibles`);

    if (audioFormats.length === 0) {
      return NextResponse.json(
        { error: 'Aucun format audio disponible pour cette vidéo' },
        { status: 400 }
      );
    }

    // Sélectionner le meilleur format audio (le premier est généralement le meilleur après filtrage)
    const bestAudioFormat = audioFormats[0];
    console.log('✅ Format audio sélectionné:', bestAudioFormat.itag, bestAudioFormat.container, bestAudioFormat.audioBitrate + 'kbps');

    // Créer les chemins de fichiers
    const timestamp = Date.now();
    const safeTitle = info.videoDetails.title
      .replace(/[^a-z0-9]/gi, '_')
      .substring(0, 50);
    
    audioPath = path.join(tempDir, `${timestamp}_audio.${bestAudioFormat.container}`);
    outputPath = path.join(tempDir, `${timestamp}.mp3`);

    // Télécharger l'audio
    console.log('📥 Téléchargement de l\'audio...');
    const audioStream = ytdl.downloadFromInfo(info, { format: bestAudioFormat });
    const writeStream = fs.createWriteStream(audioPath);

    // Gérer les erreurs du stream
    let streamError: Error | null = null;
    let bytesDownloaded = 0;
    let lastProgressTime = Date.now();

    audioStream.on('error', (error: any) => {
      console.error('❌ Erreur du stream audio:', error.message || error);
      streamError = error;
      writeStream.destroy();
    });

    audioStream.on('data', (chunk: Buffer) => {
      bytesDownloaded += chunk.length;
      const now = Date.now();
      // Afficher la progression toutes les 2 secondes
      if (now - lastProgressTime > 2000) {
        console.log(`📊 Téléchargement en cours: ${(bytesDownloaded / 1024 / 1024).toFixed(2)} MB`);
        lastProgressTime = now;
      }
    });

    audioStream.pipe(writeStream);

    // Attendre la fin du téléchargement
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('❌ Timeout du téléchargement (5 minutes)');
        audioStream.destroy();
        writeStream.destroy();
        reject(new Error('Timeout: le téléchargement a pris trop de temps'));
      }, 300000); // 5 minutes

      writeStream.on('finish', () => {
        clearTimeout(timeout);
        if (streamError) {
          // Vérifier si c'est une erreur 403
          if (streamError.message && streamError.message.includes('403')) {
            reject(new Error('YouTube bloque l\'accès (403). ytdl-core ne peut pas contourner cette restriction.'));
          } else {
            reject(streamError);
          }
          return;
        }
        console.log(`✅ Téléchargement audio terminé: ${(bytesDownloaded / 1024 / 1024).toFixed(2)} MB`);
        resolve();
      });

      writeStream.on('error', (error) => {
        clearTimeout(timeout);
        console.error('❌ Erreur lors de l\'écriture:', error);
        reject(error);
      });
    });

    // Vérifier que le fichier existe
    if (!fs.existsSync(audioPath)) {
      throw new Error('Le fichier audio téléchargé n\'existe pas');
    }

    const fileSize = fs.statSync(audioPath).size;
    console.log(`✅ Fichier audio téléchargé: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    // Convertir en MP3 avec ffmpeg
    console.log('🔄 Conversion en MP3 avec ffmpeg...');
    try {
      await execAsync(
        `ffmpeg -i "${audioPath}" -acodec libmp3lame -ab 192k -y "${outputPath}"`
      );
      console.log('✅ Conversion MP3 réussie');

      // Vérifier que le fichier MP3 existe
      if (!fs.existsSync(outputPath)) {
        throw new Error('Le fichier MP3 converti n\'existe pas');
      }

      // Lire le fichier MP3
      const fileBuffer = fs.readFileSync(outputPath);
      const finalSize = fileBuffer.length;
      console.log(`✅ Fichier MP3 créé: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);

      // Nettoyer les fichiers temporaires (après lecture du buffer)
      try {
        if (audioPath && fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
        if (outputPath && fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      } catch (cleanupErr) {
        // Ignorer les erreurs de nettoyage
      }

      // Créer un nom de fichier propre
      const cleanFileName = info.videoDetails.title
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100) + '.mp3';
      
      const asciiFileName = cleanFileName.replace(/[^\x20-\x7E]/g, '_');

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(cleanFileName)}`,
        },
      });
    } catch (ffmpegError: any) {
      console.warn('⚠️ ffmpeg non disponible ou erreur de conversion');
      console.warn('⚠️ Retour de l\'audio original au format', bestAudioFormat.container);
      
      // Si ffmpeg n'est pas disponible, retourner l'audio original
      const fileBuffer = fs.readFileSync(audioPath);
      
      // Nettoyer les fichiers temporaires (après lecture du buffer)
      try {
        if (audioPath && fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
        if (outputPath && fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      } catch (cleanupErr) {
        // Ignorer les erreurs de nettoyage
      }

      const cleanFileName = info.videoDetails.title
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100) + '.' + bestAudioFormat.container;
      
      const asciiFileName = cleanFileName.replace(/[^\x20-\x7E]/g, '_');
      const contentType = bestAudioFormat.container === 'webm' ? 'audio/webm' : 'audio/mp4';

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(cleanFileName)}`,
        },
      });
    }
  } catch (error) {
    console.error('❌ Erreur lors du téléchargement:', error);

    // Nettoyer les fichiers temporaires en cas d'erreur
    try {
      if (audioPath && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
      if (outputPath && fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch (cleanupError) {
      console.error('Erreur lors du nettoyage:', cleanupError);
    }

    let errorMessage = 'Erreur lors du téléchargement';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Messages d'erreur spécifiques
      if (errorMessage.includes('403')) {
        errorMessage = 'YouTube bloque l\'accès (403). ytdl-core ne peut pas contourner cette restriction.\n\n💡 Solutions possibles:\n- Réessayez plus tard (peut être temporaire)\n- Utilisez une autre vidéo\n- YouTube renforce ses restrictions anti-téléchargement';
      } else if (errorMessage.includes('Sign in to confirm your age')) {
        errorMessage = 'Cette vidéo nécessite une vérification d\'âge et ne peut pas être téléchargée.';
      } else if (errorMessage.includes('Private video')) {
        errorMessage = 'Cette vidéo est privée et ne peut pas être téléchargée.';
      } else if (errorMessage.includes('decipher') || errorMessage.includes('parse')) {
        errorMessage = 'YouTube a changé son système de protection. ytdl-core ne peut pas décoder cette vidéo.\n\n💡 Cette limitation est connue avec ytdl-core qui devient obsolète face aux protections YouTube.';
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

