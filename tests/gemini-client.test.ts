import assert from 'node:assert/strict';
import test from 'node:test';
import type { LiveServerMessage } from '@google/genai';
import { GeminiLiveSession } from '../lib/gemini-client';

function harness(earlySetup = false) {
  const states: string[] = [];
  const originals: string[] = [];
  let turns = 0;
  let interrupts = 0;
  type Callbacks = {
    onmessage: (message: Partial<LiveServerMessage>) => void;
    onclose: (event: { code: number; reason: string }) => void;
  };
  const sockets: Array<{
    callbacks: Callbacks;
    sent: unknown[];
    closed: boolean;
    failSend: boolean;
    resolve: () => void;
  }> = [];
  const client = new GeminiLiveSession({ apiKey: 'test', model: 'test', systemPrompt: 'Translate' }, {
    onOriginalText: text => originals.push(text), onTranslatedText: () => {}, onAudio: () => {},
    onError: () => {}, onStateChange: state => states.push(state),
    onTurnComplete: () => turns++, onInterrupt: () => interrupts++,
  });
  // Replace the transport only; exercise the real connection and message lifecycle.
  Object.assign(client, { client: { live: { connect: ({ callbacks }: { callbacks: Callbacks }) => {
    return new Promise(resolve => {
      const socket = { callbacks, sent: [] as unknown[], closed: false, failSend: false, resolve: () => {} };
      socket.resolve = () => resolve({
        sendRealtimeInput: (data: unknown) => {
          if (socket.failSend) throw new Error('Socket closed');
          socket.sent.push(data);
        },
        close: () => { socket.closed = true; },
      });
      sockets.push(socket);
      if (earlySetup) callbacks.onmessage({ setupComplete: {} });
    });
  } } } });
  return { client, sockets, states, originals, get turns() { return turns; }, get interrupts() { return interrupts; } };
}

async function ready(h: ReturnType<typeof harness>) {
  const connecting = h.client.connect();
  const socket = h.sockets.at(-1)!;
  socket.resolve();
  await connecting;
  socket.callbacks.onmessage({ setupComplete: {} });
  return socket;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('successive Korean utterances keep one usable connection', async () => {
  const h = harness();
  const socket = await ready(h);
  for (const text of ['안녕하세요', '다시 말씀드릴게요', '어디가 아프세요']) {
    h.client.sendAudio('AAAA');
    socket.callbacks.onmessage({ serverContent: { inputTranscription: { text }, interrupted: false, turnComplete: true } });
  }
  assert.equal(h.sockets.length, 1);
  assert.equal(socket.sent.length, 3);
  assert.equal(h.originals.length, 3);
  assert.equal(h.turns, 3);
  assert.equal(h.interrupts, 0);
  h.client.disconnect();
});

test('interrupt retains transcription and completion in the same message', async () => {
  const h = harness();
  const socket = await ready(h);
  socket.callbacks.onmessage({ serverContent: { interrupted: true, inputTranscription: { text: '잠시만요' }, turnComplete: true } });
  assert.equal(h.interrupts, 1);
  assert.deepEqual(h.originals, ['잠시만요']);
  assert.equal(h.turns, 1);
  h.client.disconnect();
});

for (const early of [false, true]) {
  test(`handover handles setup ${early ? 'before' : 'after'} connect resolution and ignores stale close`, async () => {
    const h = harness(early);
    const first = await ready(h);
    first.callbacks.onmessage({ goAway: { timeLeft: '10s' } });
    const second = h.sockets[1];
    second.resolve();
    await tick();
    if (!early) second.callbacks.onmessage({ setupComplete: {} });
    assert.equal(first.closed, true);
    const statesBefore = h.states.length;
    first.callbacks.onclose({ code: 1000, reason: 'old connection' });
    first.callbacks.onmessage({ serverContent: { inputTranscription: { text: 'stale' } } });
    assert.equal(h.states.length, statesBefore);
    assert.deepEqual(h.originals, []);
    h.client.sendAudio('AAAA');
    assert.equal(second.sent.length, 1);
    // The current connection's close must still recover, unlike the stale close.
    second.callbacks.onclose({ code: 1000, reason: 'server ended session' });
    assert.equal(h.states.at(-1), 'reconnecting');
    h.client.disconnect();
  });
}

test('disconnect while connect is pending closes late socket without resurrection', async () => {
  const h = harness();
  const connecting = h.client.connect();
  h.client.disconnect();
  h.sockets[0].callbacks.onmessage({ setupComplete: {} });
  h.sockets[0].resolve();
  await connecting;
  h.client.sendAudio('AAAA');
  assert.equal(h.sockets[0].closed, true);
  assert.equal(h.sockets[0].sent.length, 0);
  assert.ok(!h.states.includes('connected'));
});

test('send failure recovers once without throwing into the microphone handler', async () => {
  const h = harness();
  const socket = await ready(h);
  socket.failSend = true;
  assert.doesNotThrow(() => h.client.sendAudio('AAAA'));
  socket.callbacks.onclose({ code: 1006, reason: 'late close' });
  assert.equal(h.states.filter(state => state === 'reconnecting').length, 1);
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.equal(h.sockets.length, 2);
  h.sockets[1].resolve();
  await tick();
  h.sockets[1].callbacks.onmessage({ setupComplete: {} });
  h.client.sendAudio('BBBB');
  assert.equal(h.sockets[1].sent.length, 1);
  h.client.disconnect();
});

test('failed replacement leaves original connection usable', async () => {
  const h = harness();
  const first = await ready(h);
  first.callbacks.onmessage({ goAway: { timeLeft: '10s' } });
  h.sockets[1].callbacks.onclose({ code: 1006, reason: 'setup failed' });
  h.sockets[1].resolve();
  await tick();
  h.client.sendAudio('AAAA');
  assert.equal(first.sent.length, 1);
  assert.equal(first.closed, false);
  h.client.disconnect();
});
