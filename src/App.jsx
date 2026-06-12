import React, { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ============ Supabase ============
const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

async function carregarDados() {
  const { data, error } = await sb
    .from("koch_dados")
    .select("dados")
    .eq("id", "principal")
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return data?.dados || null;
}

async function salvarDados(dados) {
  const { error } = await sb
    .from("koch_dados")
    .upsert({ id: "principal", dados, atualizado_em: new Date().toISOString() });
  if (error) throw error;
}

// ============ Identidade KOCH ============
const AMARELO = "#FFD400";
const AMARELO_CLARO = "#FFF6C9";
const AMARELO_TEXTO = "#8A6D00";
const PRETO = "#111111";
const ROXO = "#6D4AFF";
const ROXO_CLARO = "#F1ECFF";
const ROXO_TEXTO = "#5436CC";
const FUNDO = "#F7F7F4";
const DIAS_LIXEIRA = 30;

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

const isoData = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const hojeStr = () => isoData(new Date());
const amanhaStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return isoData(d); };

const diasDesde = (iso) => {
  if (!iso) return 0;
  const p = iso.split("-").map(Number);
  if (p.length !== 3) return 0;
  return Math.floor((Date.now() - new Date(p[0], p[1] - 1, p[2]).getTime()) / 86400000);
};

const fmtData = (iso) => {
  if (!iso) return "";
  const p = iso.split("-");
  return p.length !== 3 ? iso : `${p[2]}/${p[1]}`;
};

const escapeHtml = (s) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const htmlParaTexto = (html) =>
  (html || "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p|li|h1|h2|h3)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const normalizar = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const jogarNaLixeira = (d, tipo, payload, extra) => {
  if (!d.lixeira) d.lixeira = [];
  d.lixeira.unshift({ id: uid(), tipo, payload, extra: extra || null, apagadoEm: hojeStr() });
};

const PRIORIDADES = {
  alta: { label: "Alta", bg: "#FDE3E3", fg: "#C0392B" },
  media: { label: "Média", bg: AMARELO_CLARO, fg: AMARELO_TEXTO },
  baixa: { label: "Baixa", bg: "#EFEFEF", fg: "#666666" },
};
const STATUS = {
  afazer: { label: "A fazer", bg: "#EFEFEF", fg: "#444444" },
  fazendo: { label: "Fazendo", bg: AMARELO_CLARO, fg: AMARELO_TEXTO },
  travado: { label: "Travado", bg: "#FDE3E3", fg: "#C0392B" },
  feito: { label: "Feito", bg: "#E3F6E8", fg: "#1E8E3E" },
};
const ORDEM_TABS = ["hoje","captura","demandas","pessoas","anotacoes","kanban","pessoal","contas","conteudos"];
const DEFAULT_DATA = {
  appName: "KOCH",
  tabNames: {
    hoje: "Hoje", captura: "Captura", demandas: "Demandas", pessoas: "Pessoas",
    anotacoes: "Anotações", kanban: "Acompanhamento", pessoal: "Vida Pessoal",
    contas: "Contas", conteudos: "Conteúdos",
  },
  lembretesTitulo: "Funções fixas",
  capturas: [], demandas: [], pessoas: [], lembretes: [], lembreteChecks: {},
  anotacoes: [], kanban: { colunas: [
    { id: "c1", nome: "A fazer", cards: [] },
    { id: "c2", nome: "Fazendo", cards: [] },
    { id: "c3", nome: "Feito", cards: [] },
  ]},
  pessoal: { tarefas: [] },
  lixeira: [],
};

// ============ Componentes básicos ============
function EditableText({ value, onSave, className = "", style = {}, placeholder = "Toque para escrever" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  if (editing) {
    const commit = () => { const v = draft.trim(); if (v) onSave(v); setEditing(false); };
    return (
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className={"bg-white border-2 rounded-lg px-2 py-1 w-full outline-none text-gray-900 " + className}
        style={{ borderColor: AMARELO }} />
    );
  }
  return (
    <span className={className + " cursor-text"} style={style} onClick={() => setEditing(true)} title="Toque para editar">
      {value || <span className="text-gray-400 font-normal">{placeholder}</span>}
    </span>
  );
}

function Check({ checked, onChange, cor = AMARELO, marca = PRETO }) {
  return (
    <button onClick={onChange} className="w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
      style={{ borderColor: checked ? cor : "#CFCFCF", backgroundColor: checked ? cor : "transparent" }}>
      {checked && <span className="text-sm font-bold leading-none" style={{ color: marca }}>✓</span>}
    </button>
  );
}

function ConfirmButton({ onConfirm, label = "✕", confirmLabel = "Apagar?", className = "" }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => { if (!armado) return; const t = setTimeout(() => setArmado(false), 2500); return () => clearTimeout(t); }, [armado]);
  return (
    <button onClick={(e) => { e.stopPropagation(); if (armado) { onConfirm(); setArmado(false); } else setArmado(true); }}
      className={className || (armado ? "text-xs font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-600 flex-shrink-0" : "text-gray-300 hover:text-gray-500 text-base px-2 flex-shrink-0")}>
      {armado ? confirmLabel : label}
    </button>
  );
}

function AddInput({ placeholder, onAdd, buttonLabel = "Adicionar", cor = AMARELO, corTexto = PRETO }) {
  const [v, setV] = useState("");
  const submit = () => { const t = v.trim(); if (!t) return; onAdd(t); setV(""); };
  return (
    <div className="flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={placeholder} className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-base outline-none focus:border-gray-400" />
      <button onClick={submit} className="px-4 py-2.5 rounded-xl text-sm font-bold flex-shrink-0 active:opacity-80"
        style={{ backgroundColor: cor, color: corTexto }}>{buttonLabel}</button>
    </div>
  );
}

function ScreenTitle({ data, update, tabKey }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="w-1.5 h-7 rounded-full flex-shrink-0" style={{ backgroundColor: AMARELO }}></span>
      <EditableText value={data.tabNames[tabKey]}
        onSave={(v) => update((d) => { d.tabNames[tabKey] = v; })}
        className="text-2xl font-black text-gray-900 tracking-tight" />
    </div>
  );
}

function Card({ children, className = "", style = {} }) {
  return <div className={"bg-white rounded-2xl border border-gray-200 shadow-sm " + className} style={style}>{children}</div>;
}

function Vazio({ texto }) {
  return <p className="text-sm text-gray-400 py-4 text-center px-4">{texto}</p>;
}

// ============ Demandas ============
const pesoPrioridade = { alta: 0, media: 1, baixa: 2 };
const ordenarDemandas = (a, b) => {
  const ap = a.prazo || "9999-99-99", bp = b.prazo || "9999-99-99";
  if (ap !== bp) return ap < bp ? -1 : 1;
  return (pesoPrioridade[a.prioridade] ?? 1) - (pesoPrioridade[b.prioridade] ?? 1);
};

