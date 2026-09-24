// Run after npm run build. Tests the real socket handlers with an in-process, free question fixture.
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const pipeline = require("../server/dist/ai/pipeline");
let generations = 0;
pipeline.generateQuestions = async (interests, count, progress) => {
  generations++;
  progress({
    stage: "topic_expansion",
    message: "Preparing questions",
    percent: 25,
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  if (interests.includes("Generation failure"))
    throw new Error("Fixture generation failure");
  return Array.from({ length: count }, (_, index) => ({
    interest: "Space",
    subInterest: "Our solar system",
    text: `Question ${index + 1}: Which planet is known as the red planet?`,
    options: ["Mars", "Jupiter", "Venus", "Mercury"],
    answer: "Mars",
  }));
};
const { registerSocketHandlers } = require("../server/dist/socket-handlers");
const manager = require("../server/dist/room-manager");
const server = createServer();
const io = new Server(server, { cors: { origin: true } });
io.on("connection", (socket) => registerSocketHandlers(io, socket));
function event(socket, name, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, handler);
      reject(new Error(`Timed out: ${name}`));
    }, 3000);
    const handler = (data) => {
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.off(name, handler);
      resolve(data);
    };
    socket.on(name, handler);
  });
}
async function run() {
  await new Promise((resolve) =>
    server.listen(
      process.argv.includes("--serve") ? 3000 : 0,
      "127.0.0.1",
      resolve,
    ),
  );
  if (process.argv.includes("--serve")) {
    console.log("Local fixture server on port 3000. No AI calls.");
    return;
  }
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  async function client() {
    const socket = connect(url, { transports: ["websocket"], forceNew: true });
    clients.push(socket);
    await event(socket, "connect");
    return socket;
  }
  const host = await client(),
    a = await client(),
    b = await client();
  try {
    let joined = event(host, "room_joined");
    host.emit("create_room", {});
    let room = (await joined).room;
    assert.equal(room.questionCount, 10);
    joined = event(host, "room_joined");
    host.emit("create_room", { questionCount: 5 });
    room = (await joined).room;
    assert.equal(room.questionCount, 5);
    for (const [socket, name] of [
      [a, "Ada"],
      [b, "Ben"],
    ]) {
      joined = event(socket, "room_joined");
      socket.emit("join_room", { code: room.code, playerName: name });
      await joined;
    }
    const invalid = event(a, "error");
    a.emit("submit_interests", { interests: ["   "] });
    assert.match((await invalid).message, /Invalid/);
    for (const socket of [a, b]) {
      const ready = event(
        socket,
        "room_updated",
        ({ room: r }) =>
          r.players.find((p) => p.id === socket.id)?.hasSubmittedInterests,
      );
      socket.emit("submit_interests", { interests: [" Space "] });
      const state = (await ready).room;
      assert.deepEqual(
        state.players.find((p) => p.id === socket.id).interests,
        ["Space"],
      );
    }
    let playing = event(
      host,
      "room_updated",
      ({ room: r }) => r.state === "playing",
    );
    host.emit("start_game");
    host.emit("start_game");
    room = (await playing).room;
    assert.equal(generations, 1);
    assert.equal(room.questions.length, 5);
    assert.equal(room.questions[0].answer, "");
    assert.deepEqual(room.answers, {});
    const submit = (socket, payload) =>
      new Promise((resolve) => socket.emit("submit_answer", payload, resolve));
    const payload = {
      questionIndex: 0,
      timerStartedAt: room.timerStartedAt,
      choice: "Mars",
      timeMs: 100,
    };
    assert.equal(
      (await submit(a, { ...payload, choice: "Not an option" })).canRetry,
      true,
    );
    assert.deepEqual(await submit(a, payload), {
      accepted: true,
      choice: "Mars",
    });
    assert.deepEqual(await submit(a, { ...payload, choice: "Venus" }), {
      accepted: true,
      choice: "Mars",
    });
    let revealed = event(
      host,
      "room_updated",
      ({ room: r }) => r.state === "revealing",
    );
    assert.equal((await submit(b, payload)).accepted, true);
    room = (await revealed).room;
    assert.equal(room.questions[0].answer, "Mars");
    assert.equal(room.answeredCount, 2);
    const firstScore = room.players[0].score;
    assert.deepEqual(await submit(a, payload), {
      accepted: true,
      choice: "Mars",
    });
    assert.equal(manager.getRoomByCode(room.code).players[0].score, firstScore);
    playing = event(
      host,
      "room_updated",
      ({ room: r }) => r.state === "playing",
    );
    host.emit("next_question");
    room = (await playing).room;
    assert.equal((await submit(a, payload)).accepted, false);
    assert.equal(manager.getAnsweredCount(manager.getRoomByCode(room.code)), 0);
    // Exercise the actual timer callback with a shorter test-only duration.
    const internal = manager.getRoomByCode(room.code);
    manager.clearTimer(room.code);
    internal.timerSeconds = 0.02;
    // Return to reveal then next question so the production handler owns this short timer.
    revealed = event(
      host,
      "room_updated",
      ({ room: r }) => r.state === "revealing",
    );
    host.emit("reveal_answer");
    await revealed;
    playing = event(
      host,
      "room_updated",
      ({ room: r }) => r.state === "playing",
    );
    host.emit("next_question");
    await playing;
    revealed = event(
      host,
      "room_updated",
      ({ room: r }) => r.state === "revealing",
    );
    room = (await revealed).room;
    assert.equal(room.currentQuestion, 2);
    assert.equal(room.answeredCount, 0);
    internal.timerSeconds = 20;
    for (let index = 3; index < 5; index++) {
      playing = event(
        host,
        "room_updated",
        ({ room: r }) => r.state === "playing",
      );
      host.emit("next_question");
      await playing;
      revealed = event(
        host,
        "room_updated",
        ({ room: r }) => r.state === "revealing",
      );
      host.emit("reveal_answer");
      await revealed;
    }
    let results = event(
      host,
      "room_updated",
      ({ room: r }) => r.state === "results",
    );
    host.emit("next_question");
    await results;
    let lobby = event(
      host,
      "room_updated",
      ({ room: r }) => r.state === "lobby",
    );
    host.emit("collect_interests");
    room = (await lobby).room;
    assert.equal(room.currentQuestion, 0);
    assert.deepEqual(room.answers, {});
    assert.ok(
      room.players.every(
        (p) =>
          !p.hasSubmittedInterests && p.score === 0 && p.interests.length === 0,
      ),
    );
    console.log(
      "PASS defaults, custom count, trimmed interests, duplicate generation guard, hidden answers, accepted/duplicate/rejected/stale submissions, scoring once, last-player reveal, timeout, manual progression, final results and replay.",
    );
  } finally {
    for (const socket of clients) socket.disconnect();
    await new Promise((resolve) => io.close(resolve));
    server.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  io.close();
  server.close();
});
