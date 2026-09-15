import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  CloudOff,
  Database,
  Download,
  Edit3,
  FileText,
  FolderPlus,
  GraduationCap,
  Layers,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  emptyData,
  grade,
  interval,
  newCard,
  normalizeCardText,
  outcomes,
  parseData,
  queue,
  masteryLevel,
  shuffledDeckCards,
  quizPrompt,
  quizAnswerCorrect,
  readData,
  writeData,
  uid,
  dayKey,
  backupReminderVisible,
  Rating,
  State,
  type CardTemplate,
  type Data,
  type Deck,
  type Flashcard,
} from "./data";
import { dataIsEmpty, loadCloudData, mergeData, saveCloudData } from "./cloud";
import { generateCard } from "./ai";
import { supabase, supabaseConfigured } from "./supabase";
import {
  SUPABASE_DATABASE_LIMIT_BYTES,
  SUPABASE_EDGE_FUNCTION_LIMIT,
  formatBytes,
  formatCount,
  loadSharedUsage,
  localUsage,
  usagePercent,
  type UsageState,
} from "./usage";
type Modal =
  | { kind: "deck"; deck?: Deck }
  | { kind: "card"; card?: Flashcard }
  | { kind: "settings" }
  | { kind: "usage" }
  | { kind: "templates" }
  | { kind: "template"; template?: CardTemplate }
  | {
      kind: "delete";
      target: "card" | "deck" | "reset" | "template";
      id: string;
      name: string;
    }
  | null;
const labels = ["Noi", "În învățare", "În recapitulare", "Reînvățare"];
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

type CloudState =
  "local" | "signed-out" | "syncing" | "synced" | "offline" | "error";
const CLOUD_USER_KEY = "bonjour-cloud-user";
const CLOUD_DIRTY_KEY = "bonjour-cloud-dirty";
const allowedAccounts = [
  {
    label: "Cont Vlad",
    email: import.meta.env.VITE_VLAD_EMAIL?.trim() ?? "",
  },
  {
    label: "Cont Andreea",
    email: import.meta.env.VITE_ANDREEA_EMAIL?.trim() ?? "",
  },
];
const localFlag = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const setLocalFlag = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sincronizarea poate continua chiar dacă metadatele locale nu sunt disponibile.
  }
};

