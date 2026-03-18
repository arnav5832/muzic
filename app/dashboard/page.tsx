"use client"
import 'react-toastify/dist/ReactToastify.css'
import StreamView from "../components/StreamView"
import { useSession } from "next-auth/react"

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

const creatorId = session?.user?.id;

export default function Component() {
  return <StreamView playVideo={true} creatorId={creatorId}/>
}
