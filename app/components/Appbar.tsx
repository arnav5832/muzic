"use client";
import {signIn, useSession, signOut} from "next-auth/react"
import { Button } from "@/components/ui/button";

export default function Appbar() {
    const session = useSession();
  return (
    <div className="flex justify-between px-20 pt-4">
        <div className="flex justify-between text-lg font-bold flex-col text-white">
            Muzic
        </div>
        <div>
            {session.data?.user && <button className="m-2 p-2 bg-blue-600 rounded-md text-white" onClick={() => signOut()}>Logout</button>}
            {!session.data?.user && <button className="m-2 p-2 bg-blue-600 rounded-md text-white" onClick={() => signIn()}>Signin</button>}
        </div>
    </div>
  )
}

