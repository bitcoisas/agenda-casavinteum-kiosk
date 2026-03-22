"use client";
import { useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { Moon, Plus, Sun, X, QrCode, Pencil, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { CalendarPicker } from "./components/CalendarPicker";
import { TimeWheelPicker } from "./components/TimeWheelPicker";

type EventModal = {
  id?: string;
  title: string;
  start: Date | null;
  end: Date | null;
  description?: string;
  location?: { name?: string };
  url?: string;
  image?: string;
  source?: string;
  organizer?: string;
  external_url?: string;
  [key: string]: unknown;
};

function formatDateTime(date: Date | null) {
  if (!date) return "";
  return date.toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EventImage({ src, alt, title }: { src: string; alt: string; title: string }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div className="relative w-full aspect-square flex-shrink-0">
      <img src={src} alt={alt} className="w-full h-full object-cover" onError={() => setVisible(false)} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <h2 className="absolute bottom-5 left-5 right-5 text-white font-bold text-xl leading-snug drop-shadow-lg">
        {title}
      </h2>
    </div>
  );
}

export default function AgendaKiosk() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EventModal | null>(null);
  const [showQR, setShowQR] = useState(false);
  // Default to dark mode outside 06:00–18:00 local time.
  // Initialise as false to match SSR; set correct value on client in useEffect.
  const [isDark, setIsDark] = useState(false);
  const [calendarKey] = useState(0);
  const [showGithubQR, setShowGithubQR] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isMobile, setIsMobile] = useState(false);
  const calendarRef = useRef<any>(null);
  const swipeStartX = useRef<number | null>(null);

  // Admin
  type AdminStep = "closed" | "password" | "form";
  type AdminAction = "add" | "edit" | "delete";
  const [adminStep, setAdminStep] = useState<AdminStep>("closed");
  const [adminAction, setAdminAction] = useState<AdminAction>("add");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [adminPwd, setAdminPwd] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "", date: "", startTime: "", endTime: "",
    description: "", location: "", external_url: "", organizer: "",
  });
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<{ name: string }[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const h = new Date().getHours();
    setIsDark(h < 6 || h >= 18);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(data);
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!loading && calendarRef.current) {
      const api = calendarRef.current.getApi();
      const viewStart = api.view.currentStart;
      const viewEnd = api.view.currentEnd;
      const hasEventsInView = events.some((e) => {
        const start = new Date(e.start);
        return start >= viewStart && start < viewEnd;
      });
      if (!hasEventsInView) api.changeView("dayGridMonth");
    }
  }, [loading, events, calendarKey]);

  function addOneHour(time: string) {
    if (!time) return "";
    const [h, m] = time.split(":").map(Number);
    return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function handleStartTime(time: string) {
    setEventForm((f) => ({ ...f, startTime: time, endTime: addOneHour(time) }));
  }

  async function searchLocation() {
    const q = eventForm.location.trim() || locationQuery.trim();
    if (!q) return;
    setSearchingLocation(true);
    const res = await fetch(`/api/location-search?q=${encodeURIComponent(q)}`);
    setLocationResults(await res.json());
    setSearchingLocation(false);
  }

  const emptyForm = { title: "", date: "", startTime: "", endTime: "", description: "", location: "", external_url: "", organizer: "" };

  function localDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  async function saveEvent() {
    setAdminSaving(true);
    setAdminError("");

    // Validate: start must be at least 10 min from now when date is today
    if (eventForm.date === localDateStr() && eventForm.startTime) {
      const now = new Date();
      const [h, m] = eventForm.startTime.split(":").map(Number);
      const selected = new Date(); selected.setHours(h, m, 0, 0);
      const minAllowed = new Date(now.getTime() + 5 * 60 * 1000);
      if (selected < minAllowed) {
        setAdminError("O horário deve ser pelo menos 5 minutos no futuro.");
        setAdminSaving(false);
        return;
      }
    }

    // Build ISO string with local timezone offset so Supabase stores the correct UTC value
    const tzOffset = (() => {
      const o = new Date().getTimezoneOffset(); // positive = behind UTC (e.g. UTC-3 → 180)
      const sign = o <= 0 ? "+" : "-";
      const abs = Math.abs(o);
      return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
    })();
    const toISO = (date: string, time: string) => `${date}T${time}:00${tzOffset}`;
    const start = eventForm.date && eventForm.startTime ? toISO(eventForm.date, eventForm.startTime) : null;
    const end = eventForm.date && eventForm.endTime ? toISO(eventForm.date, eventForm.endTime) : null;
    const isEdit = adminAction === "edit";
    const res = await fetch(isEdit ? "/api/admin/update-event" : "/api/admin/add-event", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPwd, id: editingEventId, ...eventForm, start, end }),
    });
    const data = await res.json();
    setAdminSaving(false);
    if (res.status === 401) { setAdminError("Senha incorreta"); setAdminStep("password"); return; }
    if (!res.ok) { setAdminError(data.error || "Erro ao salvar"); return; }
    setAdminStep("closed");
    setAdminPwd("");
    setEventForm(emptyForm);
    setEditingEventId(null);
    setAdminAction("add");
    setLocationQuery("");
    setLocationResults([]);
    refreshCalendar(eventForm.date);
  }

  function openModal(info: any) {
    info.jsEvent.preventDefault();
    setShowQR(false);
    setSelectedEvent({
      id: info.event.id,
      title: info.event.title,
      start: info.event.start,
      end: info.event.end,
      url: info.event.url || info.event.extendedProps?.url,
      ...info.event.extendedProps,
    });
  }

  function dateToFields(start: Date | null, end: Date | null) {
    if (!start) return { date: "", startTime: "", endTime: "" };
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      endTime: end ? `${pad(end.getHours())}:${pad(end.getMinutes())}` : "",
    };
  }

  function openEdit() {
    if (!selectedEvent) return;
    const { date, startTime, endTime } = dateToFields(selectedEvent.start, selectedEvent.end);
    setEventForm({
      title: selectedEvent.title,
      date,
      startTime,
      endTime,
      description: (selectedEvent.description as string) || "",
      location: (selectedEvent.location as any)?.name || "",
      external_url: selectedEvent.external_url || "",
      organizer: (selectedEvent.organizer as string) || "",
    });
    setEditingEventId(selectedEvent.id || null);
    setAdminAction("edit");
    setAdminError("");
    closeModal();
    setAdminStep("password");
  }

  function openDelete() {
    if (!selectedEvent) return;
    setEditingEventId(selectedEvent.id || null);
    setAdminAction("delete");
    setAdminError("");
    closeModal();
    setAdminStep("password");
  }

  async function refreshCalendar(gotoDate?: string) {
    const updated = await fetch("/api/events", { cache: "no-store" }).then((r) => r.json());
    setEvents(updated);
    setTimeout(() => {
      if (!calendarRef.current) return;
      const api = calendarRef.current.getApi();
      api.removeAllEvents();
      updated.forEach((e: any) => api.addEvent(e));
      if (gotoDate) api.gotoDate(gotoDate);
    }, 0);
  }

  async function deleteEvent() {
    setAdminSaving(true);
    setAdminError("");
    const res = await fetch("/api/admin/delete-event", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPwd, id: editingEventId }),
    });
    const data = await res.json();
    setAdminSaving(false);
    if (res.status === 401) { setAdminError("Senha incorreta"); return; }
    if (!res.ok) { setAdminError(data.error || "Erro ao deletar"); return; }
    setAdminStep("closed");
    setAdminPwd("");
    setEditingEventId(null);
    refreshCalendar();
  }

  function closeModal() {
    setSelectedEvent(null);
    setShowQR(false);
  }

  const eventUrl = selectedEvent?.url as string | undefined;
  const image = selectedEvent?.image as string | undefined;

  // Tema: claro (Apple) ou escuro (Vinteum)
  const d = isDark;

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${d ? "bg-zinc-950 text-zinc-100" : "bg-[#f2f2f7] text-gray-900"}`}>

      {/* Header */}
      <div className={`px-4 sm:px-8 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 ${d ? "bg-zinc-950 border-b border-zinc-800" : "bg-white border-b border-stone-200 shadow-sm"}`}>
        <img src="/logo.png" alt="Casa Vinteum" className="h-8 w-8 sm:h-11 sm:w-11 object-contain flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className={`text-lg sm:text-2xl font-bold tracking-tight truncate ${d ? "bg-gradient-to-r from-green-400 via-lime-400 to-yellow-400 bg-clip-text text-transparent" : "text-gray-900"}`}>
            Agenda Casa Vinteum
          </h1>
          <p className={`text-xs sm:text-sm mt-0.5 ${d ? "text-zinc-500" : "text-gray-400"}`}>Bitcoin · São Paulo</p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Botão GitHub — só no kiosk/desktop (QR não faz sentido no celular) */}
          <button
            onClick={() => setShowGithubQR(true)}
            className={`hidden sm:flex p-2.5 rounded-full transition-colors cursor-pointer ${d ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-stone-100 text-gray-500 hover:bg-stone-200"}`}
            title="Contribua no GitHub"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </button>

          {/* Botão adicionar evento */}
          <button
            onClick={() => { setAdminAction("add"); setEventForm(emptyForm); setEditingEventId(null); setAdminStep("password"); setAdminError(""); }}
            className={`p-2 sm:p-2.5 rounded-full transition-colors cursor-pointer ${d ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-stone-100 text-gray-500 hover:bg-stone-200"}`}
            title="Adicionar evento"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Toggle dark/light */}
          <button
            onClick={() => setIsDark((v) => !v)}
            className={`p-2 sm:p-2.5 rounded-full transition-colors cursor-pointer ${d ? "bg-zinc-800 text-yellow-400 hover:bg-zinc-700" : "bg-stone-100 text-gray-500 hover:bg-stone-200"}`}
            title={d ? "Modo claro" : "Modo escuro"}
          >
            {d ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div
        className={`p-2 sm:p-6 ${d ? "dark-theme" : ""}`}
        onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (swipeStartX.current === null || !calendarRef.current) return;
          const diff = swipeStartX.current - e.changedTouches[0].clientX;
          if (Math.abs(diff) > 50) {
            const api = calendarRef.current.getApi();
            diff > 0 ? api.next() : api.prev();
          }
          swipeStartX.current = null;
        }}
      >
        {loading ? (
          <div className={`text-center py-20 text-xl ${d ? "text-zinc-500" : "text-gray-400"}`}>
            Carregando agenda...
          </div>
        ) : (
          <div className={`rounded-xl sm:rounded-2xl overflow-hidden ${d ? "bg-zinc-900" : "bg-white shadow-sm ring-1 ring-black/5"}`}>
            <FullCalendar
              key={calendarKey}
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView="listWeek"
              headerToolbar={isMobile ? {
                left: "prev",
                center: "title",
                right: "next",
              } : {
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,listWeek",
              }}
              footerToolbar={isMobile ? {
                left: "today",
                right: "dayGridMonth,listWeek",
              } : false}
              views={{
                dayGridMonth: {
                  displayEventTime: false,
                  dayMaxEventRows: isMobile ? 3 : 4,
                },
              }}
              events={events}
              eventClick={openModal}
              eventClassNames={(arg) => {
                const { start, end, allDay } = arg.event;
                const isNow = !allDay && !!start && !!end &&
                  currentTime >= start && currentTime < end;
                return isNow ? ["event-rolando-now"] : [];
              }}
              noEventsContent={() => (
                <div style={{ textAlign: "center", padding: "2rem 1rem", opacity: 0.55, fontSize: "0.9rem" }}>
                  Não temos eventos nesta data.<br />
                  Mande sua sugestão para <strong>casa21.btc@gmail.com</strong>
                </div>
              )}
              height={isMobile ? "calc(100dvh - 64px)" : "85vh"}
              locale="pt-br"
              buttonText={{ today: "Hoje", month: "Mês", week: "Semana", list: "Lista" }}
            />
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className={`relative rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-y-auto max-h-[92vh] flex flex-col border ${d ? "bg-zinc-900 border-zinc-800" : "bg-white border-stone-200"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botão fechar */}
            <button
              onClick={closeModal}
              className={`absolute top-3 right-3 z-10 backdrop-blur-sm rounded-full p-1.5 cursor-pointer ${d ? "bg-zinc-900/80 text-zinc-400 hover:text-white" : "bg-white/90 text-gray-500 hover:text-gray-900 shadow"}`}
            >
              <X className="w-4 h-4" />
            </button>

            {image && <EventImage src={image} alt={selectedEvent.title} title={selectedEvent.title} />}

            <div className="p-6 flex-1">
              {!image && (
                <h2 className={`text-xl font-bold leading-tight mb-3 ${d ? "text-zinc-100" : "text-gray-900"}`}>
                  {selectedEvent.title}
                </h2>
              )}

              <p className={`font-semibold text-sm capitalize ${d ? "bg-gradient-to-r from-green-400 to-yellow-400 bg-clip-text text-transparent" : "text-green-700"}`}>
                {formatDateTime(selectedEvent.start)}
              </p>
              {selectedEvent.end && (
                <p className={`text-sm ${d ? "text-zinc-500" : "text-gray-400"}`}>
                  até {formatDateTime(selectedEvent.end)}
                </p>
              )}
              {(selectedEvent.location as any)?.name && (
                <p className={`text-sm mt-2 ${d ? "text-zinc-500" : "text-gray-500"}`}>
                  📍 {(selectedEvent.location as any).name}
                </p>
              )}

              {selectedEvent.description && (
                <div
                  className={`mt-4 text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:mt-1 [&_a]:underline ${
                    d
                      ? "text-zinc-400 [&_strong]:font-semibold [&_strong]:text-zinc-200 [&_h2]:font-bold [&_h2]:text-zinc-200 [&_h2]:text-base [&_h2]:mt-3 [&_a]:text-green-400"
                      : "text-gray-600 [&_strong]:font-semibold [&_strong]:text-gray-800 [&_h2]:font-bold [&_h2]:text-gray-800 [&_h2]:text-base [&_h2]:mt-3 [&_a]:text-green-700"
                  }`}
                  dangerouslySetInnerHTML={{ __html: selectedEvent.description as string }}
                />
              )}

              {showQR && eventUrl && (
                <div className={`mt-5 flex flex-col items-center gap-2 rounded-xl p-4 ${d ? "bg-zinc-800" : "bg-stone-50"}`}>
                  <p className={`text-xs mb-1 ${d ? "text-zinc-500" : "text-gray-400"}`}>
                    Aponte a câmera para acessar o evento
                  </p>
                  <div className="bg-white p-3 rounded-lg">
                    <QRCodeSVG value={eventUrl} size={150} />
                  </div>
                  <p className={`text-xs mt-1 break-all text-center max-w-[200px] ${d ? "text-zinc-600" : "text-gray-400"}`}>
                    {eventUrl}
                  </p>
                </div>
              )}
            </div>

            <div className={`px-6 pb-5 pt-2 border-t flex flex-col gap-3 ${d ? "border-zinc-800" : "border-stone-100"}`}>
              <div className="flex gap-3">
                {eventUrl && (
                  <button
                    onClick={() => setShowQR((v) => !v)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition-colors ${
                      d
                        ? "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
                        : "border-stone-200 text-gray-600 hover:bg-stone-50"
                    }`}
                  >
                    <QrCode className="w-4 h-4" />
                    {showQR ? "Ocultar QR" : "Ver QR Code"}
                  </button>
                )}
                <button
                  onClick={closeModal}
                  className={`flex-1 py-2.5 rounded-xl font-semibold cursor-pointer transition-opacity hover:opacity-90 ${
                    d
                      ? "bg-gradient-to-r from-green-500 to-lime-400 text-zinc-950"
                      : "bg-green-700 text-white"
                  }`}
                >
                  Fechar
                </button>
              </div>

              {/* Edit / Delete — subtle, only for manual events */}
              {selectedEvent?.source === "manual" && (
                <div className="flex justify-center gap-5">
                  <button
                    onClick={openEdit}
                    className={`flex items-center gap-1 text-xs cursor-pointer transition-colors ${
                      d ? "text-zinc-600 hover:text-zinc-400" : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                  <button
                    onClick={openDelete}
                    className={`flex items-center gap-1 text-xs cursor-pointer transition-colors ${
                      d ? "text-zinc-600 hover:text-red-400" : "text-gray-400 hover:text-red-500"
                    }`}
                  >
                    <Trash2 className="w-3 h-3" /> Deletar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: GitHub QR code */}
      {showGithubQR && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowGithubQR(false)}
        >
          <div
            className={`relative rounded-2xl shadow-2xl max-w-xs w-full mx-4 p-6 border flex flex-col items-center gap-4 ${d ? "bg-zinc-900 border-zinc-800" : "bg-white border-stone-200"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowGithubQR(false)}
              className={`absolute top-3 right-3 rounded-full p-1.5 cursor-pointer ${d ? "text-zinc-400 hover:text-white" : "text-gray-400 hover:text-gray-700"}`}
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className={`text-base font-bold ${d ? "text-zinc-100" : "text-gray-900"}`}>
              Contribua no GitHub
            </h2>
            <p className={`text-xs text-center ${d ? "text-zinc-400" : "text-gray-500"}`}>
              Este projeto é open-source. Aponte a câmera para acessar o repositório.
            </p>

            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value="https://github.com/bitcoisas/agenda-casavinteum-kiosk" size={180} />
            </div>

            <p className={`text-xs break-all text-center ${d ? "text-zinc-500" : "text-gray-400"}`}>
              github.com/bitcoisas/agenda-casavinteum-kiosk
            </p>

            <button
              onClick={() => setShowGithubQR(false)}
              className={`w-full py-2.5 rounded-xl font-semibold text-sm cursor-pointer transition-opacity hover:opacity-90 ${
                d ? "bg-gradient-to-r from-green-500 to-lime-400 text-zinc-950" : "bg-green-700 text-white"
              }`}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal: senha admin */}
      {adminStep === "password" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setAdminStep("closed"); setAdminAction("add"); setAdminError(""); }}>
          <div className={`relative rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-6 border ${d ? "bg-zinc-900 border-zinc-800" : "bg-white border-stone-200"}`} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setAdminStep("closed"); setAdminAction("add"); setAdminError(""); }} className={`absolute top-3 right-3 rounded-full p-1.5 cursor-pointer ${d ? "text-zinc-400 hover:text-white" : "text-gray-400 hover:text-gray-700"}`}>
              <X className="w-4 h-4" />
            </button>
            <h2 className={`text-lg font-bold mb-1 ${d ? "text-zinc-100" : "text-gray-900"}`}>
              {adminAction === "delete" ? "Deletar evento" : adminAction === "edit" ? "Editar evento" : "Senha do admin"}
            </h2>
            {adminAction === "delete" && (
              <p className={`text-sm mb-4 ${d ? "text-zinc-400" : "text-gray-500"}`}>
                Confirme a senha para deletar este evento permanentemente.
              </p>
            )}
            <div className={adminAction === "delete" ? "" : "mt-4"}>
              <input
                type="password"
                autoFocus
                placeholder="Digite a senha"
                value={adminPwd}
                onChange={(e) => setAdminPwd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !adminPwd) return;
                  if (adminAction === "delete") deleteEvent();
                  else setAdminStep("form");
                }}
                className={`w-full rounded-xl px-4 py-3 text-sm mb-3 outline-none border ${d ? "bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "bg-stone-50 border-stone-200 text-gray-900 placeholder:text-gray-400"}`}
              />
            </div>
            {adminError && <p className="text-red-500 text-xs mb-3">{adminError}</p>}
            <button
              onClick={() => {
                if (!adminPwd) return;
                if (adminAction === "delete") deleteEvent();
                else setAdminStep("form");
              }}
              disabled={adminSaving}
              className={`w-full py-2.5 rounded-xl font-semibold text-sm cursor-pointer transition-colors disabled:opacity-50 ${
                adminAction === "delete"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-green-700 text-white hover:bg-green-800"
              }`}
            >
              {adminSaving ? "Aguarde..." : adminAction === "delete" ? "Confirmar exclusão" : "Continuar"}
            </button>
          </div>
        </div>
      )}

      {/* Modal: formulário de evento */}
      {adminStep === "form" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setAdminStep("closed")}>
          <div className={`relative rounded-2xl shadow-2xl w-full max-w-md mx-4 border overflow-y-auto max-h-[92vh] ${d ? "bg-zinc-900 border-zinc-800" : "bg-white border-stone-200"}`} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setAdminStep("closed")} className={`absolute top-3 right-3 rounded-full p-1.5 cursor-pointer ${d ? "text-zinc-400 hover:text-white" : "text-gray-400 hover:text-gray-700"}`}>
              <X className="w-4 h-4" />
            </button>
            <div className="p-6">
              <h2 className={`text-lg font-bold mb-5 ${d ? "text-zinc-100" : "text-gray-900"}`}>
                {adminAction === "edit" ? "Editar evento" : "Novo evento"}
              </h2>

              {/* Título */}
              <div className="mb-3">
                <label className={`text-xs font-medium mb-1 block ${d ? "text-zinc-400" : "text-gray-500"}`}>Título *</label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border ${d ? "bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "bg-stone-50 border-stone-200 text-gray-900"}`}
                />
              </div>

              {/* Data */}
              <div className="mb-3">
                <label className={`text-xs font-medium mb-2 block ${d ? "text-zinc-400" : "text-gray-500"}`}>Data *</label>
                <CalendarPicker
                  value={eventForm.date}
                  min={(() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; })()}
                  onChange={(v) => setEventForm({ ...eventForm, date: v })}
                  isDark={d}
                />
              </div>

              {/* Horários */}
              <div className="mb-3 flex gap-3">
                <div className="flex-1">
                  <TimeWheelPicker
                    label="Hora início *"
                    value={eventForm.startTime || "08:00"}
                    onChange={handleStartTime}
                    isDark={d}
                    minTime={(() => {
                      if (eventForm.date !== localDateStr()) return undefined;
                      const n = new Date();
                      return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes() + 5).padStart(2, "0")}`;
                    })()}
                  />
                </div>
                <div className="flex-1">
                  <TimeWheelPicker
                    label="Hora fim"
                    value={eventForm.endTime || "09:00"}
                    onChange={(v) => setEventForm({ ...eventForm, endTime: v })}
                    isDark={d}
                  />
                </div>
              </div>

              {/* Local com busca */}
              <div className="mb-3">
                <label className={`text-xs font-medium mb-1 block ${d ? "text-zinc-400" : "text-gray-500"}`}>Local</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Digite ou busque o endereço..."
                    value={eventForm.location}
                    onChange={(e) => {
                      setEventForm({ ...eventForm, location: e.target.value });
                      setLocationQuery(e.target.value);
                      setLocationResults([]);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") searchLocation(); }}
                    className={`flex-1 rounded-xl px-4 py-2.5 text-sm outline-none border ${d ? "bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "bg-stone-50 border-stone-200 text-gray-900 placeholder:text-gray-400"}`}
                  />
                  <button
                    onClick={searchLocation}
                    disabled={searchingLocation || !eventForm.location.trim()}
                    className="px-3 py-2.5 rounded-xl bg-green-700 text-white text-sm font-medium cursor-pointer hover:bg-green-800 disabled:opacity-40 transition-colors"
                  >
                    {searchingLocation ? "..." : "Buscar"}
                  </button>
                </div>
                {locationResults.length > 0 && (
                  <ul className={`mt-1 rounded-xl border overflow-hidden text-sm ${d ? "bg-zinc-800 border-zinc-700" : "bg-white border-stone-200 shadow-md"}`}>
                    {locationResults.map((r, i) => (
                      <li
                        key={i}
                        onClick={() => { setEventForm({ ...eventForm, location: r.name }); setLocationResults([]); }}
                        className={`px-4 py-2.5 cursor-pointer truncate ${d ? "text-zinc-200 hover:bg-zinc-700" : "text-gray-800 hover:bg-stone-50"}`}
                      >
                        {r.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Link externo */}
              <div className="mb-3">
                <label className={`text-xs font-medium mb-1 block ${d ? "text-zinc-400" : "text-gray-500"}`}>Link do evento</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={eventForm.external_url}
                  onChange={(e) => setEventForm({ ...eventForm, external_url: e.target.value })}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border ${d ? "bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "bg-stone-50 border-stone-200 text-gray-900 placeholder:text-gray-400"}`}
                />
              </div>

              {/* Organizador */}
              <div className="mb-3">
                <label className={`text-xs font-medium mb-1 block ${d ? "text-zinc-400" : "text-gray-500"}`}>Organizador</label>
                <input
                  type="text"
                  value={eventForm.organizer}
                  onChange={(e) => setEventForm({ ...eventForm, organizer: e.target.value })}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border ${d ? "bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "bg-stone-50 border-stone-200 text-gray-900"}`}
                />
              </div>

              {/* Descrição */}
              <div className="mb-5">
                <label className={`text-xs font-medium mb-1 block ${d ? "text-zinc-400" : "text-gray-500"}`}>Descrição</label>
                <textarea
                  rows={3}
                  value={eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border resize-none ${d ? "bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "bg-stone-50 border-stone-200 text-gray-900"}`}
                />
              </div>

              {adminError && <p className="text-red-500 text-xs mb-3">{adminError}</p>}

              <button
                onClick={saveEvent}
                disabled={adminSaving || !eventForm.title || !eventForm.date || !eventForm.startTime}
                className="w-full py-2.5 rounded-xl font-semibold text-sm cursor-pointer bg-green-700 text-white hover:bg-green-800 transition-colors disabled:opacity-40"
              >
                {adminSaving ? "Salvando..." : adminAction === "edit" ? "Salvar alterações" : "Salvar evento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
