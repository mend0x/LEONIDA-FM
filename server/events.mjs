const encoder = new TextEncoder();
export function eventStream({ request, snapshot, release, clock, tickMs = 5000 }) {
  let stopped = false,
    timer,
    controller,
    previous;
  const start = clock();
  function stop(close = true) {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    request.signal.removeEventListener('abort', aborted);
    if (close) {
      try {
        controller?.close();
      } catch {
        /* Consumer closed first. */
      }
    }
    release();
  }
  function aborted() {
    stop();
  }
  async function tick() {
    if (stopped) return;
    try {
      const data = await snapshot();
      if (stopped) return;
      const marker = JSON.stringify(
        data.stations.map((s) => [
          s.slug,
          s.revision,
          s.programId,
          s.startedAt,
          s.liveStatus,
          s.liveTitle,
        ]),
      );
      if (marker !== previous) {
        controller.enqueue(
          encoder.encode(
            'id: ' +
              clock() +
              '\nevent: ' +
              (previous === undefined ? 'snapshot' : 'update') +
              '\ndata: ' +
              JSON.stringify(data) +
              '\n\n',
          ),
        );
        previous = marker;
      } else controller.enqueue(encoder.encode(': heartbeat ' + clock() + '\n\n'));
      if (clock() - start >= 240000) {
        stop();
        return;
      }
      timer = setTimeout(tick, tickMs);
      timer.unref?.();
    } catch {
      stop();
    }
  }
  const body = new ReadableStream({
    start(c) {
      controller = c;
      controller.enqueue(encoder.encode('retry: 5000\n\n'));
      if (request.signal.aborted) {
        stop();
        return;
      }
      request.signal.addEventListener('abort', aborted, { once: true });
      void tick();
    },
    cancel() {
      stop(false);
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
