"use client"
import { useEffect, useState, useRef } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
// @ts-ignore
import { ThumbsUp, ThumbsDown, Play, Share2, X } from "lucide-react"
import { toast, ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import Appbar from '../components/Appbar'

interface Video {
  id: string
  type: string
  url: string
  extractedId: string
  title: string
  smallImg: string
  bigImg: string
  active: boolean
  userId: string
  upvotes: number
  haveUpvoted: boolean
}

const REFRESH_INTERVAL_MS = 10 * 1000

// wrapper around fetch that always sends JSON headers and cookies
async function apiFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  })
}

function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
}

// extract video ID from URL just for showing the preview thumbnail
// actual validation happens on the server
function getPreviewId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([^&\n?#]{11})/)
  return match ? match[1] : null
}

export default function StreamView({
  creatorId,
  playVideo = false
}: {
  creatorId: string
  playVideo: boolean  // true on dashboard (streamer view), false on creator page (viewer view)
}) {
  const { data: session } = useSession()
  const [inputLink, setInputLink] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [queue, setQueue] = useState<Video[]>([])
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null)
  const [loading, setLoading] = useState(false)

  // this div is where the YouTube player will be injected into the DOM
  const videoPlayerRef = useRef<HTMLDivElement>(null)

  // we keep the YouTube player instance here so we can control it later
  // (load new videos, destroy it, etc.)
  const playerRef = useRef<any>(null)

  // ─── Data Fetching ────────────────────────────────────────────────────────

  async function refreshStreams() {
    const res = await apiFetch(`/api/streams/?creatorId=${creatorId}`)
    const json = await res.json()

    // normalize field names since the API returns upvotesCount but we use upvotes
    setQueue((json.streams ?? []).map((s: any) => ({
      ...s,
      upvotes: s.upvotesCount ?? s.upvotes ?? 0,
      haveUpvoted: s.haveUpvoted ?? s.hasUpvoted ?? false,
    })))

    // only update currentVideo if it actually changed
    // this prevents unnecessary re-renders / player restarts
    setCurrentVideo(existingVideo => {
      const incomingVideo = json.activeStream?.stream ?? null
      if (existingVideo?.id === incomingVideo?.id) return existingVideo
      return incomingVideo
    })
  }

  // fetch streams on mount and then every REFRESH_INTERVAL_MS milliseconds
  useEffect(() => {
    refreshStreams()
    const interval = setInterval(refreshStreams, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  // ─── YouTube Player Setup ─────────────────────────────────────────────────

  // step 1: inject the YouTube IFrame API script into the page
  // we only need this if we're in streamer/playVideo mode
  useEffect(() => {
    if (!playVideo) return

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  }, [playVideo])

  // step 2: once we have a video to play, initialize or update the player
  useEffect(() => {
    if (!playVideo || !currentVideo) return

    function onVideoEnded(event: any) {
      // YouTube sends event.data === 0 when the video finishes
      if (event.data === 0) {
        playNext()
      }
    }

    function createPlayer() {
      // @ts-ignore
      playerRef.current = new window.YT.Player(videoPlayerRef.current, {
        height: '100%',
        width: '100%',
        videoId: currentVideo?.extractedId,
        playerVars: { autoplay: 1, controls: 1 },
        events: {
          onReady: (e: any) => e.target.playVideo(),
          onStateChange: onVideoEnded,
        }
      })
    }

    function loadVideoInExistingPlayer() {
      // player already exists — just swap the video without destroying the player
      playerRef.current.loadVideoById(currentVideo?.extractedId)
      playerRef.current.playVideo()
    }

    // @ts-ignore
    if (!window.YT) {
      // API not loaded yet — set a callback that YouTube will call when ready
      // @ts-ignore
      window.onYouTubeIframeAPIReady = createPlayer
    } else if (!playerRef.current) {
      // API is loaded but no player exists yet — create one
      createPlayer()
    } else {
      // player already exists and API is ready — just load the new video
      loadVideoInExistingPlayer()
    }

    // cleanup: destroy the player when the component unmounts
    return () => {
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [currentVideo, playVideo])

  // ─── User Actions ─────────────────────────────────────────────────────────

  const handleInputChange = (value: string) => {
    setInputLink(value)
    // show thumbnail preview as user types — no validation yet
    setPreviewId(getPreviewId(value))
  }

  const clearInput = () => {
    setInputLink('')
    setPreviewId(null)
  }

  const handleVote = (id: string, isUpvote: boolean) => {
    // optimistic update — update UI immediately without waiting for server
    setQueue(prev => prev.map(video =>
      video.id === id
        ? {
            ...video,
            upvotes: isUpvote ? video.upvotes + 1 : video.upvotes - 1,
            haveUpvoted: !video.haveUpvoted,
          }
        : video
    ).sort((a, b) => b.upvotes - a.upvotes))

    // then sync with server in the background
    apiFetch(`/api/streams/${isUpvote ? "upvote" : "downvote"}`, {
      method: 'POST',
      body: JSON.stringify({ streamId: id })
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputLink.trim()) { toast.error('Please enter a YouTube URL'); return }

    try {
      setLoading(true)

      const res = await apiFetch('/api/streams', {
        method: 'POST',
        body: JSON.stringify({ creatorId, url: inputLink.trim() })
      })

      const json = await res.json()

      if (!res.ok) {
        toast.error(json.message || 'Failed to add song')
        return
      }

      // add the new song directly to the queue without re-fetching
      setQueue(prev => [...prev, {
        ...json,
        upvotes: json.upvotes ?? 0,
        haveUpvoted: json.hasUpvoted ?? false,
      }])

      clearInput()
      toast.success('Song added to queue!')
    } catch (e) {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const playNext = async () => {
  if (queue.length === 0) {
    toast.error('Queue is empty!')
    return
  }

  const res = await apiFetch('/api/streams/next', { method: 'GET' })
  const json = await res.json()

  if (!res.ok) {
    toast.error(json.message || 'Failed to play next')
    return
  }

  setCurrentVideo(json.stream)
  setQueue(prev => prev.filter(v => v.id !== json.stream.id))
  }

  const handleShare = () => {
    const shareableLink = `${window.location.hostname}/creator/${creatorId}`
    navigator.clipboard.writeText(shareableLink).then(() => {
      toast.success('Link copied to clipboard!')
    })
  }


  const sortedQueue = [...queue].sort((a, b) => b.upvotes - a.upvotes)


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
      <Appbar />
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        theme="dark"
      />

      <div className="p-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Stream Queue</h1>
          <Button
            onClick={handleShare}
            variant="outline"
            className="bg-transparent border-white/20 text-white hover:bg-white/10 gap-2"
          >
            <Share2 className="w-4 h-4" /> Share
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Left Column ── */}
          <div className="space-y-6">

            {/* Now Playing */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white">Now Playing</h2>
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="p-4">
                  {currentVideo ? (
                    <div>
                      {playVideo
                        // creator sees actual YouTube player
                        ? <div ref={videoPlayerRef} className="w-full aspect-video rounded" />
                        // everyone else sees the thumbnail of currently playing song
                        : <img src={currentVideo.bigImg} className="w-full h-72 object-cover rounded" />
                      }
                      <p className="mt-2 text-center font-semibold text-white">
                        {currentVideo.title}
                      </p>
                    </div>
                  ) : (
                    <p className="text-center py-8 text-gray-400">No video playing</p>
                  )}
                </CardContent>
              </Card>

              {/* only the streamer can manually skip to next song */}
              {playVideo && (
                <Button
                  onClick={playNext}
                  className="w-full bg-purple-700 hover:bg-purple-800 text-white"
                >
                  <Play className="mr-2 h-4 w-4" /> Play Next
                </Button>
              )}
            </div>

            {/* Add a Song */}
            <Card className="bg-black/30 border-white/10">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-white/60 mb-3">Add a Song</p>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={inputLink}
                        onChange={e => handleInputChange(e.target.value)}
                        placeholder="Paste a YouTube URL..."
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 pr-8"
                        disabled={loading}
                      />
                      {inputLink && (
                        <button
                          type="button"
                          onClick={clearInput}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <Button
                      type="submit"
                      className="bg-purple-600 hover:bg-purple-700"
                      disabled={loading}
                    >
                      {loading ? 'Adding...' : 'Add'}
                    </Button>
                  </div>

                  {/* show thumbnail preview as soon as a valid YouTube URL is pasted */}
                  {previewId && (
                    <div className="relative rounded-lg overflow-hidden bg-black">
                      <img
                        src={getYouTubeThumbnail(previewId)}
                        alt="Video preview"
                        className="w-full aspect-video object-cover"
                      />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <Play className="w-10 h-10 text-white/70" />
                      </div>
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </div>

          {/* ── Right Column — Queue ── */}
          <div>
            <h2 className="text-xl font-bold text-white mb-4">
              Upcoming Songs
              <span className="ml-2 text-sm font-normal text-white/40">
                {queue.length} {queue.length === 1 ? 'song' : 'songs'}
              </span>
            </h2>

            {sortedQueue.length === 0 ? (
              <Card className="bg-black/30 border-white/10">
                <CardContent className="p-12 text-center">
                  <p className="text-white/30 text-sm">Queue is empty — add a song!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
                {sortedQueue.map((video, index) => (
                  <Card key={video.id} className="bg-gray-900 border-gray-800">
                    <CardContent className="p-4 flex items-center gap-4">

                      {/* position in queue based on vote count */}
                      <span className="text-sm font-bold text-purple-400 w-5 flex-shrink-0">
                        {index + 1}
                      </span>

                      <img
                        src={video.smallImg}
                        alt={`Thumbnail for ${video.title}`}
                        className="w-20 h-14 object-cover rounded flex-shrink-0"
                      />

                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm truncate">
                          {video.title}
                        </h3>
                      </div>

                      {/* voting — upvote moves song up, downvote undoes upvote */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleVote(video.id, !video.haveUpvoted)}
                          className={`flex items-center gap-1 text-sm px-2 py-1 rounded transition-colors ${
                            video.haveUpvoted
                              ? 'text-purple-400 bg-purple-500/20'
                              : 'text-white/40 hover:text-purple-400 hover:bg-purple-500/10'
                          }`}
                        >
                          <ThumbsUp className="w-4 h-4" />
                          <span>{video.upvotes}</span>
                        </button>
                        <button
                          onClick={() => handleVote(video.id, false)}
                          disabled={!video.haveUpvoted}
                          className={`flex items-center gap-1 text-sm px-2 py-1 rounded transition-colors ${
                            video.haveUpvoted
                              ? 'text-red-400 bg-red-500/20 hover:bg-red-500/30'
                              : 'text-white/20 cursor-not-allowed'
                          }`}
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}