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

const creatorId = process.env.CREATOR_ID;

export default function Component() {
  return <StreamView playVideo={true} creatorId={creatorId}/>
}
