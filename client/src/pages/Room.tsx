import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import type { Room as RoomType } from "@trivia/shared";
import confetti from "canvas-confetti";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle,
  Check,
  Circle,
  Crown,
  Home,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Timer,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { socket, pendingJoin, clearPendingJoin } from "../lib/socket";
import { formatCode } from "../lib/room-code";

const TOPICS = [
  "History",
  "Science",
  "Movies",
  "Music",
  "Sports",
  "Technology",
  "Art",
  "Geography",
  "Literature",
  "Food",
  "Nature",
  "Space",
];

function sortByScore(players: RoomType["players"]) {
  return [...players].sort((a, b) => b.score - a.score);
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function QuestionTopics({
  interest,
  subInterest,
  isHost,
}: {
  interest: string;
  subInterest: string;
  isHost: boolean;
}) {
  const displayInterest = interest?.trim() || "General";
  const displaySubInterest = subInterest?.trim() || "Mixed";

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${isHost ? "text-xl" : "text-xs"} font-medium`}
    >
      <span className="text-gray-500">{displayInterest}</span>
      <span className="border-l border-gray-300 pl-2 text-gray-500">
        {displaySubInterest}
      </span>
    </div>
  );
}

export function Room() {
  const [, params] = useRoute("/room/:code");
  const [, navigate] = useLocation();
  const [room, setRoom] = useState<RoomType | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [progress, setProgress] = useState({ message: "", percent: 0 });
  const [error, setError] = useState("");
  const [interests, setInterests] = useState([""]);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [answerStatus, setAnswerStatus] = useState<
    "idle" | "pending" | "accepted" | "uncertain" | "closed"
  >("idle");
  const [interestPending, setInterestPending] = useState(false);
  const [interestError, setInterestError] = useState("");
  const [answerError, setAnswerError] = useState("");
  const answerPendingRef = useRef(false);
  const interestPendingRef = useRef(false);
  const submissionRef = useRef<{
    choice: string;
    timeMs: number;
    questionIndex: number;
    timerStartedAt: number;
  } | null>(null);
  const questionKeyRef = useRef("");
  questionKeyRef.current = room
    ? `${room.currentQuestion}:${room.timerStartedAt}`
    : "";
  const autoStartedReadyKeyRef = useRef("");

  useEffect(() => {
    if (pendingJoin) {
      setRoom(pendingJoin.room);
      setPlayerId(pendingJoin.playerId);
      clearPendingJoin();
    }

    const onJoined = (payload: { room: RoomType; playerId: string }) => {
      setRoom(payload.room);
      setPlayerId(payload.playerId);
      clearPendingJoin();
    };

    const onUpdated = (payload: { room: RoomType }) => setRoom(payload.room);
    const onProgress = (payload: { message: string; percent: number }) =>
      setProgress(payload);
    const onError = (payload: { message: string }) => {
      setError(payload.message);
      interestPendingRef.current = false;
      setInterestPending(false);
    };

    const onDisconnected = () => {
      if (interestPendingRef.current) {
        interestPendingRef.current = false;
        setInterestPending(false);
        setInterestError("Connection lost. Please try again when connected.");
      }
    };
    socket.on("disconnect", onDisconnected);
    socket.on("connect_error", onDisconnected);
    socket.on("room_joined", onJoined);
    socket.on("room_updated", onUpdated);
    socket.on("generation_progress", onProgress);
    socket.on("generation_error", onError);
    socket.on("error", onError);
    return () => {
      socket.off("disconnect", onDisconnected);
      socket.off("connect_error", onDisconnected);
      socket.off("room_joined", onJoined);
      socket.off("room_updated", onUpdated);
      socket.off("generation_progress", onProgress);
      socket.off("generation_error", onError);
      socket.off("error", onError);
    };
  }, []);

  useEffect(() => {
    if (!params?.code || !room) return;
    if (room.code !== params.code.toUpperCase()) navigate("/");
  }, [params?.code, room, navigate]);

  useEffect(() => {
    if (!room || room.state !== "playing" || !room.timerStartedAt) return;

    const tick = () => {
      const elapsed = (Date.now() - room.timerStartedAt) / 1000;
      setTimeLeft(Math.max(0, room.timerSeconds - elapsed));
    };
    tick();
    const interval = window.setInterval(tick, 100);
    return () => window.clearInterval(interval);
  }, [
    room?.state,
    room?.currentQuestion,
    room?.timerStartedAt,
    room?.timerSeconds,
  ]);

  useEffect(() => {
    if (
      room?.state === "results" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      confetti({ particleCount: 140, spread: 70, origin: { y: 0.6 } });
    }
  }, [room?.state]);

  const me = useMemo(
    () => room?.players.find((player) => player.id === playerId),
    [room, playerId],
  );
  const isHost = room?.hostId === playerId;
  const question = room?.questions[room.currentQuestion];
  const answers = room?.answers[String(room.currentQuestion)] ?? {};
  const sortedPlayers = useMemo(
    () => (room ? sortByScore(room.players) : []),
    [room],
  );
  const readyPlayers = room
    ? room.players.filter((player) => player.hasSubmittedInterests).length
    : 0;
  const canStartGame = room
    ? room.players.length > 0 &&
      room.players.every((player) => player.hasSubmittedInterests)
    : false;
  const answeredPlayers = room?.answeredCount ?? 0;
  const submittedInterests = Boolean(me?.hasSubmittedInterests);

  useEffect(() => {
    if (submittedInterests) {
      interestPendingRef.current = false;
      setInterestPending(false);
    } else if (
      room?.state === "lobby" ||
      room?.state === "collecting_interests"
    ) {
      setInterests([""]);
      setInterestError("");
      interestPendingRef.current = false;
      setInterestPending(false);
    }
  }, [submittedInterests, room?.state]);

  useEffect(() => {
    setSelectedChoice("");
    setAnswerStatus("idle");
    setAnswerError("");
    answerPendingRef.current = false;
    submissionRef.current = null;
  }, [room?.currentQuestion, room?.timerStartedAt]);

  useEffect(() => {
    if (room?.state === "generating") {
      setProgress({ message: "", percent: 0 });
      setError("");
    }
  }, [room?.state]);

  function sendAnswer(option: string, retry = false) {
    if (
      !room ||
      room.state !== "playing" ||
      answerPendingRef.current ||
      (!retry && selectedChoice)
    )
      return;
    if (!socket.connected) {
      setAnswerError("Connection lost. Try again when connected.");
      return;
    }
    const submission = retry
      ? submissionRef.current
      : {
          choice: option,
          timeMs: Math.max(0, Date.now() - room.timerStartedAt),
          questionIndex: room.currentQuestion,
          timerStartedAt: room.timerStartedAt,
        };
    if (!submission) return;
    const key = `${submission.questionIndex}:${submission.timerStartedAt}`;
    submissionRef.current = submission;
    answerPendingRef.current = true;
    setSelectedChoice(submission.choice);
    setAnswerStatus("pending");
    setAnswerError("");
    socket.timeout(5000).emit("submit_answer", submission, (err, result) => {
      if (questionKeyRef.current !== key) return;
      answerPendingRef.current = false;
      if (err) {
        setAnswerStatus("uncertain");
        setAnswerError(
          "We couldn't confirm your answer. Check again to confirm the same choice.",
        );
      } else if (result.accepted) {
        setSelectedChoice(result.choice);
        setAnswerStatus("accepted");
        setAnswerError("");
      } else {
        setAnswerError(result.message);
        setAnswerStatus(result.canRetry ? "idle" : "closed");
        if (result.canRetry) setSelectedChoice("");
      }
    });
  }

  useEffect(() => {
    if (!room || !isHost || room.state !== "ready") return;
    const key = `${room.code}:${room.currentQuestion}`;
    if (autoStartedReadyKeyRef.current === key) return;
    autoStartedReadyKeyRef.current = key;
    socket.emit("start_question");
  }, [room, isHost]);

  if (!room) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 p-4">
        <div className="mx-auto flex min-h-[80dvh] max-w-lg items-center justify-center">
          <div className="w-full rounded-lg border-[3px] border-gray-800 bg-white p-4 text-center">
            <LoaderCircle className="mx-auto h-8 w-8 animate-spin" />
            <h2 className="mt-2 text-2xl font-bold">Connecting...</h2>
            <p className="text-sm text-gray-600">Waiting for room data.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 p-4 py-6 text-gray-900 sm:p-8">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="hidden h-10 w-10 items-center justify-center sm:flex">
              {isHost ? (
                <Crown className="h-5 w-5" />
              ) : (
                <Users className="h-5 w-5" />
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold">
                Room {formatCode(room.code)}
              </h1>
              <p className="text-xs text-gray-600">
                {isHost
                  ? "You are the host"
                  : `Playing as ${me?.name ?? "Guest"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Users className="h-4 w-4" />
            <span>{room.players.length} players</span>
          </div>
        </div>

        {(room.state === "lobby" || room.state === "collecting_interests") && (
          <>
            {isHost ? (
              <>
                <div className="grid gap-8 md:grid-cols-5">
                  <div className="space-y-5 text-center md:col-span-2">
                    <h2 className="text-sm font-medium text-gray-600">
                      Scan to join
                    </h2>
                    <div className="flex justify-center">
                      <div className="rounded-xl bg-white p-4">
                        <QRCodeSVG
                          value={`${window.location.origin}/join-room?code=${room.code}`}
                          size={160}
                        />
                      </div>
                    </div>
                    <p className="text-3xl font-bold tracking-widest">
                      {formatCode(room.code)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {room.questionCount} questions · {room.timerSeconds}{" "}
                      seconds each
                    </p>
                  </div>
                  <div className="md:col-span-3">
                    <div className="mb-3 flex justify-between gap-4">
                      <h2 className="font-semibold">Players</h2>
                      <p className="text-sm text-gray-500">
                        {readyPlayers}/{room.players.length} ready
                      </p>
                    </div>
                    <ul className="divide-y divide-gray-200">
                      {room.players.map((player) => (
                        <li
                          key={player.id}
                          className="flex items-center justify-between gap-3 py-4"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 font-semibold">
                              {initial(player.name)}
                            </span>
                            <span className="break-words font-medium">
                              {player.name}
                            </span>
                          </span>
                          <span
                            className={`flex shrink-0 items-center gap-1 text-xs ${player.hasSubmittedInterests ? "text-green-700" : "text-gray-500"}`}
                          >
                            {player.hasSubmittedInterests && (
                              <Check className="h-4 w-4" />
                            )}
                            {player.hasSubmittedInterests
                              ? "Ready"
                              : "Choosing a topic"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {!room.players.length && (
                      <p className="py-8 text-sm text-gray-500">
                        Waiting for players to join.
                      </p>
                    )}
                    <button
                      onClick={() => socket.emit("start_game")}
                      disabled={!canStartGame}
                      className="primary-action mt-6 w-full"
                    >
                      Start game
                    </button>
                    {!canStartGame && room.players.length > 0 && (
                      <p className="mt-2 text-center text-xs text-gray-500">
                        Everyone needs a topic before you start.
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={() => navigate("/")} className="quiet-action">
                  Leave game
                </button>
              </>
            ) : !submittedInterests ? (
              <form
                className="mx-auto max-w-md space-y-5 py-5"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (interestPendingRef.current) return;
                  const topics = interests
                    .map((value) => value.trim())
                    .filter(Boolean);
                  if (!topics.length) {
                    setInterestError("Add at least one interest to get ready.");
                    return;
                  }
                  if (!socket.connected) {
                    setInterestError(
                      "Connection lost. Please try again when connected.",
                    );
                    return;
                  }
                  setInterestError("");
                  setError("");
                  interestPendingRef.current = true;
                  setInterestPending(true);
                  socket.emit("submit_interests", { interests: topics });
                }}
              >
                <header className="space-y-2">
                  <h2 className="text-2xl font-bold">What are you into?</h2>
                  <p className="text-sm text-gray-600">
                    Pick a topic for your quiz. One is enough.
                  </p>
                </header>
                {interests.map((interest, index) => (
                  <div key={index} className="space-y-2">
                    <label
                      htmlFor={`interest-${index}`}
                      className="block text-sm font-medium"
                    >
                      {index === 0
                        ? "Your interest"
                        : `Interest ${index + 1} (optional)`}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`interest-${index}`}
                        value={interest}
                        disabled={interestPending}
                        placeholder={
                          index === 0
                            ? "e.g., space, baking, or basketball"
                            : "Another thing you love"
                        }
                        className="field"
                        onChange={(event) => {
                          setInterestError("");
                          setInterests((values) =>
                            values.map((value, i) =>
                              i === index ? event.target.value : value,
                            ),
                          );
                        }}
                        aria-describedby={
                          interestError ? "interest-error" : undefined
                        }
                      />
                      {index > 0 && (
                        <button
                          type="button"
                          aria-label={`Remove interest ${index + 1}`}
                          disabled={interestPending}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded"
                          onClick={() =>
                            setInterests((values) =>
                              values.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <X className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {interestError && (
                  <p
                    id="interest-error"
                    role="alert"
                    className="text-sm text-red-700"
                  >
                    {interestError}
                  </p>
                )}
                {interests.length < 3 && (
                  <button
                    type="button"
                    disabled={interestPending}
                    className="quiet-action -ml-2"
                    onClick={() => setInterests((values) => [...values, ""])}
                  >
                    Add another interest
                  </button>
                )}
                <div
                  className="flex flex-wrap gap-2"
                  aria-label="Topic suggestions"
                >
                  {TOPICS.slice(0, 6).map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      disabled={
                        interestPending ||
                        (interests.length === 3 &&
                          interests.every((value) => value.trim()))
                      }
                      className="min-h-11 rounded-full bg-gray-100 px-3 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-40"
                      onClick={() =>
                        setInterests((values) => {
                          const next = [...values];
                          const empty = next.findIndex(
                            (value) => !value.trim(),
                          );
                          if (empty >= 0) next[empty] = topic;
                          else if (next.length < 3) next.push(topic);
                          return next;
                        })
                      }
                    >
                      {topic}
                    </button>
                  ))}
                </div>
                <button
                  disabled={interestPending}
                  className="primary-action w-full"
                >
                  {interestPending ? "Saving…" : "Ready"}
                </button>
              </form>
            ) : (
              <div
                className="mx-auto max-w-md space-y-3 py-12 text-center"
                role="status"
              >
                <Check className="mx-auto h-8 w-8 text-green-700" />
                <h2 className="text-2xl font-bold">You're ready</h2>
                <p className="text-gray-600">Waiting for the host.</p>
                <p className="text-sm text-gray-500">
                  {me?.interests.join(" · ")}
                </p>
              </div>
            )}
          </>
        )}

        {(room.state === "generating" || room.state === "ready") && (
          <div
            className="mx-auto max-w-md space-y-6 py-12 text-center"
            role="status"
          >
            <Sparkles className="mx-auto h-8 w-8" />
            <h2 className="text-2xl font-bold">Making your quiz</h2>
            <p className="text-sm text-gray-600">
              Turning everyone's interests into questions. This can take a
              minute.
            </p>
            <div
              role="progressbar"
              aria-label="Quiz preparation"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              className="h-2 overflow-hidden rounded-full bg-gray-200"
            >
              <div
                className="h-full bg-gray-800 transition-all"
                style={{ width: `${Math.max(3, progress.percent)}%` }}
              />
            </div>
          </div>
        )}

        {room.state === "playing" && !question && (
          <div className="mx-auto max-w-lg rounded-lg border-[3px] border-gray-800 bg-white p-6 text-center">
            <LoaderCircle className="mx-auto h-7 w-7 animate-spin" />
            <h2 className="mt-3 text-xl font-bold">Loading Question</h2>
            <p className="mt-1 text-sm text-gray-600">Please wait...</p>
          </div>
        )}

        {room.state === "playing" && question && (
          <div className="space-y-3">
            <div className="space-y-3">
              <div className={`text-gray-500 ${isHost ? "py-3" : "py-2"}`}>
                <div
                  className={`flex items-center justify-between ${isHost ? "text-xl font-semibold" : "text-sm"}`}
                >
                  <span>
                    Q{room.currentQuestion + 1}/{room.questions.length}
                  </span>
                  <span
                    className={`flex items-center ${isHost ? "gap-2" : "gap-1"}`}
                  >
                    <Timer className={isHost ? "h-6 w-6" : "h-4 w-4"} />
                    {Math.ceil(timeLeft)}s
                  </span>
                </div>
              </div>
              <div className={`space-y-6 ${isHost ? "py-4" : "py-2"}`}>
                <QuestionTopics
                  interest={question.interest}
                  subInterest={question.subInterest}
                  isHost={isHost}
                />
                <h3
                  className={
                    isHost
                      ? "text-3xl font-semibold leading-tight sm:text-5xl"
                      : "text-2xl font-semibold leading-tight"
                  }
                >
                  {question.text}
                </h3>
                {isHost ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {question.options.map((option) => (
                      <div
                        key={option}
                        className="flex min-h-[112px] w-full items-center gap-4 rounded-lg border-2 border-gray-300 bg-gray-50 p-5 text-left"
                      >
                        <Circle className="h-8 w-8 shrink-0" />
                        <span className="text-2xl font-medium leading-tight">
                          {option}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {question.options.map((option) => (
                      <button
                        key={option}
                        onClick={() => sendAnswer(option)}
                        disabled={
                          Boolean(selectedChoice) ||
                          timeLeft <= 0 ||
                          answerStatus === "closed"
                        }
                        aria-pressed={selectedChoice === option}
                        className={`flex min-h-14 w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${selectedChoice === option ? "border-gray-800 bg-gray-100" : "border-gray-800 bg-white"}`}
                      >
                        {selectedChoice === option ? (
                          <Check className="h-5 w-5 shrink-0" />
                        ) : (
                          <Circle className="h-5 w-5 shrink-0" />
                        )}
                        <span className="text-sm font-medium">{option}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!isHost && (
                  <div className="space-y-2 text-sm" role="status">
                    {answerStatus === "pending" && <p>Submitting…</p>}
                    {answerStatus === "accepted" && (
                      <p className="font-medium">
                        Answer locked. Waiting for other players.
                      </p>
                    )}
                    {timeLeft <= 0 && answerStatus === "idle" && (
                      <p>Time is up. Waiting for the answer.</p>
                    )}
                    {answerError && (
                      <p className="text-red-700">{answerError}</p>
                    )}
                    {answerStatus === "uncertain" && timeLeft > 0 && (
                      <button
                        className="quiet-action"
                        onClick={() => sendAnswer(selectedChoice, true)}
                      >
                        Check answer
                      </button>
                    )}
                  </div>
                )}
                {isHost && (
                  <div className="mt-4 py-3">
                    <div className="mb-2 text-xl text-gray-700">
                      Answers received: {answeredPlayers}/{room.players.length}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {room.state === "revealing" && question && (
          <div className={isHost ? "grid gap-5 lg:grid-cols-5" : "space-y-3"}>
            <div className={`space-y-6 ${isHost ? "lg:col-span-3" : ""}`}>
              <QuestionTopics
                interest={question.interest}
                subInterest={question.subInterest}
                isHost={isHost}
              />
              <h3
                className={
                  isHost
                    ? "text-3xl font-semibold leading-tight sm:text-5xl"
                    : "text-2xl font-semibold leading-tight"
                }
              >
                {question.text}
              </h3>
              <div
                className={
                  isHost
                    ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
                    : "grid grid-cols-1 gap-2 sm:grid-cols-2"
                }
              >
                {question.options.map((option) => {
                  const count = room.players.filter(
                    (player) => answers[player.id]?.choice === option,
                  ).length;
                  const correct = option === question.answer;
                  const mine = !isHost && answers[playerId]?.choice === option;
                  return (
                    <div
                      key={option}
                      className={`flex items-center justify-between rounded-lg border-2 ${isHost ? "min-h-[112px] p-5" : "p-3"} ${correct ? "border-green-600 bg-green-50" : mine ? "border-gray-400 bg-gray-100" : "border-gray-200 bg-transparent text-gray-500"}`}
                    >
                      <div className="min-w-0 space-y-1">
                        <p
                          className={
                            isHost
                              ? "text-2xl font-medium leading-tight"
                              : "font-medium"
                          }
                        >
                          {option}
                        </p>
                        <p className="text-xs font-medium">
                          {correct ? "✓ Correct answer" : ""}
                          {mine
                            ? correct
                              ? " · Your answer"
                              : "Your answer"
                            : ""}
                        </p>
                      </div>
                      <span
                        className="ml-3 shrink-0 text-sm"
                        aria-label={`${count} players chose this answer`}
                      >
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
              {!isHost && (
                <p role="status" className="text-sm text-gray-600">
                  {answers[playerId] ? "" : "No answer submitted. "}Waiting for{" "}
                  {room.currentQuestion + 1 >= room.questions.length
                    ? "the final results"
                    : "the next question"}
                  .
                </p>
              )}
              {isHost && (
                <button
                  onClick={() => socket.emit("next_question")}
                  className={`w-full rounded-lg bg-gray-800 font-medium text-white ${isHost ? "px-8 py-4 text-xl" : "px-6 py-3"}`}
                >
                  {room.currentQuestion + 1 >= room.questions.length
                    ? "See Final Results"
                    : "Next Question"}
                </button>
              )}
            </div>
            {isHost && (
              <div className="lg:col-span-2 lg:border-l lg:border-gray-200 lg:pl-6">
                <h3 className="mb-3 text-2xl font-semibold">Leaderboard</h3>
                <div className="space-y-2">
                  {sortedPlayers.map((player, index) => (
                    <div
                      key={player.id}
                      className="flex justify-between rounded-lg border border-gray-200 px-4 py-3 text-xl"
                    >
                      <span>
                        {index + 1}. {player.name}
                      </span>
                      <span className="font-bold">{player.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {room.state === "results" && (
          <div className="mx-auto max-w-lg space-y-3">
            <div className="space-y-1 text-center">
              <Trophy className="mx-auto h-8 w-8" />
              <h2 className="text-2xl font-bold">Final Results</h2>
            </div>
            <div className="py-4">
              <div className="space-y-2">
                {sortedPlayers.map((player, index) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <span className="font-medium">
                      {index + 1}. {player.name}
                    </span>
                    <span className="font-bold">{player.score}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate("/")}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-gray-800 bg-white px-6 py-3 text-sm font-medium"
              >
                <Home className="h-4 w-4" />
                Home
              </button>
              <button
                onClick={() =>
                  isHost ? socket.emit("collect_interests") : navigate("/")
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-800 px-6 py-3 text-sm font-medium text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Play Again
              </button>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-red-50 p-3"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
