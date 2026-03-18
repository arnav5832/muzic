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

const creatorId = process.env.NEXT_PUBLIC_CREATOR_ID as string;

export default function Component() {
  return <StreamView playVideo={true} creatorId={creatorId}/>
}
