import type { Server, Socket } from "socket.io";
import {
  CreateRoomSchema,
  JoinRoomSchema,
  SubmitAnswerSchema,
  SubmitInterestsSchema,
  UpdateSettingsSchema,
} from "@trivia/shared";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@trivia/shared";
import {
  advanceQuestion,
  allPlayersAnswered,
  allPlayersSubmitted,
  clearInterests,
  clearTimer,
  createRoom,
  getAnsweredCount,
  getRoomByCode,
  getRoomForPlayer,
  isPlayerInRoom,
  joinRoom,
  recordAnswer,
  removePlayer,
  resetForNewRound,
  setPlayerInterests,
  setRoomQuestions,
  setRoomState,
  startTimer,
  updateSettings,
} from "./room-manager";
import { generateQuestions } from "./ai/pipeline";

function publicRoom(room: ReturnType<typeof getRoomByCode>) {
  if (!room) return null;
  // Always compute the live answered count
  const answeredCount = getAnsweredCount(room);
  if (room.state !== "playing") return { ...room, answeredCount };
  return {
    ...room,
    answeredCount,
    questions: room.questions.map((question) => ({
      ...question,
      answer: "",
    })),
    answers: {},
  };
}

function emitRoom(io: Server, roomCode: string) {
  const room = getRoomByCode(roomCode);
  if (!room) return;
  io.to(roomCode).emit("room_updated", { room: publicRoom(room)! });
}

function scoreAnswer(
  isCorrect: boolean,
  timeMs: number,
  timerSeconds: number,
): number {
  if (!isCorrect) return 0;
  const maxMs = timerSeconds * 1000;
  const ratio = Math.min(Math.max(timeMs / maxMs, 0), 1);
  const score = Math.round(1000 * (1 - ratio));
  return Math.max(0, score);
}

function revealCurrentQuestion(
  room: NonNullable<ReturnType<typeof getRoomByCode>>,
): void {
  clearTimer(room.code);
  const question = room.questions[room.currentQuestion];
  if (!question) return;

  const key = String(room.currentQuestion);
  const answers = room.answers[key] ?? {};
  room.players = room.players.map((player) => {
    const submission = answers[player.id];
    if (!submission) return player;
    const earned = scoreAnswer(
      submission.choice === question.answer,
      submission.timeMs,
      room.timerSeconds,
    );
    return { ...player, score: player.score + earned };
  });

  setRoomState(room, "revealing");
}

function startCurrentQuestion(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: NonNullable<ReturnType<typeof getRoomByCode>>,
): boolean {
  if (!room.questions[room.currentQuestion]) {
    clearTimer(room.code);
    setRoomState(room, "lobby");
    io.to(room.code).emit("generation_error", {
      message: "No questions were generated. Please try again.",
    });
    return false;
  }

  setRoomState(room, "playing");
  startTimer(room, () => {
    // Timer expired - auto-reveal, scoring unanswered players as 0
    revealCurrentQuestion(room);
    emitRoom(io, room.code);
  });
  return true;
}