function DemandaItem({ d, data, update, expandida, onToggle, today, amanha }) {
  const pessoa = data.pessoas.find((p) => p.id === d.pessoaId);
  const atrasada = d.prazo && d.prazo < today && d.status !== "feito";
  const st = STATUS[d.status] || STATUS.afazer;
  const pr = PRIORIDADES[d.prioridade] || PRIORIDADES.media;
  const setCampo = (campo, valor) => update((dt) => { const a = dt.demandas.find((x) => x.id === d.id); if (a) a[campo] = valor; });

  let chipPrazo = null;
  if (d.prazo) {
    if (atrasada) chipPrazo = <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-bold">Atrasada · {fmtData(d.prazo)}</span>;
    else if (d.prazo === today) chipPrazo = <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: AMARELO, color: PRETO }}>Hoje</span>;
    else if (d.prazo === amanha) chipPrazo = <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: AMARELO_CLARO, color: AMARELO_TEXTO }}>Amanhã</span>;
    else chipPrazo = <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">{fmtData(d.prazo)}</span>;
  }

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="pt-0.5"><Check checked={d.status === "feito"} onChange={() => setCampo("status", d.status === "feito" ? "afazer" : "feito")} /></div>
        <div className="flex-1 min-w-0" onClick={onToggle}>
          <div className={"text-base leading-snug " + (d.status === "feito" ? "text-gray-400 line-through" : "text-gray-900 font-medium")}>{d.titulo}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {chipPrazo}
            {d.status !== "afazer" && d.status !== "feito" && <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: st.bg, color: st.fg }}>{st.label}</span>}
            <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: pr.bg, color: pr.fg }}>{pr.label}</span>
            {pessoa && <span className="text-xs px-2.5 py-1 rounded-full font-bold text-white" style={{ backgroundColor: PRETO }}>{pessoa.nome}</span>}
          </div>
        </div>
        <button onClick={onToggle} className="text-gray-300 text-base px-1 flex-shrink-0">{expandida ? "▴" : "▾"}</button>
      </div>
      {expandida && (
        <div className="mt-3 ml-10 space-y-3">
          <EditableText value={d.titulo} onSave={(v) => setCampo("titulo", v)} className="text-base text-gray-900 block bg-gray-50 rounded-lg px-2.5 py-2" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Status</label>
              <select value={d.status} onChange={(e) => setCampo("status", e.target.value)} className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none">
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Prioridade</label>
              <select value={d.prioridade} onChange={(e) => setCampo("prioridade", e.target.value)} className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none">
                {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Prazo</label>
              <input type="date" value={d.prazo || ""} onChange={(e) => setCampo("prazo", e.target.value)} className="w-full bg-gray-100 rounded-lg px-2 py-1.5 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Pessoa</label>
              <select value={d.pessoaId || ""} onChange={(e) => setCampo("pessoaId", e.target.value || null)} className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none">
                <option value="">Ninguém</option>
                {data.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <ConfirmButton label="Apagar demanda" confirmLabel="Confirmar exclusão"
              className="text-xs font-semibold text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50"
              onConfirm={() => update((dt) => { const a = dt.demandas.find((x) => x.id === d.id); if (a) jogarNaLixeira(dt, "demanda", a); dt.demandas = dt.demandas.filter((x) => x.id !== d.id); })} />
          </div>
        </div>
      )}
    </div>
  );
}

