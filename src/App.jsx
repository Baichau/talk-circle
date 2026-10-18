import { useState, useEffect, useRef, useMemo } from "react";
import { TOPICS, CATS, questionsFor } from "./topics.js";
import { online, createRoom, joinRoom } from "./net.js";

const EMPTY = { seq: 0, topic: null, holder: null, q: null, hand: [], used: [] };
const HUES = ["#ff8a5b", "#5b8cff", "#a77bff", "#ff6f91", "#1f9d8f", "#e8b53a", "#4fc36b", "#e0607e"];
const WORDS = ["fox", "owl", "bee", "elk", "cat", "yak", "emu", "ant"];
const CODE_CHARS = "23456789abcdefghjkmnpqrstuvwxyz";
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const newRoomCode = () => rnd(WORDS) + "-" + Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
const cleanRoomCode = (value) => value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
const compareGame = (a, b) => (a.seq || 0) - (b.seq || 0)
  || (a.updatedAt || 0) - (b.updatedAt || 0)
  || String(a.actor || "").localeCompare(String(b.actor || ""));
const pos = (i, n) => { const a = ((-90 + (i * 360) / n) * Math.PI) / 180; return { x: 50 + 37 * Math.cos(a), y: 50 + 37 * Math.sin(a) }; };
const uid = () => { let v = sessionStorage.getItem("uid"); if (!v) { v = Math.random().toString(36).slice(2, 10); sessionStorage.setItem("uid", v); } return v; };
let ac, MUTE = false;
const beep = (f, d) => { if (MUTE) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.15, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d); } catch {} };
const draw = (t, used) => { const n = questionsFor(t).length; let c = [...Array(n).keys()].filter((i) => !used.includes(t * 1000 + i)); if (c.length < 4) c = [...Array(n).keys()]; return c.sort(() => Math.random() - 0.5).slice(0, 4); };

function Ring({ people, hi, meId, fx, topic }) {
  const n = people.length;
  return (
    <div className="ring" aria-label={people.length + (people.length === 1 ? " person" : " people") + " in the circle"}>
      <i className="still" /><i className="still" /><i className="still" />
      <div className="orb">
        <span className="orb-emoji">{topic ? topic.e : "✳"}</span>
        <span className="orb-topic">{topic ? topic.name : "Pick a topic"}</span>
        <span className="orb-count">{people.length} {people.length === 1 ? "person" : "people"}</span>
      </div>
      {people.map((p, i) => { const q = pos(i, n); return (
        <div key={p.id} className={"p" + (i === hi ? " on" : "")} style={{ left: q.x + "%", top: q.y + "%", "--c": HUES[i % 8] }}>
          <i>{(p.name[0] || "?").toUpperCase()}</i><span className="person-name">{p.id === meId ? "You" : p.name}</span>
        </div>); })}
      {fx.map((f) => { if (f.kind === "wave") { const q = pos(f.a, n); return <div key={f.id} className="wave" style={{ left: q.x + "%", top: q.y + "%" }} />; }
        const A = pos(f.a, n), B = pos(f.b, n);
        return <div key={f.id} className="ball" style={{ "--ax": A.x + "%", "--ay": A.y + "%", "--bx": B.x + "%", "--by": B.y + "%" }} />; })}
    </div>
  );
}