export default function App() {
  const [data, setData] = useState<Data>(emptyData),
    [ready, setReady] = useState(false),
    [fatal, setFatal] = useState(""),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false);
  const [deckId, setDeckId] = useState<string | null>(null),
    [modal, setModal] = useState<Modal>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const [study, setStudy] = useState(false),
    [freePractice, setFreePractice] = useState(false),
    [testMode, setTestMode] = useState(false),
    [practiceIds, setPracticeIds] = useState<string[]>([]),
    [quizAnswer, setQuizAnswer] = useState(""),
    [quizResult, setQuizResult] = useState<"correct" | "incorrect" | null>(
      null,
    ),
    [quizCorrect, setQuizCorrect] = useState(0),
    [revealed, setRevealed] = useState(false),
    [done, setDone] = useState(0),
    [total, setTotal] = useState(0),
    [undo, setUndo] = useState<Data | null>(null),
    [now, setNow] = useState(new Date());
  const [studyId, setStudyId] = useState<string | null>(null);
  const [backupClock, setBackupClock] = useState<string | null>(null);
  const [backupDismissed, setBackupDismissed] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [authBusy, setAuthBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [cardDraft, setCardDraft] = useState({ front: "", back: "" });
  const [cloudState, setCloudState] = useState<CloudState>(
    supabaseConfigured ? "signed-out" : "local",
  );
  const [usage, setUsage] = useState<UsageState>({
    status: "idle",
    summary: localUsage(emptyData()),
  });
  const importer = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    busy = useRef(false),
    dataRef = useRef<Data>(emptyData()),
    sessionRef = useRef<Session | null>(null),
    initialSyncUser = useRef<string | null>(null),
    cloudQueue = useRef<Promise<void>>(Promise.resolve()),
    cloudRevision = useRef(0);
  useEffect(() => {
    readData()
      .then((d) => {
        dataRef.current = d;
        setData(d);
        setReady(true);
      })
      .catch(() =>
        setFatal(
          "Datele locale nu au putut fi citite. Reîncarcă pagina sau verifică dacă browserul permite stocarea locală. Datele existente nu au fost suprascrise.",
        ),
      );
  }, []);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data: authData, error }) => {
      if (!active) return;
      if (error) {
        setCloudState("error");
        setAuthReady(true);
        return;
      }
      sessionRef.current = authData.session;
      setSession(authData.session);
      setCloudState(authData.session ? "syncing" : "signed-out");
      setAuthReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
      setAuthReady(true);
      if (!nextSession) {
        initialSyncUser.current = null;
        setCloudState("signed-out");
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const userId = session?.user.id;
    if (!ready || !userId || initialSyncUser.current === userId) return;
    initialSyncUser.current = userId;
    void firstCloudSync(userId);
  }, [ready, session?.user.id]);
  useEffect(() => {
    if (!session) return;
    const retry = () => {
      if (localFlag(CLOUD_DIRTY_KEY) === "true") {
        enqueueCloudSave(dataRef.current, true);
      }
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [session?.user.id]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (modal && dialog.current && !dialog.current.open)
      dialog.current.showModal();
    else if (!modal && dialog.current?.open) dialog.current.close();
  }, [modal]);
  useEffect(() => {
    if (modal?.kind !== "card") return;
    setCardDraft({
      front: modal.card?.front ?? "",
      back: modal.card?.back ?? "",
    });
    setAiInput(modal.card?.front ?? "");
    setSelectedTemplateId(data.templates[0]?.id ?? "");
  }, [modal]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!ready || !data.cards.length) return;
    try {
      const stored = localStorage.getItem("bonjour-backup-clock");
      if (stored && Number.isFinite(Date.parse(stored))) {
        setBackupClock(stored);
      } else {
        const stamp = new Date().toISOString();
        localStorage.setItem("bonjour-backup-clock", stamp);
        setBackupClock(stamp);
      }
      setBackupDismissed(localStorage.getItem("bonjour-backup-dismissed"));
    } catch {
      setBackupClock(null);
      setBackupDismissed(null);
    }
  }, [ready, data.cards.length]);
  function queueCloudTask(task: () => Promise<void>) {
    const run = cloudQueue.current.catch(() => undefined).then(task);
    cloudQueue.current = run.catch(() => undefined);
    return run;
  }
  async function firstCloudSync(userId: string) {
    const client = supabase;
    if (!client) return;
    setCloudState("syncing");
    try {
      await queueCloudTask(async () => {
        const local = dataRef.current;
        const remote = await loadCloudData(client, userId);
        const knownUser = localFlag(CLOUD_USER_KEY);
        const hasUnsyncedChanges = localFlag(CLOUD_DIRTY_KEY) === "true";

        if (!remote || hasUnsyncedChanges) {
          await saveCloudData(client, userId, local);
        } else {
          const next = dataIsEmpty(local)
            ? remote
            : knownUser === userId
              ? remote
              : mergeData(remote, local);
          await writeData(next);
          dataRef.current = next;
          setData(next);
          if (knownUser !== userId) await saveCloudData(client, userId, next);
        }

        setLocalFlag(CLOUD_USER_KEY, userId);
        setLocalFlag(CLOUD_DIRTY_KEY, "false");
      });
      setCloudState("synced");
    } catch {
      setCloudState(navigator.onLine ? "error" : "offline");
      setNotice(
        navigator.onLine
          ? "Nu am putut sincroniza cu Supabase. Datele locale sunt în siguranță."
          : "Ești offline. Modificările se vor sincroniza când revine internetul.",
      );
    }
  }
  function enqueueCloudSave(next: Data, showNotice = false) {
    const currentSession = sessionRef.current;
    const client = supabase;
    if (!client || !currentSession) return;
    const revision = ++cloudRevision.current;
    setLocalFlag(CLOUD_DIRTY_KEY, "true");
    setCloudState(navigator.onLine ? "syncing" : "offline");
    void queueCloudTask(async () => {
      await saveCloudData(client, currentSession.user.id, next);
      if (revision === cloudRevision.current) {
        setLocalFlag(CLOUD_USER_KEY, currentSession.user.id);
        setLocalFlag(CLOUD_DIRTY_KEY, "false");
        setCloudState("synced");
        if (showNotice) setNotice("Biblioteca este sincronizată cu Supabase.");
      }
    }).catch(() => {
      setCloudState(navigator.onLine ? "error" : "offline");
      if (showNotice)
        setNotice(
          "Sincronizarea nu a reușit. Datele sunt păstrate local și poți încerca din nou.",
        );
    });
  }
  async function sendMagicLink(email: string) {
    if (!supabase) return;
    if (!email) {
      setNotice("Emailul acestui cont nu este configurat încă.");
      return;
    }
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
          shouldCreateUser: false,
        },
      });
      if (error) throw error;
      setNotice(
        "Dacă adresa este autorizată, vei primi un magic link. Deschide-l pe acest dispozitiv.",
      );
    } catch {
      setNotice(
        "Magic linkul nu a putut fi trimis. Verifică emailul și setările Supabase.",
      );
    } finally {
      setAuthBusy(false);
    }
  }
  async function signOut() {
    if (!supabase) return;
    setAuthBusy(true);
    const { error } = await supabase.auth.signOut();
    setAuthBusy(false);
    if (error) {
      setNotice("Deconectarea nu a reușit.");
      return;
    }
    setNotice("Te-ai deconectat. Datele locale rămân pe dispozitiv.");
  }
  function syncNow() {
    if (!session) return;
    enqueueCloudSave(dataRef.current, true);
  }
  async function refreshUsage() {
    const fallback = localUsage(dataRef.current);
    const client = supabase;
    const currentSession = sessionRef.current;
    if (!client || !currentSession) {
      setUsage({ status: "ready", summary: fallback });
      return;
    }

    setUsage({ status: "loading", summary: fallback });
    try {
      const summary = await loadSharedUsage(client, dataRef.current);
      setUsage({ status: "ready", summary });
    } catch {
      setUsage({ status: "error", summary: fallback });
    }
  }
  function openUsage() {
    setModal({ kind: "usage" });
    void refreshUsage();
  }
  async function generateWithAI() {
    const client = supabase;
    const template = data.templates.find(
      (item) => item.id === selectedTemplateId,
    );
    const input = aiInput.trim();
    if (!client || !sessionRef.current) {
      setNotice("Conectează-te pentru a folosi Gemini.");
      return;
    }
    if (!template) {
      setNotice("Alege sau creează un template.");
      return;
    }
    if (!input) {
      setNotice("Scrie cuvântul sau expresia de generat.");
      return;
    }
    if (!navigator.onLine) {
      setNotice("Generarea AI are nevoie de conexiune la internet.");
      return;
    }

    setAiBusy(true);
    try {
      const generated = await generateCard(client, input, template);
      setCardDraft({ front: generated.front, back: generated.back });
      setNotice("Card generat. Verifică textul înainte de salvare.");
      void refreshUsage();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Generarea nu a reușit.",
      );
    } finally {
      setAiBusy(false);
    }
  }
  async function commit(next: Data) {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    try {
      await writeData(next);
      dataRef.current = next;
      setData(next);
      if (supabaseConfigured && localFlag(CLOUD_USER_KEY))
        setLocalFlag(CLOUD_DIRTY_KEY, "true");
      enqueueCloudSave(next);
      return true;
    } catch {
      setNotice(
        "Salvarea a eșuat. Modificarea nu a fost aplicată. Exportă datele și verifică spațiul disponibil.",
      );
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  const deck = data.decks.find((d) => d.id === deckId),
    cards = data.cards.filter((c) => c.deckId === deckId),
    available = deckId ? queue(data, deckId, now) : [],
    current = study
      ? freePractice || testMode
        ? cards.find((c) => c.id === practiceIds[done])
        : (cards.find((c) => c.id === studyId) ?? available[0])
      : undefined;
  useEffect(() => {
    if (study && !freePractice && !testMode && current && !studyId)
      setStudyId(current.id);
  }, [study, freePractice, testMode, current?.id, studyId]);
  const studiedToday = data.reviews.filter(
    (r) => dayKey(new Date(r.at)) === dayKey(now),
  );
  const dueCount = data.decks.reduce(
    (n, d) => n + queue(data, d.id, now).length,
    0,
  );
  const visible = cards.filter(
    (c) =>
      (filter === "all" ||
        (filter === "new"
          ? c.schedule.state === State.New
          : filter === "due"
            ? c.schedule.state !== State.New && c.schedule.due <= now
            : c.schedule.state !== State.New)) &&
      normalize(`${c.front} ${c.back}`).includes(normalize(search)),
  );
  const fixedSession = freePractice || testMode;
  const preview =
    current && !fixedSession
      ? outcomes(current, data.settings.retention, now)
      : null;
  const showBackupReminder = backupReminderVisible(
    backupClock,
    backupDismissed,
    now,
    data.cards.length > 0,
  );
  const storageStatus = saving
    ? "Se salvează local…"
    : cloudState === "syncing"
      ? "Se sincronizează…"
      : cloudState === "synced"
        ? "Salvat local și în cloud"
        : cloudState === "offline"
          ? "Offline · salvat local"
          : cloudState === "error"
            ? "Cloud indisponibil · salvat local"
            : cloudState === "signed-out"
              ? "Salvat local · cloud deconectat"
              : "Salvat pe acest dispozitiv";
  function openDeck(id: string) {
    setDeckId(id);
    setSearch("");
    setFilter("all");
    setStudy(false);
  }
  function startStudy() {
    setNow(new Date());
    setStudyId(available[0]?.id ?? null);
    setFreePractice(false);
    setTestMode(false);
    setPracticeIds([]);
    setQuizAnswer("");
    setQuizResult(null);
    setQuizCorrect(0);
    setStudy(true);
    setRevealed(false);
    setDone(0);
    setTotal(available.length);
    setUndo(null);
  }
  function startFreePractice() {
    if (!deckId) return;
    const practiceCards = shuffledDeckCards(data, deckId);
    setNow(new Date());
    setStudyId(null);
    setFreePractice(true);
    setTestMode(false);
    setPracticeIds(practiceCards.map((card) => card.id));
    setQuizAnswer("");
    setQuizResult(null);
    setQuizCorrect(0);
    setStudy(true);
    setRevealed(false);
    setDone(0);
    setTotal(practiceCards.length);
    setUndo(null);
  }
  function nextPracticeCard() {
    setDone((count) => count + 1);
    setRevealed(false);
  }
  function startTest() {
    if (!deckId) return;
    const testCards = shuffledDeckCards(data, deckId);
    setNow(new Date());
    setStudyId(null);
    setFreePractice(false);
    setTestMode(true);
    setPracticeIds(testCards.map((card) => card.id));
    setQuizAnswer("");
    setQuizResult(null);
    setQuizCorrect(0);
    setStudy(true);
    setRevealed(false);
    setDone(0);
    setTotal(testCards.length);
    setUndo(null);
  }
  function checkQuizAnswer(event: FormEvent) {
    event.preventDefault();
    if (!current || quizResult || !quizAnswer.trim()) return;
    const correct = quizAnswerCorrect(quizAnswer, current.front);
    setQuizResult(correct ? "correct" : "incorrect");
    if (correct) setQuizCorrect((count) => count + 1);
  }
  function nextQuizQuestion() {
    setDone((count) => count + 1);
    setQuizAnswer("");
    setQuizResult(null);
  }
  async function answer(
    r: Rating.Again | Rating.Hard | Rating.Good | Rating.Easy,
  ) {
    if (!current) return;
    const previous = data;
    if (await commit(grade(data, current.id, r, new Date()))) {
      setUndo(previous);
      setStudyId(null);
      setDone((n) => n + 1);
      setRevealed(false);
      setNow(new Date());
    }
  }
  async function undoReview() {
    if (!undo) return;
    const last = data.reviews.at(-1);
    const prior = undo.cards.find((c) => c.id === last?.cardId);
    const next = {
      ...data,
      cards: data.cards.map((c) =>
        c.id === prior?.id ? { ...c, schedule: prior.schedule } : c,
      ),
      reviews: data.reviews.filter((r) => r.id !== last?.id),
    };
    if (await commit(next)) {
      setStudyId(prior?.id ?? null);
      setUndo(null);
      setDone((n) => Math.max(0, n - 1));
      setRevealed(false);
      setNow(new Date());
    }
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bonjour-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const stamp = new Date().toISOString();
    try {
      localStorage.setItem("bonjour-backup-clock", stamp);
      localStorage.removeItem("bonjour-backup-dismissed");
    } catch {
      // Backupul rămâne disponibil chiar dacă stocarea reminderului nu este permisă.
    }
    setBackupClock(stamp);
    setBackupDismissed(null);
    setNotice("Backup pregătit. Salvează fișierul în Files.");
  }
  function dismissBackupReminder() {
    if (!backupClock) return;
    try {
      localStorage.setItem("bonjour-backup-dismissed", backupClock);
    } catch {
      // Reminderul poate fi închis pentru sesiunea curentă.
    }
    setBackupDismissed(backupClock);
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024)
        throw Error("Fișierul depășește 25 MB.");
      const next = parseData(JSON.parse(await file.text()));
      if (
        !window.confirm(
          `Înlocuiești datele locale cu ${next.decks.length} deck-uri și ${next.cards.length} carduri? Exportă întâi datele actuale dacă vrei să le păstrezi.`,
        )
      )
        return;
      if (await commit(next)) {
        setDeckId(null);
        setStudy(false);
        setModal(null);
        setNotice("Backup importat cu succes.");
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Backup invalid.");
    } finally {
      if (importer.current) importer.current.value = "";
    }
  }
  async function saveForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (modal?.kind === "deck") {
      const name = String(f.get("name")).trim(),
        description = String(f.get("description")).trim();
      if (!name) {
        setNotice("Completează numele deck-ului.");
        return;
      }
      const d = modal.deck
        ? { ...modal.deck, name, description }
        : { id: uid(), name, description, created: new Date().toISOString() };
      if (
        await commit({
          ...data,
          decks: modal.deck
            ? data.decks.map((x) => (x.id === d.id ? d : x))
            : [...data.decks, d],
        })
      ) {
        setModal(null);
        openDeck(d.id);
      }
    } else if (modal?.kind === "card" && deckId) {
      const front = normalizeCardText(String(f.get("front"))),
        back = normalizeCardText(String(f.get("back")));
      if (!front || !back) {
        setNotice("Completează frontul și backul cardului.");
        return;
      }
      const card = modal.card
        ? { ...modal.card, front, back }
        : newCard(deckId, front, back);
      if (
        await commit({
          ...data,
          cards: modal.card
            ? data.cards.map((c) => (c.id === card.id ? card : c))
            : [...data.cards, card],
        })
      ) {
        setModal(null);
        setNotice(modal.card ? "Card actualizat." : "Card adăugat.");
      }
    } else if (modal?.kind === "template") {
      const name = String(f.get("name")).trim();
      const frontPrompt = String(f.get("frontPrompt")).trim();
      const backPrompt = String(f.get("backPrompt")).trim();
      if (!name || !frontPrompt || !backPrompt) {
        setNotice("Completează numele și ambele prompturi.");
        return;
      }
      const template = modal.template
        ? { ...modal.template, name, frontPrompt, backPrompt }
        : {
            id: uid(),
            name,
            frontPrompt,
            backPrompt,
            created: new Date().toISOString(),
          };
      if (
        await commit({
          ...data,
          templates: modal.template
            ? data.templates.map((item) =>
                item.id === template.id ? template : item,
              )
            : [...data.templates, template],
        })
      ) {
        setSelectedTemplateId(template.id);
        setModal({ kind: "templates" });
        setNotice(modal.template ? "Template actualizat." : "Template creat.");
      }
    } else if (modal?.kind === "settings") {
      const newPerDay = Number(f.get("newPerDay")),
        retention = Number(f.get("retention")) / 100;
      if (await commit({ ...data, settings: { newPerDay, retention } })) {
        setModal(null);
        setNotice("Setări salvate.");
      }
    }
  }
  async function remove() {
    if (modal?.kind !== "delete") return;
    let next = data;
    if (modal.target === "deck")
      next = {
        ...data,
        decks: data.decks.filter((d) => d.id !== modal.id),
        cards: data.cards.filter((c) => c.deckId !== modal.id),
        reviews: data.reviews.filter((r) => r.deckId !== modal.id),
      };
    else if (modal.target === "card")
      next = {
        ...data,
        cards: data.cards.filter((c) => c.id !== modal.id),
        reviews: data.reviews.filter((r) => r.cardId !== modal.id),
      };
    else if (modal.target === "template")
      next = {
        ...data,
        templates: data.templates.filter(
          (template) => template.id !== modal.id,
        ),
      };
    else
      next = {
        ...data,
        cards: data.cards.map((c) =>
          c.deckId === modal.id ? newCardWithId(c) : c,
        ),
        reviews: data.reviews.filter((r) => r.deckId !== modal.id),
      };
    if (await commit(next)) {
      if (modal.target === "deck") setDeckId(null);
      setModal(modal.target === "template" ? { kind: "templates" } : null);
      setNotice(modal.target === "reset" ? "Progres resetat." : "Șters.");
    }
  }
  if (fatal)
    return (
      <main className="loading">
        <BookOpen size={40} />
        <h1>Nu putem deschide biblioteca</h1>
        <p>{fatal}</p>
        <button className="primary" onClick={() => location.reload()}>
          Reîncearcă
        </button>
      </main>
    );
  if (!ready || !authReady)
    return (
      <main className="loading">
        <BookOpen size={40} />
        <p>Deschidem biblioteca ta…</p>
      </main>
    );
  if (supabaseConfigured && !session)
    return (
      <main className="auth-screen">
        <section className="auth-card" aria-labelledby="auth-title">
          <a className="brand auth-brand" href="#">
            <span className="brand-icon">
              <Layers size={22} />
            </span>
            bonjour<span className="brand-dot">.</span>
          </a>
          <div className="auth-cloud-icon">
            <Cloud size={24} />
          </div>
          <div className="eyebrow">BIBLIOTECĂ PRIVATĂ</div>
          <h1 id="auth-title">Alege contul.</h1>
          <p>
            Selectează contul și vei primi un magic link pe email. Nu ai nevoie
            de parolă.
          </p>
          <div className="account-buttons">
            {allowedAccounts.map((account) => (
              <button
                type="button"
                className="account-button"
                key={account.label}
                disabled={authBusy || !account.email}
                onClick={() => void sendMagicLink(account.email)}
              >
                <span className="account-avatar">
                  {account.label.replace("Cont ", "").charAt(0)}
                </span>
                <span>
                  <strong>{account.label}</strong>
                  <small>
                    {account.email ? "Primește magic link" : "În curând"}
                  </small>
                </span>
                <Mail size={18} />
              </button>
            ))}
          </div>
          <small>
            Dacă adresa nu este pe lista autorizată, nu va fi creat un cont și
            nu va primi acces.
          </small>
        </section>
        {notice && (
          <div className="toast" role="status">
            {notice}
            <button
              className="icon small"
              aria-label="Închide mesajul"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setDeckId(null);
            setStudy(false);
          }}
        >
          <span className="brand-icon">
            <Layers size={22} />
          </span>
          bonjour<span className="brand-dot">.</span>
        </a>
        <div className="sidebar-caption">SPAȚIUL TĂU DE ÎNVĂȚARE</div>
        <button
          className={!deck ? "nav active" : "nav"}
          onClick={() => {
            setDeckId(null);
            setStudy(false);
          }}
        >
          <BookOpen size={19} /> Biblioteca mea <span>{data.decks.length}</span>
        </button>
        <div className="sidebar-caption decks-caption">
          DECK-URILE TALE
          <button
            className="icon small"
            aria-label="Creează deck"
            onClick={() => setModal({ kind: "deck" })}
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="deck-nav">
          {data.decks.map((d) => (
            <button
              key={d.id}
              className={`nav ${d.id === deckId ? "selected" : ""}`}
              onClick={() => openDeck(d.id)}
            >
              <span className="mini-dot" />
              {d.name}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="daily-note">
            <span>UN PETIT PAS, CHAQUE JOUR.</span>
            <p>
              Puțin azi.
              <br />
              Mai mult decât ieri.
            </p>
            <div className="note-line" />
          </div>
          <button
            className="nav"
            onClick={() => setModal({ kind: "templates" })}
          >
            <FileText size={19} /> Template-uri
            <span>{data.templates.length}</span>
          </button>
          <button className="nav" onClick={openUsage}>
            <BarChart3 size={19} /> Usage
          </button>
          <button
            className="nav"
            onClick={() => setModal({ kind: "settings" })}
          >
            <Settings size={19} /> Setări
          </button>
          <div className={`local-status cloud-${cloudState}`}>
            <span />
            {storageStatus}
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Biblioteca mea{" "}
            {deck && (
              <>
                <ChevronRight size={14} />
                <span>{deck.name}</span>
              </>
            )}
          </span>
          <a
            className="mobile-brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setDeckId(null);
              setStudy(false);
            }}
          >
            bonjour.
          </a>
          <div className="top-actions">
            <span className="language">
              <i /> FRANCEZĂ
            </span>
            <button className="icon" aria-label="Usage" onClick={openUsage}>
              <BarChart3 size={20} />
            </button>
            <button
              className="icon"
              aria-label="Setări"
              onClick={() => setModal({ kind: "settings" })}
            >
              <Settings size={20} />
            </button>
          </div>
        </header>
        <main>
          {!deck ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">ÎN RITMUL TĂU</div>
                  <h1>
                    Un cuvânt în plus.
                    <br />
                    <span>În fiecare zi.</span>
                  </h1>
                  <p>Un loc pentru cuvintele pe care vrei să le păstrezi.</p>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="art-card back-card">Aa</div>
                  <div className="art-card front-card">
                    <span>bonjour</span>
                    <small>/bɔ̃.ʒuʁ/</small>
                    <div>↗</div>
                  </div>
                  <span className="spark">✳</span>
                </div>
              </div>
              <section className="stats">
                <div>
                  <span className="stat-label">De studiat astăzi</span>
                  <strong>
                    {dueCount}
                    <span className="stat-dot" />
                  </strong>
                  <small>carduri pregătite pentru tine</small>
                </div>
                <div>
                  <span className="stat-label">Recapitulări astăzi</span>
                  <strong>{studiedToday.length}</strong>
                  <small>fiecare repetare contează</small>
                </div>
                <div>
                  <span className="stat-label">Colecția ta</span>
                  <strong>{data.cards.length}</strong>
                  <small>cuvinte și expresii</small>
                </div>
              </section>
              <div className="section-heading">
                <h2>
                  Deck-urile mele <span>{data.decks.length}</span>
                </h2>
                <button
                  className="primary"
                  onClick={() => setModal({ kind: "deck" })}
                >
                  <Plus size={18} /> Deck nou
                </button>
              </div>
              {data.decks.length === 0 ? (
                <section className="empty-state">
                  <div className="empty-icon">
                    <FolderPlus size={30} />
                  </div>
                  <h2>Primul tău cuvânt începe aici.</h2>
                  <p>
                    Creează un deck pentru vocabular, verbe sau expresii.
                    <br />
                    Adaugă câteva carduri și revino în fiecare zi.
                  </p>
                  <button
                    className="primary"
                    onClick={() => setModal({ kind: "deck" })}
                  >
                    <Plus size={18} /> Creează primul deck
                  </button>
                </section>
              ) : (
                <div className="deck-grid">
                  {data.decks.map((d, i) => {
                    const dc = data.cards.filter((c) => c.deckId === d.id),
                      learned = dc.filter(
                        (c) => c.schedule.state !== State.New,
                      ).length,
                      count = queue(data, d.id, now).length;
                    return (
                      <button
                        className="deck-tile"
                        key={d.id}
                        onClick={() => openDeck(d.id)}
                      >
                        <div className="tile-top">
                          <span className={`deck-symbol color-${i % 3}`}>
                            <Layers size={24} />
                          </span>
                          <span className={`pill ${count ? "green" : ""}`}>
                            {count ? `${count} de studiat` : "La zi"}
                          </span>
                        </div>
                        <h3>{d.name}</h3>
                        <p>
                          {d.description ||
                            "Câte un cuvânt, câte un pas înainte."}
                        </p>
                        <div className="tile-progress">
                          <span
                            style={{
                              width: `${dc.length ? (learned / dc.length) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <div className="tile-bottom">
                          <span>
                            {dc.length} {dc.length === 1 ? "card" : "carduri"} ·{" "}
                            {learned} începute
                          </span>
                          <ArrowRight size={19} />
                        </div>
                      </button>
                    );
                  })}
                  <button
                    className="add-tile"
                    onClick={() => setModal({ kind: "deck" })}
                  >
                    <Plus size={26} />
                    <span>Un nou început</span>
                    <small>Creează un deck</small>
                  </button>
                </div>
              )}
              <footer>
                Fă loc unui mic obicei bun. <span>À bientôt.</span>
              </footer>
            </>
          ) : study ? (
            <>
              <div className="study-top">
                <button className="text-button" onClick={() => setStudy(false)}>
                  <ArrowLeft size={17} /> Înapoi la deck
                </button>
                <span>
                  {done}{" "}
                  {testMode
                    ? done === 1
                      ? "întrebare"
                      : "întrebări"
                    : freePractice
                      ? done === 1
                        ? "card"
                        : "carduri"
                      : done === 1
                        ? "răspuns"
                        : "răspunsuri"}{" "}
                  în sesiune
                </span>
              </div>
              <div
                className="session-progress"
                role="progressbar"
                aria-label="Progresul sesiunii"
                aria-valuemin={0}
                aria-valuemax={Math.max(
                  1,
                  fixedSession
                    ? total
                    : Math.max(total, done + available.length),
                )}
                aria-valuenow={done}
              >
                <span
                  style={{
                    width: `${(done / Math.max(1, fixedSession ? total : Math.max(total, done + available.length))) * 100}%`,
                  }}
                />
              </div>
              {current ? (
                <div className="study-area">
                  <div className="eyebrow">
                    {deck.name} ·{" "}
                    {testMode
                      ? "TEST ROMÂNĂ → FRANCEZĂ"
                      : freePractice
                        ? "REPETIȚIE LIBERĂ"
                        : labels[current.schedule.state]}{" "}
                    · NIVEL {masteryLevel(current.schedule)}/9
                  </div>
                  {testMode ? (
                    <article
                      className={`study-card quiz-card ${quizResult ?? ""}`}
                    >
                      <span className="card-side">
                        ROMÂNĂ · TRADU ÎN FRANCEZĂ
                      </span>
                      <h2>{quizPrompt(current.back)}</h2>
                      <form className="quiz-form" onSubmit={checkQuizAnswer}>
                        <label htmlFor="quiz-answer">
                          Scrie cuvântul împreună cu articolul
                        </label>
                        <input
                          id="quiz-answer"
                          autoFocus
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          disabled={quizResult !== null}
                          value={quizAnswer}
                          onChange={(event) =>
                            setQuizAnswer(event.target.value)
                          }
                          placeholder="de exemplu: la chaise"
                        />
                        {quizResult ? (
                          <>
                            <div className={`quiz-feedback ${quizResult}`}>
                              {quizResult === "correct" ? (
                                <Check size={25} />
                              ) : (
                                <X size={25} />
                              )}
                              <div>
                                <strong>
                                  {quizResult === "correct"
                                    ? "Corect!"
                                    : "Nu încă."}
                                </strong>
                                {quizResult === "incorrect" && (
                                  <span>
                                    Răspunsul corect: <b>{current.front}</b>
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="primary quiz-next"
                              onClick={nextQuizQuestion}
                            >
                              Următorul cuvânt <ArrowRight size={19} />
                            </button>
                          </>
                        ) : (
                          <button
                            type="submit"
                            className="primary quiz-check"
                            disabled={!quizAnswer.trim()}
                          >
                            Verifică răspunsul
                          </button>
                        )}
                      </form>
                    </article>
                  ) : (
                    <>
                      <article className="study-card">
                        <span className="card-side">FRONT · FRANCEZĂ</span>
                        <h2>{current.front}</h2>
                        {revealed && (
                          <div className="answer">
                            <span className="card-side">
                              BACK · ROMÂNĂ ȘI EXEMPLE
                            </span>
                            <p>{current.back}</p>
                          </div>
                        )}
                        {!revealed && (
                          <span className="card-hint">
                            Amintește-ți răspunsul înainte să întorci cardul.
                          </span>
                        )}
                      </article>
                      {!revealed ? (
                        <button
                          className="primary reveal"
                          onClick={() => setRevealed(true)}
                        >
                          Arată răspunsul <ArrowRight size={19} />
                        </button>
                      ) : freePractice ? (
                        <button
                          className="primary reveal"
                          onClick={nextPracticeCard}
                        >
                          Următorul card <ArrowRight size={19} />
                        </button>
                      ) : (
                        <>
                          <p className="rating-prompt">
                            Cât de ușor ți-ai amintit?
                          </p>
                          <div className="ratings">
                            {(
                              [
                                {
                                  r: Rating.Again,
                                  title: "Again",
                                  hint: "Nu am știut",
                                  cls: "again",
                                },
                                {
                                  r: Rating.Hard,
                                  title: "Hard",
                                  hint: "Cu dificultate",
                                  cls: "hard",
                                },
                                {
                                  r: Rating.Good,
                                  title: "Good",
                                  hint: "Am știut",
                                  cls: "good",
                                },
                                {
                                  r: Rating.Easy,
                                  title: "Easy",
                                  hint: "Foarte ușor",
                                  cls: "easy",
                                },
                              ] as const
                            ).map((x) => (
                              <button
                                disabled={saving}
                                className={x.cls}
                                key={x.r}
                                onClick={() => answer(x.r)}
                                title={x.hint}
                              >
                                <strong>{x.title}</strong>
                                <span>
                                  {preview &&
                                    interval(preview[x.r].card.due, now)}
                                </span>
                              </button>
                            ))}
                          </div>
                          <p className="study-help">
                            Ai uitat? Alege Again. Hard înseamnă că ți-ai
                            amintit, cu efort.
                          </p>
                        </>
                      )}
                    </>
                  )}
                  {!testMode && !freePractice && undo && (
                    <button
                      className="text-button undo"
                      disabled={saving}
                      onClick={undoReview}
                    >
                      Anulează ultimul răspuns
                    </button>
                  )}
                </div>
              ) : (
                <div className="empty-state session-complete">
                  <div className="empty-icon">
                    <Check size={32} />
                  </div>
                  <div className="eyebrow">BIEN JOUÉ !</div>
                  <h1>
                    {testMode
                      ? "Test încheiat."
                      : freePractice
                        ? "Repetiție încheiată."
                        : done
                          ? "Un pas înainte."
                          : "Ești la zi."}
                  </h1>
                  <p>
                    {testMode
                      ? `Ai răspuns corect la ${quizCorrect} din ${total} cuvinte. Testul nu a modificat programarea FSRS.`
                      : freePractice
                        ? `Ai repetat ${done} ${done === 1 ? "card" : "carduri"} fără să modifici programarea FSRS.`
                        : done
                          ? `Ai dat ${done} ${done === 1 ? "răspuns" : "răspunsuri"} în această sesiune.`
                          : "Nu ai carduri disponibile chiar acum."}
                    {!fixedSession && (
                      <>
                        <br />
                        {nextDue(cards, now)}
                      </>
                    )}
                  </p>
                  <button className="primary" onClick={() => setStudy(false)}>
                    Înapoi la deck <ArrowRight size={18} />
                  </button>
                  {!testMode && !freePractice && undo && (
                    <button className="text-button" onClick={undoReview}>
                      Anulează ultimul răspuns
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <button
                className="text-button back-link"
                onClick={() => setDeckId(null)}
              >
                <ArrowLeft size={17} /> Toate deck-urile
              </button>
              <div className="deck-heading">
                <div>
                  <div className="eyebrow">COLECȚIA TA DE FRANCEZĂ</div>
                  <h1>{deck.name}</h1>
                  <p>
                    {deck.description || "Câte un cuvânt, câte un pas înainte."}
                  </p>
                </div>
                <button
                  className="icon bordered"
                  aria-label="Editează deck"
                  onClick={() => setModal({ kind: "deck", deck })}
                >
                  <Edit3 size={19} />
                </button>
              </div>
              <section className="deck-overview">
                <div
                  className="donut"
                  style={
                    {
                      "--progress": `${cards.length ? (cards.filter((c) => c.schedule.state !== State.New).length / cards.length) * 100 : 0}%`,
                    } as React.CSSProperties
                  }
                >
                  <div>
                    <strong>{available.length}</strong>
                    <span>pentru azi</span>
                  </div>
                </div>
                <div className="overview-text">
                  <h2>Puțină practică. Mult progres.</h2>
                  <p>
                    {available.length
                      ? "Cardurile tale sunt pregătite pentru o nouă rundă."
                      : "Adaugă carduri noi sau revino la următoarea recapitulare."}
                  </p>
                  <div className="legend">
                    <span>
                      <i className="new-dot" />
                      {
                        cards.filter((c) => c.schedule.state === State.New)
                          .length
                      }{" "}
                      noi
                    </span>
                    <span>
                      <i />
                      {
                        cards.filter((c) => c.schedule.state !== State.New)
                          .length
                      }{" "}
                      începute
                    </span>
                  </div>
                </div>
                <div className="study-actions">
                  <button
                    className="primary study-button"
                    disabled={!available.length}
                    onClick={startStudy}
                  >
                    <GraduationCap size={20} /> Studiază azi{" "}
                    <ArrowRight size={18} />
                  </button>
                  <button
                    className="secondary practice-button"
                    disabled={!cards.length}
                    onClick={startFreePractice}
                  >
                    Repetă liber
                  </button>
                  <button
                    className="secondary test-button"
                    disabled={!cards.length}
                    onClick={startTest}
                  >
                    Test RO → FR
                  </button>
                </div>
              </section>
              <div className="section-heading">
                <h2>
                  Carduri <span>{cards.length}</span>
                </h2>
                <button
                  className="primary"
                  onClick={() => setModal({ kind: "card" })}
                >
                  <Plus size={18} /> Card nou
                </button>
              </div>
              <div className="list-controls">
                <label className="search">
                  <Search size={20} />
                  <input
                    aria-label="Caută carduri"
                    placeholder="Caută un cuvânt sau o expresie…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      className="icon small"
                      aria-label="Șterge căutarea"
                      onClick={() => setSearch("")}
                    >
                      <X size={16} />
                    </button>
                  )}
                </label>
                <select
                  aria-label="Filtrează carduri"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Toate cardurile</option>
                  <option value="new">Noi</option>
                  <option value="due">De repetat acum</option>
                  <option value="learning">Începute</option>
                </select>
              </div>
              {!visible.length ? (
                <div className="empty-state compact">
                  <BookOpen size={30} />
                  <h2>
                    {cards.length
                      ? "Niciun card găsit."
                      : "Un deck plin de posibilități."}
                  </h2>
                  <p>
                    {cards.length
                      ? "Încearcă alt cuvânt sau schimbă filtrul."
                      : "Adaugă primul card, cu un cuvânt în față și traducerea pe spate."}
                  </p>
                  {!cards.length && (
                    <button
                      className="text-button"
                      onClick={() => setModal({ kind: "card" })}
                    >
                      Adaugă primul card <Plus size={17} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="card-list">
                  {visible.map((c) => (
                    <article className="word-card" key={c.id}>
                      <button
                        className="word-content"
                        onClick={() => setModal({ kind: "card", card: c })}
                      >
                        <div className="word-meta">
                          <span className="word-status">
                            <i
                              className={
                                c.schedule.state === State.New ? "new-dot" : ""
                              }
                            />
                            {labels[c.schedule.state]}
                            {c.schedule.state !== State.New &&
                              ` · ${c.schedule.due <= now ? "disponibil acum" : new Intl.DateTimeFormat("ro", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(c.schedule.due)}`}
                          </span>
                          <span className="mastery-badge">
                            Nivel {masteryLevel(c.schedule)}/9
                          </span>
                        </div>
                        <h3>{c.front}</h3>
                        <p>{c.back}</p>
                      </button>
                      <div className="word-actions">
                        <button
                          className="icon"
                          aria-label={`Editează ${c.front}`}
                          onClick={() => setModal({ kind: "card", card: c })}
                        >
                          <Edit3 size={17} />
                        </button>
                        <button
                          className="icon delete-icon"
                          aria-label={`Șterge ${c.front}`}
                          onClick={() =>
                            setModal({
                              kind: "delete",
                              target: "card",
                              id: c.id,
                              name: c.front,
                            })
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <input
        ref={importer}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => importBackup(e.target.files?.[0])}
      />
      {showBackupReminder && (
        <div className="backup-reminder" role="alert">
          <div className="backup-reminder-copy">
            <strong>E timpul pentru un backup.</strong>
            <span>Au trecut 7 zile. Păstrează biblioteca în Files.</span>
          </div>
          <button className="primary" onClick={exportBackup}>
            <Download size={17} /> Exportă backup
          </button>
          <button
            className="icon"
            aria-label="Închide reminderul"
            onClick={dismissBackupReminder}
          >
            <X size={20} />
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="dialog-title"
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget && !saving) setModal(null);
        }}
      >
        <div className="dialog-content">
          <div className="dialog-header">
            <h2 id="dialog-title">
              {modal?.kind === "deck"
                ? modal.deck
                  ? "Editează deck-ul"
                  : "Un deck nou"
                : modal?.kind === "card"
                  ? modal.card
                    ? "Editează cardul"
                    : "Un cuvânt nou"
                  : modal?.kind === "usage"
                    ? "Usage"
                    : modal?.kind === "templates"
                      ? "Template-uri AI"
                      : modal?.kind === "template"
                        ? modal.template
                          ? "Editează template-ul"
                          : "Template nou"
                        : modal?.kind === "settings"
                          ? "Setările tale"
                          : modal?.kind === "delete" && modal.target === "reset"
                            ? "Resetezi progresul?"
                            : "Confirmă ștergerea"}
            </h2>
            <button
              className="icon"
              aria-label="Închide"
              disabled={saving}
              onClick={() => setModal(null)}
            >
              <X size={22} />
            </button>
          </div>
          {notice && (
            <p role="status" className="settings-note">
              {notice}
            </p>
          )}
          <form
            key={
              modal?.kind +
              (modal?.kind === "card"
                ? (modal.card?.id ?? "new")
                : modal?.kind === "deck"
                  ? (modal.deck?.id ?? "new")
                  : "")
            }
            onSubmit={saveForm}
          >
            {modal?.kind === "deck" && (
              <>
                <label className="field">
                  Numele deck-ului
                  <input
                    name="name"
                    required
                    autoFocus
                    maxLength={80}
                    defaultValue={modal.deck?.name}
                    placeholder="Ex. Expresii de zi cu zi"
                  />
                </label>
                <label className="field">
                  Descriere <span>opțional</span>
                  <textarea
                    name="description"
                    maxLength={240}
                    defaultValue={modal.deck?.description}
                    placeholder="Ce ai vrea să înveți?"
                    rows={3}
                  />
                </label>
                <button className="primary full" disabled={saving}>
                  <Check size={18} /> Salvează deck-ul
                </button>
                {modal.deck && (
                  <div className="danger-zone">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setModal({
                          kind: "delete",
                          target: "reset",
                          id: modal.deck!.id,
                          name: modal.deck!.name,
                        })
                      }
                    >
                      Resetează progresul
                    </button>
                    <button
                      type="button"
                      className="text-button danger"
                      onClick={() =>
                        setModal({
                          kind: "delete",
                          target: "deck",
                          id: modal.deck!.id,
                          name: modal.deck!.name,
                        })
                      }
                    >
                      <Trash2 size={16} /> Șterge deck-ul
                    </button>
                  </div>
                )}
              </>
            )}
            {modal?.kind === "card" && (
              <>
                <p className="dialog-intro">
                  Un singur lucru de reținut. Un pas mai aproape.
                </p>
                {!modal.card && (
                  <section className="ai-generator">
                    <div className="ai-generator-title">
                      <Sparkles size={18} />
                      <div>
                        <strong>Generează cu Gemini</strong>
                        <span>Folosește unul dintre template-urile tale.</span>
                      </div>
                    </div>
                    {data.templates.length ? (
                      <>
                        <label className="field compact">
                          Template
                          <select
                            value={selectedTemplateId}
                            onChange={(event) =>
                              setSelectedTemplateId(event.target.value)
                            }
                          >
                            {data.templates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field compact">
                          Cuvânt sau expresie în franceză
                          <input
                            value={aiInput}
                            onChange={(event) => setAiInput(event.target.value)}
                            maxLength={500}
                            placeholder="Ex. chat"
                          />
                        </label>
                        <button
                          type="button"
                          className="ai-generate-button"
                          disabled={aiBusy}
                          onClick={() => void generateWithAI()}
                        >
                          <Sparkles size={17} />
                          {aiBusy ? "Gemini generează…" : "Generează cardul"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="secondary full"
                        onClick={() => setModal({ kind: "template" })}
                      >
                        <Plus size={17} /> Creează primul template
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-button manage-templates"
                      onClick={() => setModal({ kind: "templates" })}
                    >
                      Gestionează template-urile
                    </button>
                  </section>
                )}
                <label className="field">
                  Front <span>cuvântul sau expresia în franceză</span>
                  <textarea
                    name="front"
                    required
                    autoFocus={!data.templates.length || Boolean(modal.card)}
                    maxLength={2000}
                    value={cardDraft.front}
                    onChange={(event) =>
                      setCardDraft((draft) => ({
                        ...draft,
                        front: event.target.value,
                      }))
                    }
                    placeholder="Ex. chat"
                    rows={3}
                  />
                </label>
                <label className="field">
                  Back <span>traducerea, exemplele și conjugarea</span>
                  <textarea
                    name="back"
                    required
                    maxLength={12000}
                    value={cardDraft.back}
                    onChange={(event) =>
                      setCardDraft((draft) => ({
                        ...draft,
                        back: event.target.value,
                      }))
                    }
                    placeholder="a merge&#10;Je vais à la maison."
                    rows={6}
                  />
                </label>
                {modal.card && (
                  <p className="field-help">
                    Editarea textului păstrează istoricul de studiu.
                  </p>
                )}
                <button className="primary full" disabled={saving || aiBusy}>
                  <Check size={18} /> Salvează cardul
                </button>
              </>
            )}
            {modal?.kind === "templates" && (
              <div className="templates-view">
                <div className="templates-heading">
                  <p>
                    Prompturile descriu cum completează Gemini fața și spatele
                    cardului.
                  </p>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setModal({ kind: "template" })}
                  >
                    <Plus size={17} /> Template nou
                  </button>
                </div>
                {data.templates.length ? (
                  <div className="template-list">
                    {data.templates.map((template) => (
                      <article className="template-item" key={template.id}>
                        <div>
                          <strong>{template.name}</strong>
                          <span>{template.backPrompt}</span>
                        </div>
                        <button
                          type="button"
                          className="icon bordered"
                          aria-label={`Editează ${template.name}`}
                          onClick={() =>
                            setModal({ kind: "template", template })
                          }
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon bordered danger"
                          aria-label={`Șterge ${template.name}`}
                          onClick={() =>
                            setModal({
                              kind: "delete",
                              target: "template",
                              id: template.id,
                              name: template.name,
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="template-empty">
                    <FileText size={27} />
                    <strong>Nu ai niciun template.</strong>
                    <span>Creează unul pentru primul card generat cu AI.</span>
                  </div>
                )}
              </div>
            )}
            {modal?.kind === "template" && (
              <>
                <label className="field">
                  Numele template-ului
                  <input
                    name="name"
                    required
                    autoFocus
                    maxLength={80}
                    defaultValue={modal.template?.name ?? "Franceză → Română"}
                    placeholder="Ex. Vocabular franceză"
                  />
                </label>
                <label className="field">
                  Prompt pentru Front
                  <textarea
                    name="frontPrompt"
                    required
                    maxLength={6000}
                    rows={4}
                    defaultValue={
                      modal.template?.frontPrompt ??
                      `The input will be a French word or expression exactly as I found it in a book.

Create the front of the flashcard:
- preserve the French word or expression as written;
- if it is a noun, add the correct definite article (le, la or l') and clearly indicate its gender;
- if it has a distinct feminine form, add that form too;
- if it is not a noun, do not add an article;
- do not include the Romanian translation, examples, definitions or conjugations.

Keep the result concise.`
                    }
                  />
                </label>
                <label className="field">
                  Prompt pentru Back
                  <textarea
                    name="backPrompt"
                    required
                    maxLength={6000}
                    rows={9}
                    defaultValue={
                      modal.template?.backPrompt ??
                      `Create the back of the flashcard for the provided French word or expression.

Include:
- the correct Romanian translation;
- two short, natural example sentences in French;
- if the word is a verb, its complete conjugation in the present indicative: je, tu, il/elle/on, nous, vous, ils/elles;
- if the verb is reflexive, use the correct reflexive pronouns;
- if it is not a verb, do not include a conjugation.

Use correct French spelling, accents and grammar. Keep the result clear and concise.`
                    }
                  />
                </label>
                <button className="primary full" disabled={saving}>
                  <Check size={18} /> Salvează template-ul
                </button>
              </>
            )}
            {modal?.kind === "usage" && (
              <div className="usage-view">
                <section className="usage-highlight">
                  <span className="usage-icon">
                    <Sparkles size={22} />
                  </span>
                  <div>
                    <span>LIMITĂ ZILNICĂ COMUNĂ</span>
                    <strong>
                      {formatCount(usage.summary.aiToday)}
                      <small> / {formatCount(usage.summary.dailyLimit)}</small>
                    </strong>
                    <p>Generări Gemini folosite astăzi de Vlad și Andreea.</p>
                  </div>
                </section>
                <div
                  className="usage-progress"
                  role="progressbar"
                  aria-label="Generări Gemini folosite astăzi"
                  aria-valuemin={0}
                  aria-valuemax={usage.summary.dailyLimit}
                  aria-valuenow={usage.summary.aiToday}
                >
                  <span
                    style={{
                      width: `${usagePercent(
                        usage.summary.aiToday,
                        usage.summary.dailyLimit,
                      )}%`,
                    }}
                  />
                </div>
                <div className="usage-grid">
                  <article className="usage-card">
                    <Sparkles size={18} />
                    <span>Gemini luna aceasta</span>
                    <strong>{formatCount(usage.summary.aiThisMonth)}</strong>
                    <small>generări comune</small>
                  </article>
                  <article className="usage-card">
                    <BarChart3 size={18} />
                    <span>Tokeni Gemini</span>
                    <strong>
                      {formatCount(
                        usage.summary.inputTokensThisMonth +
                          usage.summary.outputTokensThisMonth,
                      )}
                    </strong>
                    <small>
                      {formatCount(usage.summary.inputTokensThisMonth)} input ·{" "}
                      {formatCount(usage.summary.outputTokensThisMonth)} output
                    </small>
                  </article>
                  <article className="usage-card">
                    <Database size={18} />
                    <span>Baza de date Supabase</span>
                    <strong>{formatBytes(usage.summary.databaseBytes)}</strong>
                    <small>
                      din {formatBytes(SUPABASE_DATABASE_LIMIT_BYTES)} ·{" "}
                      {formatCount(usage.summary.databaseRows)} înregistrări
                    </small>
                    <div className="usage-mini-progress">
                      <span
                        style={{
                          width: `${usagePercent(
                            usage.summary.databaseBytes,
                            SUPABASE_DATABASE_LIMIT_BYTES,
                          )}%`,
                        }}
                      />
                    </div>
                  </article>
                  <article className="usage-card">
                    <RefreshCw size={18} />
                    <span>Supabase Edge Functions</span>
                    <strong>
                      {formatCount(usage.summary.edgeInvocationsThisMonth)}
                    </strong>
                    <small>
                      din {formatCount(SUPABASE_EDGE_FUNCTION_LIMIT)} pe lună
                    </small>
                    <div className="usage-mini-progress">
                      <span
                        style={{
                          width: `${usagePercent(
                            usage.summary.edgeInvocationsThisMonth,
                            SUPABASE_EDGE_FUNCTION_LIMIT,
                          )}%`,
                        }}
                      />
                    </div>
                  </article>
                </div>
                <p className="usage-footnote">
                  {usage.summary.shared
                    ? "Total comun pentru ambele conturi. Valorile Gemini vin din răspunsurile API, iar spațiul bazei de date este o estimare a tabelelor aplicației."
                    : "Momentan vezi estimarea locală. Rulează schema Usage în Supabase pentru totalul comun al ambelor conturi."}
                </p>
                {usage.status === "error" && (
                  <p role="status" className="usage-warning">
                    Contorizarea comună nu este activă încă în Supabase.
                  </p>
                )}
                <button
                  type="button"
                  className="secondary full"
                  disabled={usage.status === "loading"}
                  onClick={() => void refreshUsage()}
                >
                  <RefreshCw size={17} />
                  {usage.status === "loading"
                    ? "Se actualizează…"
                    : "Actualizează Usage"}
                </button>
              </div>
            )}
            {modal?.kind === "settings" && (
              <>
                <section className={`cloud-panel cloud-${cloudState}`}>
                  <div className="cloud-panel-heading">
                    {cloudState === "offline" || cloudState === "error" ? (
                      <CloudOff size={20} />
                    ) : (
                      <Cloud size={20} />
                    )}
                    <div>
                      <strong>
                        {!supabaseConfigured
                          ? "Cloud neconfigurat"
                          : session
                            ? storageStatus
                            : "Conectează backupul cloud"}
                      </strong>
                      <span>
                        {session?.user.email ??
                          "Datele locale rămân disponibile și offline."}
                      </span>
                    </div>
                  </div>
                  {!supabaseConfigured ? (
                    <p>
                      Completează URL-ul și cheia Publishable în `.env.local`,
                      apoi repornește aplicația.
                    </p>
                  ) : session ? (
                    <div className="cloud-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={authBusy || cloudState === "syncing"}
                        onClick={syncNow}
                      >
                        <RefreshCw size={16} /> Sincronizează acum
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={authBusy}
                        onClick={signOut}
                      >
                        <LogOut size={16} /> Deconectează
                      </button>
                    </div>
                  ) : (
                    <div className="magic-link-box">
                      {allowedAccounts.map((account) => (
                        <button
                          type="button"
                          className="secondary full"
                          key={account.label}
                          disabled={authBusy || !account.email}
                          onClick={() => void sendMagicLink(account.email)}
                        >
                          <Mail size={17} /> {account.label}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                <label className="field">
                  Carduri noi pe zi, pentru fiecare deck
                  <input
                    type="number"
                    name="newPerDay"
                    min={0}
                    max={100}
                    required
                    defaultValue={data.settings.newPerDay}
                  />
                </label>
                <label className="field">
                  Retenție țintă FSRS (%)
                  <input
                    type="number"
                    name="retention"
                    min={80}
                    max={97}
                    step={1}
                    required
                    defaultValue={Math.round(data.settings.retention * 100)}
                  />
                </label>
                <p className="field-help">
                  90% este un punct bun de plecare. O valoare mai mare înseamnă
                  recapitulări mai dese. Modificările se aplică la următorul
                  răspuns; cardurile deja programate își păstrează data.
                </p>
                <button className="primary full" disabled={saving}>
                  <Check size={18} /> Salvează setările
                </button>
                <div className="backup-section">
                  <h3>Datele tale</h3>
                  <p>
                    Păstrează un backup: ștergerea datelor browserului șterge și
                    biblioteca locală.
                  </p>
                  <div className="backup-buttons">
                    <button
                      type="button"
                      className="secondary"
                      onClick={exportBackup}
                    >
                      <Download size={17} /> Exportă
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={saving}
                      onClick={() => importer.current?.click()}
                    >
                      <Upload size={17} /> Importă
                    </button>
                  </div>
                </div>
              </>
            )}
            {modal?.kind === "delete" && (
              <>
                <p className="confirm-copy">
                  {modal.target === "reset"
                    ? `Toate cardurile din „${modal.name}” vor deveni noi, iar istoricul deck-ului va fi șters.`
                    : modal.target === "template"
                      ? `Template-ul „${modal.name}” va fi șters.`
                      : `„${modal.name}” ${modal.target === "deck" ? "și toate cardurile și recapitulările sale vor fi șterse" : "și istoricul acestui card vor fi șterse"}.`}{" "}
                  Această acțiune nu poate fi anulată.
                </p>
                <div className="backup-buttons">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setModal(null)}
                  >
                    Renunță
                  </button>
                  <button
                    type="button"
                    className="destructive"
                    disabled={saving}
                    onClick={remove}
                  >
                    {modal.target === "reset" ? "Resetează" : "Șterge"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </dialog>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            className="icon small"
            aria-label="Închide mesajul"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function newCardWithId(c: Flashcard) {
  return { ...c, schedule: newCard(c.deckId, c.front, c.back).schedule };
}
function nextDue(cards: Flashcard[], now: Date) {
  const next = cards
    .filter((c) => c.schedule.state !== State.New && c.schedule.due > now)
    .sort((a, b) => +a.schedule.due - +b.schedule.due)[0];
  return next
    ? `Următorul card: ${new Intl.DateTimeFormat("ro", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(next.schedule.due)}.`
    : cards.some((c) => c.schedule.state === State.New)
      ? "Ai atins limita zilnică pentru carduri noi. Revino mâine sau ajustează setările."
      : "Revino când ai alte carduri de învățat.";
}
