const socket = new WebSocket("wss://amra-signal.devusimple.workers.dev/ws");


import { useEffect, useState } from "react"

export default function MainView() {

    const [message, setMessage] = useState("")


    useEffect(() => {
        socket.onmessage = (e) => {
            console.log(e.data)
        }
    }, []);




    return (
        <div className="w-full h-screen grid place-content-center">
            <div className="w-md">
                <div className="bg-gray-200 flex items-center p-2 rounded-md">
                    <input type="text" className="p-2 rounded-md flex-1 focus:outline-0" placeholder="message..."
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                    />
                    <button
                        onClick={() => {
                            socket.send(message)
                        }}
                        className="p-2 cursor-pointer bg-emerald-400 rounded-md">⬆</button>
                </div>
            </div>
        </div>
    )
}