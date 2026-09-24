import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import { normalizeCode, formatCode } from "../lib/room-code";

export function Home() {
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  function join(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Enter the six-character code from your host.");
      return;
    }
    navigate(`/join-room?code=${code}`);
  }
  return (
    <main className="setup-page">
      <div className="setup-content">
        <header className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">Trivia Quiz</h1>
          <p className="text-gray-600">
            Questions made from the things you love.
          </p>
        </header>
        <form onSubmit={join} noValidate className="space-y-4">
          <label htmlFor="code" className="block text-sm font-medium">
            Room code
          </label>
          <input
            id="code"
            value={formatCode(code)}
            onChange={(e) => {
              setCode(normalizeCode(e.target.value));
              setError("");
            }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABC-DEF"
            className="field text-center text-2xl font-bold tracking-widest"
            aria-describedby={error ? "code-error" : undefined}
            aria-invalid={Boolean(error)}
          />
          {error && (
            <p id="code-error" role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="primary-action w-full">Continue</button>
        </form>
        <button
          onClick={() => navigate("/create-room")}
          className="quiet-action w-full"
        >
          Host a game
        </button>
      </div>
    </main>
  );
}
