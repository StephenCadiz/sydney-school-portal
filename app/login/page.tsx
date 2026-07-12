"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

   const router = useRouter();

  async function handleLogin() {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

  const profile = await supabase
  .from("profiles")
  .select("*")
  .eq("id", data.user.id);

console.log("PROFILE FULL:", JSON.stringify(profile, null, 2));

if (profile.data && profile.data.length > 0) {
  const role = profile.data[0].role;

  if (role === "admin") {
    router.push("/admin");
  }

  if (role === "teacher") {
    router.push("/teacher");
  }

  if (role === "student") {
    router.push("/student");
  }
}
}

  return (
  <main
    style={{
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background:
        "linear-gradient(135deg,#1695e8 0%,#0b6fb8 100%)",
      padding: "20px",
    }}
  >
    <div
      style={{
        background: "#ffffff",
        padding: "50px",
        borderRadius: "20px",
        width: "100%",
        maxWidth: "500px",
        boxShadow:
          "0 25px 60px rgba(0,0,0,0.2)",
        textAlign: "center",
      }}
    >
      <img
        src="/LOGO and NAME.png"
        alt="Sydney School"
        style={{
          width: "100%",
          maxWidth: "350px",
          marginBottom: "20px",
        }}
      />

      <p
        style={{
          color: "#666",
          marginBottom: "30px",
        }}
      >
        Teacher • Student • Admin Portal
      </p>

      <input
        type="email"
        placeholder="Email Address"
        value={email}
        onChange={(e) =>
          setEmail(e.target.value)
        }
        style={{
          width: "100%",
          padding: "14px",
          marginBottom: "15px",
          border: "1px solid #ddd",
          borderRadius: "10px",
          fontSize: "16px",
          color: "#333",
        }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) =>
          setPassword(e.target.value)
        }
        style={{
          width: "100%",
          padding: "14px",
          marginBottom: "20px",
          border: "1px solid #ddd",
          borderRadius: "10px",
          fontSize: "16px",
          color: "#333",
        }}
      />

      <button
        onClick={handleLogin}
        style={{
          width: "100%",
          padding: "14px",
          background: "#1695e8",
          color: "white",
          border: "none",
          borderRadius: "10px",
          fontSize: "16px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Sign In
      </button>
    </div>
  </main>
);
}
