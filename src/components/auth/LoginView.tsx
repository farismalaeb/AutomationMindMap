"use client";

import { useMsal } from "@azure/msal-react";
import { loginRequest } from "@/config/authConfig";
import { LogIn } from "lucide-react";
import { motion } from "framer-motion";

export function LoginView() {
    const { instance } = useMsal();

    const handleLogin = () => {
        instance.loginRedirect(loginRequest).catch((e) => {
            console.error(e);
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center items-center text-white relative overflow-hidden">
            {/* Decorative background effects */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/20 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[120px] pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-8 rounded-2xl shadow-2xl flex flex-col items-center"
            >
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/30">
                    <svg
                        className="w-8 h-8 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                    </svg>
                </div>
                <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 mb-2">
                    Azure Mindmap
                </h1>
                <p className="text-slate-400 text-center mb-8">
                    Sign in to visualize your Azure Automation accounts, runbooks, variables, and connections in an interactive diagram.
                </p>

                <button
                    onClick={handleLogin}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 active:scale-95"
                >
                    <LogIn className="w-5 h-5" />
                    Sign in with Microsoft Entra ID
                </button>

                <div className="mt-6 text-xs text-slate-500 text-center max-w-[280px]">
                    By continuing, you grant this application permission to read your Azure Resources to construct the visualization.
                </div>
            </motion.div>
        </div>
    );
}
