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

// Dia "efetivo" das funções fixas: o dia só vira às 6h da manhã.
// Marcou às 23h? Continua marcado até as 6h do dia seguinte. Às 6h, zera.
const diaEfetivo = () => { const d = new Date(); d.setHours(d.getHours() - 6); return isoData(d); };

const diasDesde = (iso) => {
  if (!iso) return 0;
  const p = iso.split("-").map(Number);
  if (p.length !== 3) return 0;
  return Math.floor((Date.now() - new Date(p[0], p[1] - 1, p[2]).getTime()) / 86400000);
};

const diasAte = (iso) => -diasDesde(iso);

const fmtData = (iso) => {
  if (!iso) return "";
  const p = iso.split("-");
  return p.length !== 3 ? iso : `${p[2]}/${p[1]}`;
};

const fmtDinheiro = (v) =>
  "R$ " + (v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

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

// Entrada inteligente: lê prazo e prioridade do próprio texto da demanda.
// Ex.: "relatório amanhã alta" -> prazo amanhã, prioridade alta
function parseDemanda(texto) {
  let t = " " + texto + " ";
  let prazo = "";
  let prioridade = null;
  const hoje = new Date();
  const setDelta = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoData(d); };

  // prioridade
  if (/\b(alta|urgente|urgência)\b/i.test(t)) { prioridade = "alta"; t = t.replace(/\b(alta|urgente|urgência)\b/i, " "); }
  else if (/\b(baixa|tranquilo|tranquila)\b/i.test(t)) { prioridade = "baixa"; t = t.replace(/\b(baixa|tranquilo|tranquila)\b/i, " "); }
  else if (/\b(média|media)\b/i.test(t)) { prioridade = "media"; t = t.replace(/\b(média|media)\b/i, " "); }

  // prazo relativo
  if (/\bhoje\b/i.test(t)) { prazo = setDelta(0); t = t.replace(/\bhoje\b/i, " "); }
  else if (/\bamanhã\b|\bamanha\b/i.test(t)) { prazo = setDelta(1); t = t.replace(/\bamanhã\b|\bamanha\b/i, " "); }
  else if (/\bdepois de amanhã\b|\bdepois de amanha\b/i.test(t)) { prazo = setDelta(2); t = t.replace(/\bdepois de amanhã\b|\bdepois de amanha\b/i, " "); }
  else {
    const diasSemana = { domingo: 0, "segunda": 1, "terça": 2, "terca": 2, "quarta": 3, "quinta": 4, "sexta": 5, "sábado": 6, "sabado": 6 };
    for (const [nome, idx] of Object.entries(diasSemana)) {
      const re = new RegExp("\\b" + nome + "(-feira)?\\b", "i");
      if (re.test(t)) {
        let delta = (idx - hoje.getDay() + 7) % 7;
        if (delta === 0) delta = 7;
        prazo = setDelta(delta);
        t = t.replace(re, " ");
        break;
      }
    }
  }
  // data dd/mm
  const md = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (md && !prazo) {
    const dia = +md[1], mes = +md[2];
    let ano = md[3] ? +md[3] : hoje.getFullYear();
    if (ano < 100) ano += 2000;
    let cand = new Date(ano, mes - 1, dia);
    if (!md[3] && cand < hoje) cand = new Date(ano + 1, mes - 1, dia);
    prazo = isoData(cand);
    t = t.replace(md[0], " ");
  }

  const titulo = t.replace(/\s+/g, " ").trim();
  return { titulo: titulo || texto.trim(), prazo, prioridade: prioridade || "media" };
}

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

// ============ Contas: tags e classificação automática ============
const TAGS_BASE = [
  { nome: "Uber", cor: "#111111", palavras: ["uber", "99", "taxi", "corrida"] },
  { nome: "Delivery", cor: "#EA1D2C", palavras: ["ifood", "delivery", "rappi", "entrega", "zedelivery"] },
  { nome: "Restaurante", cor: "#E8870C", palavras: ["restaurante", "comida", "almoco", "jantar", "lanche", "pizza", "hamburguer", "acai", "padaria", "cafe"] },
  { nome: "Mercado/Farmácia", cor: "#1E8E3E", palavras: ["mercado", "supermercado", "farmacia", "remedio", "hortifruti", "feira"] },
  { nome: "Presente", cor: "#D6336C", palavras: ["presente", "flores", "lembranca"] },
  { nome: "Shopping", cor: "#6D4AFF", palavras: ["shopping", "roupa", "tenis", "loja", "sapato", "camisa"] },
  { nome: "Lazer", cor: "#1A73E8", palavras: ["lazer", "cinema", "bar", "festa", "show", "jogo", "netflix", "spotify", "streaming", "praia"] },
];
const COR_OUTROS = "#8E8E93";
const COR_ENTRADA = "#0B8043";
const PALETA_TAGS = ["#C0392B", "#0B8043", "#B45309", "#00838F", "#7B1FA2", "#455A64", "#C62828", "#2E7D32"];

function classificarTag(descricao, tagsCustom) {
  const txt = normalizar(descricao);
  const todas = [...(tagsCustom || []), ...TAGS_BASE];
  for (const tag of todas) {
    if ((tag.palavras || []).some((p) => p && txt.includes(normalizar(p)))) return tag.nome;
  }
  return "Outros";
}

function corDaTag(nome, tagsCustom) {
  if (nome === "Entrada") return COR_ENTRADA;
  const todas = [...TAGS_BASE, ...(tagsCustom || [])];
  const t = todas.find((x) => x.nome === nome);
  return t ? t.cor : COR_OUTROS;
}

function parseLancamento(texto) {
  const m = texto.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const valor = parseFloat(m[1].replace(",", "."));
  let resto = texto.replace(m[0], " ");
  resto = resto.replace(/r\$\s*/gi, " ").replace(/\breais?\b/gi, " ").replace(/\s+/g, " ").trim();
  return { valor, descricao: resto || "Sem descrição" };
}

// ============ Conteúdos: formatos, etapas e editorias ============
const FORMATOS = {
  react: "React", carrossel: "Carrossel", card: "Card", reels: "Reels", estatico: "Estático",
};
const FORMATO_COR = {
  react: { bg: "#EAF3FF", chip: "#1A73E8" },
  carrossel: { bg: "#FFF0E6", chip: "#B45309" },
  card: { bg: "#F3EEFF", chip: "#6D4AFF" },
  reels: { bg: "#FFEAF2", chip: "#D6336C" },
  estatico: { bg: "#EAF7EE", chip: "#1E8E3E" },
};
const ETAPAS = {
  ideia: { label: "Ideia", bg: "#EFEFEF", fg: "#444444" },
  roteiro: { label: "Roteiro", bg: AMARELO_CLARO, fg: AMARELO_TEXTO },
  gravar: { label: "Falta gravar", bg: "#FFE8CC", fg: "#B45309" },
  editar: { label: "Falta editar", bg: "#CDE6FF", fg: "#1A73E8" },
  pronto: { label: "Pronto", bg: "#E3F6E8", fg: "#1E8E3E" },
};
const ETAPA_FINAL = "pronto";
const EDITORIAS = [
  "Máfia dos Combustíveis", "Humanização", "Política", "Críticas Cláudio/Douglas",
  "Apoio Desembargador", "Corrupção", "Transportes/Detran", "Identidade Política",
  "Indústria das Multas", "Outros", "Segurança", "Críticas Alerj",
  "Motoristas de Aplicativo", "Mulheres", "Prefeitura Entregas", "Trajetória",
];
const PALETA_EDITORIAS = [
  "#C0392B", "#D6336C", "#1A73E8", "#B45309", "#0B8043", "#7B1FA2", "#00838F", "#6D4AFF",
  "#E8870C", "#8E8E93", "#455A64", "#C62828", "#2E7D32", "#E91E63", "#5436CC", "#111111",
];
const corDaEditoria = (nome) => {
  const i = EDITORIAS.indexOf(nome);
  return i >= 0 ? PALETA_EDITORIAS[i % PALETA_EDITORIAS.length] : COR_OUTROS;
};

const TEMAS_TIMELINE = [
  "política Rio de Janeiro", "segurança pública RJ", "preço gasolina Rio de Janeiro",
  "posto de gasolina RJ", "bets apostas", "jogo do tigrinho", "feminicídio Rio de Janeiro",
];

