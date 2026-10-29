import { useState } from "react";
import { useAuth } from "../hooks/use-auth";

export function AuthView() {
    const { signin, signup } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState("")
    const [name, setName] = useState("");
    const [type, setType] = useState<"signin" | "signup">("signin");
    const [loading, setLoading] = useState(false)

    const [error, setError] = useState<string | null>(null)


    return (
        <div className="w-full h-screen grid place-content-center">
            <div className="flex flex-col w-sm p-6 gap-3">
                <div className="flex items-center w-full rounded-md p-1 bg-black/10">
                    <button className={`flex-1 text-center p-1.5 rounded-md cursor-pointer ${type == "signin" && "bg-emerald-600 text-white"}`} onClick={() => setType('signin')}>SIGNIN</button>
                    <button className={`flex-1 text-center p-1.5 rounded-md cursor-pointer ${type == "signup" && "bg-emerald-600 text-white"}`} onClick={() => setType('signup')}>SIGNUP</button>
                </div>

                <div className="py-4">
                    <p className="text-2xl font-semibold">{type == "signin" ? "Welcome Back" : "Let's register a new account"}</p>
                    <p>Let's continue with your full name, email & password to register a new account</p>
                </div>

                {type == "signup" && <input type="text" className="p-2 w-full border border-neutral-300 rounded-md focus:outline-2 focus:outline-emerald-200" onChange={e => setName(e.target.value)} value={name} placeholder="Full Name" />}
                <input type="email" className="p-2 w-full border border-neutral-300 rounded-md focus:outline-2 focus:outline-emerald-200" onChange={e => setEmail(e.target.value)} value={email} placeholder="Email" />
                <input type="password" className="p-2 w-full border border-neutral-300 rounded-md focus:outline-2 focus:outline-emerald-200" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />

                <button className="bg-emerald-600 p-2 rounded-md cursor-pointer text-white font-semibold grid place-content-center disabled:bg-emerald-400"
                    disabled={loading}
                    onClick={async () => {

                        if (!email && !password) {
                            setError("Email & Password is required field")
                            return
                        }

                        setLoading(true);
                        try {
                            if (type == "signin") {
                                signin(email, password);
                            } if (type == 'signup') {
                                signup(email, password, name)
                            }
                        } catch (error: any) {
                            console.log(error);
                            setError("Auth Error: " + error.message);
                        } finally { setLoading(false); setEmail(""); setName(""); setPassword(""); setError(null) }
                    }}
                >
                    {
                        loading ?
                            (
                                <div className="w-6 h-6 border-2 border-emerald-50 border-l-amber-300 border-r-red-200 rounded-full border-dashed animate-spin"></div>
                            )
                            :
                            (
                                type == "signin" ? "Login" : "Continue"
                            )
                    }
                </button>
                {error &&
                    <p className="text-red-400 text-sm">{error}</p>
                }
            </div>
        </div>
    )
}