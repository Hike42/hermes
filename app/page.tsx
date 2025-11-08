'use client';

import { useState, useEffect, useCallback } from 'react';

interface VideoInfo {
  title: string;
  author: string;
  thumbnail: string;
  lengthSeconds: number;
  viewCount: number;
  audioFormats?: Array<{ id: string; quality: string; ext: string }>;
  videoFormats?: Array<{ id: string; quality: string; ext: string }>;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [format] = useState<'mp3'>('mp3'); // Uniquement MP3
  const [loading, setLoading] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [selectedQuality] = useState<string>('best'); // Toujours meilleure qualité pour audio

  const validateYouTubeUrl = (url: string): boolean => {
    const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return pattern.test(url);
  };

  // Fonction pour récupérer les informations de la vidéo
  const fetchVideoInfo = useCallback(async (videoUrl: string) => {
    if (!validateYouTubeUrl(videoUrl)) {
      setVideoInfo(null);
      return;
    }

    setLoadingInfo(true);
    setError('');

    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: videoUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur lors de la récupération' }));
        throw new Error(errorData.error || 'Erreur lors de la récupération des informations');
      }

      const info = await response.json();
      setVideoInfo(info);
    } catch (err) {
      console.error('Erreur:', err);
      setVideoInfo(null);
      if (err instanceof Error && !err.message.includes('aborted')) {
        setError(err.message);
      }
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  // Debounce pour récupérer les infos
  useEffect(() => {
    const timer = setTimeout(() => {
      if (url.trim() && validateYouTubeUrl(url)) {
        fetchVideoInfo(url);
      } else {
        setVideoInfo(null);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [url, fetchVideoInfo]);


  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatViews = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const handleDownload = async () => {
    if (!url.trim()) {
      setError('Veuillez entrer une URL YouTube');
      return;
    }

    if (!validateYouTubeUrl(url)) {
      setError('URL YouTube invalide');
      return;
    }

    setError('');
    setLoading(true);
    setProgress(10);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 360000);

    try {
      setProgress(20);
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, format: 'mp3', quality: 'best' }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setProgress(60);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur lors du téléchargement' }));
        throw new Error(errorData.error || 'Erreur lors du téléchargement');
      }

      setProgress(80);
      const blob = await response.blob();
      setProgress(90);
      
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `video.${format}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1]);
        }
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      setUrl('');
      setProgress(100);
      setVideoInfo(null);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError('Le téléchargement a pris trop de temps. Veuillez réessayer avec une vidéo plus courte.');
        } else {
          setError(err.message || 'Une erreur est survenue');
        }
      } else {
        setError('Une erreur est survenue lors du téléchargement');
      }
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 2000);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 md:p-12">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-3">
              YouTube Downloader
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-lg">
              Téléchargez vos vidéos YouTube en MP3 (Audio uniquement)
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                URL YouTube
              </label>
              <div className="relative">
                <input
                  id="url"
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-10"
                  disabled={loading}
                />
                {loadingInfo && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Affichage des informations de la vidéo */}
            {videoInfo && (
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                <div className="flex gap-4">
                  {videoInfo.thumbnail && (
                    <img
                      src={videoInfo.thumbnail}
                      alt={videoInfo.title}
                      className="w-32 h-24 object-cover rounded-lg flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white text-lg mb-1 line-clamp-2">
                      {videoInfo.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                      {videoInfo.author}
                    </p>
                    <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                      <span>⏱️ {formatDuration(videoInfo.lengthSeconds)}</span>
                      {videoInfo.viewCount && (
                        <span>👁️ {formatViews(videoInfo.viewCount)} vues</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Format MP3 uniquement - affichage informatif */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Format: MP3 (Audio uniquement)
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Meilleure qualité audio disponible
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {loading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>
                    {progress < 20 && 'Préparation...'}
                    {progress >= 20 && progress < 60 && 'Téléchargement en cours...'}
                    {progress >= 60 && progress < 80 && 'Finalisation...'}
                    {progress >= 80 && 'Téléchargement terminé !'}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleDownload}
              disabled={loading || !url.trim() || loadingInfo}
              className={`w-full py-4 px-6 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all transform ${
                loading || !url.trim() || loadingInfo
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:scale-105 active:scale-95'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Téléchargement en cours...
                </span>
              ) : (
                'Télécharger'
              )}
            </button>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              Cet outil est à des fins éducatives uniquement. Respectez les droits d&apos;auteur.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}