const ORDEM_TABS = ["hoje", "captura", "demandas", "pessoas", "anotacoes", "conteudos", "pessoal"];
const DEFAULT_DATA = {
  appName: "KOCH",
  tabNames: {
    hoje: "Hoje", captura: "Captura", demandas: "Demandas", pessoas: "Pessoas",
    anotacoes: "Anotações", pessoal: "Vida Pessoal", conteudos: "Conteúdos",
  },
  lembretesTitulo: "Dever diário",
  capturas: [], demandas: [], pessoas: [], lembretes: [], lembreteChecks: {},
  anotacoes: [],
  pessoal: { tarefas: [] },
  contas: { lancamentos: [], tagsCustom: [] },
  conteudos: { itens: [], pautas: [], datas: [] },
  lixeira: [],
};

const EQUIPE_INICIAL = [
  { nome: "Bismarck", cargo: "Fotógrafo e editor de vídeo · acompanha agendas, banco de imagens" },
  { nome: "Graciano", cargo: "Design e criação · conteúdo, abaixo-assinado e diversos" },
  { nome: "Marcio Moushe", cargo: "Editor de vídeo" },
];

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

function ChipFiltro({ ativo, onClick, children }) {
  return (
    <button onClick={onClick}
      className={"text-sm px-3.5 py-2 rounded-xl flex-shrink-0 font-bold " + (ativo ? "" : "bg-white border border-gray-200 text-gray-600")}
      style={ativo ? { backgroundColor: PRETO, color: AMARELO } : {}}>{children}</button>
  );
}

// ============ Demandas ============
const pesoPrioridade = { alta: 0, media: 1, baixa: 2 };
const ordenarDemandas = (a, b) => {
  if (!!a.fav !== !!b.fav) return a.fav ? -1 : 1;
  const ap = a.prazo || "9999-99-99", bp = b.prazo || "9999-99-99";
  if (ap !== bp) return ap < bp ? -1 : 1;
  return (pesoPrioridade[a.prioridade] ?? 1) - (pesoPrioridade[b.prioridade] ?? 1);
};

