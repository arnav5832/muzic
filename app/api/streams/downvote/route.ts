import { prisma } from "@/app/lib/db";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { use } from "react";
import {z} from "zod"

const UpvoteSchema = z.object({
    streamId: z.string()
})

export async function POST(req:NextRequest) {
    const session = await getServerSession();

    const user = await prisma.user.findFirst({
        where: {
            email: session?.user?.email ?? ""
        }
    })

    if(!user){
        return NextResponse.json({
            message: "Unauthenticated"
        }, {
            status: 403
        })
    }

   try {
    const data = UpvoteSchema.parse(await req.json())
    await prisma.upvote.delete({
        where:{
            userId_streamId: {
            userId: user.id,
            streamId: data.streamId
            }
        }
    })
    return NextResponse.json({
        message: "Done!"
    })
   } catch (error) {
    return NextResponse.json({
        message: "Error while upvote"
    },{
        status: 403
    })
   }
}