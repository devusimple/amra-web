import { AuthProvider, useAuth } from "./hooks/use-auth";
import { AuthView } from "./view/auth-view";
import MainView from "./view/main-view";

export default function App() {
    return (
        <AuthProvider>
            <RootView />
        </AuthProvider>
    );
}

function RootView() {
    const { loading, session } = useAuth();

    if (loading) {
        return (
            <div className="grid h-dvh place-content-center bg-neutral-950">
                <div className="h-12 w-12 animate-spin rounded-full border-2 border-emerald-500/25 border-t-emerald-400" />
            </div>
        );
    }

    if (!session) return <AuthView />;

    return <MainView />;
}
