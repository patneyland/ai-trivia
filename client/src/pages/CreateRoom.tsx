import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { socket } from "../lib/socket";

export function CreateRoom() {
  const [, navigate] = useLocation();
  const [questionCount, setQuestionCount] = useState("10");
  const [changingCount, setChangingCount] = useState(false);
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
  function create(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    const count = Number(questionCount);
    if (!Number.isInteger(count) || count < 5 || count > 50) {
      setError("Choose between 5 and 50 questions.");
      return;
    }
    if (!socket.connected) {
      setError("Connecting to the game. Please try again in a moment.");
      return;
    }
    setError("");
    pendingRef.current = true;
    setPending(true);
    socket.emit("create_room", { questionCount: count });
  }
  return (
    <main className="setup-page">
      <div className="setup-content">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold">Host a game</h1>
        </header>
        <form onSubmit={create} noValidate className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <p>{questionCount || "10"} questions</p>
            <button
              type="button"
              disabled={pending}
              className="quiet-action"
              aria-expanded={changingCount}
              aria-controls="count-setting"
              onClick={() => setChangingCount(!changingCount)}
            >
              {changingCount ? "Done" : "Change"}
            </button>
          </div>
          {changingCount && (
            <div id="count-setting" className="space-y-2">
              <label
                htmlFor="questionCount"
                className="block text-sm font-medium"
              >
                Number of questions
              </label>
              <input
                id="questionCount"
                type="number"
                inputMode="numeric"
                min={5}
                max={50}
                value={questionCount}
                disabled={pending}
                onChange={(e) => setQuestionCount(e.target.value)}
                className="field"
                aria-describedby="count-help"
              />
              <p id="count-help" className="text-sm text-gray-600">
                Between 5 and 50.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button disabled={pending} className="primary-action w-full">
            {pending ? "Creating…" : "Create game"}
          </button>
        </form>
        <button onClick={() => navigate("/")} className="quiet-action w-full">
          Back
        </button>
      </div>
    </main>
  );
}
