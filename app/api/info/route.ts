import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Fonction pour trouver yt-dlp
async function findYtDlpPath(): Promise<string | null> {
  const possiblePaths = [
    'yt-dlp',
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];

  for (const ytDlpPath of possiblePaths) {
    try {
      await execAsync(`${ytDlpPath} --version`, { timeout: 5000 });
      return ytDlpPath;
    } catch {
      // Continue
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

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

    // Nettoyer l'URL
    const urlOnly = url.split('&list=')[0].split('&start_radio=')[0];

    // Essayer d'utiliser yt-dlp d'abord (plus fiable pour les formats)
    const ytDlpPath = await findYtDlpPath();
    
    if (ytDlpPath) {
      try {
        // Récupérer les infos avec yt-dlp (contient déjà tous les formats)
        const { stdout: infoStdout } = await execAsync(
          `"${ytDlpPath}" --dump-json --no-playlist "${urlOnly}"`,
          { timeout: 30000 }
        );
        
        const videoInfo = JSON.parse(infoStdout);

        // Extraire les formats disponibles depuis videoInfo.formats
        const formats = videoInfo.formats || [];

        // Formats audio uniquement
        const audioFormats = formats
          .filter((f: any) => {
            return f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none');
          })
          .map((f: any) => ({
            id: f.format_id,
            quality: f.abr ? `${Math.round(f.abr)}kbps` : f.quality || 'audio',
            ext: f.ext || 'unknown',
          }))
          .filter((f: any, index: number, self: any[]) => 
            index === self.findIndex((t: any) => t.quality === f.quality)
          )
          .sort((a: any, b: any) => {
            const aNum = parseInt(a.quality) || 0;
            const bNum = parseInt(b.quality) || 0;
            return bNum - aNum;
          });

        // Formats vidéo : privilégier les formats combinés (vidéo+audio)
        const combinedFormats = formats
          .filter((f: any) => {
            return f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none';
          })
          .map((f: any) => ({
            id: f.format_id,
            quality: f.height ? `${f.height}p` : f.quality || 'unknown',
            ext: f.ext || 'unknown',
            hasAudio: true,
            height: f.height || null,
          }))
          .filter((f: any, index: number, self: any[]) => 
            index === self.findIndex((t: any) => t.quality === f.quality)
          )
          .sort((a: any, b: any) => {
            const aNum = parseInt(a.quality) || 0;
            const bNum = parseInt(b.quality) || 0;
            return bNum - aNum;
          });

        // Formats vidéo seulement (sans audio)
        const videoOnlyFormats = formats
          .filter((f: any) => {
            return f.vcodec && f.vcodec !== 'none' && (!f.acodec || f.acodec === 'none');
          })
          .map((f: any) => ({
            id: f.format_id,
            quality: f.height ? `${f.height}p (vidéo seule)` : f.quality || 'unknown',
            ext: f.ext || 'unknown',
            hasAudio: false,
            height: f.height || null,
          }))
          .filter((f: any, index: number, self: any[]) => 
            index === self.findIndex((t: any) => t.quality === f.quality)
          )
          .sort((a: any, b: any) => {
            const aNum = parseInt(a.quality) || 0;
            const bNum = parseInt(b.quality) || 0;
            return bNum - aNum;
          });

        // Combiner les formats (combinés en premier)
        const videoFormats = [...combinedFormats, ...videoOnlyFormats];

        return NextResponse.json({
          title: videoInfo.title,
          author: videoInfo.uploader || videoInfo.channel || videoInfo.uploader_id,
          lengthSeconds: videoInfo.duration,
          viewCount: videoInfo.view_count,
          thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[videoInfo.thumbnails.length - 1]?.url || '',
          audioFormats: audioFormats.length > 0 ? audioFormats : undefined,
          videoFormats: videoFormats.length > 0 ? videoFormats : undefined,
        });
      } catch (error) {
        console.error('Erreur avec yt-dlp, utilisation de ytdl-core:', error);
        // Fallback sur ytdl-core
      }
    }

    // Fallback sur ytdl-core
    const info = await ytdl.getInfo(urlOnly);

    // Extraire les formats disponibles
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly').map(f => ({
      id: f.itag?.toString() || '',
      quality: f.audioBitrate ? `${f.audioBitrate}kbps` : f.qualityLabel || f.quality || 'unknown',
      ext: f.container || 'unknown',
    }));

    const videoFormats = ytdl.filterFormats(info.formats, 'videoonly').map(f => ({
      id: f.itag?.toString() || '',
      quality: f.qualityLabel || f.quality || 'unknown',
      ext: f.container || 'unknown',
    }));

    // Ajouter aussi les formats combinés
    const combinedFormats = ytdl.filterFormats(info.formats, (f) => f.hasVideo && f.hasAudio).map(f => ({
      id: f.itag?.toString() || '',
      quality: f.qualityLabel || f.quality || 'unknown',
      ext: f.container || 'unknown',
    }));

    return NextResponse.json({
      title: info.videoDetails.title,
      author: info.videoDetails.author.name,
      lengthSeconds: info.videoDetails.lengthSeconds,
      viewCount: info.videoDetails.viewCount,
      thumbnail: info.videoDetails.thumbnails[0]?.url || '',
      audioFormats: audioFormats.length > 0 ? audioFormats : undefined,
      videoFormats: [...combinedFormats, ...videoFormats].length > 0 ? [...combinedFormats, ...videoFormats] : undefined,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des informations:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la récupération des informations' },
      { status: 500 }
    );
  }
}
