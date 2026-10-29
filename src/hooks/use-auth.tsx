import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { client } from "../api/client";
import type { components } from "../api/schema";

type Session = components['schemas']['AuthResponse']
export const AUTH_STORAGE_KEY = "@session"

export type AuthContext = {
    session: Session | null;
    loading: boolean;
    signin: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string, name: string) => Promise<void>;

}


const AuthContext = createContext<AuthContext | null>(null);


function AuthProvider({ children }: { children: ReactNode }) {
    const [loading, setLoading] = useState<boolean>(false)
    const [session, setSession] = useState<Session | null>(null);

    const getSession = async () => {
        setLoading(true)
        try {
            const res = localStorage.getItem(AUTH_STORAGE_KEY);

            if (res == null) {
                setSession(null);
                return;
            }

            const resJson = await JSON.parse(res) as Session
            setSession(resJson)

        } catch (error) {
            console.log(error)
        } finally { setLoading(false) }
    }

    const signin = useCallback(async (email: string, password: string) => {
        try {
            const { data, error } = await client.POST('/api/auth/login', {
                body: {
                    email,
                    password
                }
            });

            if (error) {
                throw new Error(error.error)
            }

            if (data) {
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data))
                setSession(data)
            }
        } catch (error) {
            console.log(error)
        }
    }, [session])

    const signup = useCallback(async (email: string, password: string, name: string) => {
        try {
            const { data, error } = await client.POST('/api/auth/register', {
                body: {
                    email,
                    password,
                    display_name: name
                }
            })


            if (error) {
                throw new Error(error.error)
            }

            if (data) {
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data))
                setSession(data)
            }
        } catch (error) {
            console.log(error)
        }
    }, [session])

    useEffect(() => {
        getSession();
    }, [])


    const value = useMemo<AuthContext>(() => ({
        loading,
        session,
        signin,
        signup
    }), [session, loading, signin, signup])

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) throw new Error("useAuth must be use within <AuthProvide></AuthProvider>")
    return context
}


export { AuthProvider, useAuth };
