import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { socket } from "../lib/socket";
import { normalizeCode, formatCode } from "../lib/room-code";

export function JoinRoom() {
  const [, navigate] = useLocation();
  const [roomCode, setRoomCode] = useState(() =>
    normalizeCode(
      new URLSearchParams(window.location.search).get("code") ?? "",
    ),
  );
  const [editingCode, setEditingCode] = useState(roomCode.length !== 6);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  useEffect(() => {
    const joined = ({ room }: { room: { code: string } }) => {
      if (!pendingRef.current) return;
      pendingRef.current = false;
      navigate(`/room/${room.code}`);
    };
    const failed = ({ message }: { message: string }) => {
      if (!pendingRef.current) return;
      pendingRef.current = false;
      setPending(false);
      setError(message);
    };
    const disconnected = () =>
      failed({ message: "Connection lost. Please try again when connected." });
    socket.on("room_joined", joined);
    socket.on("error", failed);
    socket.on("disconnect", disconnected);
    socket.on("connect_error", disconnected);
    return () => {
      socket.off("room_joined", joined);
      socket.off("error", failed);
      socket.off("disconnect", disconnected);
      socket.off("connect_error", disconnected);
    };
  }, [navigate]);
  function join(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    if (roomCode.length !== 6) {
      setError("Enter a six-character room code.");
      setEditingCode(true);
      return;
    }
    if (!name.trim()) {
      setError("Enter your name to join.");
      return;
    }
    if (!socket.connected) {
      setError("Connecting to the game. Please try again in a moment.");
      return;
    }
    setError("");
    pendingRef.current = true;
    setPending(true);
    socket.emit("join_room", { code: roomCode, playerName: name.trim() });
  }
  return (
    <main className="setup-page">
      <div className="setup-content">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold">Join the game</h1>
        </header>
        <form onSubmit={join} noValidate className="space-y-5">
          {editingCode ? (
            <div className="space-y-2">
              <label htmlFor="roomCode" className="block text-sm font-medium">
                Room code
              </label>
              <input
                id="roomCode"
                className="field text-center text-xl font-bold tracking-widest"
                value={formatCode(roomCode)}
                onChange={(e) => setRoomCode(normalizeCode(e.target.value))}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ABC-DEF"
                disabled={pending}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-gray-600">
                Room{" "}
                <strong className="text-gray-900">
                  {formatCode(roomCode)}
                </strong>
              </p>
              <button
                type="button"
                className="quiet-action"
                onClick={() => setEditingCode(true)}
                disabled={pending}
              >
                Change
              </button>
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-medium">
              Your name
            </label>
            <input
              id="name"
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              autoComplete="given-name"
              autoFocus={!editingCode}
              placeholder="What should we call you?"
              disabled={pending}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="primary-action w-full" disabled={pending}>
            {pending ? "Joining…" : "Join game"}
          </button>
        </form>
        <button onClick={() => navigate("/")} className="quiet-action w-full">
          Back
        </button>
      </div>
    </main>
  );
}