function Picker({ onPick }) {
  const [q, setQ] = useState(""), [cat, setCat] = useState(-1);
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return TOPICS.map((t, i) => ({ ...t, i })).filter((t) => (cat < 0 || t.ci === cat) && (!s || t.name.toLowerCase().includes(s) || t.cat.toLowerCase().includes(s))); }, [q, cat]);
  return (
    <section>
      <div className="join">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={"Search " + TOPICS.length + " topics"} aria-label="Search topics" />
        <button className="btn" onClick={() => onPick(Math.floor(Math.random() * TOPICS.length))}>Random topic</button>
      </div>
      <div className="chips">
        <button className={"chip2" + (cat < 0 ? " on" : "")} onClick={() => setCat(-1)}>All</button>
        {CATS.map((c, i) => <button key={c.n} className={"chip2" + (cat === i ? " on" : "")} onClick={() => setCat(i)}>{c.e} {c.n}</button>)}
      </div>
      <div className="topics">
        {list.map((t) => <button key={t.i} className="topic" style={{ "--c": `hsl(${t.h} 75% 55%)` }} onClick={() => onPick(t.i)}><span>{t.e}</span><b>{t.name}</b></button>)}
        {!list.length && <p className="hint">No topic matches “{q}”.</p>}
      </div>
    </section>
  );
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [name, setName] = useState(() => localStorage.getItem("tc-name") || "");
  const [code, setCode] = useState("");
  const [roomCode, setRoomCode] = useState(() => cleanRoomCode(new URLSearchParams(location.search).get("room") || ""));
  const [createCode, setCreateCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [mode, setMode] = useState("local");
  const [G, setG] = useState(EMPTY), Gr = useRef(EMPTY);
  const [people, setPeople] = useState([]), [fx, setFx] = useState([]);
  const [muted, setMuted] = useState(false), [note, setNote] = useState(""), [nm, setNm] = useState("");
  const [connection, setConnection] = useState("idle"), [connectionError, setConnectionError] = useState("");
  const [talking, setTalking] = useState(false);
  const net = useRef(null), me = useRef({}), prev = useRef({ ids: [], holder: null }), flashTimer = useRef(null);

  const flash = (m) => { setNote(m); window.clearTimeout(flashTimer.current); flashTimer.current = window.setTimeout(() => setNote(""), 3000); };
  const addFx = (f) => { const id = Math.random(); setFx((x) => [...x, { ...f, id }]); setTimeout(() => setFx((x) => x.filter((y) => y.id !== id)), 1800); };
  const hi = Math.max(0, people.findIndex((p) => p.id === G.holder));
  const can = mode === "local" || (connection === "connected" && people[hi]?.id === me.current.id);

  const commit = (p) => {
    const g = { ...Gr.current, ...p, seq: Gr.current.seq + 1, updatedAt: Date.now(), actor: me.current.id };
    Gr.current = g; setG(g); net.current?.track({ ...me.current, g });
  };
  const onPeers = (list) => {
    const ps = list.filter((p) => p && p.id && p.name).sort((a, b) => a.j - b.j || (a.id < b.id ? -1 : 1));
    setPeople(ps.map((p) => ({ id: p.id, name: String(p.name).slice(0, 12) })));
    setConnection(me.current.creator || ps.some((p) => p.id !== me.current.id) ? "connected" : "waiting");
    setConnectionError("");
    let best = null;
    ps.forEach((p) => {
      if (p.g && Number.isFinite(p.g.seq) && (!best || compareGame(p.g, best) > 0)) best = p.g;
    });
    if (best && compareGame(best, Gr.current) > 0) { Gr.current = best; setG(best); }
    else if (!best && ps.length && !Gr.current.holder) {
      const initial = { ...Gr.current, holder: ps[0].id };
      Gr.current = initial; setG(initial);
    }
    const mine = ps.find((p) => p.id === me.current.id);
    if (best && mine && (!mine.g || !Number.isFinite(mine.g.seq) || compareGame(best, mine.g) > 0)) {
      net.current?.track({ ...me.current, g: best });
    }
  };
  const start = (kind, c, creator = false) => {
    const nick = (name.trim() || "Guest " + (10 + Math.floor(Math.random() * 90))).slice(0, 12);
    localStorage.setItem("tc-name", nick); me.current = { id: uid(), name: nick, j: Date.now(), creator };
    const initial = { ...EMPTY, holder: me.current.id, seq: creator ? 1 : 0, updatedAt: creator ? Date.now() : 0, actor: creator ? me.current.id : "" };
    Gr.current = initial; setG(initial); prev.current = { ids: [], holder: null }; setPeople([]);
    if (kind === "room") {
      setCode(c); setMode("room"); setConnection("connecting"); setConnectionError(""); setCodeError("");
      const onStatus = (status, message) => {
        setConnection(status);
        if (status === "error" && creator) {
          setCodeError(message || "Could not create the room.");
          setConnection("idle");
          setScreen("home");
        } else if (status === "error") {
          setConnectionError(message || "Could not connect to the room.");
          flash(message || "Could not connect to the room.");
        } else if (status === "connected") {
          setConnectionError("");
        }
      };
      try {
        net.current = creator
          ? createRoom(c, { ...me.current, creator, g: initial }, onPeers, onStatus)
          : joinRoom(c, { ...me.current, g: initial }, onPeers, onStatus);
      } catch (error) {
        onStatus("error", error instanceof Error ? error.message : "Could not connect to the room.");
      }
    } else {
      setMode("local"); setConnection("idle"); setPeople([{ id: me.current.id, name: nick }]);
    }
    setScreen("session");
  };
  const leave = () => {
    net.current?.leave(); net.current = null; setConnection("idle"); setConnectionError("");
    setScreen("home"); setTalking(false); window.speechSynthesis?.cancel();
  };
  useEffect(() => () => net.current?.leave(), []);

  useEffect(() => { if (screen !== "session") return; const ids = people.map((p) => p.id), old = prev.current.ids;
    if (old.length) ids.forEach((id, i) => { if (!old.includes(id) && id !== me.current.id) { addFx({ kind: "wave", a: i }); beep(660, 0.5); setTimeout(() => beep(880, 0.4), 120); } });
    prev.current.ids = ids; }, [people]);
  useEffect(() => { if (!people.length) return; const hid = people[hi].id, ph = prev.current.holder;
    if (ph && ph !== hid) { addFx({ kind: "ball", a: Math.max(0, people.findIndex((p) => p.id === ph)), b: hi }); beep(520, 0.3); setTimeout(() => beep(780, 0.3), 800); }
    prev.current.holder = hid; }, [G.holder, people]);
  useEffect(() => { document.documentElement.style.setProperty("--hue", G.topic != null && TOPICS[G.topic] ? TOPICS[G.topic].h : 172); }, [G.topic, screen]);

  const chooseTopic = (t) => commit({ topic: t, q: null, hand: draw(t, G.used) });
  const pick = (i) => can && commit({ q: { t: G.topic, i }, used: [...G.used, G.topic * 1000 + i].slice(-200) });
  const pass = () => { if (!can) return; window.speechSynthesis?.cancel(); setTalking(false); const nx = people[(hi + 1) % people.length];
    commit({ holder: nx.id, q: null, hand: G.topic != null ? draw(G.topic, G.used) : [] }); };
  const speak = (text) => { const s = window.speechSynthesis; if (!s) return; s.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = 0.9; u.onend = u.onerror = () => setTalking(false); setTalking(true); s.speak(u); };
  const addPerson = () => { const v = nm.trim().slice(0, 12); if (!v || people.length >= 8) return; setPeople([...people, { id: "l" + people.length + v, name: v }]); setNm(""); };
  const toggleMute = () => { MUTE = !MUTE; setMuted(MUTE); };
  const copyInvite = async () => {
    const invite = location.origin + location.pathname + "?room=" + encodeURIComponent(code);
    try {
      await navigator.clipboard.writeText(invite);
      flash("Invite link copied");
    } catch {
      flash("Copy unavailable — share room code " + code.toUpperCase());
    }
  };

  if (screen === "home") return (
    <main>
      <div className="blob b1" /><div className="blob b2" />
      <h1 className="big"><svg className="brand-mark" aria-hidden="true" viewBox="0 0 40 40"><path d="M7 8.5A5.5 5.5 0 0 1 12.5 3h15A5.5 5.5 0 0 1 33 8.5v13a5.5 5.5 0 0 1-5.5 5.5H18l-8.5 7v-9.5A5.5 5.5 0 0 1 7 19.5z" /><path d="M14 14h12M14 20h8" /></svg>Talk Circle</h1>
      <p className="lead">Pick a topic, pick a question, pass the turn. Everyone sees it, one person answers.</p>
      <input className="wide" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={12} autoComplete="off" />
      <div className="panel">
        <b>Create a room</b>
        <div className="join code-entry">
          <input value={createCode} onChange={(e) => { setCreateCode(cleanRoomCode(e.target.value)); setCodeError(""); }} onKeyDown={(e) => e.key === "Enter" && online && cleanRoomCode(createCode) && start("room", cleanRoomCode(createCode), true)} placeholder="Choose your own room code" aria-label="Choose your own room code" maxLength={32} autoComplete="off" />
          <button className="btn" type="button" onClick={() => { setCreateCode(newRoomCode()); setCodeError(""); }}>Random</button>
          <button className="btn main" disabled={!online || !cleanRoomCode(createCode)} onClick={() => start("room", cleanRoomCode(createCode), true)}>Create room</button>
        </div>
        <small className="field-hint">Use a memorable code with letters, numbers, or hyphens.</small>
        {codeError && <p className="form-error" role="alert">{codeError}</p>}
      </div>
      <div className="panel">
        <b>Join a room</b>
        <div className="join"><input value={roomCode} onChange={(e) => setRoomCode(cleanRoomCode(e.target.value))} placeholder="Room code, e.g. book-club" aria-label="Room code" maxLength={32} autoComplete="off" />
          <button className="btn main" disabled={!online || !roomCode} onClick={() => start("room", roomCode)}>Join</button></div>
      </div>
      <button className="btn" onClick={() => start("local")}>Play on one phone</button>
      {!online && <p className="hint">Live rooms need <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>. Add them to your deployment settings; one-phone mode works without them.</p>}
    </main>
  );

  const topic = G.topic != null ? TOPICS[G.topic] : null, qs = topic ? questionsFor(G.topic) : [];
  const curQ = G.q ? questionsFor(G.q.t)[G.q.i] : null, holder = people[hi];
  return (
    <main>
      <div className="blob b1" /><div className="blob b2" />
      <div className="bar">
        <button className="btn" onClick={leave}>Leave</button>
        <button className="btn" onClick={toggleMute}>{muted ? "Sound off" : "Sound on"}</button>
        {mode === "room" && <button className="chip" title="Copy invite link" onClick={copyInvite}>{code.toUpperCase()}</button>}
      </div>
      {mode === "room" && <p className={"connection " + connection} role="status">
        {connection === "connected" ? "Live room connected" : connection === "error" ? connectionError : connection === "disconnected" ? "Connection closed. Rejoin the room to continue." : connection === "waiting" ? "Waiting for someone in this room…" : "Connecting to the live room…"}
      </p>}
      {connection === "error" && mode === "room" ? <div className="empty-room">
        <p className="hint">{connectionError || "Could not connect to the room."}</p>
        <button className="btn" onClick={leave}>Back to rooms</button>
      </div> : !people.length ? <div className="empty-room">
        <p className="hint">Connecting to the room…</p>
      </div> : <>
        <Ring people={people} hi={hi} meId={me.current.id} fx={fx} topic={topic} />
        <p className="hint">{mode === "room" && connection === "waiting" ? "Waiting for someone to join this room…" : mode === "local" ? (holder.id === me.current.id ? "Your turn" : holder.name + "'s turn") + (topic ? ". Pick a question." : ". Pick a topic.") : can ? (topic ? "Your turn. Pick a question." : "Your turn. Pick a topic.") : holder.name + " is choosing…"}</p>
        {mode === "local" && <div className="join" style={{ maxWidth: 440, margin: "0 auto 14px" }}>
          <input value={nm} onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPerson()} placeholder="Add a person" maxLength={12} />
          <button className="btn main" onClick={addPerson}>Add</button></div>}
        {!topic ? (can ? <Picker onPick={chooseTopic} /> : null) : (
          <section>
            <div className="row" style={{ justifyContent: "center", marginBottom: 12 }}>
              {can && <button className="btn" onClick={() => commit({ topic: null, q: null, hand: [] })}>Change topic</button>}
              {can && <button className="btn" onClick={() => commit({ hand: draw(G.topic, G.used) })}>Shuffle</button>}
            </div>
            <div className="hand">{G.hand.map((i) => qs[i] && <button key={i} className="card" disabled={!can} onClick={() => pick(i)}>{qs[i]}</button>)}</div>
          </section>)}
        {curQ && <div className="sheet"><div className="q">
          <small>{TOPICS[G.q.t]?.name} · {holder.name} answers</small>
          <p>{curQ}</p>
          <div className="row">
            <button className={"btn" + (talking ? " speaking" : "")} onClick={() => speak(curQ)}><span className="eq"><i /><i /><i /></span> Listen</button>
            {can && <button className="btn" onClick={() => commit({ q: null, used: G.used.filter((id) => id !== G.q.t * 1000 + G.q.i) })}>Put back</button>}
            {can && <button className="btn main" onClick={pass}>Pass to {people[(hi + 1) % people.length].name}</button>}
          </div>
        </div></div>}
      </>}
      <div className={"toast" + (note ? " show" : "")}>{note}</div>
    </main>
  );
}