function DemandaItem({ d, data, update, expandida, onToggle, today, amanha }) {
  const pessoa = data.pessoas.find((p) => p.id === d.pessoaId);
  const atrasada = d.prazo && d.prazo < today && d.status !== "feito";
  const st = STATUS[d.status] || STATUS.afazer;
  const pr = PRIORIDADES[d.prioridade] || PRIORIDADES.media;
  const setCampo = (campo, valor) => update((dt) => {
    const a = dt.demandas.find((x) => x.id === d.id);
    if (!a) return;
    if (campo === "status") {
      if (valor === "feito" && a.status !== "feito") {
        a.concluidoEm = hojeStr();
        if (a.prazo) a.atrasadaNaEntrega = a.prazo < hojeStr();
      }
      if (valor !== "feito") { a.concluidoEm = null; a.atrasadaNaEntrega = false; }
    }
    a[campo] = valor;
  });

  const toggleFav = () => update((dt) => { const a = dt.demandas.find((x) => x.id === d.id); if (a) a.fav = !a.fav; });

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
          <div className={"text-base leading-snug flex items-center gap-1.5 " + (d.status === "feito" ? "text-gray-400 line-through" : "text-gray-900 font-medium")}>
            {d.fav && <span style={{ color: AMARELO_TEXTO }}>★</span>}
            {d.titulo}
          </div>
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

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Prioridade</label>
            <div className="flex gap-2">
              {Object.entries(PRIORIDADES).map(([k, v]) => (
                <button key={k} onClick={() => setCampo("prioridade", k)}
                  className="flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5"
                  style={d.prioridade === k ? { backgroundColor: v.bg, color: v.fg, outline: `2px solid ${v.fg}` } : { backgroundColor: "#F2F2F2", color: "#888" }}>
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: v.fg }}></span>{v.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Tipo</label>
            <div className="flex gap-2">
              <button onClick={() => setCampo("esfera", "trabalho")} className="flex-1 py-2 rounded-lg text-sm font-bold"
                style={(d.esfera || "trabalho") !== "pessoal" ? { backgroundColor: PRETO, color: AMARELO } : { backgroundColor: "#F2F2F2", color: "#888" }}>Trabalho</button>
              <button onClick={() => setCampo("esfera", "pessoal")} className="flex-1 py-2 rounded-lg text-sm font-bold"
                style={(d.esfera || "trabalho") === "pessoal" ? { backgroundColor: "#0B8043", color: "#FFF" } : { backgroundColor: "#F2F2F2", color: "#888" }}>Vida pessoal</button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Prazo</label>
            <input type="date" value={d.prazo || ""} onChange={(e) => setCampo("prazo", e.target.value)} className="w-full bg-gray-100 rounded-lg px-3 py-2.5 text-base outline-none" />
            <div className="flex gap-2 mt-2">
              <button onClick={() => setCampo("prazo", amanha)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600">Amanhã</button>
              <button onClick={() => { const dd = new Date(); dd.setDate(dd.getDate() + 7); setCampo("prazo", isoData(dd)); }} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600">+7 dias</button>
              {d.prazo && <button onClick={() => setCampo("prazo", "")} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400">Sem prazo</button>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Status</label>
              <select value={d.status} onChange={(e) => setCampo("status", e.target.value)} className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none">
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Pessoa</label>
              <select value={d.pessoaId || ""} onChange={(e) => setCampo("pessoaId", e.target.value || null)} className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none">
                <option value="">Ninguém</option>
                {data.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <button onClick={toggleFav} className="text-xs font-bold px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: d.fav ? AMARELO : "#F2F2F2", color: d.fav ? PRETO : "#666" }}>
              {d.fav ? "★ Favoritada" : "☆ Favoritar"}
            </button>
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
  if (filtro === "ativas") lista = lista.filter((d) => !d.pessoaId && d.status !== "feito");
  if (filtro === "pessoas") lista = lista.filter((d) => d.pessoaId && d.status !== "feito");
  if (filtro === "travado") lista = lista.filter((d) => d.status === "travado");
  if (filtro === "feito") lista = lista.filter((d) => d.status === "feito");
  if (filtroPessoa) lista = lista.filter((d) => d.pessoaId === filtroPessoa);
  lista.sort(ordenarDemandas);

  const filtros = [
    { k: "ativas", label: "Ativas" },
    { k: "pessoas", label: "Pessoas" },
    { k: "travado", label: "Travadas" },
    { k: "feito", label: "Feitas" },
    { k: "todas", label: "Todas" },
  ];

  return (
    <div>
      <ScreenTitle data={data} update={update} tabKey="demandas" />
      <div className="mb-3">
        <AddInput placeholder='Nova demanda… (ex.: "relatório sexta alta")' onAdd={(t) => { const novoId = uid(); const p = parseDemanda(t); update((d) => { d.demandas.unshift({ id: novoId, titulo: p.titulo, prazo: p.prazo, prioridade: p.prioridade, status: "afazer", pessoaId: null, esfera: "trabalho" }); }); setExpandida(novoId); }} />
        <p className="text-xs text-gray-400 mt-1.5 px-1">Dá pra escrever o prazo e a prioridade no texto ("sexta", "amanhã", "12/08", "alta") — ou só o título e ajustar abaixo com um toque.</p>
      </div>
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {filtros.map((f) => <ChipFiltro key={f.k} ativo={filtro === f.k} onClick={() => setFiltro(f.k)}>{f.label}</ChipFiltro>)}
        {data.pessoas.length > 0 && filtro === "pessoas" && (
          <select value={filtroPessoa} onChange={(e) => setFiltroPessoa(e.target.value)} className="text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none flex-shrink-0 text-gray-600 font-medium">
            <option value="">Todas as pessoas</option>
            {data.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        )}
      </div>
      <Card className="divide-y divide-gray-100">
        {filtro === "ativas" ? (
          (() => {
            const trabalho = lista.filter((d) => (d.esfera || "trabalho") !== "pessoal");
            const pessoal = lista.filter((d) => (d.esfera || "trabalho") === "pessoal");
            if (lista.length === 0) return <Vazio texto="Nenhuma demanda ativa." />;
            return (
              <>
                <div className="px-4 pt-3 pb-1 text-xs font-black text-gray-400 uppercase tracking-wide">Trabalho</div>
                {trabalho.length === 0 && <Vazio texto="Nada de trabalho." />}
                {trabalho.map((d) => (
                  <DemandaItem key={d.id} d={d} data={data} update={update} today={today} amanha={amanha}
                    expandida={expandida === d.id} onToggle={() => setExpandida(expandida === d.id ? null : d.id)} />
                ))}
                <div className="px-4 pt-3 pb-1 text-xs font-black text-gray-400 uppercase tracking-wide border-t-2 border-gray-100">Vida pessoal</div>
                {pessoal.length === 0 && <Vazio texto="Nada pessoal." />}
                {pessoal.map((d) => (
                  <DemandaItem key={d.id} d={d} data={data} update={update} today={today} amanha={amanha}
                    expandida={expandida === d.id} onToggle={() => setExpandida(expandida === d.id ? null : d.id)} />
                ))}
              </>
            );
          })()
        ) : (
          <>
            {lista.length === 0 && <Vazio texto={filtro === "pessoas" ? "Nenhuma demanda direcionada a alguém." : "Nenhuma demanda aqui."} />}
            {lista.map((d) => (
              <DemandaItem key={d.id} d={d} data={data} update={update} today={today} amanha={amanha}
                expandida={expandida === d.id} onToggle={() => setExpandida(expandida === d.id ? null : d.id)} />
            ))}
          </>
        )}
      </Card>
      {filtro === "ativas" && <p className="text-xs text-gray-400 mt-2 px-1">Marque o tipo (Trabalho/Vida pessoal) ao abrir a demanda. As direcionadas a alguém ficam na aba "Pessoas".</p>}
    </div>
  );
}

// ============ Funções Fixas ============
function FuncoesFixas({ data, update }) {
  const [aberto, setAberto] = useState(true);
  const diaFx = diaEfetivo();
  const toggle = (id) => update((d) => { if (d.lembreteChecks[id] === diaFx) delete d.lembreteChecks[id]; else d.lembreteChecks[id] = diaFx; });
  const feitos = data.lembretes.filter((l) => data.lembreteChecks[l.id] === diaFx).length;
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
          {total === 0 && <p className="text-sm pb-2" style={{ color: ROXO_TEXTO }}>Suas obrigações de todo dia — ex.: olhar o G1, postar no TikTok. Zeram às 6h da manhã.</p>}
          <ul>
            {data.lembretes.map((l) => {
              const feito = data.lembreteChecks[l.id] === diaFx;
              return (
                <li key={l.id} className="flex items-center gap-2.5 py-2">
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

// ============ Visão dos próximos dias ============
function ProximosDias({ data, today }) {
  const [aberto, setAberto] = useState(false);
  const dias = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    dias.push(isoData(d));
  }
  const nomeDia = (iso, i) => {
    if (i === 0) return "Hoje";
    if (i === 1) return "Amanhã";
    const [y, m, dd] = iso.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString("pt-BR", { weekday: "long" });
  };

  const itensDoDia = (iso) => {
    const arr = [];
    data.demandas.filter((d) => d.status !== "feito" && d.prazo === iso).forEach((d) => {
      const pessoa = data.pessoas.find((p) => p.id === d.pessoaId);
      arr.push({ tipo: "Demanda", texto: d.titulo, cor: PRETO, extra: pessoa ? pessoa.nome : "" });
    });
    (data.conteudos?.itens || []).filter((c) => c.status !== ETAPA_FINAL && c.prazo === iso).forEach((c) => {
      const pessoa = data.pessoas.find((p) => p.id === c.pessoaId);
      const etapa = ETAPAS[c.status] ? ETAPAS[c.status].label : "";
      const extras = [pessoa ? pessoa.nome : "", etapa].filter(Boolean).join(" • ");
      arr.push({ tipo: "Conteúdo", texto: c.titulo, cor: "#6D4AFF", extra: extras });
    });
    (data.conteudos?.datas || []).filter((dt) => dt.data === iso).forEach((dt) => arr.push({ tipo: "Data", texto: dt.titulo, cor: "#C0392B", extra: "" }));
    (data.pessoal?.tarefas || []).filter((t) => !t.feito && t.prazo === iso).forEach((t) => arr.push({ tipo: "Pessoal", texto: t.texto, cor: "#0B8043", extra: "" }));
    return arr;
  };

  const total = dias.reduce((s, iso) => s + itensDoDia(iso).length, 0);

  return (
    <div className="rounded-2xl border border-gray-200 shadow-sm mb-5 overflow-hidden bg-white">
      <button onClick={() => setAberto(!aberto)} className="w-full px-4 py-3.5 flex items-center justify-between gap-2 text-left">
        <span className="text-base font-black tracking-tight text-gray-900">Próximos 4 dias</span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {total > 0 && <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: AMARELO, color: PRETO }}>{total}</span>}
          <span className="text-gray-400">{aberto ? "▴" : "▾"}</span>
        </span>
      </button>
      {aberto && (
        <div className="px-4 pb-4">
          {dias.map((iso, i) => {
            const itens = itensDoDia(iso);
            return (
              <div key={iso} className="py-2 border-t border-gray-100 first:border-t-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-black text-gray-900 capitalize">{nomeDia(iso, i)}</span>
                  <span className="text-xs text-gray-400">{fmtData(iso)}</span>
                </div>
                {itens.length === 0 && <p className="text-xs text-gray-300">livre</p>}
                {itens.map((it, j) => (
                  <div key={j} className="flex items-center gap-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: it.cor }}></span>
                    <span className="text-sm text-gray-700 truncate">{it.texto}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0 truncate">· {it.tipo}{it.extra ? " • " + it.extra : ""}</span>
                  </div>
                ))}
              </div>
            );
          })}
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
      <FuncoesFixas data={data} update={update} />
      <ProximosDias data={data} today={today} />
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
function CapturaInput({ onAdd }) {
  const [v, setV] = useState("");
  const submit = () => { const t = v.trim(); if (!t) return; onAdd(t); setV(""); };
  return (
    <div className="flex gap-2 items-end">
      <textarea value={v} onChange={(e) => setV(e.target.value)} placeholder="O que veio na cabeça?" rows={2}
        className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-base outline-none focus:border-gray-400 resize-none" />
      <button onClick={submit} className="px-4 py-2.5 rounded-xl text-sm font-bold flex-shrink-0 active:opacity-80" style={{ backgroundColor: AMARELO, color: PRETO }}>Guardar</button>
    </div>
  );
}

function CapturaScreen({ data, update, goTo }) {
  return (
    <div>
      <ScreenTitle data={data} update={update} tabKey="captura" />
      <div className="mb-1">
        <CapturaInput onAdd={(t) => update((d) => { d.capturas.unshift({ id: uid(), texto: t, criadoEm: hojeStr() }); })} />
      </div>
      <p className="text-xs text-gray-400 mb-4 px-1">Enter pula linha. Toca em Guardar pra enviar.</p>
      <Card className="divide-y divide-gray-100">
        {data.capturas.length === 0 && <Vazio texto="Caixa de entrada vazia." />}
        {data.capturas.map((c) => (
          <div key={c.id} className="px-4 py-3.5">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <EditableText value={c.texto} onSave={(v) => update((d) => { const a = d.capturas.find((x) => x.id === c.id); if (a) a.texto = v; })} className="text-base text-gray-900 font-medium whitespace-pre-wrap" />
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
                onClick={() => { update((d) => { d.conteudos.pautas.unshift({ id: uid(), texto: c.texto, editoria: "Outros", link: "", criadoEm: hojeStr() }); d.capturas = d.capturas.filter((x) => x.id !== c.id); }); goTo("conteudos"); }}>→ Pauta</button>
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
        {[...data.pessoas].sort((a, b) => (!!b.fixado - !!a.fixado)).map((p) => {
          const itens = p.itens || [];
          const abertos = itens.filter((i) => !i.feito).length;
          const demandasDela = data.demandas.filter((d) => d.pessoaId === p.id && d.status !== "feito");
          const abertaEsta = aberta === p.id;
          return (
            <Card key={p.id} style={p.equipe ? { backgroundColor: "#FFFCEC", borderColor: "#F2E6A8" } : {}}>
              <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer" onClick={() => setAberta(abertaEsta ? null : p.id)}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0" style={{ backgroundColor: PRETO, color: AMARELO }}>{p.nome.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                    {p.fixado && <span style={{ color: AMARELO_TEXTO }}>📌</span>}
                    {p.nome}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {p.equipe && p.cargo ? p.cargo.split(" · ")[0] + " · " : ""}{abertos} pendente{abertos !== 1 ? "s" : ""}{demandasDela.length > 0 ? ` · ${demandasDela.length} demanda${demandasDela.length !== 1 ? "s" : ""}` : ""}
                  </div>
                </div>
                <span className="text-gray-300 text-base">{abertaEsta ? "▴" : "▾"}</span>
              </div>
              {abertaEsta && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Nome</label>
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
                  {(() => {
                    if (!p.equipe) return null;
                    const feitas = data.demandas.filter((d) => d.pessoaId === p.id && d.status === "feito");
                    const noPrazo = feitas.filter((d) => !d.atrasadaNaEntrega).length;
                    const atrasou = feitas.filter((d) => d.atrasadaNaEntrega).length;
                    return (
                      <div className="mb-3">
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1.5">Histórico</h4>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl bg-gray-50 px-2 py-2 text-center">
                            <div className="text-lg font-black text-gray-900">{demandasDela.length}</div>
                            <div className="text-xs text-gray-400">ativas</div>
                          </div>
                          <div className="rounded-xl px-2 py-2 text-center" style={{ backgroundColor: "#E3F6E8" }}>
                            <div className="text-lg font-black" style={{ color: "#1E8E3E" }}>{noPrazo}</div>
                            <div className="text-xs" style={{ color: "#1E8E3E" }}>no prazo</div>
                          </div>
                          <div className="rounded-xl px-2 py-2 text-center" style={{ backgroundColor: atrasou > 0 ? "#FDE3E3" : "#F2F2F2" }}>
                            <div className="text-lg font-black" style={{ color: atrasou > 0 ? "#C0392B" : "#999" }}>{atrasou}</div>
                            <div className="text-xs" style={{ color: atrasou > 0 ? "#C0392B" : "#999" }}>atrasou</div>
                          </div>
                        </div>
                        {feitas.length >= 3 && demandasDela.length >= 5 && (
                          <p className="text-xs mt-2" style={{ color: AMARELO_TEXTO }}>⚠ {p.nome.split(" ")[0]} está com bastante coisa ativa — vale checar a carga.</p>
                        )}
                      </div>
                    );
                  })()}
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
        <div className="flex items-center gap-2">
          <button onClick={() => update((d) => { const a = d.anotacoes.find((n) => n.id === nota.id); if (a) a.fav = !a.fav; })}
            className="text-sm font-bold px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: nota.fav ? AMARELO : "#F2F2F2", color: nota.fav ? PRETO : "#666" }}>
            {nota.fav ? "★" : "☆"}
          </button>
          <ConfirmButton label="Apagar" confirmLabel="Confirmar"
            className="text-xs font-semibold text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50"
            onConfirm={() => { update((d) => { const a = d.anotacoes.find((n) => n.id === nota.id); if (a) jogarNaLixeira(d, "anotacao", a); d.anotacoes = d.anotacoes.filter((n) => n.id !== nota.id); }); onVoltar(); }} />
        </div>
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
        {[...data.anotacoes].sort((a, b) => (!!a.fav !== !!b.fav ? (a.fav ? -1 : 1) : 0)).map((n) => {
          const plain = htmlParaTexto(n.html || "");
          const linhas = plain.split("\n").map((l) => l.trim()).filter(Boolean);
          return (
            <button key={n.id} onClick={() => setAbertaId(n.id)} className="w-full text-left px-4 py-3.5 block active:bg-gray-50">
              <div className="text-base font-bold text-gray-900 truncate flex items-center gap-1.5">{n.fav && <span style={{ color: AMARELO_TEXTO }}>★</span>}{linhas[0] || "Sem título"}</div>
              <div className="text-sm text-gray-400 mt-0.5 truncate">{fmtData(n.atualizadoEm)}{linhas[1] ? " · " + linhas[1] : ""}</div>
            </button>
          );
        })}
      </Card>
    </div>
  );
}

// ============ Vida Pessoal: Contas + Tarefas ============
function ContasModulo({ data, update, today }) {
  const [tipo, setTipo] = useState("saida");
  const [mes, setMes] = useState(today.slice(0, 7));
  const [erroAdd, setErroAdd] = useState("");
  const [tagsAberto, setTagsAberto] = useState(false);

  const contas = data.contas || { lancamentos: [], tagsCustom: [] };
  const tagsCustom = contas.tagsCustom || [];
  const todasTags = [...TAGS_BASE.map((t) => t.nome), ...tagsCustom.map((t) => t.nome), "Outros"];

  const lanc = (contas.lancamentos || []).filter((l) => (l.data || "").startsWith(mes));
  const saidas = lanc.filter((l) => l.tipo !== "entrada");
  const entradas = lanc.filter((l) => l.tipo === "entrada");
  const totalS = saidas.reduce((s, l) => s + (l.valor || 0), 0);
  const totalE = entradas.reduce((s, l) => s + (l.valor || 0), 0);

  const porTag = {};
  saidas.forEach((l) => { porTag[l.tag] = (porTag[l.tag] || 0) + (l.valor || 0); });
  const tagsOrdenadas = Object.entries(porTag).sort((a, b) => b[1] - a[1]);
  const maxTag = tagsOrdenadas.length ? tagsOrdenadas[0][1] : 0;

  const mudarMes = (delta) => {
    const [y, m] = mes.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const mesLabel = (() => { const [y, m] = mes.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); })();

  const adicionar = (t) => {
    const p = parseLancamento(t);
    if (!p) { setErroAdd('Não achei o valor. Escreve tipo: "Uber 50" ou "60 ifood".'); return; }
    setErroAdd("");
    const tag = tipo === "entrada" ? "Entrada" : classificarTag(p.descricao, tagsCustom);
    update((d) => { if (!d.contas) d.contas = { lancamentos: [], tagsCustom: [] }; d.contas.lancamentos.unshift({ id: uid(), descricao: p.descricao, valor: p.valor, tag, tipo, data: hojeStr() }); });
  };

  return (
    <div>
      {/* Adicionar */}
      <div className="mb-2 flex gap-2">
        <button onClick={() => setTipo("saida")} className={"text-sm px-3.5 py-2 rounded-xl font-bold " + (tipo === "saida" ? "text-white" : "bg-white border border-gray-200 text-gray-600")} style={tipo === "saida" ? { backgroundColor: "#C0392B" } : {}}>Gasto</button>
        <button onClick={() => setTipo("entrada")} className={"text-sm px-3.5 py-2 rounded-xl font-bold " + (tipo === "entrada" ? "text-white" : "bg-white border border-gray-200 text-gray-600")} style={tipo === "entrada" ? { backgroundColor: COR_ENTRADA } : {}}>Entrada</button>
      </div>
      <AddInput placeholder={tipo === "saida" ? 'Ex.: "Uber 50" ou "60 ifood"' : 'Ex.: "salário 3000"'} buttonLabel="+" onAdd={adicionar} />
      {erroAdd && <p className="text-xs text-red-600 mt-1 px-1">{erroAdd}</p>}
      <p className="text-xs text-gray-400 mt-1.5 px-1 mb-4">Escreve do seu jeito que eu coloco a tag certa sozinho.</p>

      {/* Navegação de mês + resumo */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => mudarMes(-1)} className="w-9 h-9 rounded-xl bg-white border border-gray-200 text-gray-600 font-bold">‹</button>
        <span className="text-base font-black text-gray-900 capitalize">{mesLabel}</span>
        <button onClick={() => mudarMes(1)} className="w-9 h-9 rounded-xl bg-white border border-gray-200 text-gray-600 font-bold">›</button>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Card className="px-3 py-3 text-center">
          <p className="text-xs text-gray-400 font-bold">Entradas</p>
          <p className="text-sm font-black mt-0.5" style={{ color: COR_ENTRADA }}>{fmtDinheiro(totalE)}</p>
        </Card>
        <Card className="px-3 py-3 text-center">
          <p className="text-xs text-gray-400 font-bold">Saídas</p>
          <p className="text-sm font-black mt-0.5 text-red-600">{fmtDinheiro(totalS)}</p>
        </Card>
        <Card className="px-3 py-3 text-center" style={{ backgroundColor: PRETO, borderColor: PRETO }}>
          <p className="text-xs font-bold" style={{ color: "#999" }}>Saldo</p>
          <p className="text-sm font-black mt-0.5" style={{ color: totalE - totalS >= 0 ? AMARELO : "#FF6B6B" }}>{fmtDinheiro(totalE - totalS)}</p>
        </Card>
      </div>

      {/* Gráfico por tag */}
      {tagsOrdenadas.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-black text-gray-500 uppercase tracking-wide mb-2 px-1">Pra onde foi o dinheiro</h3>
          <Card className="p-4 space-y-3">
            {tagsOrdenadas.map(([tag, valor]) => (
              <div key={tag}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: corDaTag(tag, tagsCustom) }}></span>
                    {tag}
                  </span>
                  <span className="text-sm font-black text-gray-900">{fmtDinheiro(valor)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${maxTag ? Math.max(4, (valor / maxTag) * 100) : 0}%`, backgroundColor: corDaTag(tag, tagsCustom) }}></div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Lançamentos */}
      <h3 className="text-sm font-black text-gray-500 uppercase tracking-wide mb-2 px-1">Lançamentos</h3>
      <Card className="divide-y divide-gray-100 mb-4">
        {lanc.length === 0 && <Vazio texto="Nenhum lançamento nesse mês." />}
        {lanc.map((l) => (
          <div key={l.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: corDaTag(l.tag, tagsCustom) }}></span>
              <div className="flex-1 min-w-0">
                <EditableText value={l.descricao} onSave={(v) => update((d) => { const a = d.contas.lancamentos.find((x) => x.id === l.id); if (a) a.descricao = v; })} className="text-base text-gray-900 font-medium" />
              </div>
              <span className={"text-base font-black flex-shrink-0 " + (l.tipo === "entrada" ? "" : "text-red-600")} style={l.tipo === "entrada" ? { color: COR_ENTRADA } : {}}>
                {l.tipo === "entrada" ? "+" : "−"}{fmtDinheiro(l.valor)}
              </span>
              <ConfirmButton onConfirm={() => update((d) => { const a = d.contas.lancamentos.find((x) => x.id === l.id); if (a) jogarNaLixeira(d, "lancamento", a); d.contas.lancamentos = d.contas.lancamentos.filter((x) => x.id !== l.id); })} />
            </div>
            <div className="flex items-center gap-2 mt-1.5 ml-4">
              <select value={l.tag} onChange={(e) => update((d) => { const a = d.contas.lancamentos.find((x) => x.id === l.id); if (a) a.tag = e.target.value; })}
                className="text-xs bg-gray-100 rounded-lg px-2 py-1 outline-none text-gray-600 font-medium">
                {[...todasTags, "Entrada"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="date" value={l.data || ""} onChange={(e) => update((d) => { const a = d.contas.lancamentos.find((x) => x.id === l.id); if (a) a.data = e.target.value; })}
                className="text-xs bg-gray-100 rounded-lg px-2 py-1 outline-none text-gray-600 w-28" />
            </div>
          </div>
        ))}
      </Card>

      {/* Tags personalizadas */}
      <button onClick={() => setTagsAberto(!tagsAberto)} className="w-full py-2.5 rounded-xl text-sm font-bold bg-white border border-gray-200 text-gray-600 mb-2">
        {tagsAberto ? "Fechar tags" : "Gerenciar tags"}
      </button>
      {tagsAberto && (
        <Card className="p-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {TAGS_BASE.map((t) => (
              <span key={t.nome} className="text-xs px-2.5 py-1 rounded-full font-bold bg-gray-100 text-gray-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.cor }}></span>{t.nome}
              </span>
            ))}
            {tagsCustom.map((t) => (
              <span key={t.id} className="text-xs px-2.5 py-1 rounded-full font-bold bg-gray-100 text-gray-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.cor }}></span>{t.nome}
                <button onClick={() => update((d) => { d.contas.tagsCustom = d.contas.tagsCustom.filter((x) => x.id !== t.id); })} className="text-gray-400">✕</button>
              </span>
            ))}
          </div>
          <AddInput placeholder="Nova tag (ex.: Academia)…" buttonLabel="+"
            onAdd={(t) => update((d) => { if (!d.contas.tagsCustom) d.contas.tagsCustom = []; d.contas.tagsCustom.push({ id: uid(), nome: t, cor: PALETA_TAGS[d.contas.tagsCustom.length % PALETA_TAGS.length], palavras: [normalizar(t)] }); })} />
        </Card>
      )}
    </div>
  );
}

function PessoalScreen({ data, update, today }) {
  const [sub, setSub] = useState("contas");
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [pin, setPin] = useState("");
  const [erroPin, setErroPin] = useState(false);
  const SENHA = "2807";

  const tentar = () => {
    if (pin === SENHA) { setDesbloqueado(true); setPin(""); setErroPin(false); }
    else { setErroPin(true); setPin(""); }
  };

  if (!desbloqueado) {
    return (
      <div>
        <ScreenTitle data={data} update={update} tabKey="pessoal" />
        <Card className="p-6 max-w-xs mx-auto mt-6 text-center">
          <div className="text-3xl mb-2">🔒</div>
          <p className="text-base font-bold text-gray-900 mb-1">Área privada</p>
          <p className="text-sm text-gray-400 mb-4">Digite a senha pra ver suas contas e tarefas pessoais.</p>
          <input type="password" inputMode="numeric" value={pin} autoFocus
            onChange={(e) => { setPin(e.target.value); setErroPin(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") tentar(); }}
            placeholder="• • • •"
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-center text-xl tracking-widest outline-none mb-3" />
          {erroPin && <p className="text-red-600 text-sm mb-3">Senha incorreta.</p>}
          <button onClick={tentar} className="w-full py-3 rounded-xl text-base font-black active:opacity-80" style={{ backgroundColor: AMARELO, color: PRETO }}>Entrar</button>
        </Card>
      </div>
    );
  }

  const tarefas = data.pessoal.tarefas || [];
  return (
    <div>
      <div className="flex items-center justify-between">
        <ScreenTitle data={data} update={update} tabKey="pessoal" />
        <button onClick={() => setDesbloqueado(false)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-500 -mt-3 flex-shrink-0">🔒 Bloquear</button>
      </div>
      <div className="flex gap-2 mb-4">
        <ChipFiltro ativo={sub === "contas"} onClick={() => setSub("contas")}>Contas</ChipFiltro>
        <ChipFiltro ativo={sub === "tarefas"} onClick={() => setSub("tarefas")}>Tarefas</ChipFiltro>
      </div>
      {sub === "contas" && <ContasModulo data={data} update={update} today={today} />}
      {sub === "tarefas" && (
        <div>
          <div className="mb-4"><AddInput placeholder="Nova tarefa pessoal…" onAdd={(t) => update((d) => { d.pessoal.tarefas.unshift({ id: uid(), texto: t, prazo: "", feito: false }); })} /></div>
          <Card className="divide-y divide-gray-100">
            {tarefas.length === 0 && <Vazio texto="Nada pessoal pendente." />}
            {tarefas.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                <Check checked={!!t.feito} onChange={() => update((d) => { const a = d.pessoal.tarefas.find((x) => x.id === t.id); if (a) a.feito = !a.feito; })} />
                <div className="flex-1 min-w-0">
                  <EditableText value={t.texto} onSave={(v) => update((d) => { const a = d.pessoal.tarefas.find((x) => x.id === t.id); if (a) a.texto = v; })}
                    className={"text-base " + (t.feito ? "text-gray-400 line-through" : "text-gray-900 font-medium")} />
                  {t.prazo && t.prazo < today && !t.feito && <span className="text-xs text-red-600 font-bold ml-1">· atrasada</span>}
                </div>
                <input type="date" value={t.prazo || ""} onChange={(e) => update((d) => { const a = d.pessoal.tarefas.find((x) => x.id === t.id); if (a) a.prazo = e.target.value; })}
                  className="bg-gray-100 rounded-lg px-1.5 py-1.5 text-xs text-gray-600 outline-none w-28 flex-shrink-0" />
                <ConfirmButton onConfirm={() => update((d) => { const a = d.pessoal.tarefas.find((x) => x.id === t.id); if (a) jogarNaLixeira(d, "tarefaPessoal", a); d.pessoal.tarefas = d.pessoal.tarefas.filter((x) => x.id !== t.id); })} />
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

// ============ Conteúdos ============
// Sincroniza a demanda ligada a um conteúdo (criação/atualização/remoção automática)
const sincronizarDemandaDeConteudo = (d, c) => {
  if (c.pessoaId) {
    let dem = c.demandaId ? d.demandas.find((x) => x.id === c.demandaId) : null;
    if (!dem) {
      dem = { id: uid(), titulo: "Conteúdo: " + c.titulo, prazo: c.prazo || "", prioridade: c.urgencia || "media", status: "afazer", pessoaId: c.pessoaId, deConteudo: c.id };
      d.demandas.unshift(dem);
      c.demandaId = dem.id;
    } else {
      dem.titulo = "Conteúdo: " + c.titulo;
      dem.prazo = c.prazo || "";
      dem.prioridade = c.urgencia || "media";
      dem.pessoaId = c.pessoaId;
    }
    if (c.status === ETAPA_FINAL) dem.status = "feito";
  } else if (c.demandaId) {
    d.demandas = d.demandas.filter((x) => x.id !== c.demandaId);
    c.demandaId = null;
  }
};

function ConteudoItem({ c, data, update, expandida, onToggle, today, amanha }) {
  const pessoa = data.pessoas.find((p) => p.id === c.pessoaId);
  const et = ETAPAS[c.status] || ETAPAS.ideia;
  const ur = PRIORIDADES[c.urgencia] || PRIORIDADES.media;
  const atrasado = c.prazo && c.prazo < today && c.status !== ETAPA_FINAL;

  const setCampo = (campo, valor) => update((dt) => {
    const a = dt.conteudos.itens.find((x) => x.id === c.id);
    if (!a) return;
    a[campo] = valor;
    sincronizarDemandaDeConteudo(dt, a);
  });

  let chipPrazo = null;
  if (c.prazo) {
    if (atrasado) chipPrazo = <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-bold">Atrasado · {fmtData(c.prazo)}</span>;
    else if (c.prazo === today) chipPrazo = <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: AMARELO, color: PRETO }}>Hoje</span>;
    else if (c.prazo === amanha) chipPrazo = <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: AMARELO_CLARO, color: AMARELO_TEXTO }}>Amanhã</span>;
    else chipPrazo = <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">{fmtData(c.prazo)}</span>;
  }

  const fc = FORMATO_COR[c.formato] || { bg: "#FFFFFF", chip: "#444" };

  return (
    <div className="px-4 py-3.5" style={{ backgroundColor: c.status === ETAPA_FINAL ? "#FAFAFA" : fc.bg }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0" onClick={onToggle}>
          <div className={"text-base leading-snug " + (c.status === ETAPA_FINAL ? "text-gray-400" : "text-gray-900 font-medium")}>{c.titulo}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: et.bg, color: et.fg }}>{et.label}</span>
            {c.formato && <span className="text-xs px-2.5 py-1 rounded-full font-bold text-white" style={{ backgroundColor: fc.chip }}>{FORMATOS[c.formato] || c.formato}</span>}
            {c.editoria && (
              <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-gray-100 text-gray-700 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: corDaEditoria(c.editoria) }}></span>
                {c.editoria}
              </span>
            )}
            {chipPrazo}
            <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: ur.bg, color: ur.fg }}>{ur.label}</span>
            {pessoa && <span className="text-xs px-2.5 py-1 rounded-full font-bold text-white" style={{ backgroundColor: PRETO }}>{pessoa.nome}</span>}
            {c.link && <a href={c.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: AMARELO_CLARO, color: AMARELO_TEXTO }}>link ↗</a>}
          </div>
        </div>
        <button onClick={onToggle} className="text-gray-300 text-base px-1 flex-shrink-0">{expandida ? "▴" : "▾"}</button>
      </div>

      {expandida && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Título</label>
            <EditableText value={c.titulo} onSave={(v) => setCampo("titulo", v)} className="text-base text-gray-900 block bg-gray-50 rounded-lg px-2.5 py-2" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Descrição</label>
            <textarea value={c.descricao || ""} onChange={(e) => setCampo("descricao", e.target.value)} placeholder="Descreve a ideia, o roteiro, a referência…"
              className="w-full bg-gray-50 rounded-lg px-2.5 py-2 text-base text-gray-900 outline-none resize-none" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Formato</label>
              <select value={c.formato || "card"} onChange={(e) => setCampo("formato", e.target.value)} className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none">
                {Object.entries(FORMATOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Editoria</label>
              <select value={c.editoria || "Outros"} onChange={(e) => setCampo("editoria", e.target.value)} className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none">
                {EDITORIAS.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Etapa</label>
              <select value={c.status || "ideia"} onChange={(e) => setCampo("status", e.target.value)} className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none">
                {Object.entries(ETAPAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Urgência</label>
              <select value={c.urgencia || "media"} onChange={(e) => setCampo("urgencia", e.target.value)} className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none">
                {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Prazo</label>
              <input type="date" value={c.prazo || ""} onChange={(e) => setCampo("prazo", e.target.value)} className="w-full bg-gray-100 rounded-lg px-2 py-1.5 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Demandar para</label>
              <select value={c.pessoaId || ""} onChange={(e) => setCampo("pessoaId", e.target.value || null)} className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none">
                <option value="">Ninguém</option>
                {data.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Link</label>
            <input type="url" value={c.link || ""} onChange={(e) => setCampo("link", e.target.value)} placeholder="https://…"
              className="w-full bg-gray-100 rounded-lg px-2.5 py-2 text-sm outline-none" />
          </div>
          {c.pessoaId && <p className="text-xs text-gray-400">Esse conteúdo vira demanda automática pra {pessoa ? pessoa.nome : "a pessoa"} — aparece em Pessoas e em Demandas › Pessoas. Quando marcar "No ar", a demanda fecha sozinha.</p>}
          <div className="flex justify-end">
            <ConfirmButton label="Apagar conteúdo" confirmLabel="Confirmar exclusão"
              className="text-xs font-semibold text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50"
              onConfirm={() => update((dt) => {
                const a = dt.conteudos.itens.find((x) => x.id === c.id);
                if (a) {
                  jogarNaLixeira(dt, "conteudo", a);
                  if (a.demandaId) dt.demandas = dt.demandas.filter((x) => x.id !== a.demandaId);
                }
                dt.conteudos.itens = dt.conteudos.itens.filter((x) => x.id !== c.id);
              })} />
          </div>
        </div>
      )}
    </div>
  );
}

function DatasChave({ data, update, today }) {
  const datas = [...(data.conteudos.datas || [])].sort((a, b) => (a.data || "").localeCompare(b.data || ""));
  return (
    <Card className="p-4 mb-4" style={{ borderColor: AMARELO, borderWidth: 2 }}>
      <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-2">📅 Datas-chave</h3>
      {datas.length === 0 && <p className="text-sm text-gray-400 mb-2">Datas que não podem passar — eventos, sessões, datas comemorativas que rendem conteúdo.</p>}
      {datas.map((dt) => {
        const dias = dt.data ? diasAte(dt.data) : null;
        const passou = dias !== null && dias < 0;
        const urgente = dias !== null && dias >= 0 && dias <= 3;
        return (
          <div key={dt.id} className="flex items-center gap-2.5 py-2">
            <div className="flex-1 min-w-0">
              <EditableText value={dt.titulo} onSave={(v) => update((d) => { const a = d.conteudos.datas.find((x) => x.id === dt.id); if (a) a.titulo = v; })}
                className={"text-base font-medium " + (passou ? "text-gray-400 line-through" : "text-gray-900")} />
            </div>
            {dt.data && (
              <span className={"text-xs px-2.5 py-1 rounded-full font-bold flex-shrink-0 " + (passou ? "bg-gray-100 text-gray-400" : urgente ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-600")}>
                {fmtData(dt.data)}{!passou && dias !== null ? (dias === 0 ? " · hoje!" : ` · faltam ${dias}d`) : ""}
              </span>
            )}
            <input type="date" value={dt.data || ""} onChange={(e) => update((d) => { const a = d.conteudos.datas.find((x) => x.id === dt.id); if (a) a.data = e.target.value; })}
              className="bg-gray-100 rounded-lg px-1 py-1 text-xs text-gray-600 outline-none w-10 flex-shrink-0" style={{ width: 34 }} title="Mudar a data" />
            <ConfirmButton onConfirm={() => update((d) => { const a = d.conteudos.datas.find((x) => x.id === dt.id); if (a) jogarNaLixeira(d, "dataChave", a); d.conteudos.datas = d.conteudos.datas.filter((x) => x.id !== dt.id); })} />
          </div>
        );
      })}
      <div className="mt-2">
        <AddInput placeholder="Ex.: Aniversário da cidade" buttonLabel="+"
          onAdd={(t) => update((d) => { d.conteudos.datas.push({ id: uid(), titulo: t, data: "" }); })} />
        <p className="text-xs text-gray-400 mt-1.5">Adiciona o nome e depois toca no campo pequeno pra escolher a data.</p>
      </div>
    </Card>
  );
}

function TimelineModulo({ update, goToPautas }) {
  const [tema, setTema] = useState("");
  const [colar, setColar] = useState("");
  const [colarLink, setColarLink] = useState("");

  const buscar = (q) => {
    const query = encodeURIComponent(q + " quando:7d");
    window.open(`https://news.google.com/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, "_blank");
  };

  const mandarPraPauta = () => {
    const texto = colar.trim();
    if (!texto) return;
    update((d) => { d.conteudos.pautas.unshift({ id: uid(), texto, editoria: "Outros", link: colarLink.trim(), criadoEm: hojeStr() }); });
    setColar(""); setColarLink("");
    goToPautas();
  };

  return (
    <div>
      <Card className="p-4 mb-4">
        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-1">Buscar notícias</h3>
        <p className="text-xs text-gray-400 mb-3">Abre as notícias dos últimos 7 dias no Google Notícias. Achou algo que rende? Cola embaixo e manda pra pauta.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {TEMAS_TIMELINE.map((t) => (
            <button key={t} onClick={() => buscar(t)} className="text-xs px-3 py-1.5 rounded-full font-bold" style={{ backgroundColor: AMARELO_CLARO, color: AMARELO_TEXTO }}>{t} ↗</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={tema} onChange={(e) => setTema(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && tema.trim()) buscar(tema.trim()); }}
            placeholder="Buscar outro tema…" className="flex-1 min-w-0 bg-gray-100 rounded-xl px-3.5 py-2.5 text-base outline-none" />
          <button onClick={() => tema.trim() && buscar(tema.trim())} className="px-4 py-2.5 rounded-xl text-sm font-bold flex-shrink-0" style={{ backgroundColor: PRETO, color: AMARELO }}>Buscar ↗</button>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-1">Mandar pra pauta</h3>
        <p className="text-xs text-gray-400 mb-3">Achou uma notícia? Cola o resumo aqui e o link da fonte. Vira pauta no seu banco de ideias.</p>
        <textarea value={colar} onChange={(e) => setColar(e.target.value)} placeholder="Resumo da notícia / ideia de conteúdo…"
          className="w-full bg-gray-100 rounded-xl px-3.5 py-2.5 text-base outline-none resize-none mb-2" rows={3} />
        <input value={colarLink} onChange={(e) => setColarLink(e.target.value)} placeholder="Link da fonte (opcional)"
          className="w-full bg-gray-100 rounded-xl px-3.5 py-2.5 text-base outline-none mb-3" />
        <button onClick={mandarPraPauta} className="w-full py-2.5 rounded-xl text-sm font-black" style={{ backgroundColor: AMARELO, color: PRETO }}>→ Mandar pra Pauta</button>
      </Card>
      <p className="text-xs text-gray-400 mt-3 px-1">A busca automática de notícias dentro do app virá numa próxima etapa. Por ora, isso te dá o caminho rápido.</p>
    </div>
  );
}

function ConteudosScreen({ data, update, today, amanha }) {
  const [sub, setSub] = useState("conteudos");
  const [filtroEtapa, setFiltroEtapa] = useState("ativos");
  const [filtroEditoria, setFiltroEditoria] = useState("");
  const [expandida, setExpandida] = useState(null);
  const [datasAberto, setDatasAberto] = useState(false);

  const itens = data.conteudos.itens || [];
  const pautas = data.conteudos.pautas || [];

  let lista = [...itens];
  if (filtroEtapa === "ativos") lista = lista.filter((c) => c.status !== ETAPA_FINAL);
  else if (filtroEtapa !== "todos") lista = lista.filter((c) => c.status === filtroEtapa);
  if (filtroEditoria) lista = lista.filter((c) => c.editoria === filtroEditoria);
  lista.sort((a, b) => (a.prazo || "9999") < (b.prazo || "9999") ? -1 : 1);

  const proximaData = [...(data.conteudos.datas || [])].filter((d) => d.data && d.data >= today).sort((a, b) => a.data.localeCompare(b.data))[0];

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <span className="w-1.5 h-7 rounded-full flex-shrink-0" style={{ backgroundColor: AMARELO }}></span>
        <div className="flex-1 min-w-0">
          <EditableText value={data.tabNames.conteudos} onSave={(v) => update((d) => { d.tabNames.conteudos = v; })}
            className="text-2xl font-black text-gray-900 tracking-tight" />
        </div>
        <button onClick={() => setDatasAberto(!datasAberto)} title="Datas-chave"
          className="w-11 h-11 rounded-xl border-2 flex items-center justify-center text-lg flex-shrink-0 relative"
          style={{ borderColor: AMARELO, backgroundColor: datasAberto ? AMARELO : "#FFF" }}>
          📅
          {proximaData && diasAte(proximaData.data) <= 3 && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500"></span>}
        </button>
      </div>

      {datasAberto && <DatasChave data={data} update={update} today={today} />}

      <div className="flex gap-2 mb-4">
        <ChipFiltro ativo={sub === "conteudos"} onClick={() => setSub("conteudos")}>Conteúdos{itens.filter((c) => c.status !== ETAPA_FINAL).length > 0 ? ` · ${itens.filter((c) => c.status !== ETAPA_FINAL).length}` : ""}</ChipFiltro>
        <ChipFiltro ativo={sub === "pautas"} onClick={() => setSub("pautas")}>Pautas{pautas.length > 0 ? ` · ${pautas.length}` : ""}</ChipFiltro>
        <ChipFiltro ativo={sub === "timeline"} onClick={() => setSub("timeline")}>Timeline</ChipFiltro>
      </div>

      {sub === "timeline" && <TimelineModulo update={update} goToPautas={() => setSub("pautas")} />}

      {sub === "conteudos" && (
        <div>
          <div className="mb-3">
            <AddInput placeholder="Novo conteúdo (título)…"
              onAdd={(t) => { const novoId = uid(); update((d) => { d.conteudos.itens.unshift({ id: novoId, titulo: t, descricao: "", formato: "card", editoria: "Outros", link: "", pessoaId: null, demandaId: null, prazo: "", status: "ideia", urgencia: "media", criadoEm: hojeStr() }); }); setExpandida(novoId); }} />
            <p className="text-xs text-gray-400 mt-1.5 px-1">Ao criar, já abre pra você preencher formato, editoria, etapa, prazo, pessoa e link.</p>
          </div>
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            <ChipFiltro ativo={filtroEtapa === "ativos"} onClick={() => setFiltroEtapa("ativos")}>Ativos</ChipFiltro>
            <ChipFiltro ativo={filtroEtapa === ETAPA_FINAL} onClick={() => setFiltroEtapa(ETAPA_FINAL)}>Pronto</ChipFiltro>
            {Object.entries(ETAPAS).filter(([k]) => k !== ETAPA_FINAL).map(([k, v]) => <ChipFiltro key={k} ativo={filtroEtapa === k} onClick={() => setFiltroEtapa(k)}>{v.label}</ChipFiltro>)}
            <ChipFiltro ativo={filtroEtapa === "todos"} onClick={() => setFiltroEtapa("todos")}>Todos</ChipFiltro>
            <select value={filtroEditoria} onChange={(e) => setFiltroEditoria(e.target.value)} className="text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none flex-shrink-0 text-gray-600 font-medium">
              <option value="">Todas editorias</option>
              {EDITORIAS.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
            </select>
          </div>
          <Card className="divide-y divide-gray-100">
            {lista.length === 0 && <Vazio texto="Nenhum conteúdo aqui. O fluxo: pauta → conteúdo → no ar." />}
            {lista.map((c) => (
              <ConteudoItem key={c.id} c={c} data={data} update={update} today={today} amanha={amanha}
                expandida={expandida === c.id} onToggle={() => setExpandida(expandida === c.id ? null : c.id)} />
            ))}
          </Card>
        </div>
      )}

      {sub === "pautas" && (
        <div>
          <div className="mb-3">
            <AddInput placeholder="Nova pauta / ideia de conteúdo…"
              onAdd={(t) => update((d) => { d.conteudos.pautas.unshift({ id: uid(), texto: t, editoria: "Outros", link: "", criadoEm: hojeStr() }); })} />
            <p className="text-xs text-gray-400 mt-1.5 px-1">Seu baú de ideias. Quando uma pauta amadurecer, toca em "→ Conteúdo".</p>
          </div>
          <Card className="divide-y divide-gray-100">
            {pautas.length === 0 && <Vazio texto="Nenhuma pauta guardada." />}
            {pautas.map((p) => (
              <div key={p.id} className="px-4 py-3.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <EditableText value={p.texto} onSave={(v) => update((d) => { const a = d.conteudos.pautas.find((x) => x.id === p.id); if (a) a.texto = v; })} className="text-base text-gray-900 font-medium" />
                    <p className="text-xs text-gray-400 mt-0.5">{fmtData(p.criadoEm)}{p.link && <a href={p.link} target="_blank" rel="noreferrer" className="ml-2 font-bold" style={{ color: AMARELO_TEXTO }}>fonte ↗</a>}</p>
                  </div>
                  <ConfirmButton onConfirm={() => update((d) => { const a = d.conteudos.pautas.find((x) => x.id === p.id); if (a) jogarNaLixeira(d, "pauta", a); d.conteudos.pautas = d.conteudos.pautas.filter((x) => x.id !== p.id); })} />
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <select value={p.editoria || "Outros"} onChange={(e) => update((d) => { const a = d.conteudos.pautas.find((x) => x.id === p.id); if (a) a.editoria = e.target.value; })}
                    className="text-xs bg-gray-100 rounded-lg px-2 py-1.5 outline-none text-gray-600 font-medium">
                    {EDITORIAS.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
                  </select>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: corDaEditoria(p.editoria) }}></span>
                  <div className="flex-1"></div>
                  <button className="text-xs px-3 py-1.5 rounded-full font-bold" style={{ backgroundColor: AMARELO, color: PRETO }}
                    onClick={() => { update((d) => { d.conteudos.itens.unshift({ id: uid(), titulo: p.texto, descricao: p.link ? "Fonte: " + p.link : "", formato: "card", editoria: p.editoria || "Outros", link: p.link || "", pessoaId: null, demandaId: null, prazo: "", status: "ideia", urgencia: "media", criadoEm: hojeStr() }); d.conteudos.pautas = d.conteudos.pautas.filter((x) => x.id !== p.id); }); setSub("conteudos"); }}>→ Conteúdo</button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
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
    (data.conteudos?.itens || []).forEach((c) => { if (normalizar(c.titulo + " " + (c.descricao || "")).includes(nq)) resultados.push({ tab: "conteudos", label: "Conteúdos", texto: c.titulo, extra: ETAPAS[c.status]?.label || "" }); });
    (data.conteudos?.pautas || []).forEach((p) => { if (normalizar(p.texto).includes(nq)) resultados.push({ tab: "conteudos", label: "Pautas", texto: p.texto, extra: p.editoria || "" }); });
    data.capturas.forEach((c) => { if (normalizar(c.texto).includes(nq)) resultados.push({ tab: "captura", label: "Captura", texto: c.texto, extra: "" }); });
    data.lembretes.forEach((l) => { if (normalizar(l.texto).includes(nq)) resultados.push({ tab: "hoje", label: "Dever diário", texto: l.texto, extra: "" }); });
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
const TIPO_LABEL = { demanda:"Demanda", captura:"Captura", anotacao:"Anotação", tarefaPessoal:"Vida Pessoal", funcaoFixa:"Função fixa", pessoaItem:"Pessoa", pessoa:"Pessoa", card:"Quadro", coluna:"Coluna", lancamento:"Contas", conteudo:"Conteúdo", pauta:"Pauta", dataChave:"Data-chave" };
const textoDoLixo = (item) => {
  const p = item.payload || {};
  if (item.tipo === "anotacao") { const plain = htmlParaTexto(p.html || ""); return plain.split("\n").map((l) => l.trim()).filter(Boolean)[0] || "Sem título"; }
  if (item.tipo === "lancamento") return (p.descricao || "") + " · " + fmtDinheiro(p.valor);
  return p.titulo || p.texto || p.nome || p.descricao || "(sem texto)";
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
    else if (item.tipo === "lancamento") d.contas.lancamentos.unshift(p);
    else if (item.tipo === "conteudo") { p.demandaId = null; d.conteudos.itens.unshift(p); }
    else if (item.tipo === "pauta") d.conteudos.pautas.unshift(p);
    else if (item.tipo === "dataChave") d.conteudos.datas.push(p);
    else if (item.tipo === "card") d.capturas.unshift({ id: uid(), texto: p.texto, criadoEm: hojeStr() });
    else if (item.tipo === "coluna") (p.cards || []).forEach((k) => d.capturas.unshift({ id: uid(), texto: k.texto, criadoEm: hojeStr() }));
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

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => setSessao(session));
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => setSessao(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao) return;
    setLoaded(false);
    carregarDados().then((dados) => {
      if (dados) {
        if (dados.pessoas) dados.pessoas.forEach((p) => { if (!p.itens) p.itens = [...(p.devo || []), ...(p.falar || [])]; });
        if (dados.anotacoes) dados.anotacoes.forEach((n) => { if (n.html === undefined) n.html = (n.texto || "").split("\n").map((l) => escapeHtml(l)).join("<br>"); });
        dados.lixeira = (dados.lixeira || []).filter((i) => diasDesde(i.apagadoEm) < DIAS_LIXEIRA);
        // Migra etapas antigas de conteúdo
        const mapaEtapa = { gravado: "gravar", editado: "editar", noar: "pronto" };
        (dados.conteudos?.itens || []).forEach((c) => { if (mapaEtapa[c.status]) c.status = mapaEtapa[c.status]; });
        if (!dados.pessoas || dados.pessoas.length === 0) {
          dados.pessoas = EQUIPE_INICIAL.map((e) => ({ id: uid(), nome: e.nome, cargo: e.cargo, equipe: true, fixado: true, itens: [] }));
        } else {
          // Marca Bismarck, Graciano e Marcio como equipe/fixados se já existirem
          const nomesEquipe = ["bismarck", "graciano", "marcio moushe", "márcio moushe", "moushe", "marcio", "márcio"];
          dados.pessoas.forEach((p) => {
            if (nomesEquipe.includes(normalizar(p.nome))) { p.equipe = true; p.fixado = true; }
          });
        }
        setData({
          ...DEFAULT_DATA, ...dados,
          tabNames: { ...DEFAULT_DATA.tabNames, ...(dados.tabNames || {}) },
          lembretesTitulo: (!dados.lembretesTitulo || dados.lembretesTitulo === "Funções fixas") ? "Dever diário" : dados.lembretesTitulo,
          pessoal: { tarefas: dados.pessoal?.tarefas || [] },
          contas: { lancamentos: dados.contas?.lancamentos || [], tagsCustom: dados.contas?.tagsCustom || [] },
          conteudos: { itens: dados.conteudos?.itens || [], pautas: dados.conteudos?.pautas || [], datas: dados.conteudos?.datas || [] },
          lixeira: dados.lixeira,
        });
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [sessao?.user?.id]);

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
    pessoal: <PessoalScreen data={data} update={update} today={today} />,
    conteudos: <ConteudosScreen data={data} update={update} today={today} amanha={amanha} />,
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
