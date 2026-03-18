import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/lib/db";
import youtubesearchapi from "youtube-search-api";
import { getServerSession } from "next-auth";
import { ImageOff } from "lucide-react";
var ytRegex = /^(?:(?:https?:)?\/\/)?(?:www\.)?(?:m\.)?(?:youtu(?:be)?\.com\/(?:v\/|embed\/|watch(?:\/|\?v=))|youtu\.be\/)((?:\w|-){11})(?:\S+)?$/;


const CreateStreamSchema = z.object({
    creatorId: z.string(),
    url: z.string()
})

const MAX_QUEUE_LEN = 20;

export async function POST(req: NextRequest) {
    try {
        const data = CreateStreamSchema.parse(await req.json());
        const isYt = data.url.match(ytRegex);
        if(!isYt){
            return NextResponse.json({
                message: "Wrong url format"
            },{
                status: 411
            })
        }

        const session = await getServerSession()
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

        const extractedId = isYt[1];
        console.log("yt id",extractedId)
        const res = await youtubesearchapi.GetVideoDetails(extractedId)
        const thumbnails = res.thumbnail.thumbnails;
        thumbnails.sort((a: {width: number},b: {width: number}) => a.width<b.width ? -1:1)

        const existingActiveStream = await prisma.stream.count({
            where: {
                userId: data.creatorId
            }
        })

        if(existingActiveStream > MAX_QUEUE_LEN) {
            return NextResponse.json({
                message: "Already at limit"
            }, {
                status: 411
            })
        }

        const stream = await prisma.stream.create({
        data: {
            userId: data.creatorId,
            addedById: user.id,  
            url: data.url,
            extractedId,
            title: res.title ?? "Can't find video title",
            smallImg: thumbnails.length > 1 ? thumbnails[thumbnails.length-2].url : thumbnails[thumbnails.length-1].url ?? "https://hips.hearstapps.com/hmg-prod/images/ginger-maine-coon-kitten-running-on-lawn-in-royalty-free-image-1719608142.jpg",
            bigImg: thumbnails[thumbnails.length-1].url ?? "https://hips.hearstapps.com/hmg-prod/images/ginger-maine-coon-kitten-running-on-lawn-in-royalty-free-image-1719608142.jpg",
            type: "Youtube"
        }
        })

        return NextResponse.json({
            ...stream,
            hasUpvoted: false,
            upvotes: 0
        });

    } catch (error) {
        console.log(error)
        return NextResponse.json({
            message: "Error while adding a stream"
        },{
            status: 411
        })
    }
}


export async function GET(req: NextRequest) {
    const creatorId = req.nextUrl.searchParams.get("creatorId");
    const session = await getServerSession()

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
    if(!creatorId){
        return NextResponse.json({
            message: "Error"
        }, {
            status: 411
        })
    }

    const [streams, activeStream] = await Promise.all([prisma.stream.findMany({
        where: {
            userId: creatorId,
            played: false
        },
        include: {
            _count: {
                select: {
                upvotes: true
                }
        },
        upvotes: {
            where: {
                userId: user.id
            }
        }}}), prisma.currentStream.findFirst({
                where: {
                    userId: creatorId
                },
                include: {
                    stream: true
                }
            })
    ])

    return NextResponse.json({
        streams: streams.map(({ _count, ...rest }) => ({
            ...rest,
            upvotesCount: _count.upvotes,
            haveUpvoted: rest.upvotes.length ? true:false
        })),
        activeStream
    })
}
