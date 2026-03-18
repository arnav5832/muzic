"use client"
import 'react-toastify/dist/ReactToastify.css'
import StreamView from "../components/StreamView"

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

const creatorId = "58c651bd-f1f5-48b6-81ac-a31719e84394"

export default function Component() {
  return <StreamView playVideo={true} creatorId={creatorId}/>
}