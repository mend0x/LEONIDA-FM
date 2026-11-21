// Measures only the ephemeral loopback server created by this program.
import {createServer} from 'node:http';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {createNodeHandler} from '../server/node.mjs';

const listeners = 24;
const stationSlugs = ['flash-fm','cocoteo-fm','back-country','the-chamber','dirty-south','afro-bank'];
const handler = createNodeHandler({databasePath:':memory:',distDir:fileURLToPath(new URL('../public/',import.meta.url))});
const server = createServer(handler);
await new Promise((resolve) => server.listen(0,'127.0.0.1',resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const latencies = [], audioLatencies = [], failures = [];
let apiBytes = 0, audioBytes = 0, requests = 0;
async function request(path, headers, media = false) {
  const start = performance.now();
  requests++;
  const result = await fetch(origin + path,{headers});
  const body = await result.arrayBuffer();
  const elapsed = performance.now() - start;
  if (!result.ok || (media && result.status !== 206)) throw new Error('HTTP ' + result.status + ' for ' + path);
  if (media) {audioBytes += body.byteLength; audioLatencies.push(elapsed);return;}
  apiBytes += body.byteLength;latencies.push(elapsed);
  return JSON.parse(new TextDecoder().decode(body));
}
function summary(input) {
  const sorted=[...input].sort((a,b) => a - b);
  const at = (q) => Number(sorted[Math.max(0,Math.ceil(q*sorted.length)-1)]?.toFixed(2) ?? 0);
  return {samples:sorted.length,medianMs:at(.5),p95Ms:at(.95),maxMs:at(1)};
}
function megabytes(bytes) {return Number((bytes / 1048576).toFixed(2));}
try {
  await handler.api.ready();
  await (await fetch(origin+'/api/health')).arrayBuffer();
  const rssStart=process.memoryUsage().rss;
  let rssPeak=rssStart;
  const sampling=setInterval(() => {rssPeak=Math.max(rssPeak,process.memoryUsage().rss);},10);
  const cpuStart=process.cpuUsage(), begin=performance.now();
  try {
    await Promise.all(Array.from({length:listeners}, async (_v,index) => {
      try {
        const slug=stationSlugs[index%stationSlugs.length];
        await request('/api/system/time');
        const [nowPlaying] = await Promise.all([request('/api/stations/'+slug+'/now-playing'),request('/api/stations/'+slug+'/sources')]);
        const metadata=await fetch(origin+nowPlaying.current.url,{method:'HEAD'});
        requests++;
        if (!metadata.ok) throw new Error('Missing media asset');
        const size=Number(metadata.headers.get('content-length'));
        const start=Math.max(0,Math.min(size-32768,Math.floor(size*nowPlaying.offset/nowPlaying.current.duration)));
        await request(nowPlaying.current.url,{Range:'bytes='+start+'-'+(start+32767)},true);
      } catch(error) {failures.push(error.message);}
    }));
  } finally {clearInterval(sampling);}
  const wallMs=performance.now()-begin, cpu=process.cpuUsage(cpuStart);
  rssPeak=Math.max(rssPeak,process.memoryUsage().rss);
  console.log(JSON.stringify({measuredAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,
    profile:'Loopback, one Node process for server and 24 clients, warm SQLite catalog in memory. Each client reads time, metadata, source list and one 32 KiB audio range.',
    listeners,requests,failures:failures.length,errorMessages:[...new Set(failures)],wallMs:Number(wallMs.toFixed(2)),
    api:summary(latencies),audioRanges:summary(audioLatencies),apiBytes,audioBytes,
    responseMiBPerSecond:Number(((apiBytes+audioBytes)*1000/wallMs/1048576).toFixed(2)),
    processCpuUserMs:Number((cpu.user/1000).toFixed(2)),processCpuSystemMs:Number((cpu.system/1000).toFixed(2)),
    rssStartMiB:megabytes(rssStart),rssSampledPeakMiB:megabytes(rssPeak)},null,2));
  if(failures.length) process.exitCode=1;
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  handler.close();
}