export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
) {
  socket.on("create_room", (payload) => {
    const parsed = CreateRoomSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("error", { message: "Invalid host details." });
      return;
    }
    const room = createRoom(socket.id);
    if (parsed.data.questionCount !== undefined)
      updateSettings(room, { questionCount: parsed.data.questionCount });
    socket.join(room.code);
    socket.emit("room_joined", {
      room: publicRoom(room)!,
      playerId: socket.id,
    });
  });

  socket.on("join_room", (payload) => {
    const parsed = JoinRoomSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("error", { message: "Invalid room code or name." });
      return;
    }
    const code = parsed.data.code.toUpperCase();
    const existingRoom = getRoomByCode(code);
    if (!existingRoom) {
      socket.emit("error", { message: "Room not found." });
      return;
    }
    if (existingRoom.hostId === socket.id) {
      socket.emit("error", {
        message: "Host controls the room and cannot join as a player.",
      });
      return;
    }

    const room = joinRoom(code, socket.id, parsed.data.playerName);
    if (!room) {
      socket.emit("error", { message: "Room not found." });
      return;
    }
    socket.join(code);
    socket.emit("room_joined", {
      room: publicRoom(room)!,
      playerId: socket.id,
    });
    emitRoom(io, code);
  });

  socket.on("update_settings", (payload) => {
    const parsed = UpdateSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("error", { message: "Invalid settings." });
      return;
    }
    const room = getRoomForPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;
    updateSettings(room, parsed.data);
    emitRoom(io, room.code);
  });

  socket.on("collect_interests", () => {
    const room = getRoomForPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.state === "results") {
      resetForNewRound(room);
    }
    clearInterests(room);
    // Interest collection now happens directly in lobby for players.
    setRoomState(room, "lobby");
    emitRoom(io, room.code);
  });

  socket.on("submit_interests", (payload) => {
    const parsed = SubmitInterestsSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("error", { message: "Invalid interests." });
      return;
    }
    const room = getRoomForPlayer(socket.id);
    if (!room) return;
    if (!isPlayerInRoom(room, socket.id)) {
      socket.emit("error", { message: "Only players can submit interests." });
      return;
    }
    setPlayerInterests(room, socket.id, parsed.data.interests);
    emitRoom(io, room.code);
  });

  socket.on("start_game", async () => {
    const room = getRoomForPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.state !== "lobby" && room.state !== "collecting_interests") return;
    if (room.players.length === 0) {
      socket.emit("error", { message: "At least one player must join first." });
      return;
    }
    if (!allPlayersSubmitted(room)) {
      socket.emit("error", { message: "All players must submit interests." });
      return;
    }
    setRoomState(room, "generating");
    emitRoom(io, room.code);

    const interests = room.players.flatMap((player) => player.interests);
    try {
      const questions = await generateQuestions(
        interests,
        room.questionCount,
        (progress) => {
          io.to(room.code).emit("generation_progress", progress);
        },
        { roomCode: room.code },
      );
      setRoomQuestions(room, questions);
      startCurrentQuestion(io, room);
      emitRoom(io, room.code);
    } catch (error) {
      console.error("[start_game] Question generation failed:", error);
      setRoomState(room, "lobby");
      emitRoom(io, room.code);
      io.to(room.code).emit("generation_error", {
        message: "Failed to generate questions.",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  socket.on("submit_answer", (payload, acknowledge) => {
    const reply = typeof acknowledge === "function" ? acknowledge : () => {};
    const room = getRoomForPlayer(socket.id);
    if (!room || !isPlayerInRoom(room, socket.id)) {
      reply({
        accepted: false,
        message: "You are no longer in this game.",
        canRetry: false,
      });
      return;
    }
    const parsed = SubmitAnswerSchema.safeParse(payload);
    if (!parsed.success) {
      reply({
        accepted: false,
        message: "That answer could not be submitted.",
        canRetry: false,
      });
      return;
    }
    if (
      parsed.data.questionIndex !== room.currentQuestion ||
      parsed.data.timerStartedAt !== room.timerStartedAt
    ) {
      reply({
        accepted: false,
        message: "This question has ended.",
        canRetry: false,
      });
      return;
    }
    const existing = room.answers[String(room.currentQuestion)]?.[socket.id];
    if (existing) {
      reply({ accepted: true, choice: existing.choice });
      return;
    }
    if (
      room.state !== "playing" ||
      Date.now() >= room.timerStartedAt + room.timerSeconds * 1000
    ) {
      reply({
        accepted: false,
        message: "Time is up. Waiting for the answer.",
        canRetry: false,
      });
      return;
    }
    if (
      !room.questions[room.currentQuestion]?.options.includes(
        parsed.data.choice,
      )
    ) {
      reply({
        accepted: false,
        message: "Choose one of the answers shown.",
        canRetry: true,
      });
      return;
    }
    recordAnswer(room, room.currentQuestion, socket.id, {
      choice: parsed.data.choice,
      timeMs: parsed.data.timeMs,
    });
    reply({ accepted: true, choice: parsed.data.choice });
    if (allPlayersAnswered(room)) revealCurrentQuestion(room);
    emitRoom(io, room.code);
  });

  socket.on("reveal_answer", () => {
    const room = getRoomForPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.state !== "playing") return;
    revealCurrentQuestion(room);
    emitRoom(io, room.code);
  });

  socket.on("next_question", () => {
    const room = getRoomForPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.state !== "revealing") return;
    if (room.currentQuestion + 1 >= room.questions.length) {
      setRoomState(room, "results");
    } else {
      advanceQuestion(room);
      startCurrentQuestion(io, room);
    }
    emitRoom(io, room.code);
  });

  socket.on("start_question", () => {
    const room = getRoomForPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.state !== "ready") return;
    startCurrentQuestion(io, room);
    emitRoom(io, room.code);
  });

  socket.on("disconnect", () => {
    const activeRoom = getRoomForPlayer(socket.id);
    const roomCode = activeRoom?.code;
    const wasHost = activeRoom?.hostId === socket.id;
    const room = removePlayer(socket.id);

    if (wasHost && roomCode) {
      io.to(roomCode).emit("error", {
        message: "Host disconnected. Room closed.",
      });
      io.in(roomCode).socketsLeave(roomCode);
      clearTimer(roomCode);
      return;
    }

    if (!room && roomCode) {
      clearTimer(roomCode);
      return;
    }
    if (!room) return;
    emitRoom(io, room.code);
  });
}
