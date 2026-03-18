import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/app/lib/db"
import { getServerSession } from "next-auth"

export async function GET(req: NextRequest) {
  const session = await getServerSession()

  const user = await prisma.user.findFirst({
    where: { email: session?.user?.email ?? "" }
  })

  if (!user) {
    return NextResponse.json({ message: "Unauthenticated" }, { status: 403 })
  }

  const mostUpvotedStream = await prisma.stream.findFirst({
    where: {
      userId: user.id,
      played: false
    },
    orderBy: {
      upvotes: { _count: "desc" }
    }
  })

  if (!mostUpvotedStream) {
    return NextResponse.json({ message: "No streams in queue" }, { status: 404 })
  }


  await Promise.all([
    prisma.stream.update({
      where: { id: mostUpvotedStream.id },
      data: { played: true, playedTs: new Date() }
    }),
    prisma.currentStream.upsert({
      where: { userId: user.id },
      update: { streamId: mostUpvotedStream.id },
      create: { userId: user.id, streamId: mostUpvotedStream.id }
    })
  ])

  return NextResponse.json({ stream: mostUpvotedStream })
}