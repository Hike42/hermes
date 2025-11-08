import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Fonction pour vérifier si yt-dlp est disponible
async function isYtDlpAvailable(): Promise<boolean> {
  try {
    await execAsync('yt-dlp --version');
    return true;
  } catch {
    return false;
  }
}

// Fonction pour trouver le chemin de yt-dlp
async function findYtDlpPath(): Promise<string | null> {
  const possiblePaths = [
    'yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    path.join(process.cwd(), 'yt-dlp'),
  ];

  for (const ytDlpPath of possiblePaths) {
    try {
      await execAsync(`"${ytDlpPath}" --version`);
      return ytDlpPath;
    } catch {
      continue;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;

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

    const title = info.videoDetails.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const videoTitle = info.videoDetails.title;

    // Essayer d'utiliser yt-dlp en premier (plus fiable)
    const ytDlpAvailable = await isYtDlpAvailable();
    console.log('🔧 yt-dlp disponible:', ytDlpAvailable);

    if (ytDlpAvailable) {
      try {
        console.log('📦 Utilisation de yt-dlp pour télécharger l\'audio...');
        const ytDlpPath = await findYtDlpPath();
        if (!ytDlpPath) {
          throw new Error('yt-dlp non trouvé');
        }

        // Nettoyer l'URL pour éviter de télécharger toute la playlist
        const urlOnly = url.split('&list=')[0].split('&start_radio=')[0];

        // Utiliser un nom de fichier simple avec timestamp
        const timestamp = Date.now();
        const outputTemplate = path.join(tempDir, `download_${timestamp}.%(ext)s`);

        // Créer un nom de fichier propre
        let cleanFileName = 'video';
        if (videoTitle) {
          cleanFileName = videoTitle
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100);
        }
        const finalFileName = `${cleanFileName}.mp3`;

        console.log(`🚀 Lancement de yt-dlp pour extraire l'audio en MP3...`);

        // Utiliser spawn pour avoir un meilleur contrôle
        return new Promise<NextResponse>((resolve, reject) => {
          const args = [
            '--extractor-args', 'youtube:player_client=web',
            '--no-playlist',
            '--progress',
            '--newline',
            '--no-mtime',
            '-x', // Extraire l'audio
            '--audio-format', 'mp3',
            '--audio-quality', '192K',
            '-o', outputTemplate,
            urlOnly,
          ];

          console.log(`📋 Commande: ${ytDlpPath} ${args.join(' ')}`);

          const ytDlpProcess = spawn(ytDlpPath, args, {
            cwd: tempDir || process.cwd(),
            shell: false,
            env: {
              ...process.env,
              PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
            },
          }) as any;

          let stdout = '';
          let stderr = '';
          let lastProgress = Date.now();

          ytDlpProcess.stdout.on('data', (data: Buffer) => {
            const output = data.toString();
            stdout += output;
            const now = Date.now();
            if (now - lastProgress > 2000) {
              const lines = output.split('\n').filter((l: string) => l.trim());
              const progressLine = lines.find((l: string) => 
                l.includes('%') || l.includes('Downloading') || l.includes('Extracting')
              );
              if (progressLine) {
                console.log(`📊 ${progressLine.trim()}`);
              }
              lastProgress = now;
            }
          });

          ytDlpProcess.stderr.on('data', (data: Buffer) => {
            const output = data.toString();
            stderr += output;
            if (output.includes('ERROR')) {
              console.error(`❌ ${output.trim()}`);
            } else if (output.includes('WARNING')) {
              console.warn(`⚠️ ${output.trim()}`);
            } else if (output.includes('%') || output.includes('Downloading') || output.includes('Extracting')) {
              const now = Date.now();
              if (now - lastProgress > 2000) {
                console.log(`📊 ${output.trim()}`);
                lastProgress = now;
              }
            }
          });

          ytDlpProcess.on('close', (code: number) => {
            if (code !== 0) {
              console.error('❌ yt-dlp a échoué avec le code:', code);
              console.error('stderr:', stderr.substring(0, 500));
              
              // Si yt-dlp échoue, essayer avec ytdl-core comme fallback
              console.log('📦 Passage au fallback ytdl-core...');
              downloadWithYtdlCore(info, tempDir, title, videoTitle)
                .then(result => resolve(result))
                .catch(error => reject(error));
              return;
            }

            console.log('✅ yt-dlp terminé avec succès');

            // Attendre un peu pour s'assurer que le fichier est écrit
            setTimeout(() => {
              if (!tempDir) {
                reject(new Error('tempDir est null'));
                return;
              }
              const files = fs.readdirSync(tempDir);
              const downloadedFile = files.find(f => f.startsWith(`download_${timestamp}`));

              if (!downloadedFile) {
                console.error('❌ Fichiers disponibles:', files);
                reject(new Error(`Fichier téléchargé non trouvé. Fichiers présents: ${files.join(', ')}`));
                return;
              }

              console.log(`📁 Fichier téléchargé: ${downloadedFile}`);

              const filePath = path.join(tempDir!, downloadedFile);

              // Vérifier que le fichier existe et a une taille
              if (!fs.existsSync(filePath)) {
                reject(new Error('Le fichier téléchargé n\'existe pas'));
                return;
              }

              const fileSize = fs.statSync(filePath).size;
              if (fileSize === 0) {
                reject(new Error('Le fichier téléchargé est vide'));
                return;
              }

              console.log(`✅ Fichier MP3 créé: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

              const fileBuffer = fs.readFileSync(filePath);

              // Nettoyer le fichier temporaire
              fs.unlinkSync(filePath);

              // Créer un nom de fichier propre
              const cleanFileName = videoTitle
                .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 100) + '.mp3';

              const asciiFileName = cleanFileName.replace(/[^\x20-\x7E]/g, '_');

              resolve(new NextResponse(fileBuffer, {
                headers: {
                  'Content-Type': 'audio/mpeg',
                  'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(cleanFileName)}`,
                },
              }));
            }, 1000);
          });

          ytDlpProcess.on('error', (error: Error) => {
            console.error('❌ Erreur lors du lancement de yt-dlp:', error);
            // Fallback vers ytdl-core
            downloadWithYtdlCore(info, tempDir, title, videoTitle)
              .then(result => resolve(result))
              .catch(err => reject(err));
          });

          // Timeout de 10 minutes
          setTimeout(() => {
            ytDlpProcess.kill();
            reject(new Error('Timeout: yt-dlp a pris trop de temps (10 minutes)'));
          }, 600000);
        });
      } catch (error) {
        console.error('❌ Erreur avec yt-dlp, utilisation de ytdl-core:', error);
        // Continuer avec ytdl-core
      }
    }

    // Fallback vers ytdl-core
    console.log('📦 Utilisation de ytdl-core (fallback)...');
    return await downloadWithYtdlCore(info, tempDir, title, videoTitle);

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

    let errorMessage = 'Erreur lors du téléchargement';

    if (error instanceof Error) {
      errorMessage = error.message;

      if (errorMessage.includes('403')) {
        errorMessage = 'YouTube bloque l\'accès (403). Réessayez plus tard ou utilisez une autre vidéo.';
      } else if (errorMessage.includes('Sign in to confirm your age')) {
        errorMessage = 'Cette vidéo nécessite une vérification d\'âge et ne peut pas être téléchargée.';
      } else if (errorMessage.includes('Private video')) {
        errorMessage = 'Cette vidéo est privée et ne peut pas être téléchargée.';
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// Fonction helper pour télécharger avec ytdl-core
async function downloadWithYtdlCore(
  info: any,
  tempDir: string,
  title: string,
  videoTitle: string
): Promise<NextResponse> {
  console.log('📦 Téléchargement audio avec ytdl-core...');

  const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
  console.log(`📊 ${audioFormats.length} formats audio disponibles`);

  if (audioFormats.length === 0) {
    throw new Error('Aucun format audio disponible pour cette vidéo');
  }

  const bestAudioFormat = audioFormats[0];
  console.log('✅ Format audio sélectionné:', bestAudioFormat.itag, bestAudioFormat.container, bestAudioFormat.audioBitrate + 'kbps');

  const timestamp = Date.now();
  const audioPath = path.join(tempDir, `${timestamp}_audio.${bestAudioFormat.container}`);
  const outputPath = path.join(tempDir, `${timestamp}.mp3`);

  try {
    console.log('📥 Téléchargement de l\'audio...');
    const audioStream = ytdl.downloadFromInfo(info, { format: bestAudioFormat });
    const writeStream = fs.createWriteStream(audioPath);

    let streamError: Error | null = null;
    audioStream.on('error', (error: any) => {
      console.error('❌ Erreur du stream audio:', error.message || error);
      streamError = error;
      writeStream.destroy();
    });

    audioStream.pipe(writeStream);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('❌ Timeout du téléchargement (5 minutes)');
        audioStream.destroy();
        writeStream.destroy();
        reject(new Error('Timeout: le téléchargement a pris trop de temps'));
      }, 300000);

      writeStream.on('finish', () => {
        clearTimeout(timeout);
        if (streamError) {
          reject(streamError);
          return;
        }
        console.log('✅ Téléchargement audio terminé');
        resolve();
      });

      writeStream.on('error', (error) => {
        clearTimeout(timeout);
        console.error('❌ Erreur lors de l\'écriture:', error);
        reject(error);
      });
    });

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

      if (!fs.existsSync(outputPath)) {
        throw new Error('Le fichier MP3 converti n\'existe pas');
      }

      const fileBuffer = fs.readFileSync(outputPath);

      // Nettoyer
      fs.unlinkSync(audioPath);
      fs.unlinkSync(outputPath);

      const cleanFileName = videoTitle
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
      console.warn('⚠️ ffmpeg non disponible, retour de l\'audio original');
      const fileBuffer = fs.readFileSync(audioPath);
      fs.unlinkSync(audioPath);
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }

      const cleanFileName = videoTitle
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
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    throw error;
  }
}
