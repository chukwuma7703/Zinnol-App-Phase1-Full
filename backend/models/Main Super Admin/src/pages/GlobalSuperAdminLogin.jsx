import React, { useState } from "react";

export default function GlobalSuperAdminLogin({ onLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        // Replace with your backend API call
        try {
            // Example: await api.post("/api/global-admin/login", { email, password });
            if (email === "admin@zinnol.com" && password === "password") {
                onLogin && onLogin({ email });
            } else {
                setError("Invalid credentials");
            }
        } catch (err) {
            setError("Login failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-300">
            <form
                className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md flex flex-col gap-4"
                onSubmit={handleSubmit}
            >
                <h2 className="text-2xl font-bold text-blue-700 mb-2 text-center">
                    Global Super Admin Login
                </h2>
                <input
                    type="email"
                    className="border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
                <input
                    type="password"
                    className="border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                {error && <div className="text-red-600 text-sm text-center">{error}</div>}
                <button
                    type="submit"
                    className="bg-blue-600 text-white font-semibold py-2 rounded hover:bg-blue-700 transition"
                    disabled={loading}
                >
                    {loading ? "Logging in..." : "Login"}
                </button>
            </form>
        </div>
    );
}