function DemandasScreen({ data, update, today, amanha }) {
  const [filtro, setFiltro] = useState("ativas");
  const [filtroPessoa, setFiltroPessoa] = useState("");
  const [expandida, setExpandida] = useState(null);
  let lista = [...data.demandas];
  if (filtro === "ativas") lista = lista.filter((d) => d.status !== "feito");
  if (filtro === "travado") lista = lista.filter((d) => d.status === "travado");
  if (filtro === "feito") lista = lista.filter((d) => d.status === "feito");
  if (filtroPessoa) lista = lista.filter((d) => d.pessoaId === filtroPessoa);
  lista.sort(ordenarDemandas);
  const filtros = [{ k: "ativas", label: "Ativas" }, { k: "travado", label: "Travadas" }, { k: "feito", label: "Feitas" }, { k: "todas", label: "Todas" }];
  return (
    <div>
      <ScreenTitle data={data} update={update} tabKey="demandas" />
      <div className="mb-3">
        <AddInput placeholder="Nova demanda…" onAdd={(t) => update((d) => { d.demandas.unshift({ id: uid(), titulo: t, prazo: "", prioridade: "media", status: "afazer", pessoaId: null }); })} />
      </div>
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {filtros.map((f) => (
          <button key={f.k} onClick={() => setFiltro(f.k)}
            className={"text-sm px-3.5 py-2 rounded-xl flex-shrink-0 font-bold " + (filtro === f.k ? "" : "bg-white border border-gray-200 text-gray-600")}
            style={filtro === f.k ? { backgroundColor: PRETO, color: AMARELO } : {}}>{f.label}</button>
        ))}
        {data.pessoas.length > 0 && (
          <select value={filtroPessoa} onChange={(e) => setFiltroPessoa(e.target.value)} className="text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none flex-shrink-0 text-gray-600 font-medium">
            <option value="">Todas as pessoas</option>
            {data.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        )}
      </div>
      <Card className="divide-y divide-gray-100">
        {lista.length === 0 && <Vazio texto="Nenhuma demanda aqui." />}
        {lista.map((d) => (
          <DemandaItem key={d.id} d={d} data={data} update={update} today={today} amanha={amanha}
            expandida={expandida === d.id} onToggle={() => setExpandida(expandida === d.id ? null : d.id)} />
        ))}
      </Card>
    </div>
  );
}

// ============ Funções Fixas ============
function FuncoesFixas({ data, update, today }) {
  const [aberto, setAberto] = useState(false);
  const toggle = (id) => update((d) => { if (d.lembreteChecks[id] === today) delete d.lembreteChecks[id]; else d.lembreteChecks[id] = today; });
  const feitos = data.lembretes.filter((l) => data.lembreteChecks[l.id] === today).length;
  const total = data.lembretes.length;
  return (
    <div className="rounded-2xl border shadow-sm mb-5 overflow-hidden" style={{ backgroundColor: ROXO_CLARO, borderColor: "#DCD2FF" }}>
      <button onClick={() => setAberto(!aberto)} className="w-full px-4 py-3.5 flex items-center justify-between gap-2 text-left">
        <span onClick={(e) => e.stopPropagation()}>
          <EditableText value={data.lembretesTitulo} onSave={(v) => update((d) => { d.lembretesTitulo = v; })}
            className="text-base font-black tracking-tight" style={{ color: ROXO_TEXTO }} />
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {total > 0 && <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={feitos === total ? { backgroundColor: ROXO, color: "#FFF" } : { backgroundColor: "#FFF", color: ROXO_TEXTO }}>{feitos}/{total}</span>}
          <span style={{ color: ROXO_TEXTO }}>{aberto ? "▴" : "▾"}</span>
        </span>
      </button>
      {aberto && (
        <div className="px-4 pb-4">
          {total === 0 && <p className="text-sm pb-2" style={{ color: ROXO_TEXTO }}>Suas obrigações de todo dia — ex.: olhar o G1, postar no TikTok. Voltam desmarcadas a cada dia.</p>}
          <ul>
            {data.lembretes.map((l) => {
              const feito = data.lembreteChecks[l.id] === today;
              return (
                <li key={l.id} className="flex items-center gap-2.5 py-2">
                  <span className="text-lg leading-none flex-shrink-0" style={{ color: ROXO }}>•</span>
                  <Check checked={feito} onChange={() => toggle(l.id)} cor={ROXO} marca="#FFF" />
                  <div className="flex-1 min-w-0">
                    <EditableText value={l.texto} onSave={(v) => update((d) => { const a = d.lembretes.find((x) => x.id === l.id); if (a) a.texto = v; })}
                      className={"text-base " + (feito ? "line-through opacity-50" : "font-medium")} style={{ color: "#3A2E73" }} />
                  </div>
                  <ConfirmButton onConfirm={() => update((d) => { const a = d.lembretes.find((x) => x.id === l.id); if (a) jogarNaLixeira(d, "funcaoFixa", a); d.lembretes = d.lembretes.filter((x) => x.id !== l.id); delete d.lembreteChecks[l.id]; })} />
                </li>
              );
            })}
          </ul>
          <div className="mt-2">
            <AddInput placeholder="Nova função (vírgula pra criar várias)" buttonLabel="+" cor={ROXO} corTexto="#FFF"
              onAdd={(t) => update((d) => { t.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).forEach((texto) => d.lembretes.push({ id: uid(), texto })); })} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Hoje ============
function HojeScreen({ data, update, today, amanha }) {
  const [expandida, setExpandida] = useState(null);
  const atrasadas = data.demandas.filter((d) => d.status !== "feito" && d.prazo && d.prazo < today).sort(ordenarDemandas);
  const vence24h = data.demandas.filter((d) => d.status !== "feito" && (d.prazo === today || d.prazo === amanha)).sort(ordenarDemandas);
  const pessoalVencendo = (data.pessoal.tarefas || []).filter((t) => !t.feito && t.prazo && t.prazo <= amanha);
  const semNada = atrasadas.length === 0 && vence24h.length === 0 && pessoalVencendo.length === 0;
  return (
    <div>
      <ScreenTitle data={data} update={update} tabKey="hoje" />
      <FuncoesFixas data={data} update={update} today={today} />
      {semNada && <Card className="px-4 py-6 text-center"><p className="text-gray-900 font-bold">Nada atrasado, nada vencendo</p><p className="text-gray-400 text-sm mt-1">Demandas atrasadas ou com prazo em 24h aparecem aqui.</p></Card>}
      {atrasadas.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-black text-red-600 uppercase tracking-wide mb-2 px-1">Atrasadas · {atrasadas.length}</h3>
          <Card className="divide-y divide-gray-100" style={{ borderColor: "#F5C6C6" }}>
            {atrasadas.map((d) => <DemandaItem key={d.id} d={d} data={data} update={update} today={today} amanha={amanha} expandida={expandida === d.id} onToggle={() => setExpandida(expandida === d.id ? null : d.id)} />)}
          </Card>
        </div>
      )}
      {vence24h.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-black uppercase tracking-wide mb-2 px-1" style={{ color: AMARELO_TEXTO }}>Vence em 24h · {vence24h.length}</h3>
          <Card className="divide-y divide-gray-100">
            {vence24h.map((d) => <DemandaItem key={d.id} d={d} data={data} update={update} today={today} amanha={amanha} expandida={expandida === d.id} onToggle={() => setExpandida(expandida === d.id ? null : d.id)} />)}
          </Card>
        </div>
      )}
      {pessoalVencendo.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-black text-gray-500 uppercase tracking-wide mb-2 px-1">Vida pessoal · vencendo</h3>
          <Card className="divide-y divide-gray-100">
            {pessoalVencendo.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                <Check checked={!!t.feito} onChange={() => update((d) => { const a = d.pessoal.tarefas.find((x) => x.id === t.id); if (a) a.feito = !a.feito; })} />
                <span className="text-base text-gray-900 font-medium flex-1">{t.texto}</span>
                {t.prazo < today
                  ? <span className="text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded-full font-bold">Atrasada</span>
                  : <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: AMARELO_CLARO, color: AMARELO_TEXTO }}>{t.prazo === today ? "Hoje" : "Amanhã"}</span>}
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

// ============ Captura ============
function CapturaScreen({ data, update, goTo }) {
  return (
    <div>
      <ScreenTitle data={data} update={update} tabKey="captura" />
      <div className="mb-4">
        <AddInput placeholder="O que veio na cabeça?" buttonLabel="Guardar"
          onAdd={(t) => update((d) => { d.capturas.unshift({ id: uid(), texto: t, criadoEm: hojeStr() }); })} />
      </div>
      <Card className="divide-y divide-gray-100">
        {data.capturas.length === 0 && <Vazio texto="Caixa de entrada vazia." />}
        {data.capturas.map((c) => (
          <div key={c.id} className="px-4 py-3.5">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <EditableText value={c.texto} onSave={(v) => update((d) => { const a = d.capturas.find((x) => x.id === c.id); if (a) a.texto = v; })} className="text-base text-gray-900 font-medium" />
                <p className="text-xs text-gray-400 mt-0.5">{fmtData(c.criadoEm)}</p>
              </div>
              <ConfirmButton onConfirm={() => update((d) => { const a = d.capturas.find((x) => x.id === c.id); if (a) jogarNaLixeira(d, "captura", a); d.capturas = d.capturas.filter((x) => x.id !== c.id); })} />
            </div>
            <div className="flex flex-wrap gap-2 mt-2.5">
              <button className="text-xs px-3 py-1.5 rounded-full font-bold" style={{ backgroundColor: AMARELO, color: PRETO }}
                onClick={() => { update((d) => { d.demandas.unshift({ id: uid(), titulo: c.texto, prazo: "", prioridade: "media", status: "afazer", pessoaId: null }); d.capturas = d.capturas.filter((x) => x.id !== c.id); }); goTo("demandas"); }}>→ Demanda</button>
              <button className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 font-bold"
                onClick={() => update((d) => { d.pessoal.tarefas.unshift({ id: uid(), texto: c.texto, prazo: "", feito: false }); d.capturas = d.capturas.filter((x) => x.id !== c.id); })}>→ Vida pessoal</button>
              <button className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 font-bold"
                onClick={() => update((d) => { d.anotacoes.unshift({ id: uid(), html: escapeHtml(c.texto), atualizadoEm: hojeStr() }); d.capturas = d.capturas.filter((x) => x.id !== c.id); })}>→ Anotação</button>
              <button className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 font-bold"
                onClick={() => update((d) => { if (d.kanban.colunas.length > 0) { d.kanban.colunas[0].cards.push({ id: uid(), texto: c.texto }); d.capturas = d.capturas.filter((x) => x.id !== c.id); } })}>→ Quadro</button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ============ Pessoas ============
function PessoasScreen({ data, update, today, goTo }) {
  const [aberta, setAberta] = useState(null);
  return (
    <div>
      <ScreenTitle data={data} update={update} tabKey="pessoas" />
      <div className="mb-4">
        <AddInput placeholder="Nome da pessoa…" onAdd={(t) => update((d) => { d.pessoas.push({ id: uid(), nome: t, itens: [] }); })} />
      </div>
      {data.pessoas.length === 0 && <Card><Vazio texto="Adicione os nomes da sua equipe." /></Card>}
      <div className="space-y-3">
        {data.pessoas.map((p) => {
          const itens = p.itens || [];
          const abertos = itens.filter((i) => !i.feito).length;
          const demandasDela = data.demandas.filter((d) => d.pessoaId === p.id && d.status !== "feito");
          const abertaEsta = aberta === p.id;
          return (
            <Card key={p.id}>
              <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer" onClick={() => setAberta(abertaEsta ? null : p.id)}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0" style={{ backgroundColor: PRETO, color: AMARELO }}>{p.nome.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-gray-900">{p.nome}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{abertos} pendente{abertos !== 1 ? "s" : ""}{demandasDela.length > 0 ? ` · ${demandasDela.length} demanda${demandasDela.length !== 1 ? "s" : ""}` : ""}</div>
                </div>
                <span className="text-gray-300 text-base">{abertaEsta ? "▴" : "▾"}</span>
              </div>
              {abertaEsta && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  <div className="mb-3">
                    <EditableText value={p.nome} onSave={(v) => update((d) => { const a = d.pessoas.find((x) => x.id === p.id); if (a) a.nome = v; })}
                      className="text-sm font-bold text-gray-900 bg-gray-50 rounded-lg px-2.5 py-2 block" />
                  </div>
                  {itens.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 py-2">
                      <Check checked={!!item.feito} onChange={() => update((d) => { const pp = d.pessoas.find((x) => x.id === p.id); const a = pp && pp.itens.find((i) => i.id === item.id); if (a) a.feito = !a.feito; })} />
                      <div className="flex-1 min-w-0">
                        <EditableText value={item.texto} onSave={(v) => update((d) => { const pp = d.pessoas.find((x) => x.id === p.id); const a = pp && pp.itens.find((i) => i.id === item.id); if (a) a.texto = v; })}
                          className={"text-base " + (item.feito ? "text-gray-400 line-through" : "text-gray-900 font-medium")} />
                      </div>
                      <ConfirmButton onConfirm={() => update((d) => { const pp = d.pessoas.find((x) => x.id === p.id); if (pp) { const a = pp.itens.find((i) => i.id === item.id); if (a) jogarNaLixeira(d, "pessoaItem", a, { pessoaId: p.id, pessoaNome: p.nome }); pp.itens = pp.itens.filter((i) => i.id !== item.id); } })} />
                    </div>
                  ))}
                  <div className="mt-2 mb-4">
                    <AddInput placeholder="Anotar sobre essa pessoa…" buttonLabel="+"
                      onAdd={(t) => update((d) => { const pp = d.pessoas.find((x) => x.id === p.id); if (pp) pp.itens.push({ id: uid(), texto: t, feito: false }); })} />
                  </div>
                  {demandasDela.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1.5">Demandas dela</h4>
                      {demandasDela.map((d) => {
                        const st = STATUS[d.status];
                        return (
                          <div key={d.id} className="flex items-center gap-2 py-1.5">
                            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate font-medium">{d.titulo}</span>
                            {d.prazo && <span className={"text-xs font-bold " + (d.prazo < today ? "text-red-600" : "text-gray-400")}>{fmtData(d.prazo)}</span>}
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0" style={{ backgroundColor: st.bg, color: st.fg }}>{st.label}</span>
                          </div>
                        );
                      })}
                      <button onClick={() => goTo("demandas")} className="text-xs font-bold mt-1" style={{ color: AMARELO_TEXTO }}>Ir para Demandas →</button>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <ConfirmButton label="Remover pessoa" confirmLabel="Confirmar remoção"
                      className="text-xs font-semibold text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50"
                      onConfirm={() => update((d) => { const a = d.pessoas.find((x) => x.id === p.id); if (a) jogarNaLixeira(d, "pessoa", a); d.pessoas = d.pessoas.filter((x) => x.id !== p.id); d.demandas.forEach((dm) => { if (dm.pessoaId === p.id) dm.pessoaId = null; }); })} />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ============ Anotações ============
const CORES_TEXTO = ["#111111","#C0392B","#1A73E8","#1E8E3E","#6D4AFF","#B45309"];
const CORES_FUNDO = ["transparent","#FFF59D","#C8F7C5","#CDE6FF","#E9DEFF","#FFD6E7"];

function BotaoFmt({ children, onClick, ativo, title }) {
  return (
    <button title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={"min-w-9 h-9 px-2 rounded-lg text-sm font-bold flex items-center justify-center flex-shrink-0 " + (ativo ? "" : "bg-gray-100 text-gray-700")}
      style={ativo ? { backgroundColor: PRETO, color: AMARELO } : {}}>{children}</button>
  );
}

function EditorNota({ nota, update, onVoltar }) {
  const ref = useRef(null);
  const [paleta, setPaleta] = useState(null);
  useEffect(() => { if (ref.current) { ref.current.innerHTML = nota.html || ""; try { document.execCommand("styleWithCSS", false, true); } catch (e) {} } }, [nota.id]);
  const salvar = () => { if (!ref.current) return; const html = ref.current.innerHTML; update((d) => { const n = d.anotacoes.find((x) => x.id === nota.id); if (n) { n.html = html; n.atualizadoEm = hojeStr(); } }); };
  const cmd = (c, v) => { if (ref.current) ref.current.focus(); try { document.execCommand(c, false, v); } catch (e) {} salvar(); };
  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2">
        <button onClick={onVoltar} className="text-sm font-bold flex-shrink-0" style={{ color: AMARELO_TEXTO }}>‹ Anotações</button>
        <ConfirmButton label="Apagar" confirmLabel="Confirmar"
          className="text-xs font-semibold text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50"
          onConfirm={() => { update((d) => { const a = d.anotacoes.find((n) => n.id === nota.id); if (a) jogarNaLixeira(d, "anotacao", a); d.anotacoes = d.anotacoes.filter((n) => n.id !== nota.id); }); onVoltar(); }} />
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 p-2">
          <div className="flex gap-1.5 overflow-x-auto">
            <BotaoFmt title="Negrito" onClick={() => cmd("bold")}>B</BotaoFmt>
            <BotaoFmt title="Itálico" onClick={() => cmd("italic")}><span className="italic font-serif">I</span></BotaoFmt>
            <BotaoFmt title="Sublinhado" onClick={() => cmd("underline")}><span className="underline">U</span></BotaoFmt>
            <BotaoFmt title="Riscado" onClick={() => cmd("strikeThrough")}><span className="line-through">S</span></BotaoFmt>
            <span className="w-px bg-gray-200 mx-0.5 flex-shrink-0"></span>
            <BotaoFmt title="Pequeno" onClick={() => cmd("fontSize","2")}><span className="text-xs">A</span></BotaoFmt>
            <BotaoFmt title="Normal" onClick={() => cmd("fontSize","3")}>A</BotaoFmt>
            <BotaoFmt title="Grande" onClick={() => cmd("fontSize","5")}><span className="text-lg">A</span></BotaoFmt>
            <BotaoFmt title="Título" onClick={() => cmd("fontSize","6")}><span className="text-xl">A</span></BotaoFmt>
            <span className="w-px bg-gray-200 mx-0.5 flex-shrink-0"></span>
            <BotaoFmt title="Lista" onClick={() => cmd("insertUnorderedList")}>☰</BotaoFmt>
            <BotaoFmt title="Cor do texto" ativo={paleta === "cor"} onClick={() => setPaleta(paleta === "cor" ? null : "cor")}><span style={{ borderBottom: "3px solid #C0392B", paddingBottom: 1 }}>A</span></BotaoFmt>
            <BotaoFmt title="Destaque" ativo={paleta === "fundo"} onClick={() => setPaleta(paleta === "fundo" ? null : "fundo")}><span className="px-1 rounded" style={{ backgroundColor: "#FFF59D" }}>A</span></BotaoFmt>
            <BotaoFmt title="Limpar" onClick={() => cmd("removeFormat")}><span className="text-xs font-normal">Tx</span></BotaoFmt>
          </div>
          {paleta && (
            <div className="flex gap-2 mt-2 px-1 pb-1">
              {(paleta === "cor" ? CORES_TEXTO : CORES_FUNDO).map((cor) => (
                <button key={cor} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { cmd(paleta === "cor" ? "foreColor" : "hiliteColor", cor); setPaleta(null); }}
                  className="w-8 h-8 rounded-full border-2 border-gray-200 flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: cor === "transparent" ? "#FFF" : cor }}>
                  {cor === "transparent" && <span className="text-gray-400 text-xs">✕</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div ref={ref} contentEditable suppressContentEditableWarning onInput={salvar}
          className="p-4 text-base text-gray-900 outline-none leading-relaxed" style={{ minHeight: "55vh" }}
          data-placeholder="Escreva aqui…" />
      </div>
    </div>
  );
}

function AnotacoesScreen({ data, update, notaParaAbrir, onNotaAberta }) {
  const [abertaId, setAbertaId] = useState(notaParaAbrir || null);
  useEffect(() => { if (notaParaAbrir) { setAbertaId(notaParaAbrir); onNotaAberta(); } }, [notaParaAbrir]);
  const nota = data.anotacoes.find((n) => n.id === abertaId);
  if (nota) return <EditorNota nota={nota} update={update} onVoltar={() => setAbertaId(null)} />;
  return (
    <div>
      <ScreenTitle data={data} update={update} tabKey="anotacoes" />
      <button onClick={() => { const id = uid(); update((d) => { d.anotacoes.unshift({ id, html: "", atualizadoEm: hojeStr() }); }); setAbertaId(id); }}
        className="w-full mb-4 py-3 rounded-xl text-base font-black active:opacity-80" style={{ backgroundColor: AMARELO, color: PRETO }}>Nova anotação</button>
      <Card className="divide-y divide-gray-100">
        {data.anotacoes.length === 0 && <Vazio texto="Nenhuma anotação ainda." />}
        {data.anotacoes.map((n) => {
          const plain = htmlParaTexto(n.html || "");
          const linhas = plain.split("\n").map((l) => l.trim()).filter(Boolean);
          return (
            <button key={n.id} onClick={() => setAbertaId(n.id)} className="w-full text-left px-4 py-3.5 block active:bg-gray-50">
              <div className="text-base font-bold text-gray-900 truncate">{linhas[0] || "Sem título"}</div>
              <div className="text-sm text-gray-400 mt-0.5 truncate">{fmtData(n.atualizadoEm)}{linhas[1] ? " · " + linhas[1] : ""}</div>
            </button>
          );
        })}
      </Card>
    </div>
  );
}

// ============ Kanban ============
function KanbanScreen({ data, update }) {
  const colunas = data.kanban.colunas;
  const [drag, setDrag] = useState(null);
  const [alvo, setAlvo] = useState(null);
  const alvoRef = useRef(null);

  const iniciarDrag = (e, card, colId) => {
    const tag = e.target.tagName;
    if (["INPUT","TEXTAREA","SELECT","BUTTON"].includes(tag)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const isTouch = e.pointerType !== "mouse";
    const startX = e.clientX, startY = e.clientY;
    let ativo = false, timer = null;

    const atualizarAlvo = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const colEl = el && el.closest ? el.closest("[data-col]") : null;
      if (!colEl) { alvoRef.current = null; setAlvo(null); return; }
      const colIdAlvo = colEl.getAttribute("data-col");
      const cardsEls = colEl.querySelectorAll("[data-card]");
      let index = cardsEls.length;
      for (let i = 0; i < cardsEls.length; i++) { const r = cardsEls[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { index = i; break; } }
      const novo = { colId: colIdAlvo, index };
      alvoRef.current = novo; setAlvo(novo);
    };

    const ativar = (x, y) => { ativo = true; setDrag({ cardId: card.id, texto: card.texto, x, y }); atualizarAlvo(x, y); document.body.style.userSelect = "none"; };
    const bloquearScroll = (ev) => { if (ativo) ev.preventDefault(); };

    const encerrar = (soltar) => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onCancel); window.removeEventListener("touchmove", bloquearScroll);
      document.body.style.userSelect = "";
      if (ativo) { const cc = (ev) => { ev.stopPropagation(); ev.preventDefault(); }; window.addEventListener("click", cc, true); setTimeout(() => window.removeEventListener("click", cc, true), 80); }
      if (soltar && ativo && alvoRef.current) {
        const dest = alvoRef.current;
        update((d) => {
          const origem = d.kanban.colunas.find((c) => c.id === colId); if (!origem) return;
          const i = origem.cards.findIndex((k) => k.id === card.id); if (i < 0) return;
          const destino = d.kanban.colunas.find((c) => c.id === dest.colId); if (!destino) return;
          const [mov] = origem.cards.splice(i, 1);
          let idx = dest.index; if (destino.id === origem.id && i < idx) idx -= 1; if (idx > destino.cards.length) idx = destino.cards.length;
          destino.cards.splice(idx, 0, mov);
        });
      }
      alvoRef.current = null; setDrag(null); setAlvo(null);
    };

    const onMove = (ev) => {
      const x = ev.clientX, y = ev.clientY;
      if (!ativo) { const dist = Math.hypot(x - startX, y - startY); if (isTouch) { if (dist > 12) encerrar(false); return; } if (dist > 5) ativar(x, y); return; }
      setDrag((dr) => dr ? { ...dr, x, y } : dr); atualizarAlvo(x, y);
    };

    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", () => encerrar(true)); window.addEventListener("pointercancel", () => encerrar(false)); window.addEventListener("touchmove", bloquearScroll, { passive: false });
    if (isTouch) timer = setTimeout(() => ativar(startX, startY), 250);
  };

  const Indicador = () => <div className="h-2 rounded-full my-1" style={{ backgroundColor: AMARELO }}></div>;

  return (
    <div>
      <ScreenTitle data={data} update={update} tabKey="kanban" />
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 items-start">
        {colunas.map((col) => (
          <div key={col.id} data-col={col.id} className="w-72 flex-shrink-0 rounded-2xl p-3" style={{ backgroundColor: "#EDEDEA" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 min-w-0"><EditableText value={col.nome} onSave={(v) => update((d) => { const a = d.kanban.colunas.find((c) => c.id === col.id); if (a) a.nome = v; })} className="text-base font-black text-gray-800" /></div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: PRETO, color: AMARELO }}>{col.cards.length}</span>
              <ConfirmButton confirmLabel="Apagar coluna?" onConfirm={() => update((d) => { const a = d.kanban.colunas.find((c) => c.id === col.id); if (a) jogarNaLixeira(d, "coluna", a); d.kanban.colunas = d.kanban.colunas.filter((c) => c.id !== col.id); })} />
            </div>
            <div className="mb-2" style={{ minHeight: 24 }}>
              {col.cards.map((card, idx) => (
                <React.Fragment key={card.id}>
                  {alvo && alvo.colId === col.id && alvo.index === idx && <Indicador />}
                  <div data-card onPointerDown={(e) => iniciarDrag(e, card, col.id)}
                    className={"bg-white rounded-xl px-3.5 py-3 border border-gray-200 shadow-sm mb-2 " + (drag && drag.cardId === card.id ? "opacity-30" : "")}
                    style={{ cursor: "grab" }}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0"><EditableText value={card.texto} onSave={(v) => update((d) => { const c = d.kanban.colunas.find((x) => x.id === col.id); const a = c && c.cards.find((k) => k.id === card.id); if (a) a.texto = v; })} className="text-base text-gray-900 font-medium block" /></div>
                      <ConfirmButton onConfirm={() => update((d) => { const c = d.kanban.colunas.find((x) => x.id === col.id); if (c) { const a = c.cards.find((k) => k.id === card.id); if (a) jogarNaLixeira(d, "card", a, { coluna: col.nome }); c.cards = c.cards.filter((k) => k.id !== card.id); } })} />
                    </div>
                  </div>
                </React.Fragment>
              ))}
              {alvo && alvo.colId === col.id && alvo.index === col.cards.length && <Indicador />}
            </div>
            <AddInput placeholder="Novo card…" buttonLabel="+" onAdd={(t) => update((d) => { const c = d.kanban.colunas.find((x) => x.id === col.id); if (c) c.cards.push({ id: uid(), texto: t }); })} />
          </div>
        ))}
        <button onClick={() => update((d) => { d.kanban.colunas.push({ id: uid(), nome: "Nova coluna", cards: [] }); })}
          className="w-40 flex-shrink-0 rounded-2xl border-2 border-dashed border-gray-300 text-gray-400 text-base font-bold py-6 self-start">+ Coluna</button>
      </div>
      <p className="text-xs text-gray-400 px-1">Celular: segure o card e arraste. Computador: clique e arraste.</p>
      {drag && (
        <div className="fixed z-50 pointer-events-none bg-white rounded-xl px-3.5 py-3 border-2 shadow-xl text-base font-medium text-gray-900"
          style={{ left: drag.x, top: drag.y, width: 250, transform: "translate(-50%,-50%) rotate(2deg)", borderColor: AMARELO }}>{drag.texto}</div>
      )}
    </div>
  );
}

// ============ Vida Pessoal ============
function PessoalScreen({ data, update, today }) {
  return (
    <div>
      <ScreenTitle data={data} update={update} tabKey="pessoal" />
      <div className="mb-4"><AddInput placeholder="Nova tarefa pessoal…" onAdd={(t) => update((d) => { d.pessoal.tarefas.unshift({ id: uid(), texto: t, prazo: "", feito: false }); })} /></div>
      <Card className="divide-y divide-gray-100">
        {(data.pessoal.tarefas || []).length === 0 && <Vazio texto="Nada pessoal pendente." />}
        {(data.pessoal.tarefas || []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
            <Check checked={!!t.feito} onChange={() => update((d) => { const a = d.pessoal.tarefas.find((x) => x.id === t.id); if (a) a.feito = !a.feito; })} />
            <div className="flex-1 min-w-0">
              <EditableText value={t.texto} onSave={(v) => update((d) => { const a = d.pessoal.tarefas.find((x) => x.id === t.id); if (a) a.texto = v; })}
                className={"text-base " + (t.feito ? "text-gray-400 line-through" : "text-gray-900 font-medium")} />
              {t.prazo && t.prazo < today && !t.feito && <span className="text-xs text-red-600 font-bold ml-1">· atrasada</span>}
              {t.prazo === today && !t.feito && <span className="text-xs font-bold ml-1" style={{ color: AMARELO_TEXTO }}>· hoje</span>}
            </div>
            <input type="date" value={t.prazo || ""} onChange={(e) => update((d) => { const a = d.pessoal.tarefas.find((x) => x.id === t.id); if (a) a.prazo = e.target.value; })}
              className="bg-gray-100 rounded-lg px-1.5 py-1.5 text-xs text-gray-600 outline-none w-28 flex-shrink-0" />
            <ConfirmButton onConfirm={() => update((d) => { const a = d.pessoal.tarefas.find((x) => x.id === t.id); if (a) jogarNaLixeira(d, "tarefaPessoal", a); d.pessoal.tarefas = d.pessoal.tarefas.filter((x) => x.id !== t.id); })} />
          </div>
        ))}
      </Card>
    </div>
  );
}

// ============ Contas ============
function ContasScreen({ data, update }) {
  return (
    <div>
      <ScreenTitle data={data} update={update} tabKey="contas" />
      <Card className="px-5 py-6">
        <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ backgroundColor: AMARELO, color: PRETO }}>EM CONSTRUÇÃO</span>
        <p className="text-base text-gray-900 font-bold mt-3">O que vai morar aqui:</p>
        <ul className="text-sm text-gray-500 mt-2 space-y-1.5">
          <li>· Entradas e saídas de dinheiro</li>
          <li>· Digitação rápida: "50 reais Uber" cai na categoria certa</li>
          <li>· Tags coloridas automáticas + criar as suas</li>
          <li>· Gráfico mostrando pra onde o dinheiro está indo</li>
          <li>· Visão dos seus dois cartões de crédito, somados</li>
        </ul>
      </Card>
    </div>
  );
}

// ============ Conteúdos ============
function ConteudosScreen({ data, update }) {
  return (
    <div>
      <ScreenTitle data={data} update={update} tabKey="conteudos" />
      <Card className="px-5 py-8 text-center">
        <p className="text-base text-gray-900 font-bold">Aba reservada</p>
        <p className="text-sm text-gray-400 mt-1">Você disse que vai me passar o que entra aqui.</p>
      </Card>
    </div>
  );
}

// ============ Busca global ============
function BuscaOverlay({ data, onFechar, onIr }) {
  const [q, setQ] = useState("");
  const nq = normalizar(q);
  const resultados = [];
  if (nq.length >= 2) {
    data.demandas.forEach((dm) => { if (normalizar(dm.titulo).includes(nq)) resultados.push({ tab: "demandas", label: "Demandas", texto: dm.titulo, extra: STATUS[dm.status]?.label || "" }); });
    data.pessoas.forEach((p) => {
      if (normalizar(p.nome).includes(nq)) resultados.push({ tab: "pessoas", label: "Pessoas", texto: p.nome, extra: "" });
      (p.itens || []).forEach((i) => { if (normalizar(i.texto).includes(nq)) resultados.push({ tab: "pessoas", label: "Pessoas · " + p.nome, texto: i.texto, extra: "" }); });
    });
    data.anotacoes.forEach((n) => {
      const plain = htmlParaTexto(n.html || "");
      if (normalizar(plain).includes(nq)) { const linhas = plain.split("\n").map((l) => l.trim()).filter(Boolean); resultados.push({ tab: "anotacoes", label: "Anotações", texto: linhas[0] || "Sem título", extra: fmtData(n.atualizadoEm), notaId: n.id }); }
    });
    data.kanban.colunas.forEach((c) => { c.cards.forEach((k) => { if (normalizar(k.texto).includes(nq)) resultados.push({ tab: "kanban", label: "Quadro · " + c.nome, texto: k.texto, extra: "" }); }); });
    (data.pessoal.tarefas || []).forEach((t) => { if (normalizar(t.texto).includes(nq)) resultados.push({ tab: "pessoal", label: "Vida Pessoal", texto: t.texto, extra: t.prazo ? fmtData(t.prazo) : "" }); });
    data.capturas.forEach((c) => { if (normalizar(c.texto).includes(nq)) resultados.push({ tab: "captura", label: "Captura", texto: c.texto, extra: "" }); });
    data.lembretes.forEach((l) => { if (normalizar(l.texto).includes(nq)) resultados.push({ tab: "hoje", label: "Funções fixas", texto: l.texto, extra: "" }); });
  }
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: FUNDO }}>
      <div className="sticky top-0 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar em tudo…"
            className="flex-1 min-w-0 bg-gray-100 rounded-xl px-3.5 py-2.5 text-base outline-none" />
          <button onClick={onFechar} className="text-sm font-bold px-3 py-2.5 rounded-xl" style={{ backgroundColor: PRETO, color: AMARELO }}>Fechar</button>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-4">
        {nq.length < 2 && <p className="text-sm text-gray-400 text-center py-6">Digite pelo menos 2 letras.</p>}
        {nq.length >= 2 && resultados.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nada encontrado com "{q}".</p>}
        {resultados.slice(0, 30).length > 0 && (
          <Card className="divide-y divide-gray-100">
            {resultados.slice(0, 30).map((r, i) => (
              <button key={i} onClick={() => onIr(r)} className="w-full text-left px-4 py-3.5 block active:bg-gray-50">
                <div className="flex items-center gap-2"><span className="text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0" style={{ backgroundColor: AMARELO_CLARO, color: AMARELO_TEXTO }}>{r.label}</span>{r.extra && <span className="text-xs text-gray-400">{r.extra}</span>}</div>
                <div className="text-base text-gray-900 font-medium mt-1 truncate">{r.texto}</div>
              </button>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

// ============ Lixeira ============
const TIPO_LABEL = { demanda:"Demanda", captura:"Captura", anotacao:"Anotação", tarefaPessoal:"Vida Pessoal", funcaoFixa:"Função fixa", pessoaItem:"Pessoa", pessoa:"Pessoa", card:"Quadro", coluna:"Coluna" };
const textoDoLixo = (item) => {
  const p = item.payload || {};
  if (item.tipo === "anotacao") { const plain = htmlParaTexto(p.html || ""); return plain.split("\n").map((l) => l.trim()).filter(Boolean)[0] || "Sem título"; }
  if (item.tipo === "coluna") return `${p.nome} (${(p.cards||[]).length} cards)`;
  return p.titulo || p.texto || p.nome || "(sem texto)";
};

function LixeiraOverlay({ data, update, onFechar }) {
  const lixeira = data.lixeira || [];
  const restaurar = (item) => update((d) => {
    d.lixeira = d.lixeira.filter((x) => x.id !== item.id);
    const p = item.payload;
    if (item.tipo === "demanda") d.demandas.unshift(p);
    else if (item.tipo === "captura") d.capturas.unshift(p);
    else if (item.tipo === "anotacao") d.anotacoes.unshift(p);
    else if (item.tipo === "tarefaPessoal") d.pessoal.tarefas.unshift(p);
    else if (item.tipo === "funcaoFixa") d.lembretes.push(p);
    else if (item.tipo === "pessoa") d.pessoas.push(p);
    else if (item.tipo === "coluna") d.kanban.colunas.push(p);
    else if (item.tipo === "card") { if (!d.kanban.colunas.length) d.kanban.colunas.push({ id: uid(), nome: "A fazer", cards: [] }); d.kanban.colunas[0].cards.push(p); }
    else if (item.tipo === "pessoaItem") { const pessoa = d.pessoas.find((x) => x.id === (item.extra?.pessoaId)); if (pessoa) pessoa.itens.push(p); else d.capturas.unshift({ id: uid(), texto: p.texto, criadoEm: hojeStr() }); }
  });
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: FUNDO }}>
      <div className="sticky top-0 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <span className="text-lg font-black text-gray-900">Lixeira</span>
          <button onClick={onFechar} className="text-sm font-bold px-3 py-2 rounded-xl" style={{ backgroundColor: PRETO, color: AMARELO }}>Fechar</button>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-4">
        <p className="text-xs text-gray-400 mb-3 px-1">Itens apagados ficam aqui por {DIAS_LIXEIRA} dias.</p>
        {lixeira.length === 0 && <Card><Vazio texto="Lixeira vazia." /></Card>}
        {lixeira.length > 0 && (
          <Card className="divide-y divide-gray-100">
            {lixeira.map((item) => { const restam = Math.max(0, DIAS_LIXEIRA - diasDesde(item.apagadoEm)); return (
              <div key={item.id} className="px-4 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-xs px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-500 flex-shrink-0">{TIPO_LABEL[item.tipo] || item.tipo}{item.tipo === "pessoaItem" && item.extra ? " · " + item.extra.pessoaNome : ""}</span><span className="text-xs text-gray-400">some em {restam}d</span></div>
                  <div className="text-base text-gray-900 font-medium mt-1 truncate">{textoDoLixo(item)}</div>
                </div>
                <button onClick={() => restaurar(item)} className="text-xs font-bold px-3 py-2 rounded-xl flex-shrink-0" style={{ backgroundColor: AMARELO, color: PRETO }}>Restaurar</button>
                <ConfirmButton confirmLabel="De vez?" onConfirm={() => update((d) => { d.lixeira = d.lixeira.filter((x) => x.id !== item.id); })} />
              </div>
            ); })}
          </Card>
        )}
        {lixeira.length > 0 && <div className="flex justify-end mt-3"><ConfirmButton label="Esvaziar lixeira" confirmLabel="Apagar tudo de vez?" className="text-xs font-semibold text-red-500 px-3 py-2 rounded-xl hover:bg-red-50" onConfirm={() => update((d) => { d.lixeira = []; })} /></div>}
      </div>
    </div>
  );
}

// ============ Tela de Login ============
function TelaLogin() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const entrar = async () => {
    if (!email || !senha) { setErro("Preencha e-mail e senha."); return; }
    setCarregando(true); setErro("");
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) { setErro("E-mail ou senha incorretos."); setCarregando(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: PRETO }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: AMARELO }}></span>
            <span className="text-4xl font-black tracking-widest" style={{ color: AMARELO }}>KOCH</span>
          </div>
          <p className="text-gray-500 text-sm">Seu organizador pessoal</p>
        </div>
        <Card className="p-6">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail"
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-base outline-none mb-3" />
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} placeholder="Senha"
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-base outline-none mb-4" />
          {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}
          <button onClick={entrar} disabled={carregando} className="w-full py-3 rounded-xl text-base font-black active:opacity-80" style={{ backgroundColor: AMARELO, color: PRETO }}>
            {carregando ? "Entrando…" : "Entrar"}
          </button>
        </Card>
      </div>
    </div>
  );
}

// ============ App principal ============
export default function App() {
  const [sessao, setSessao] = useState(undefined);
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("hoje");
  const [saveState, setSaveState] = useState("salvo");
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [notaParaAbrir, setNotaParaAbrir] = useState(null);
  const today = hojeStr();
  const amanha = amanhaStr();

  // Auth
  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => setSessao(session));
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => setSessao(session));
    return () => subscription.unsubscribe();
  }, []);

  // Carregar dados quando logar
  useEffect(() => {
    if (!sessao) return;
    setLoaded(false);
    carregarDados().then((dados) => {
      if (dados) {
        if (dados.pessoas) dados.pessoas.forEach((p) => { if (!p.itens) p.itens = [...(p.devo || []), ...(p.falar || [])]; });
        if (dados.anotacoes) dados.anotacoes.forEach((n) => { if (n.html === undefined) n.html = (n.texto || "").split("\n").map((l) => escapeHtml(l)).join("<br>"); });
        dados.lixeira = (dados.lixeira || []).filter((i) => diasDesde(i.apagadoEm) < DIAS_LIXEIRA);
        setData({ ...DEFAULT_DATA, ...dados, tabNames: { ...DEFAULT_DATA.tabNames, ...(dados.tabNames || {}) }, lembretesTitulo: dados.lembretesTitulo || DEFAULT_DATA.lembretesTitulo, kanban: dados.kanban?.colunas ? dados.kanban : DEFAULT_DATA.kanban, pessoal: { tarefas: dados.pessoal?.tarefas || [] }, lixeira: dados.lixeira });
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [sessao?.user?.id]);

  // Salvar automaticamente
  useEffect(() => {
    if (!loaded || !sessao) return;
    setSaveState("salvando");
    const t = setTimeout(async () => {
      try { await salvarDados(data); setSaveState("salvo"); }
      catch (e) { setSaveState("erro"); }
    }, 800);
    return () => clearTimeout(t);
  }, [data, loaded]);

  const update = useCallback((fn) => {
    setData((prev) => { const copia = JSON.parse(JSON.stringify(prev)); fn(copia); return copia; });
  }, []);

  const baixarBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "backup-koch-" + today + ".json"; a.click(); URL.revokeObjectURL(url);
  };

  // Estados de carregamento e auth
  if (sessao === undefined) return (
    <div className="min-h-screen flex items-center justify-center text-sm font-bold" style={{ backgroundColor: PRETO, color: AMARELO }}>KOCH</div>
  );
  if (!sessao) return <TelaLogin />;
  if (!loaded) return (
    <div className="min-h-screen flex items-center justify-center text-sm font-bold" style={{ backgroundColor: PRETO, color: AMARELO }}>Carregando…</div>
  );

  const capturaCount = data.capturas.length;
  const atrasadasCount = data.demandas.filter((d) => d.status !== "feito" && d.prazo && d.prazo < today).length;
  const lixeiraCount = (data.lixeira || []).length;
  const dataExtensa = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const telas = {
    hoje: <HojeScreen data={data} update={update} today={today} amanha={amanha} />,
    captura: <CapturaScreen data={data} update={update} goTo={setTab} />,
    demandas: <DemandasScreen data={data} update={update} today={today} amanha={amanha} />,
    pessoas: <PessoasScreen data={data} update={update} today={today} goTo={setTab} />,
    anotacoes: <AnotacoesScreen data={data} update={update} notaParaAbrir={notaParaAbrir} onNotaAberta={() => setNotaParaAbrir(null)} />,
    kanban: <KanbanScreen data={data} update={update} />,
    pessoal: <PessoalScreen data={data} update={update} today={today} />,
    contas: <ContasScreen data={data} update={update} />,
    conteudos: <ConteudosScreen data={data} update={update} />,
  };

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: FUNDO }}>
      <div className="sticky top-0 z-10">
        <div style={{ backgroundColor: PRETO }}>
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: AMARELO }}></span>
              <EditableText value={data.appName} onSave={(v) => update((d) => { d.appName = v; })}
                className="text-lg font-black tracking-widest uppercase" style={{ color: AMARELO }} />
              <span className="text-xs text-gray-400 capitalize hidden sm:inline ml-2">{dataExtensa}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs text-gray-400" title={saveState === "salvando" ? "Salvando…" : saveState === "erro" ? "Erro ao salvar" : "Tudo salvo"}>
                {saveState === "salvando" ? "…" : saveState === "erro" ? "⚠" : "✓"}
              </span>
              <button onClick={() => setBuscaAberta(true)} className="text-xs font-bold" style={{ color: AMARELO }}>Buscar</button>
              <button onClick={() => setLixeiraAberta(true)} className="text-xs font-bold" style={{ color: AMARELO }}>Lixeira{lixeiraCount > 0 ? ` · ${lixeiraCount}` : ""}</button>
              <button onClick={baixarBackup} className="text-xs font-bold" style={{ color: AMARELO }}>Backup</button>
              <button onClick={() => sb.auth.signOut()} className="text-xs font-bold text-gray-500">Sair</button>
            </div>
          </div>
        </div>
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-2.5 flex gap-2 overflow-x-auto">
            {ORDEM_TABS.map((k) => {
              const ativa = tab === k;
              return (
                <button key={k} onClick={() => setTab(k)}
                  className={"text-sm px-4 py-2.5 rounded-xl flex-shrink-0 font-bold whitespace-nowrap " + (ativa ? "" : "bg-gray-100 text-gray-600")}
                  style={ativa ? { backgroundColor: AMARELO, color: PRETO } : {}}>
                  {data.tabNames[k]}
                  {k === "captura" && capturaCount > 0 && <span className="ml-1 opacity-70">· {capturaCount}</span>}
                  {k === "hoje" && atrasadasCount > 0 && <span className={"ml-1 font-black " + (ativa ? "" : "text-red-600")}>· {atrasadasCount}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <main className="max-w-3xl mx-auto px-4 py-5 pb-24">{telas[tab]}</main>
      {buscaAberta && <BuscaOverlay data={data} onFechar={() => setBuscaAberta(false)} onIr={(r) => { setTab(r.tab); if (r.notaId) setNotaParaAbrir(r.notaId); setBuscaAberta(false); }} />}
      {lixeiraAberta && <LixeiraOverlay data={data} update={update} onFechar={() => setLixeiraAberta(false)} />}
    </div>
  );
}
