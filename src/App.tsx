import { AuthProvider, useAuth } from "./hooks/use-auth";
import { AuthView } from "./view/auth-view";
import MainView from "./view/main-view";

export default function App() {



  return (
    <AuthProvider>
      <RootView />
    </AuthProvider>
  )
}


function RootView() {
  const { loading, session } = useAuth()

  if (loading) return (
    <div className="w-full h-screen grid place-content-center">
      <div className="grid place-content-center w-16 h-16 outline-5 outline-blue-400 rounded-full animate-pulse">
        <div className="w-14 h-14 bg-amber-300 rounded-full animate-ping"></div>
      </div>
    </div>
  )

  if (!session) return <AuthView />

  return (
    <MainView />
  )
}


