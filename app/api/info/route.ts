import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

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

    console.log('📋 Récupération des informations de la vidéo:', url);
    const info = await ytdl.getInfo(url);

    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    // Trier par qualité audio (bitrate)
    const sortedAudioFormats = audioFormats
      .map((format: any) => ({
        id: format.itag,
        quality: format.audioBitrate ? `${format.audioBitrate}kbps` : 'unknown',
        ext: format.container || 'unknown',
      }))
      .sort((a: any, b: any) => {
        const aBitrate = parseInt(a.quality) || 0;
        const bBitrate = parseInt(b.quality) || 0;
        return bBitrate - aBitrate;
      });

    return NextResponse.json({
      title: info.videoDetails.title,
      author: info.videoDetails.author.name,
      thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1]?.url,
      lengthSeconds: parseInt(info.videoDetails.lengthSeconds),
      viewCount: parseInt(info.videoDetails.viewCount || '0'),
      audioFormats: sortedAudioFormats,
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des infos:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la récupération des informations' },
      { status: 500 }
    );
  }
}

