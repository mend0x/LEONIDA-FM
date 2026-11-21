import { useEffect, useState } from 'react';
import { LockKeyhole, Plus, Radio } from 'lucide-react';
import { readApi } from './hooks';
import { PageHead } from './Explore';
import type { T } from './ui';
interface Draft {
  slug: string;
  revision?: number;
  station: Record<string, unknown>;
  tracks: unknown[];
  sources: unknown[];
  evidence: unknown[];
  programs: unknown[];
}
interface Dash {
  stations: { slug: string; name: string; enabled: boolean }[];
  metrics: Record<string, string | number | null>;
  events: { id: number; type: string; at: number; detail: string }[];
}
const sections = ['sources', 'programs', 'tracks', 'evidence'] as const;
const fresh = (): Draft => ({
  slug: '',
  station: {
    name: '',
    genre: '',
    description: '',
    confidence: 'COMMUNITY',
    enabled: true,
    hosts: [],
    order: 6,
  },
  tracks: [],
  sources: [],
  programs: [],
  evidence: [],
});
export default function Studio({ t, refresh }: { t: T; refresh: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null),
    [dash, setDash] = useState<Dash | null>(null),
    [token, setToken] = useState(''),
    [draft, setDraft] = useState<Draft | null>(null),
    [msg, setMsg] = useState(''),
    [busy, setBusy] = useState(false);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const api = <T,>(p: string, method = 'GET', body?: unknown) =>
    readApi<T>('admin/' + p, {
      method,
      credentials: 'same-origin',
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    });
  const err = (e: unknown) => setMsg(e instanceof Error ? e.message : String(e));
  const load = async () => {
    const d = await api<Dash>('dashboard');
    setDash(d);
  };
  useEffect(() => {
    let active = true;
    void readApi<{ adminAvailable: boolean }>('config/public')
      .then(async (c) => {
        if (!active) return;
        setEnabled(c.adminAvailable);
        if (c.adminAvailable)
          try {
            const d = await api<Dash>('dashboard');
            if (active) setDash(d);
          } catch {}
      })
      .catch((e) => {
        if (active) {
          setEnabled(false);
          err(e);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const edit = (d: Draft) => {
    setDraft(d);
    setTexts(Object.fromEntries(sections.map((k) => [k, JSON.stringify(d[k] || [], null, 2)])));
    setMsg('');
  };
  const setField = (name: string, v: unknown) => {
    if (draft) setDraft({ ...draft, station: { ...draft.station, [name]: v } });
  };
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const body = {
        revision: draft.revision,
        station: { ...draft.station, slug: draft.slug },
        ...Object.fromEntries(sections.map((k) => [k, JSON.parse(texts[k])])),
      };
      const saved = await api<Draft>(
        draft.revision ? 'stations/' + draft.slug : 'stations',
        draft.revision ? 'PUT' : 'POST',
        body,
      );
      edit(saved);
      await load();
      refresh();
      setMsg(t('Changes saved.', 'Cambios guardados.'));
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  }
  const field = (name: string, label: string) =>
    draft && (
      <label>
        {label}
        <input
          value={String(draft.station[name] ?? '')}
          onChange={(e) => setField(name, e.target.value)}
          required={name === 'name' || name === 'genre'}
        />
      </label>
    );
  return (
    <>
      <PageHead
        kicker={t('Operator access', 'Acceso de operadores')}
        title={t('Broadcast studio', 'Estudio de emisión')}
      />
      {msg && (
        <p role="status" className="studio-msg">
          {msg}
        </p>
      )}
      {enabled === null ? (
        <p>{t('Checking studio…', 'Comprobando el estudio…')}</p>
      ) : !enabled ? (
        <section className="section-panel">
          <h2>
            <LockKeyhole />
            {t('Studio locked', 'Estudio bloqueado')}
          </h2>
          <p>
            {t(
              'The operator can enable sign-in by setting ADMIN_TOKEN on the server and connecting the persistent database. Listener access is open.',
              'El operador puede activar el acceso configurando ADMIN_TOKEN en el servidor y conectando la base de datos persistente. La radio está disponible para los oyentes.',
            )}
          </p>
        </section>
      ) : !dash ? (
        <form
          className="studio-form section-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('session', 'POST', { token });
              setToken('');
              setMsg('');
              await load();
            } catch (ex) {
              err(ex);
            }
          }}
        >
          <label>
            {t('Operator credential', 'Credencial del operador')}
            <input
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </label>
          <button className="primary">{t('Sign in', 'Acceder')}</button>
        </form>
      ) : (
        <>
          <div className="facts">
            {[
              ['enabled', t('Enabled stations', 'Emisoras habilitadas')],
              ['liveOnline', t('Live signals', 'Señales en directo')],
              ['listeners', t('Measured listeners', 'Oyentes medidos')],
              ['bytesServed', t('Bytes sent', 'Bytes enviados')],
            ].map(([key, label]) => (
              <div key={key}>
                <small>{label}</small>
                <br />
                <b>{dash.metrics[key] ?? '—'}</b>
              </div>
            ))}
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await api('session', 'DELETE');
                  setDash(null);
                  setDraft(null);
                  setMsg('');
                } catch (e) {
                  err(e);
                }
              }}
            >
              {t('Sign out', 'Cerrar sesión')}
            </button>
          </div>
          <div className="studio-cols">
            <section className="section-panel">
              <h2>
                <Radio />
                {t('Stations', 'Emisoras')}
              </h2>
              <div className="studio-list">
                {dash.stations.map((s) => (
                  <button
                    key={s.slug}
                    className={s.slug === draft?.slug ? 'active' : ''}
                    onClick={() =>
                      void api<Draft>('stations/' + s.slug)
                        .then(edit)
                        .catch(err)
                    }
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <button className="text-button" onClick={() => edit(fresh())}>
                <Plus size={15} />
                {t('New station', 'Nueva emisora')}
              </button>
            </section>
            {draft ? (
              <form
                className="studio-form section-panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <h2>
                  {draft.revision
                    ? t('Edit station', 'Editar emisora')
                    : t('New station', 'Nueva emisora')}
                </h2>
                <label>
                  Slug
                  <input
                    disabled={!!draft.revision}
                    value={draft.slug}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    required
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                  />
                </label>
                {field('name', t('Name', 'Nombre'))}
                {field('genre', t('Genre', 'Género'))}
                {field('description', t('English description', 'Descripción en inglés'))}
                {field('descriptionEs', t('Spanish description', 'Descripción en español'))}
                <label>
                  {t('Evidence level', 'Nivel de confirmación')}
                  <select
                    value={String(draft.station.confidence)}
                    onChange={(e) => setField('confidence', e.target.value)}
                  >
                    {['OFFICIAL', 'REPORTED', 'UNVERIFIED', 'COMMUNITY'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('Station enabled', 'Emisora habilitada')}
                  <input
                    type="checkbox"
                    checked={draft.station.enabled !== false}
                    onChange={(e) => setField('enabled', e.target.checked)}
                  />
                </label>
                <details>
                  <summary>
                    {t('Branding, languages and dial order', 'Identidad, idiomas y orden del dial')}
                  </summary>
                  {field('shortName', t('Short name', 'Nombre corto'))}
                  {field('genreEs', t('Spanish genre', 'Género en español'))}
                  {field('color', t('Accent color', 'Color de acento'))}
                  {field('art', t('Artwork path', 'Ruta de carátula'))}
                  <label>
                    {t('Order', 'Posición')}
                    <input
                      type="number"
                      min="0"
                      value={Number(draft.station.order ?? 0)}
                      onChange={(e) => setField('order', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    {t('Hosts, comma-separated', 'Presentadores separados por comas')}
                    <input
                      value={
                        Array.isArray(draft.station.hosts) ? draft.station.hosts.join(',') : ''
                      }
                      onChange={(e) =>
                        setField(
                          'hosts',
                          e.target.value.split(',').map((s) => s.trim()),
                        )
                      }
                    />
                  </label>
                  <label>
                    {t('Station reference IDs', 'Referencias de la emisora')}
                    <input
                      value={
                        Array.isArray(draft.station.evidence)
                          ? draft.station.evidence.join(',')
                          : ''
                      }
                      onChange={(e) =>
                        setField('evidence', e.target.value.split(',').filter(Boolean))
                      }
                    />
                  </label>
                </details>
                {sections.map((k, i) => (
                  <details key={k}>
                    <summary>
                      {
                        [
                          t('Audio sources', 'Fuentes de audio'),
                          t('Program schedule', 'Programación'),
                          t('Music catalog', 'Catálogo musical'),
                          t('Evidence records', 'Evidencias'),
                        ][i]
                      }
                    </summary>
                    <label>
                      JSON
                      <textarea
                        value={texts[k]}
                        onChange={(e) => setTexts({ ...texts, [k]: e.target.value })}
                      />
                    </label>
                  </details>
                ))}
                <div className="inline-actions">
                  <button className="primary" disabled={busy}>
                    {t('Save changes', 'Guardar cambios')}
                  </button>
                  {draft.revision && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={async () => {
                        try {
                          const x = await api<{ status: { liveStatus: string } }>(
                            'stations/' + draft.slug + '/probe',
                            'POST',
                          );
                          setMsg(x.status.liveStatus);
                          await load();
                        } catch (e) {
                          err(e);
                        }
                      }}
                    >
                      {t('Probe source', 'Comprobar fuente')}
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <section className="section-panel">
                <h2>{t('Recent events', 'Eventos recientes')}</h2>
                {dash.events.length ? (
                  dash.events.map((e) => (
                    <p key={e.id}>
                      {new Date(e.at).toLocaleString()} · {e.detail}
                    </p>
                  ))
                ) : (
                  <p>{t('No recorded events.', 'Sin eventos registrados.')}</p>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}
