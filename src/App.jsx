import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
/** Operacion RPETC: POST .../certificados.cesiones.cesionario (Manual Interfactor). */
const DEMO_PROFILE_OPERATION = "certificados-cesionario";
/** Cesiones por cesionario con RUT de tarea fijo (mismo valor que RPETC_DEFAULT_PROFILE_TASK_RUT/DV en backend). */
const CESIONARIO_FIJO_CESIONES_OPERATION = "cesiones-cesionario-fijo";
const OPERATION_CESIONES_CERTIFICADO_MASIVO = "cesiones-certificado-masivo";
const OPERATION_CERTIFICADOS_CESIONARIO = "certificados-cesionario";
const VIEW_CERTIFICADOS_MASIVO = "certificadosMasivosCesiones";
const MASIVO_MAX_PERIOD_DAYS = 30;
const MASIVO_TABLE_PAGE_SIZE = 25;

/** Campos agrupados para vista legible (evita tabla de muchas columnas). */
const CESIONES_RESULTADO_GRUPOS = [
  {
    title: "Documento",
    fields: [
      { key: "folio_doc", label: "Folio", mono: true },
      { key: "tipo_doc", label: "Tipo DTE", mono: true },
      { key: "nombre_doc", label: "Nombre" },
      { key: "fch_emis_dte", label: "Fecha emisión", kind: "date" },
    ],
  },
  {
    title: "Partes",
    fields: [
      { key: "deudor", label: "Deudor", mono: true },
      { key: "cedente", label: "Cedente", mono: true },
      { key: "rz_cedente", label: "Razón social cedente" },
      { key: "cesionario", label: "Cesionario", mono: true },
    ],
  },
  {
    title: "Cesión",
    fields: [
      { key: "fch_cesion", label: "Fecha y hora cesión", kind: "datetime" },
      { key: "mnt_cesion", label: "Monto cesión", kind: "amount", mono: true },
      { key: "mnt_total", label: "Monto total", kind: "amount", mono: true },
      { key: "estado_cesion", label: "Estado", badge: true },
      { key: "id_cesion", label: "ID cesión", mono: true, breakAll: true },
    ],
  },
];

/** En detalle cesiones: solo lo alineado al criterio de búsqueda (RUTs y folio). */
const CESIONES_RESULTADO_GRUPOS_BUSQUEDA = [
  {
    title: "Consulta (folio y RUT según registro)",
    fields: [
      { key: "folio_doc", label: "Folio", mono: true },
      { key: "deudor", label: "Deudor", mono: true },
      { key: "cedente", label: "Cedente", mono: true },
      { key: "cesionario", label: "Cesionario", mono: true },
    ],
  },
];

const operationGroups = [
  { title: "Certificados", operations: ["certificados-deudor", "certificados-cesionario", "certificados-cedente"] },
  {
    title: "Cesiones",
    operations: ["cesiones-deudor", "cesiones-cesionario", "cesiones-cesionario-fijo", "cesiones-cedente"],
  },
  { title: "Tareas", operations: ["estado", "resultado", "estados"] },
];

/** Columnas 2 y 3 (relacionados) -> claves de payload segun operacion. */
function partyRutsFromRow(rel1, rel2, opKey) {
  const out = { rut_deudor: "", rut_cedente: "", rut_cesionario: "" };
  const a = String(rel1 ?? "").trim();
  const b = String(rel2 ?? "").trim();
  if (opKey.includes("deudor")) {
    if (a) out.rut_cesionario = a;
    if (b) out.rut_cedente = b;
  } else if (opKey.includes("cesionario")) {
    if (a) out.rut_deudor = a;
    if (b) out.rut_cedente = b;
  } else if (opKey.includes("cedente")) {
    if (a) out.rut_deudor = a;
    if (b) out.rut_cesionario = b;
  }
  return out;
}

/** Etiquetas de los 3 campos en fila (orden fijo: tarea, rel.1, rel.2). */
function rutRowLabels(opKey, isRestricted) {
  const t1 = isRestricted ? "RUT tarea (fijado)" : "RUT tarea";
  if (opKey.includes("deudor")) return { l1: t1, l2: "Cesionario (opc.)", l3: "Cliente (opc.)" };
  if (opKey.includes("cesionario")) return { l1: t1, l2: "Deudor (opc.)", l3: "Cliente (opc.)" };
  if (opKey.includes("cedente")) return { l1: t1, l2: "Deudor (opc.)", l3: "Cesionario (opc.)" };
  return { l1: t1, l2: "Relacionado 1 (opc.)", l3: "Relacionado 2 (opc.)" };
}

/** Valida rango Desde/Hasta (YYYY-MM-DD) para pantalla certificado masivo. */
function assertDateRangeMaxDaysAllowed(desdeIso, hastaIso, maxDays) {
  const ds = String(desdeIso || "").trim();
  const hs = String(hastaIso || "").trim();
  if (!ds || !hs) return { ok: false, message: "Indica Desde y Hasta." };
  const a = new Date(`${ds}T12:00:00`);
  const b = new Date(`${hs}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return { ok: false, message: "Fechas invalidas." };
  if (b < a) return { ok: false, message: "La fecha Hasta no puede ser anterior a Desde." };
  const span = Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  if (span > maxDays) {
    return { ok: false, message: `El periodo no puede superar ${maxDays} dias (seleccion actual: ${span} dias).` };
  }
  return { ok: true };
}

/** Solo digitos del folio para comparar rangos (acepta pegados con puntos o guiones). */
function folioComparableNumber(value) {
  const d = String(value ?? "").replace(/\D/g, "");
  if (!d) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

function masivoAmountSortNumber(raw) {
  const val = raw != null && String(raw).trim() !== "" ? String(raw).trim() : "";
  if (!val) return null;
  const normalized = val.replace(/\./g, "").replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function masivoDateSortMs(raw) {
  const val = raw != null && String(raw).trim() !== "" ? String(raw).trim() : "";
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(`${val.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const d2 = new Date(val);
  return Number.isNaN(d2.getTime()) ? null : d2.getTime();
}

/** Orden estable del listado masivo (columna + dirección). */
function compareMasivoRows(a, b, column, dir) {
  const tie = (a?.line_number ?? 0) - (b?.line_number ?? 0);
  let cmp = 0;
  switch (column) {
    case "cedente":
      cmp = String(a?.cedente ?? "")
        .trim()
        .localeCompare(String(b?.cedente ?? "").trim(), undefined, { numeric: true, sensitivity: "base" });
      break;
    case "rz_cedente":
      cmp = String(a?.rz_cedente ?? "")
        .trim()
        .localeCompare(String(b?.rz_cedente ?? "").trim(), undefined, { numeric: true, sensitivity: "base" });
      break;
    case "deudor":
      cmp = String(a?.deudor ?? "")
        .trim()
        .localeCompare(String(b?.deudor ?? "").trim(), undefined, { numeric: true, sensitivity: "base" });
      break;
    case "folio_doc": {
      const na = folioComparableNumber(a?.folio_doc);
      const nb = folioComparableNumber(b?.folio_doc);
      if (na != null && nb != null) cmp = na - nb;
      else if (na != null) cmp = -1;
      else if (nb != null) cmp = 1;
      else {
        cmp = String(a?.folio_doc ?? "").localeCompare(String(b?.folio_doc ?? ""), undefined, { numeric: true });
      }
      break;
    }
    case "documento": {
      const da = [a?.tipo_doc, a?.nombre_doc].filter(Boolean).join(" ").trim().toLowerCase();
      const db = [b?.tipo_doc, b?.nombre_doc].filter(Boolean).join(" ").trim().toLowerCase();
      cmp = da.localeCompare(db, undefined, { numeric: true, sensitivity: "base" });
      break;
    }
    case "fch_emis_dte": {
      const ta = masivoDateSortMs(a?.fch_emis_dte);
      const tb = masivoDateSortMs(b?.fch_emis_dte);
      if (ta != null && tb != null) cmp = ta - tb;
      else if (ta != null) cmp = -1;
      else if (tb != null) cmp = 1;
      else cmp = String(a?.fch_emis_dte ?? "").localeCompare(String(b?.fch_emis_dte ?? ""));
      break;
    }
    case "mnt_total": {
      const na = masivoAmountSortNumber(a?.mnt_total);
      const nb = masivoAmountSortNumber(b?.mnt_total);
      if (na != null && nb != null) cmp = na - nb;
      else if (na != null) cmp = -1;
      else if (nb != null) cmp = 1;
      else cmp = 0;
      break;
    }
    case "mnt_cesion": {
      const na = masivoAmountSortNumber(a?.mnt_cesion);
      const nb = masivoAmountSortNumber(b?.mnt_cesion);
      if (na != null && nb != null) cmp = na - nb;
      else if (na != null) cmp = -1;
      else if (nb != null) cmp = 1;
      else cmp = 0;
      break;
    }
    case "id_cesion":
      cmp = String(a?.id_cesion ?? "").localeCompare(String(b?.id_cesion ?? ""), undefined, { numeric: true });
      break;
    case "estado_cesion":
      cmp = String(a?.estado_cesion ?? "")
        .trim()
        .localeCompare(String(b?.estado_cesion ?? "").trim(), undefined, { numeric: true, sensitivity: "base" });
      break;
    default:
      cmp = 0;
  }
  if (cmp === 0) cmp = tie;
  return dir === "asc" ? cmp : -cmp;
}

/** Cabecera de tabla masiva ordenable al clic. */
function MasivoSortTh({ colKey, sortColumn, sortDir, onSort, className = "", children, textEnd = false }) {
  const active = sortColumn === colKey;
  return (
    <th scope="col" className={`masivo-th-sort ${className}`.trim()}>
      <button
        type="button"
        className={`btn btn-link text-decoration-none p-0 text-body d-inline-flex align-items-center gap-1 w-100 masivo-sort-btn ${
          textEnd ? "justify-content-end" : "justify-content-start"
        }`}
        onClick={() => onSort(colKey)}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        title="Clic para ordenar; otro clic invierte el orden"
      >
        <span className="fw-semibold">{children}</span>
        <span className="small text-muted" aria-hidden>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </button>
    </th>
  );
}

function buildMasivoCesionesCertPayload(masiva) {
  return {
    use_default_task_rut: true,
    desde: masiva.desde,
    hasta: masiva.hasta,
    rut_cedente: String(masiva.rut_cedente || "").trim(),
    rut_deudor: String(masiva.rut_deudor || "").trim(),
    enforce_period_max_days: MASIVO_MAX_PERIOD_DAYS,
  };
}

async function apiFetch(path, options = {}) {
  const authToken = localStorage.getItem("auth_token") || "";
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Error inesperado");
  return data;
}

function formatChileDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
}

/** Fechas y montos del TXT SII en formato legible (Chile). */
function formatCesionesCampoDisplay(raw, kind) {
  const val = raw != null && String(raw).trim() !== "" ? String(raw).trim() : "";
  if (!val) return "—";
  if (kind === "amount") {
    const normalized = val.replace(/\./g, "").replace(/\s/g, "").replace(",", ".");
    const n = Number(normalized);
    if (!Number.isFinite(n)) return val;
    return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n);
  }
  if (kind === "datetime") {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
    }
  }
  if (kind === "date") {
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      const d = new Date(`${val.slice(0, 10)}T12:00:00`);
      if (!Number.isNaN(d.getTime())) {
        return new Intl.DateTimeFormat("es-CL", {
          timeZone: "America/Santiago",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d);
      }
    }
    const d2 = new Date(val);
    if (!Number.isNaN(d2.getTime())) {
      return new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d2);
    }
  }
  return val;
}

function CesionesResultadosOrdenados({ rows, variant = "full" }) {
  if (!rows?.length) return null;
  const grupos = variant === "busqueda" ? CESIONES_RESULTADO_GRUPOS_BUSQUEDA : CESIONES_RESULTADO_GRUPOS;
  const nGrupos = grupos.length;
  return (
    <div className="d-flex flex-column gap-3">
      {rows.map((row) => (
        <div
          key={row.id ?? `${row.request_id}-${row.line_number}`}
          className="card border shadow-sm cesiones-resultado-card overflow-hidden"
        >
          <div className="card-body p-3 p-md-4">
            {grupos.map((grupo, gi) => (
              <div key={grupo.title} className={gi < nGrupos - 1 ? "mb-4 pb-1 border-bottom border-light" : ""}>
                <h4 className="h6 text-uppercase text-secondary mb-3 fw-semibold">{grupo.title}</h4>
                <div className="row g-3 row-cols-1 row-cols-sm-2 row-cols-xl-3">
                  {grupo.fields.map((f) => {
                    const display = formatCesionesCampoDisplay(row[f.key], f.kind);
                    const mono = Boolean(f.mono);
                    const breakAll = Boolean(f.breakAll);
                    const isBadge = Boolean(f.badge) && display !== "—";
                    const nowrapMono = mono && !breakAll;
                    return (
                      <div key={f.key} className="col">
                        <div
                          className="small text-muted text-uppercase mb-1"
                          style={{ fontSize: "0.7rem", letterSpacing: "0.03em" }}
                        >
                          {f.label}
                        </div>
                        {isBadge ? (
                          <span className="badge rounded-pill bg-primary-subtle text-primary-emphasis border border-primary-subtle fw-normal px-3 py-2">
                            {display}
                          </span>
                        ) : (
                          <div
                            className={`${mono ? "font-monospace" : ""} ${nowrapMono ? "text-nowrap" : "text-break"} lh-sm`}
                            title={display !== "—" && !nowrapMono ? display : undefined}
                          >
                            {display}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Spinner({ className = "" }) {
  return (
    <>
      <span className={`spinner-border spinner-border-sm text-primary if-btn-spinner ${className}`} role="status" aria-hidden="true" />
      <span className="visually-hidden">Cargando</span>
    </>
  );
}

function SpinnerBlock({ message = "Cargando..." }) {
  return (
    <div className="d-flex flex-column align-items-center gap-2 py-4 text-primary" role="status" aria-live="polite">
      <span className="spinner-border" style={{ width: "2.25rem", height: "2.25rem" }} aria-hidden="true" />
      <span className="small text-secondary">{message}</span>
      <span className="visually-hidden">{message}</span>
    </div>
  );
}

function LoadingOverlay({ show, message = "Cargando..." }) {
  if (!show) return null;
  return (
    <div className="if-loading-overlay">
      <SpinnerBlock message={message} />
    </div>
  );
}

function getRequestPayload(item) {
  if (item?.payload && typeof item.payload === "object") return item.payload;
  try {
    return item?.payload_json ? JSON.parse(item.payload_json) : {};
  } catch {
    return {};
  }
}

function getRequestDateRange(item) {
  const payload = getRequestPayload(item);
  const desde = payload?.desde || "";
  const hasta = payload?.hasta || "";
  if (desde && hasta) return `${desde} a ${hasta}`;
  if (desde) return `Desde ${desde}`;
  if (hasta) return `Hasta ${hasta}`;
  return "-";
}

function formatRutDvDisplay(rut, dv) {
  const r = rut != null && String(rut).trim() !== "" ? String(rut).trim() : "";
  const d = dv != null && String(dv).trim() !== "" ? String(dv).trim() : "";
  if (!r) return "—";
  if (!d) return r;
  return `${r}-${d}`;
}

/** RUTs guardados en la solicitud (columnas BD + payload normalizado). */
function getRequestRutCells(item) {
  const p = getRequestPayload(item);
  const rutT =
    item?.rut != null && String(item.rut).trim() !== "" ? String(item.rut).trim() : p.rut;
  const dvT = item?.dv != null && String(item.dv).trim() !== "" ? String(item.dv).trim() : p.dv;
  return {
    tarea: formatRutDvDisplay(rutT, dvT),
    deudor: formatRutDvDisplay(p.rut_deudor, p.dv_deudor),
    cliente: formatRutDvDisplay(p.rut_cedente, p.dv_cedente),
    cesionario: formatRutDvDisplay(p.rut_cesionario, p.dv_cesionario),
  };
}

function getRequestResponseData(item) {
  if (item?.response_data && typeof item.response_data === "object") return item.response_data;
  try {
    return item?.response_json ? JSON.parse(item.response_json) : {};
  } catch {
    return {};
  }
}

function getCesionesFilasGuardadas(item) {
  const r = getRequestResponseData(item);
  if (r?.tipo === "cesiones_txt" && r.filas_insertadas != null) return String(r.filas_insertadas);
  return "—";
}

/** Estado para listado historial cesiones: encontrado / sin datos / pendiente / error. */
function getCesionesEstadoResultado(item) {
  const err = item?.error_text && String(item.error_text).trim();
  if (err) {
    const corto = err.length > 120 ? `${err.slice(0, 120)}…` : err;
    return {
      codigo: "error",
      texto: "Error",
      descripcion: corto,
      puedeDetalle: false,
    };
  }
  const rd = getRequestResponseData(item);
  const hasTask = Boolean(item?.task_id && String(item.task_id).trim());
  if (rd?.tipo !== "cesiones_txt") {
    if (!hasTask) {
      return {
        codigo: "pendiente",
        texto: "Pendiente",
        descripcion: "El tramite aun no tiene numero de seguimiento",
        puedeDetalle: false,
      };
    }
    return {
      codigo: "pendiente",
      texto: "Pendiente",
      descripcion: "Falta completar la consulta",
      puedeDetalle: false,
    };
  }
  const n = Number(rd.filas_insertadas ?? 0);
  if (n > 0) {
    return {
      codigo: "encontrado",
      texto: "Encontrado",
      descripcion: `${n} registro(s) disponibles`,
      puedeDetalle: true,
    };
  }
  return {
    codigo: "no_encontrado",
    texto: "Sin datos",
    descripcion: "No se encontraron registros para esta consulta",
    puedeDetalle: false,
  };
}

function CesionesResultadoCelda({ estado }) {
  const variant =
    estado.codigo === "encontrado"
      ? "success"
      : estado.codigo === "no_encontrado"
        ? "warning"
        : estado.codigo === "error"
          ? "danger"
          : "secondary";
  return (
    <div className="lh-sm">
      <span className={`badge text-bg-${variant}`}>{estado.texto}</span>
      {estado.descripcion ? (
        <div className="small text-muted mt-1 text-wrap" style={{ maxWidth: "14rem" }}>
          {estado.descripcion}
        </div>
      ) : null}
    </div>
  );
}

function requestHasPdfKey(item) {
  if (item?.pdf_key) return true;
  return Boolean(getRequestResponseData(item)?.pdf_key);
}

/** Menu desplegable del nav (sin JS de Bootstrap: cierre al clic fuera). */
function NavbarDropdown({ menuId, buttonLabel, buttonTitle, openMenu, setOpenMenu, items }) {
  const rootRef = useRef(null);
  const isOpen = openMenu === menuId;
  const list = items?.filter(Boolean) ?? [];

  useEffect(() => {
    if (!isOpen) return undefined;
    const onDocMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [isOpen, setOpenMenu]);

  if (!list.length) return null;

  return (
    <div className="dropdown nav-if-dd" ref={rootRef}>
      <button
        type="button"
        className={`btn btn-light btn-sm rounded-pill dropdown-toggle ${isOpen ? "show" : ""}`}
        title={buttonTitle}
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={() => setOpenMenu((m) => (m === menuId ? null : menuId))}
      >
        {buttonLabel}
      </button>
      <ul className={`dropdown-menu shadow-sm py-1 small ${isOpen ? "show" : ""}`} role="menu">
        {list.map((it) => (
          <li key={it.key} role="none">
            <button
              type="button"
              role="menuitem"
              className="dropdown-item"
              title={it.title}
              onClick={() => {
                it.onClick();
                setOpenMenu(null);
              }}
            >
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("auth_token") || "");
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [currentUser, setCurrentUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [view, setView] = useState("inicio");
  const [navMenuOpen, setNavMenuOpen] = useState(null);
  const [settings, setSettings] = useState({ access_token: "", refresh_token: "", base_url: "", timeout: "30" });
  const [operation, setOperation] = useState("certificados-deudor");
  const [restrictedHomeTab, setRestrictedHomeTab] = useState("certificado");
  const [form, setForm] = useState({
    rut_tarea: "",
    rut_rel_1: "",
    rut_rel_2: "",
    rut_cedente: "",
    folio_doc: "",
    desde: "",
    hasta: "",
  });
  const [requestsData, setRequestsData] = useState({ items: [], total: 0, page: 1, total_pages: 1 });
  const [cesionesListData, setCesionesListData] = useState({ items: [], total: 0, page: 1, total_pages: 1 });
  const [cesionesQ, setCesionesQ] = useState("");
  const [cesionesListLoading, setCesionesListLoading] = useState(false);
  const [cesionesDetalleRequest, setCesionesDetalleRequest] = useState(null);
  const [cesionesDetalleRows, setCesionesDetalleRows] = useState([]);
  const [cesionesDetalleLoading, setCesionesDetalleLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [usersData, setUsersData] = useState([]);
  const [profilesData, setProfilesData] = useState([]);
  const [userForm, setUserForm] = useState({ username: "", full_name: "", password: "", profile_id: "", is_active: true });
  const [profileForm, setProfileForm] = useState({ name: "", description: "", is_active: true, permissions: [] });
  const [message, setMessage] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listPipelineLoadingId, setListPipelineLoadingId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailActionPending, setDetailActionPending] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [showTechnicalDetail, setShowTechnicalDetail] = useState(false);
  const [cesionesConsultaRows, setCesionesConsultaRows] = useState([]);
  const [cesionesConsultaStatus, setCesionesConsultaStatus] = useState("");
  /** Tras ejecutar consulta cesionario fijo: sin filas pero pipeline OK (folio no en libro Interfactor). */
  const [cesionesConsultaSinCoincidencias, setCesionesConsultaSinCoincidencias] = useState(false);

  const [masivoForm, setMasivoForm] = useState({
    rut_cedente: "",
    rut_deudor: "",
    desde: "",
    hasta: "",
    folio_desde: "",
    folio_hasta: "",
  });
  const [masivoAdvancedOpen, setMasivoAdvancedOpen] = useState(false);
  const [masivoRows, setMasivoRows] = useState([]);
  const [masivoRequestId, setMasivoRequestId] = useState(null);
  const [masivoSelectedIds, setMasivoSelectedIds] = useState([]);
  const [masivoLoading, setMasivoLoading] = useState(false);
  const [masivoOverlayMessage, setMasivoOverlayMessage] = useState("");
  const [masivoTableSearch, setMasivoTableSearch] = useState("");
  const [masivoPage, setMasivoPage] = useState(1);
  const [masivoSort, setMasivoSort] = useState({ column: "folio_doc", dir: "asc" });

  const masivoFolioDesdeN = folioComparableNumber(masivoForm.folio_desde);
  const masivoFolioHastaN = folioComparableNumber(masivoForm.folio_hasta);
  const masivoFolioRangeInvalid =
    masivoFolioDesdeN != null && masivoFolioHastaN != null && masivoFolioDesdeN > masivoFolioHastaN;

  const masivoFolioDatalistOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const row of masivoRows) {
      const raw = row?.folio_doc != null ? String(row.folio_doc).trim() : "";
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      out.push(raw);
    }
    out.sort((a, b) => {
      const na = folioComparableNumber(a);
      const nb = folioComparableNumber(b);
      if (na != null && nb != null && na !== nb) return na - nb;
      return a.localeCompare(b, undefined, { numeric: true });
    });
    return out.slice(0, 400);
  }, [masivoRows]);

  const masivoFilteredRows = useMemo(() => {
    const q = masivoTableSearch.trim().toLowerCase();
    let rows = masivoRows;
    if (q) {
      rows = rows.filter((row) => {
        const parts = [
          row.folio_doc,
          row.nombre_doc,
          row.tipo_doc,
          row.fch_emis_dte,
          row.mnt_total,
          row.mnt_cesion,
          row.cedente,
          row.rz_cedente,
          row.deudor,
          row.mail_deudor,
          row.id_cesion,
          row.estado_cesion,
        ];
        const hay = parts.map((x) => (x != null ? String(x) : "")).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    if (masivoFolioRangeInvalid) return rows;
    const hasDesde = String(masivoForm.folio_desde || "").trim() !== "";
    const hasHasta = String(masivoForm.folio_hasta || "").trim() !== "";
    if (!hasDesde && !hasHasta) return rows;
    const minN = masivoFolioDesdeN;
    const maxN = masivoFolioHastaN;
    return rows.filter((row) => {
      const rowN = folioComparableNumber(row.folio_doc);
      if (rowN == null) return false;
      if (minN != null && rowN < minN) return false;
      if (maxN != null && rowN > maxN) return false;
      return true;
    });
  }, [
    masivoRows,
    masivoTableSearch,
    masivoForm.folio_desde,
    masivoForm.folio_hasta,
    masivoFolioDesdeN,
    masivoFolioHastaN,
    masivoFolioRangeInvalid,
  ]);

  const masivoSortedRows = useMemo(() => {
    const rows = [...masivoFilteredRows];
    rows.sort((a, b) => compareMasivoRows(a, b, masivoSort.column, masivoSort.dir));
    return rows;
  }, [masivoFilteredRows, masivoSort.column, masivoSort.dir]);

  const masivoPageCount = Math.max(1, Math.ceil(masivoSortedRows.length / MASIVO_TABLE_PAGE_SIZE));

  const masivoPagedRows = useMemo(() => {
    const start = (masivoPage - 1) * MASIVO_TABLE_PAGE_SIZE;
    return masivoSortedRows.slice(start, start + MASIVO_TABLE_PAGE_SIZE);
  }, [masivoSortedRows, masivoPage]);

  function onMasivoColumnSort(colKey) {
    setMasivoSort((prev) => {
      if (prev.column === colKey) {
        return { column: colKey, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { column: colKey, dir: "asc" };
    });
  }

  useEffect(() => {
    setMasivoPage(1);
  }, [masivoTableSearch, masivoForm.folio_desde, masivoForm.folio_hasta, masivoSort.column, masivoSort.dir]);

  useEffect(() => {
    setMasivoPage((p) => {
      const maxP = Math.max(1, Math.ceil(masivoSortedRows.length / MASIVO_TABLE_PAGE_SIZE));
      return p > maxP ? maxP : p;
    });
  }, [masivoSortedRows.length]);

  const taskOps = useMemo(() => new Set(["estado", "resultado", "estados"]), []);

  useEffect(() => {
    if (token) {
      loadMe();
    }
  }, [token]);

  useEffect(() => {
    setNavMenuOpen(null);
  }, [view]);

  async function loadMe() {
    setBootstrapping(true);
    try {
      const data = await apiFetch("/me");
      setCurrentUser(data.user);
      setPermissions(data.permissions || []);
      if ((data.permissions || []).includes("view_configuracion")) await loadSettings();
      if ((data.permissions || []).includes("view_solicitudes")) {
        await loadRequests(1, { silent: true });
        const perms = data.permissions || [];
        const isAdminNav =
          perms.includes("view_usuarios") || perms.includes("view_perfiles");
        if (isAdminNav) await loadCesionesRequests(1, { silent: true });
      }
      if ((data.permissions || []).includes("view_usuarios")) await loadUsers();
      if ((data.permissions || []).includes("view_perfiles")) await loadProfiles();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBootstrapping(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Credenciales invalidas");
      }
      localStorage.setItem("auth_token", data.token);
      setToken(data.token);
      setCurrentUser(data.user || null);
      setPermissions((data.user && data.user.permissions) || []);
      setMessage(`Sesion iniciada como ${data.user?.username || credentials.username}`);
    } catch (error) {
      const msg = String(error.message || error);
      if (msg.includes("Unexpected token") || msg.includes("not valid JSON")) {
        setMessage(
          "No se pudo conectar con el API. Revisa VITE_API_BASE_URL del build (debe apuntar al backend, no al bucket S3)."
        );
      } else {
        setMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("auth_token");
    setToken("");
    setCurrentUser(null);
    setPermissions([]);
    setSelectedRequest(null);
    setRequestsData({ items: [], total: 0, page: 1, total_pages: 1 });
    setRestrictedHomeTab("certificado");
    setMessage("Sesion cerrada.");
  }

  const canView = (perm) => permissions.includes(perm);
  const isRestrictedUser = !canView("view_usuarios") && !canView("view_perfiles");
  const operationForForm = isRestrictedUser ? DEMO_PROFILE_OPERATION : operation;
  /** Certificados y cesiones exigen periodo Desde/Hasta (no aplica a tareas estado/resultado/estados). */
  const showDateRangeFields = isRestrictedUser || !taskOps.has(operation);
  const onCesionarioFijoConsulta =
    (isRestrictedUser && restrictedHomeTab === "consultaCesiones") ||
    (!isRestrictedUser && operation === CESIONARIO_FIJO_CESIONES_OPERATION);
  const showPartyRowRestrictedCertificado =
    isRestrictedUser && restrictedHomeTab === "certificado" && showDateRangeFields;
  const rutLblCertificado = showPartyRowRestrictedCertificado ? rutRowLabels(operationForForm, true) : null;
  const showAdminStandardRutRow =
    !isRestrictedUser &&
    showDateRangeFields &&
    !taskOps.has(operation) &&
    operation !== CESIONARIO_FIJO_CESIONES_OPERATION;
  const rutLblAdmin = showAdminStandardRutRow ? rutRowLabels(operation, false) : null;

  /** Usuarios sin mantenedor (usuarios/perfiles) no ven Historial cesiones ni sus subvistas. */
  useEffect(() => {
    if (!isRestrictedUser) return;
    if (view === "historialCesiones" || view === "detalleCesiones") {
      setView("inicio");
      setCesionesDetalleRequest(null);
      setCesionesDetalleRows([]);
    }
  }, [isRestrictedUser, view]);

  useEffect(() => {
    if (!isRestrictedUser && operation !== CESIONARIO_FIJO_CESIONES_OPERATION) {
      setCesionesConsultaRows([]);
      setCesionesConsultaSinCoincidencias(false);
    }
  }, [operation, isRestrictedUser]);

  async function loadSettings() {
    try {
      const data = await apiFetch("/settings");
      setSettings(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/settings", { method: "PUT", body: JSON.stringify(settings) });
      setMessage("Configuracion guardada.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function executeOperation(event) {
    event.preventDefault();
    setLoading(true);
    try {
      let effectiveOperation = isRestrictedUser ? DEMO_PROFILE_OPERATION : operation;
      let payload;
      if (isRestrictedUser && restrictedHomeTab === "consultaCesiones") {
        const rutCedente = String(form.rut_cedente || "").trim();
        const folioDoc = String(form.folio_doc || "").trim();
        if (!rutCedente) {
          setMessage("Ingresa el RUT del cedente.");
          setLoading(false);
          return;
        }
        if (!folioDoc) {
          setMessage("Ingresa el folio del documento.");
          setLoading(false);
          return;
        }
        await runCesionarioFijoConsultaFlow({
          desde: form.desde,
          hasta: form.hasta,
          rut_cedente: rutCedente,
          folio_doc: folioDoc,
        });
        return;
      } else if (taskOps.has(operation) && !isRestrictedUser) {
        payload = { desde: form.desde, hasta: form.hasta };
      } else if (isRestrictedUser) {
        payload = {
          use_default_task_rut: true,
          desde: form.desde,
          hasta: form.hasta,
          ...partyRutsFromRow(form.rut_rel_1, form.rut_rel_2, effectiveOperation),
        };
      } else if (operation === CESIONARIO_FIJO_CESIONES_OPERATION) {
        const rutCedente = String(form.rut_cedente || "").trim();
        const folioDoc = String(form.folio_doc || "").trim();
        if (!rutCedente) {
          setMessage("Ingresa el RUT del cedente.");
          setLoading(false);
          return;
        }
        if (!folioDoc) {
          setMessage("Ingresa el folio del documento.");
          setLoading(false);
          return;
        }
        await runCesionarioFijoConsultaFlow({
          desde: form.desde,
          hasta: form.hasta,
          rut_cedente: rutCedente,
          folio_doc: folioDoc,
        });
        return;
      } else {
        const principal = String(form.rut_tarea || "").trim();
        if (!principal) {
          setMessage("Ingresa el RUT de la tarea en el primer campo.");
          setLoading(false);
          return;
        }
        payload = {
          rut: principal,
          desde: form.desde,
          hasta: form.hasta,
          ...partyRutsFromRow(form.rut_rel_1, form.rut_rel_2, effectiveOperation),
        };
      }
      const data = await apiFetch(`/operations/${effectiveOperation}`, { method: "POST", body: JSON.stringify(payload) });
      await loadRequests(1, { silent: true, excludeCesiones: true });
      await loadCesionesRequests(1, { silent: true });
      const tryAutoDocumento = !taskOps.has(effectiveOperation) || isRestrictedUser;
      if (tryAutoDocumento && data.request_id) {
        setMessage("Solicitud registrada. Obteniendo el documento...");
        const res = await runDocumentoPipelineForRequestId(data.request_id, {
          syncSelectedRequest: false,
          cesionesListPage: 1,
        });
        setMessage(res.message);
      } else {
        setMessage("Operacion registrada. Podras verla en Solicitudes.");
        setView("solicitudes");
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function requestsListQueryString(page, searchQ, excludeCesiones) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("q", searchQ);
    if (excludeCesiones !== false) params.set("exclude_operation_prefix", "cesiones");
    return params.toString();
  }

  async function loadRequests(page = 1, opts = {}) {
    const silent = opts.silent === true;
    const excludeCesiones = opts.excludeCesiones !== false;
    if (!silent) setListLoading(true);
    try {
      const qs = requestsListQueryString(page, q, excludeCesiones);
      const data = await apiFetch(`/requests?${qs}`);
      setRequestsData(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      if (!silent) setListLoading(false);
    }
  }

  async function loadCesionesRequests(page = 1, opts = {}) {
    const silent = opts.silent === true;
    if (!silent) setCesionesListLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("q", cesionesQ);
      params.set("operation_prefix", "cesiones");
      const data = await apiFetch(`/requests?${params.toString()}`);
      setCesionesListData(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      if (!silent) setCesionesListLoading(false);
    }
  }

  async function openRequest(id) {
    setDetailLoading(true);
    try {
      const data = await apiFetch(`/requests/${id}`);
      setSelectedRequest(data);
      setView("detalle");
      return data;
    } catch (error) {
      setMessage(error.message);
      return null;
    } finally {
      setDetailLoading(false);
    }
  }

  function volverHistorialCesiones() {
    setView(isRestrictedUser ? "inicio" : "historialCesiones");
    setCesionesDetalleRequest(null);
    setCesionesDetalleRows([]);
  }

  function volverSolicitudes() {
    setView("solicitudes");
    setSelectedRequest(null);
  }

  async function openCesionesDetalle(item) {
    setCesionesDetalleRequest(item);
    setCesionesDetalleRows([]);
    setView("detalleCesiones");
    setCesionesDetalleLoading(true);
    try {
      const data = await apiFetch(`/requests/${item.id}/cesiones-filas`);
      setCesionesDetalleRows(data.items || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCesionesDetalleLoading(false);
    }
  }

  async function runPipelineFromList(requestId) {
    setListPipelineLoadingId(requestId);
    try {
      const res = await runDocumentoPipelineForRequestId(requestId, {
        syncSelectedRequest: false,
        listPage: requestsData.page,
        cesionesListPage: cesionesListData.page,
      });
      setMessage(res.message);
    } finally {
      setListPipelineLoadingId(null);
    }
  }

  /**
   * Consulta estado, genera resultado si hace falta y abre PDF. Usado desde Inicio (tras Ejecutar) y desde detalle.
   */
  async function runDocumentoPipelineForRequestId(requestId, options = {}) {
    const { syncSelectedRequest = false, listPage, cesionesListPage } = options;
    const pageToRefresh = listPage != null ? listPage : 1;
    const cesPage = cesionesListPage != null ? cesionesListPage : 1;
    const id = String(requestId);

    async function pull() {
      const data = await apiFetch(`/requests/${id}`);
      if (syncSelectedRequest) setSelectedRequest(data);
      return data;
    }

    try {
      let req = await pull();
      const isCesionesOperation = String(req.operation || "").startsWith("cesiones-");
      const taskId = String(req.task_id || "").trim();
      if (!taskId) {
        return {
          ok: false,
          message: isCesionesOperation
            ? isRestrictedUser
              ? "El tramite aun no tiene numero de seguimiento. Espera unos segundos y vuelve a intentar desde Inicio (pestaña Consulta cesiones) con los mismos datos."
              : "El tramite aun no tiene numero de seguimiento. Espera unos segundos y pulsa Actualizar solicitud en Historial cesiones."
            : "El tramite aun no tiene numero de seguimiento. Espera unos segundos y en Solicitudes abre la solicitud y pulsa Obtener documento, o vuelve a ejecutar desde Inicio.",
        };
      }

      await apiFetch(`/requests/${id}/fetch-status`, {
        method: "POST",
        body: JSON.stringify({ id_tarea: taskId }),
      });
      req = await pull();
      await loadRequests(pageToRefresh, { silent: true, excludeCesiones: true });
      await loadCesionesRequests(cesPage, { silent: true });

      let hasPdf = requestHasPdfKey(req);
      if (!hasPdf) {
        try {
          await apiFetch(`/requests/${id}/fetch-result`, {
            method: "POST",
            body: JSON.stringify({ id_tarea: taskId }),
          });
        } catch (resultErr) {
          req = await pull();
          await loadRequests(pageToRefresh, { silent: true, excludeCesiones: true });
          await loadCesionesRequests(cesPage, { silent: true });
          const resultErrMessage = resultErr?.message || "";
          const filePending =
            /archivo.*no est[aá] listo|estado actual|creado|HTTP 400/i.test(resultErrMessage);
          const baseResultMessage = filePending
            ? "Archivo solicitado al servicio. Aun no esta disponible; por favor reintenta mas tarde."
            : resultErrMessage || "No se pudo obtener el resultado todavia; el tramite puede seguir en proceso.";
          return {
            ok: false,
            message:
              baseResultMessage +
              (isCesionesOperation
                ? isRestrictedUser
                  ? " Reintenta en unos momentos desde Inicio (pestaña Consulta cesiones)."
                  : " Reintenta con Actualizar solicitud en Historial cesiones."
                : " Reintenta Obtener documento en el detalle de la solicitud."),
          };
        }
        req = await pull();
        await loadRequests(pageToRefresh, { silent: true, excludeCesiones: true });
        await loadCesionesRequests(cesPage, { silent: true });
        hasPdf = requestHasPdfKey(req);
      }

      if (isCesionesOperation) {
        const rowsSaved = Number(req.response_data?.filas_insertadas || 0);
        return {
          ok: true,
          message:
            rowsSaved > 0
              ? `Consulta finalizada. Hay ${rowsSaved} registro(s) para revisar.`
              : "Consulta finalizada. No se encontraron registros para mostrar.",
        };
      }

      if (hasPdf) {
        const pdfData = await apiFetch(`/requests/${id}/pdf`);
        window.open(pdfData.download_url, "_blank", "noopener");
        return {
          ok: true,
          message: "Si el navegador lo permite, el PDF se abrira en una nueva pestana.",
        };
      }
      return {
        ok: false,
        message:
          "Archivo solicitado al servicio. Aun no esta disponible; por favor reintenta mas tarde desde Obtener documento.",
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message || "Ocurrio un error al contactar el servicio.",
      };
    }
  }

  async function runCesionarioFijoConsultaFlow(payload) {
    setCesionesConsultaRows([]);
    setCesionesConsultaSinCoincidencias(false);
    setLoading(true);
    setCesionesConsultaStatus("Buscando si ya hay resultados guardados...");
    try {
      let data = await apiFetch("/cesiones/consulta-cesionario-fijo", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const items = data.items || [];
      if (items.length > 0) {
        setCesionesConsultaRows(items);
        setCesionesConsultaSinCoincidencias(false);
        setMessage(`Se encontraron ${items.length} registro(s) guardados previamente.`);
        return;
      }
      setCesionesConsultaStatus("No hay resultados previos. Consultando...");
      const opRes = await apiFetch(`/operations/${CESIONARIO_FIJO_CESIONES_OPERATION}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadRequests(1, { silent: true, excludeCesiones: true });
      await loadCesionesRequests(1, { silent: true });
      if (opRes.request_id) {
        setCesionesConsultaStatus("Actualizando la consulta y guardando resultados...");
        const res = await runDocumentoPipelineForRequestId(opRes.request_id, {
          syncSelectedRequest: false,
          cesionesListPage: 1,
        });
        setCesionesConsultaStatus("Cargando resultados actualizados...");
        data = await apiFetch("/cesiones/consulta-cesionario-fijo", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const itemsAfter = data.items || [];
        if (itemsAfter.length > 0) {
          setCesionesConsultaRows(itemsAfter);
          setCesionesConsultaSinCoincidencias(false);
          setMessage(`Se muestran ${itemsAfter.length} fila(s) guardadas tras el servicio. ${res.message}`);
        } else if (res.ok) {
          setCesionesConsultaSinCoincidencias(true);
          setMessage(res.message || "");
        } else {
          setCesionesConsultaSinCoincidencias(false);
          setMessage(
            `No hay registros para esta consulta o el tramite aun no termina. ${res.message || ""}`.trim()
          );
        }
      } else {
        setMessage("No se pudo registrar la solicitud. Intenta de nuevo.");
      }
    } catch (error) {
      setMessage(error.message || "Error en la consulta de cesiones.");
    } finally {
      setLoading(false);
      setCesionesConsultaStatus("");
    }
  }

  function masivoIdCesionStr(row) {
    return row?.id_cesion != null && String(row.id_cesion).trim() !== "" ? String(row.id_cesion).trim() : "";
  }

  function toggleMasivoSelectId(idKey) {
    if (!idKey) return;
    setMasivoSelectedIds((prev) => (prev.includes(idKey) ? prev.filter((x) => x !== idKey) : [...prev, idKey]));
  }

  function setMasivoSelectAll(checked, sourceRows) {
    const list = sourceRows ?? masivoRows;
    const ids = list.map((r) => masivoIdCesionStr(r)).filter(Boolean);
    if (!ids.length) return;
    setMasivoSelectedIds((prev) => {
      if (checked) {
        const set = new Set(prev);
        ids.forEach((id) => set.add(id));
        return Array.from(set);
      }
      const idsSet = new Set(ids);
      return prev.filter((id) => !idsSet.has(id));
    });
  }

  async function consultarCesionesMasivo(e) {
    e.preventDefault();
    const period = assertDateRangeMaxDaysAllowed(masivoForm.desde, masivoForm.hasta, MASIVO_MAX_PERIOD_DAYS);
    if (!period.ok) {
      setMessage(period.message);
      return;
    }
    if (!String(masivoForm.rut_cedente || "").trim()) {
      setMessage("Ingresa el RUT del cedente.");
      return;
    }
    if (!String(masivoForm.rut_deudor || "").trim()) {
      setMessage("Ingresa el RUT del deudor.");
      return;
    }
    setMasivoLoading(true);
    setMasivoOverlayMessage("Consultando cesiones en el SII y guardando resultados...");
    setMasivoRows([]);
    setMasivoSelectedIds([]);
    setMasivoRequestId(null);
    setMasivoTableSearch("");
    setMasivoPage(1);
    try {
      const payload = buildMasivoCesionesCertPayload(masivoForm);
      const opRes = await apiFetch(`/operations/${OPERATION_CESIONES_CERTIFICADO_MASIVO}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadRequests(1, { silent: true, excludeCesiones: true });
      await loadCesionesRequests(1, { silent: true });
      if (!opRes.request_id) {
        setMessage("No se pudo registrar la solicitud de cesiones.");
        return;
      }
      const res = await runDocumentoPipelineForRequestId(opRes.request_id, {
        syncSelectedRequest: false,
        cesionesListPage: 1,
      });
      const data = await apiFetch(`/requests/${opRes.request_id}/cesiones-filas`);
      const items = data.items || [];
      setMasivoRequestId(String(opRes.request_id));
      setMasivoRows(items);
      setMasivoSort({ column: "folio_doc", dir: "asc" });
      setMessage(
        items.length > 0
          ? `Listo: se encontraron ${items.length} resultado(s). ${res.message || ""}`.trim()
          : (res.message || "La consulta termino, pero no hay filas para mostrar en la tabla.").trim()
      );
    } catch (error) {
      setMessage(error.message || "Error al consultar cesiones.");
    } finally {
      setMasivoLoading(false);
      setMasivoOverlayMessage("");
    }
  }

  async function obtenerCertificadoMasivo() {
    if (masivoSelectedIds.length === 0) {
      setMessage("Marca con la casilla al menos una fila del listado antes de pedir el certificado.");
      return;
    }
    const period = assertDateRangeMaxDaysAllowed(masivoForm.desde, masivoForm.hasta, MASIVO_MAX_PERIOD_DAYS);
    if (!period.ok) {
      setMessage(period.message);
      return;
    }
    setMasivoLoading(true);
    setMasivoOverlayMessage("Solicitando certificado al SII...");
    try {
      const payload = {
        ...buildMasivoCesionesCertPayload(masivoForm),
        id_cesiones: masivoSelectedIds.filter(Boolean),
      };
      if (!payload.id_cesiones.length) {
        setMessage("Las filas marcadas no traen un numero de identificacion valido para pedir el certificado. Elige otras filas.");
        setMasivoLoading(false);
        setMasivoOverlayMessage("");
        return;
      }
      const opRes = await apiFetch(`/operations/${OPERATION_CERTIFICADOS_CESIONARIO}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadRequests(1, { silent: true, excludeCesiones: true });
      await loadCesionesRequests(1, { silent: true });
      if (opRes.request_id) {
        setMessage("Solicitud de certificado registrada. Obteniendo el documento...");
        const res = await runDocumentoPipelineForRequestId(opRes.request_id, {
          syncSelectedRequest: false,
          listPage: requestsData.page,
          cesionesListPage: cesionesListData.page,
        });
        setMessage(res.message);
      } else {
        setMessage("Operacion registrada.");
      }
    } catch (error) {
      setMessage(error.message || "Error al solicitar el certificado.");
    } finally {
      setMasivoLoading(false);
      setMasivoOverlayMessage("");
    }
  }

  async function runObtenerDocumentoSecuencia() {
    if (!selectedRequest) return;
    setDetailActionPending("pipeline");
    try {
      const res = await runDocumentoPipelineForRequestId(selectedRequest.id, {
        syncSelectedRequest: true,
        listPage: requestsData.page,
        cesionesListPage: cesionesListData.page,
      });
      setMessage(res.message);
    } finally {
      setDetailActionPending(null);
    }
  }

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const data = await apiFetch("/admin/users");
      setUsersData(data.items || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUsersLoading(false);
    }
  }

  async function saveUser(event) {
    event.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/admin/users", { method: "POST", body: JSON.stringify({ ...userForm, profile_id: Number(userForm.profile_id) }) });
      setUserForm({ username: "", full_name: "", password: "", profile_id: "", is_active: true });
      await loadUsers();
      setMessage("Usuario creado.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadProfiles() {
    setProfilesLoading(true);
    try {
      const data = await apiFetch("/admin/profiles");
      setProfilesData(data.items || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setProfilesLoading(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const payload = { ...profileForm, permissions: profileForm.permissions.filter(Boolean) };
      await apiFetch("/admin/profiles", { method: "POST", body: JSON.stringify(payload) });
      setProfileForm({ name: "", description: "", is_active: true, permissions: [] });
      await loadProfiles();
      setMessage("Perfil creado.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function buildFriendlySummary(request) {
    const responseData = request?.response_data || {};
    const hasPdf = Boolean(responseData?.pdf_key);
    const hasTask = Boolean(request?.task_id);
    const statusCode = request?.status_code;

    let statusText = "Solicitud registrada";
    if (statusCode && Number(statusCode) >= 200 && Number(statusCode) < 300) statusText = "Solicitud procesada correctamente";
    if (statusCode && Number(statusCode) >= 400) statusText = "Solicitud con observaciones o error";

    let recommendation = "Desde Inicio, Ejecutar intenta abrir el documento si ya esta listo; si no, usa Obtener documento aqui.";
    if (hasTask) recommendation = "Pulsa Obtener documento para actualizar el estado y descargar cuando este disponible.";
    if (hasPdf) recommendation = "Ya hay un documento asociado. Obtener documento lo abrira en una nueva pestana.";
    if (statusCode && Number(statusCode) >= 400) recommendation = "Hubo una observacion en la ultima respuesta. Revisa la informacion de la solicitud o reintenta Obtener documento.";

    return {
      statusText,
      recommendation,
      hasPdf,
      dateRange:
        request?.payload?.desde && request?.payload?.hasta
          ? `${request.payload.desde} a ${request.payload.hasta}`
          : null,
      rut:
        request?.payload?.rut != null && String(request.payload.rut).trim() !== ""
          ? String(request.payload.dv ?? "").trim() !== ""
            ? `${request.payload.rut}-${request.payload.dv}`
            : String(request.payload.rut)
          : null,
    };
  }

  const detailOverlayMessage =
    detailActionPending === "pipeline"
      ? "Actualizando y preparando el documento..."
      : detailLoading
        ? "Cargando detalle..."
        : "";
  const showDetailOverlay = Boolean(detailActionPending || detailLoading);

  return (
    <div className="app-shell">
      {!token ? (
        <div className="container vh-100 d-flex align-items-center justify-content-center">
          <div className="row w-100 justify-content-center">
            <div className="col-12 col-md-6 col-lg-4">
              <div className="card shadow-lg border-0">
                <div className="card-body p-4">
                  <h1 className="h4 text-center fw-bold mb-2">Consultas SII</h1>
                  <p className="text-secondary text-center mb-4">Ingreso seguro al sistema</p>
                  <form onSubmit={login}>
                    <div className="mb-3">
                      <label className="form-label">Usuario</label>
                      <input
                        className="form-control"
                        placeholder="Ingresa tu usuario"
                        value={credentials.username}
                        onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Password</label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="Ingresa tu password"
                        value={credentials.password}
                        onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                        required
                      />
                    </div>
                    <button
                      className="btn btn-primary w-100 d-inline-flex align-items-center justify-content-center gap-2"
                      disabled={loading}
                      type="submit"
                    >
                      {loading && <Spinner />}
                      {loading ? "Ingresando..." : "Ingresar"}
                    </button>
                  </form>
                  {message && <div className="alert alert-info mt-3 mb-0">{message}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm navbar-if border-bottom border-white border-opacity-10">
        <div className="container-fluid px-3 px-lg-4 py-2">
          <span className="navbar-brand fw-semibold mb-0">Consultas SII</span>
          <div className="navbar-if-toolbar ms-auto">
            {canView("view_inicio") && (
              <NavbarDropdown
                menuId="principal"
                buttonLabel="Principal"
                buttonTitle="Inicio y certificado masivo"
                openMenu={navMenuOpen}
                setOpenMenu={setNavMenuOpen}
                items={[
                  {
                    key: "inicio",
                    label: "Consulta cesiones",
                    title: "Ir a la pantalla principal y operaciones habituales",
                    onClick: () => setView("inicio"),
                  },
                  {
                    key: "masivo",
                    label: "Certificado masivo",
                    title: "Buscar cesiones por cedente y deudor, y pedir certificado de varias a la vez",
                    onClick: () => setView(VIEW_CERTIFICADOS_MASIVO),
                  },
                ]}
              />
            )}
            {canView("view_solicitudes") && (
              <NavbarDropdown
                menuId="tramites"
                buttonLabel="Historial"
                buttonTitle="Solicitudes e historial de cesiones"
                openMenu={navMenuOpen}
                setOpenMenu={setNavMenuOpen}
                items={[
                  {
                    key: "solicitudes",
                    label: "Solicitudes",
                    title: "Ver solicitudes y descargar documentos",
                    onClick: () => {
                      setView("solicitudes");
                      loadRequests(1);
                    },
                  },
                  ...(!isRestrictedUser
                    ? [
                        {
                          key: "historial",
                          label: "Historial cesiones",
                          title: "Historial de consultas de cesiones",
                          onClick: () => {
                            setView("historialCesiones");
                            loadCesionesRequests(1);
                          },
                        },
                      ]
                    : []),
                ]}
              />
            )}
            {(canView("view_usuarios") || canView("view_perfiles")) && (
              <NavbarDropdown
                menuId="admin"
                buttonLabel="Administración"
                buttonTitle="Usuarios y perfiles del sistema"
                openMenu={navMenuOpen}
                setOpenMenu={setNavMenuOpen}
                items={[
                  ...(canView("view_usuarios")
                    ? [
                        {
                          key: "usuarios",
                          label: "Usuarios",
                          title: "Gestionar usuarios del sistema",
                          onClick: () => {
                            setView("usuarios");
                            loadUsers();
                          },
                        },
                      ]
                    : []),
                  ...(canView("view_perfiles")
                    ? [
                        {
                          key: "perfiles",
                          label: "Perfiles",
                          title: "Gestionar perfiles y permisos",
                          onClick: () => {
                            setView("perfiles");
                            loadProfiles();
                          },
                        },
                      ]
                    : []),
                ]}
              />
            )}
            {canView("view_configuracion") && (
              <NavbarDropdown
                menuId="ajustes"
                buttonLabel="Ajustes"
                buttonTitle="Conexion al SII y parametros tecnicos"
                openMenu={navMenuOpen}
                setOpenMenu={setNavMenuOpen}
                items={[
                  {
                    key: "config",
                    label: "Configuración",
                    title: "Conexion al SII, tokens y tiempos de espera",
                    onClick: () => setView("config"),
                  },
                ]}
              />
            )}
            <div className="navbar-if-exit">
              <button
                type="button"
                className="btn btn-outline-light btn-sm rounded-pill"
                title="Cerrar sesion de forma segura"
                onClick={logout}
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="container py-4 position-relative" style={{ minHeight: bootstrapping ? "50vh" : undefined }}>
      <LoadingOverlay show={bootstrapping} message="Cargando tu sesion..." />
      <div className={bootstrapping ? "opacity-50 pe-none user-select-none" : ""}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">
          {view === VIEW_CERTIFICADOS_MASIVO
            ? "Certificado masivo por cesiones"
            : isRestrictedUser
              ? restrictedHomeTab === "consultaCesiones"
                ? "Consulta de cesiones (cesionario)"
                : "Obtención de certificado de cesión"
              : "Panel de Gestion"}
        </h1>
        <span className="text-secondary small d-inline-flex align-items-center gap-2">
          {currentUser ? `Usuario: ${currentUser.username}` : ""}
          {bootstrapping && <Spinner />}
        </span>
      </div>
      {message && <div className="alert alert-info">{message}</div>}

      {isRestrictedUser && canView("view_inicio") && view === "inicio" && (
        <div className="btn-group mb-3" role="group" aria-label="Tipo de tramite">
          <button
            type="button"
            className={`btn btn-sm ${restrictedHomeTab === "certificado" ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => {
              setRestrictedHomeTab("certificado");
              setCesionesConsultaRows([]);
              setCesionesConsultaSinCoincidencias(false);
            }}
          >
            Certificado de cesión
          </button>
          <button
            type="button"
            className={`btn btn-sm ${restrictedHomeTab === "consultaCesiones" ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setRestrictedHomeTab("consultaCesiones")}
          >
            Consulta cesiones
          </button>
        </div>
      )}

      {view === "inicio" && canView("view_inicio") && (
        <>
        <section className="card border-0 shadow-sm mb-4">
          <div className="card-body">
          <div className="alert alert-light border mb-3">
            <h3 className="h6 mb-2">Instrucciones</h3>
            <ol className="mb-2 ps-3">
              {isRestrictedUser && restrictedHomeTab === "consultaCesiones" ? (
                <>
                  <li>
                    Indica <strong>Desde</strong> y <strong>Hasta</strong> del periodo (obligatorias).
                  </li>
                  <li>
                    Ingresa el <strong>RUT del cedente</strong> y el <strong>folio del documento</strong>; con eso y el periodo se
                    hace la busqueda.
                  </li>
                  <li>
                    Pulsa <strong>Ejecutar</strong>: si ya hay resultados de una consulta anterior, se muestran abajo; si no, se
                    inicia una nueva consulta y al terminar podras ver los resultados en el mismo lugar.
                  </li>
                </>
              ) : isRestrictedUser ? (
                <>
                  <li>
                    Elige el <strong>periodo</strong> con <strong>Desde</strong> y <strong>Hasta</strong> (obligatorias).
                  </li>
                  <li>
                    Si aplica, ingresa el <strong>RUT del cliente</strong> y el <strong>RUT del deudor</strong> (puedes escribirlos con o sin puntos).
                  </li>
                  <li>
                    Pulsa <strong>Ejecutar</strong> para solicitar el certificado. Si el documento esta listo, puede abrirse en
                    otra pestana; si no, entra a <strong>Solicitudes</strong>, abre el detalle y usa <strong>Obtener documento</strong>.
                  </li>
                </>
              ) : (
                <>
                  <li>Elige el tipo de tramite con los botones de operacion.</li>
                  <li>
                    Completa <strong>Desde</strong> y <strong>Hasta</strong> cuando el formulario lo pida, y los RUT que correspondan.
                  </li>
                  <li>
                    Pulsa <strong>Ejecutar</strong> para enviar la solicitud. Si hay documento disponible, se intentara abrir aqui;
                    si no, revisa <strong>Solicitudes</strong> y el detalle de la solicitud.
                  </li>
                </>
              )}
            </ol>
            <p className="small text-muted mb-0">
              {isRestrictedUser && restrictedHomeTab === "consultaCesiones"
                ? "El RUT del cesionario de la consulta lo aplica el sistema segun tu perfil; no hace falta ingresarlo."
                : isRestrictedUser
                  ? "Revisa que las fechas cubran el periodo que necesitas."
                  : "Algunas operaciones solo registran la solicitud: el seguimiento se hace en Solicitudes."}
            </p>
          </div>
          {!isRestrictedUser && (
            <div className="row g-3">
              {operationGroups.map((group) => (
                <div key={group.title} className="col-12 col-md-4">
                  <p className="text-uppercase text-muted small fw-semibold mb-2">{group.title}</p>
                  <div className="d-flex flex-wrap gap-2">
                    {group.operations.map((op) => (
                      <button key={op} className={op === operation ? "btn btn-primary btn-sm" : "btn btn-outline-secondary btn-sm"} onClick={() => setOperation(op)}>
                        {op}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={executeOperation} className="row g-3 mt-1">
            {showDateRangeFields && (
              <>
                <div className="col-12 col-md-6">
                  <label className="form-label mb-1">Desde <span className="text-danger">*</span></label>
                  <input
                    className="form-control"
                    type="date"
                    required
                    value={form.desde || ""}
                    onChange={(e) => setForm({ ...form, desde: e.target.value })}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label mb-1">Hasta <span className="text-danger">*</span></label>
                  <input
                    className="form-control"
                    type="date"
                    required
                    value={form.hasta || ""}
                    onChange={(e) => setForm({ ...form, hasta: e.target.value })}
                  />
                </div>
              </>
            )}
            {onCesionarioFijoConsulta && (
              <>
                <div className="col-12 col-md-6">
                  <label className="form-label mb-1">
                    RUT cedente <span className="text-danger">*</span>
                  </label>
                  <input
                    className="form-control font-monospace"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Ej: 12.345.678-9"
                    required
                    value={form.rut_cedente}
                    onChange={(e) => setForm({ ...form, rut_cedente: e.target.value })}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label mb-1">
                    Folio del documento <span className="text-danger">*</span>
                  </label>
                  <input
                    className="form-control font-monospace"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Ej: 123456"
                    required
                    value={form.folio_doc}
                    onChange={(e) => setForm({ ...form, folio_doc: e.target.value })}
                  />
                </div>
              </>
            )}
            {rutLblCertificado && (
              <>
                <div className="col-12 col-md-6">
                  <label className="form-label mb-1">{rutLblCertificado.l3}</label>
                  <input
                    className="form-control font-monospace"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Ej: 22.222.222-2"
                    value={form.rut_rel_2}
                    onChange={(e) => setForm({ ...form, rut_rel_2: e.target.value })}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label mb-1">{rutLblCertificado.l2}</label>
                  <input
                    className="form-control font-monospace"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Ej: 88.201.900-4"
                    value={form.rut_rel_1}
                    onChange={(e) => setForm({ ...form, rut_rel_1: e.target.value })}
                  />
                </div>
              </>
            )}
            {rutLblAdmin && (
              <>
                <div className="col-12 col-md-4">
                  <label className="form-label mb-1">
                    {rutLblAdmin.l1} {!taskOps.has(operation) && <span className="text-danger">*</span>}
                  </label>
                  <input
                    className="form-control font-monospace"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Ej: 12.345.678-9"
                    value={form.rut_tarea}
                    onChange={(e) => setForm({ ...form, rut_tarea: e.target.value })}
                    required={!taskOps.has(operation)}
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label mb-1">{rutLblAdmin.l2}</label>
                  <input
                    className="form-control font-monospace"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Ej: 88.201.900-4"
                    value={form.rut_rel_1}
                    onChange={(e) => setForm({ ...form, rut_rel_1: e.target.value })}
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label mb-1">{rutLblAdmin.l3}</label>
                  <input
                    className="form-control font-monospace"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Ej: 22.222.222-2"
                    value={form.rut_rel_2}
                    onChange={(e) => setForm({ ...form, rut_rel_2: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="col-12">
              <p className="text-muted small mb-0">
                {showDateRangeFields
                  ? onCesionarioFijoConsulta
                    ? "La busqueda usa el periodo, el RUT del cedente y el folio. Si no hay resultados previos, se hace una consulta nueva con los mismos datos."
                    : isRestrictedUser
                      ? "Desde y Hasta marcan el periodo del certificado. Cliente y Deudor son opcionales."
                      : "Desde y Hasta son obligatorias cuando el tramite las requiere. Completa tambien los RUT indicados en el formulario."
                  : "Completa los campos que pida la operacion elegida."}
              </p>
            </div>
            <div className="col-12">
              <button className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={loading} type="submit">
                {loading && <Spinner />}
                {loading ? (onCesionarioFijoConsulta ? "Procesando..." : "Ejecutando...") : "Ejecutar"}
              </button>
            </div>
            {onCesionarioFijoConsulta && cesionesConsultaStatus ? (
              <div className="col-12 mt-3">
                <SpinnerBlock message={cesionesConsultaStatus} />
              </div>
            ) : null}
          </form>
          </div>
        </section>

        {onCesionarioFijoConsulta && (cesionesConsultaRows.length > 0 || cesionesConsultaSinCoincidencias) ? (
          <section className="card border-primary border-2 shadow mb-4 overflow-hidden">
            <div className="card-header bg-primary-subtle border-bottom border-primary-subtle py-3">
              <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                <div className="flex-grow-1 min-w-0">
                  <h2 className="h6 mb-0 text-primary-emphasis fw-semibold">Resultado de la consulta</h2>
                  <p className="small text-muted mb-0 mt-2">
                    {cesionesConsultaRows.length > 0
                      ? "Aqui ves los registros encontrados para tu consulta: documento, partes involucradas y datos de la cesion."
                      : "Consulta por folio, cedente y periodo frente al libro de facturas cedidas al cesionario del perfil."}
                  </p>
                </div>
                {cesionesConsultaRows.length > 0 ? (
                  <span className="badge rounded-pill bg-success-subtle text-success-emphasis border border-success-subtle fw-normal px-3 py-2 align-self-center flex-shrink-0">
                    Documento Cedido a Interfactor
                  </span>
                ) : null}
              </div>
            </div>
            <div className="card-body">
              {cesionesConsultaRows.length > 0 ? (
                <CesionesResultadosOrdenados rows={cesionesConsultaRows} />
              ) : (
                <p className="mb-0 text-secondary">
                  Folio no se encuentra entre las facturas cedidas a interfactor.
                </p>
              )}
            </div>
          </section>
        ) : null}
        </>
      )}

      {view === VIEW_CERTIFICADOS_MASIVO && canView("view_inicio") && (
        <section className="card border-0 shadow-sm mb-4 position-relative">
          <LoadingOverlay show={masivoLoading} message={masivoOverlayMessage || "Procesando..."} />
          <div className={`card-body ${masivoLoading ? "opacity-50 pe-none user-select-none" : ""}`}>
            <div className="alert alert-light border mb-3">
              <h2 className="h6 mb-2">Pasos sencillos</h2>
              <ol className="mb-2 ps-3 small">
                <li>
                  Escribe el <strong>RUT de quien cede la factura (cedente)</strong>, el <strong>RUT de quien debe (deudor)</strong> y el
                  rango de fechas <strong>Desde</strong> y <strong>Hasta</strong>. El intervalo no puede ser mayor a {MASIVO_MAX_PERIOD_DAYS}{" "}
                  dias. El RUT de la empresa cesionaria (quien recibe la cesion) lo usa el sistema automaticamente; no hace falta que lo
                  escribas.
                </li>
                <li>
                  Pulsa <strong>Consultar cesiones</strong> y espera a que termine la carga. Aparecera un listado con las operaciones que
                  coinciden con tus datos.
                </li>
                <li>
                  Si el listado es largo, escribe en el <strong>cuadro de filtro</strong> lo que buscas (por ejemplo un folio, un nombre o
                  un monto) para acortar la lista. En <strong>Búsqueda avanzada</strong> puedes acotar por <strong>folio desde</strong> y{" "}
                  <strong>folio hasta</strong> (solo afecta la tabla en pantalla, no la consulta al SII). Pulsa el{" "}
                  <strong>titulo de una columna</strong> para ordenar (al cargar el resultado viene ordenado por <strong>folio</strong> de
                  menor a mayor; otro clic en la misma columna invierte el orden). El listado se divide en <strong>paginas</strong> para que
                  sea mas facil de revisar.
                </li>
                <li>
                  Marca con una casilla las cesiones para las que quieres el certificado. Las marcas <strong>se mantienen</strong> aunque
                  cambies de pagina, el orden de las columnas o uses el filtro. <strong>Marcar todas de esta pagina</strong> solo afecta a las
                  filas visibles en la pagina actual que traen numero de identificacion.
                </li>
                <li>
                  Pulsa <strong>Obtener certificado(s)</strong>. El sistema pedira al Servicio de Impuestos el certificado correspondiente a
                  lo que marcaste. Si no se abre un archivo enseguida, entra a <strong>Solicitudes</strong> y revisa el estado del tramite
                  alli.
                </li>
              </ol>
              <p className="small text-muted mb-0">
                Cualquier persona con acceso al menu <strong>Inicio</strong> puede usar esta pantalla. Las demas opciones del sistema
                siguen igual.
              </p>
            </div>
            <form onSubmit={consultarCesionesMasivo} className="row g-3 mb-4">
              <div className="col-12 col-md-6">
                <label className="form-label mb-1">
                  RUT cedente <span className="text-danger">*</span>
                </label>
                <input
                  className="form-control font-monospace"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="Ej: 76.543.210-K"
                  required
                  value={masivoForm.rut_cedente}
                  onChange={(e) => setMasivoForm({ ...masivoForm, rut_cedente: e.target.value })}
                />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label mb-1">
                  RUT deudor <span className="text-danger">*</span>
                </label>
                <input
                  className="form-control font-monospace"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="Ej: 11.222.333-4"
                  required
                  value={masivoForm.rut_deudor}
                  onChange={(e) => setMasivoForm({ ...masivoForm, rut_deudor: e.target.value })}
                />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label mb-1">
                  Desde <span className="text-danger">*</span>
                </label>
                <input
                  className="form-control"
                  type="date"
                  required
                  value={masivoForm.desde}
                  onChange={(e) => setMasivoForm({ ...masivoForm, desde: e.target.value })}
                />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label mb-1">
                  Hasta <span className="text-danger">*</span>
                </label>
                <input
                  className="form-control"
                  type="date"
                  required
                  value={masivoForm.hasta}
                  onChange={(e) => setMasivoForm({ ...masivoForm, hasta: e.target.value })}
                />
              </div>
              <div className="col-12">
                <details
                  className="border rounded px-3 py-2 bg-body-tertiary bg-opacity-50"
                  open={masivoAdvancedOpen}
                  onToggle={(e) => setMasivoAdvancedOpen(e.target.open)}
                >
                  <summary className="small fw-semibold user-select-none" style={{ cursor: "pointer" }}>
                    Búsqueda avanzada: folio desde / hasta (opcional)
                  </summary>
                  <p className="small text-muted mt-2 mb-3">
                    Filtra el <strong>listado en pantalla</strong> despues de consultar. Puedes escribir el folio o elegir uno sugerido del
                    resultado. La consulta al SII sigue usando solo cedente, deudor y fechas.
                  </p>
                  <div className="row g-3 pb-1">
                    <div className="col-12 col-md-6">
                      <label className="form-label small mb-1" htmlFor="masivo-folio-desde">
                        Folio desde
                      </label>
                      <input
                        id="masivo-folio-desde"
                        className="form-control form-control-sm font-monospace"
                        list="masivo-folios-datalist"
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="Ej: 100"
                        value={masivoForm.folio_desde}
                        onChange={(e) => setMasivoForm({ ...masivoForm, folio_desde: e.target.value })}
                      />
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label small mb-1" htmlFor="masivo-folio-hasta">
                        Folio hasta
                      </label>
                      <input
                        id="masivo-folio-hasta"
                        className="form-control form-control-sm font-monospace"
                        list="masivo-folios-datalist"
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="Ej: 500"
                        value={masivoForm.folio_hasta}
                        onChange={(e) => setMasivoForm({ ...masivoForm, folio_hasta: e.target.value })}
                      />
                    </div>
                  </div>
                  {masivoFolioRangeInvalid ? (
                    <p className="small text-danger mb-0">
                      El folio desde no puede ser mayor que el folio hasta. Corrige los valores para aplicar el filtro.
                    </p>
                  ) : null}
                  <div className="d-flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setMasivoForm({ ...masivoForm, folio_desde: "", folio_hasta: "" })}
                      disabled={masivoLoading || (!masivoForm.folio_desde.trim() && !masivoForm.folio_hasta.trim())}
                    >
                      Quitar filtro de folios
                    </button>
                  </div>
                </details>
                <datalist id="masivo-folios-datalist">
                  {masivoFolioDatalistOptions.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
              <div className="col-12 d-flex flex-wrap gap-2 align-items-center">
                <button className="btn btn-primary d-inline-flex align-items-center gap-2" type="submit" disabled={masivoLoading}>
                  {masivoLoading && <Spinner />}
                  Consultar cesiones
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setView("inicio")}
                  disabled={masivoLoading}
                >
                  Volver a Inicio
                </button>
              </div>
            </form>

            {masivoRows.length > 0 ? (
              <>
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                  <h3 className="h6 mb-0">Listado de la consulta</h3>
                  <div className="form-check">
                    <input
                      id="masivo-select-all"
                      className="form-check-input"
                      type="checkbox"
                      disabled={masivoLoading || !masivoPagedRows.some((r) => masivoIdCesionStr(r))}
                      checked={
                        masivoPagedRows.some((r) => masivoIdCesionStr(r)) &&
                        masivoPagedRows
                          .map((r) => masivoIdCesionStr(r))
                          .filter(Boolean)
                          .every((id) => masivoSelectedIds.includes(id))
                      }
                      onChange={(e) => setMasivoSelectAll(e.target.checked, masivoPagedRows)}
                    />
                    <label className="form-check-label small" htmlFor="masivo-select-all">
                      Marcar todas las de esta pagina (con numero de identificacion)
                    </label>
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-12 col-md-8 col-lg-6">
                    <label className="form-label small text-muted mb-1" htmlFor="masivo-buscar">
                      Acortar el listado (opcional)
                    </label>
                    <input
                      id="masivo-buscar"
                      type="search"
                      className="form-control form-control-sm"
                      placeholder="Ejemplo: folio, parte del nombre, RUT, monto..."
                      value={masivoTableSearch}
                      onChange={(e) => setMasivoTableSearch(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="col-12 col-md-4 col-lg-6 d-flex align-items-end">
                    <p className="small text-muted mb-1 mb-md-0">
                      {masivoSortedRows.length === 0
                        ? "Sin filas que mostrar."
                        : (() => {
                            const from = (masivoPage - 1) * MASIVO_TABLE_PAGE_SIZE + 1;
                            const to = Math.min(masivoPage * MASIVO_TABLE_PAGE_SIZE, masivoSortedRows.length);
                            const folioFiltro =
                              !masivoFolioRangeInvalid &&
                              (masivoForm.folio_desde.trim() || masivoForm.folio_hasta.trim())
                                ? `Rango folio: ${masivoForm.folio_desde.trim() || "…"} – ${masivoForm.folio_hasta.trim() || "…"}. `
                                : "";
                            const filtro = masivoTableSearch.trim()
                              ? `Filtradas: ${masivoSortedRows.length} de ${masivoRows.length}. `
                              : `Total: ${masivoRows.length}. `;
                            return `${folioFiltro}${filtro}Pagina ${masivoPage} de ${masivoPageCount} (filas ${from} a ${to}).`;
                          })()}
                    </p>
                  </div>
                </div>
                {masivoSortedRows.length === 0 ? (
                  <p className="text-secondary small mb-0">
                    No hay filas que coincidan con lo que escribiste. Prueba con otra palabra o borra el filtro.
                  </p>
                ) : (
                <div className="table-responsive border rounded">
                  <table className="table table-sm table-striped mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th scope="col" style={{ width: "2.5rem" }} aria-label="Seleccionar" />
                        <MasivoSortTh
                          colKey="cedente"
                          sortColumn={masivoSort.column}
                          sortDir={masivoSort.dir}
                          onSort={onMasivoColumnSort}
                        >
                          RUT cedente
                        </MasivoSortTh>
                        <MasivoSortTh
                          colKey="rz_cedente"
                          sortColumn={masivoSort.column}
                          sortDir={masivoSort.dir}
                          onSort={onMasivoColumnSort}
                        >
                          Nombre cedente
                        </MasivoSortTh>
                        <MasivoSortTh
                          colKey="deudor"
                          sortColumn={masivoSort.column}
                          sortDir={masivoSort.dir}
                          onSort={onMasivoColumnSort}
                        >
                          RUT deudor
                        </MasivoSortTh>
                        <MasivoSortTh
                          colKey="folio_doc"
                          sortColumn={masivoSort.column}
                          sortDir={masivoSort.dir}
                          onSort={onMasivoColumnSort}
                        >
                          Folio
                        </MasivoSortTh>
                        <MasivoSortTh
                          colKey="documento"
                          sortColumn={masivoSort.column}
                          sortDir={masivoSort.dir}
                          onSort={onMasivoColumnSort}
                        >
                          Documento
                        </MasivoSortTh>
                        <MasivoSortTh
                          colKey="fch_emis_dte"
                          sortColumn={masivoSort.column}
                          sortDir={masivoSort.dir}
                          onSort={onMasivoColumnSort}
                        >
                          F. emision doc.
                        </MasivoSortTh>
                        <MasivoSortTh
                          colKey="mnt_total"
                          sortColumn={masivoSort.column}
                          sortDir={masivoSort.dir}
                          onSort={onMasivoColumnSort}
                          className="text-end"
                          textEnd
                        >
                          Monto total
                        </MasivoSortTh>
                        <MasivoSortTh
                          colKey="mnt_cesion"
                          sortColumn={masivoSort.column}
                          sortDir={masivoSort.dir}
                          onSort={onMasivoColumnSort}
                          className="text-end"
                          textEnd
                        >
                          Monto cesion
                        </MasivoSortTh>
                        <MasivoSortTh
                          colKey="id_cesion"
                          sortColumn={masivoSort.column}
                          sortDir={masivoSort.dir}
                          onSort={onMasivoColumnSort}
                        >
                          Nº identif.
                        </MasivoSortTh>
                        <MasivoSortTh
                          colKey="estado_cesion"
                          sortColumn={masivoSort.column}
                          sortDir={masivoSort.dir}
                          onSort={onMasivoColumnSort}
                        >
                          Estado
                        </MasivoSortTh>
                      </tr>
                    </thead>
                    <tbody>
                      {masivoPagedRows.map((row) => {
                        const idc = masivoIdCesionStr(row);
                        const rowKey = row.id != null ? String(row.id) : `ln-${row.line_number ?? ""}`;
                        const docLabel = [row.tipo_doc, row.nombre_doc].filter(Boolean).join(" · ") || "—";
                        return (
                          <tr key={rowKey}>
                            <td>
                              {idc ? (
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  checked={masivoSelectedIds.includes(idc)}
                                  onChange={() => toggleMasivoSelectId(idc)}
                                  disabled={masivoLoading}
                                  aria-label={`Seleccionar fila ${idc}`}
                                />
                              ) : (
                                <span className="text-muted small">—</span>
                              )}
                            </td>
                            <td className="font-monospace text-break small">{row.cedente?.trim() ? row.cedente : "—"}</td>
                            <td className="small text-break">{row.rz_cedente?.trim() ? row.rz_cedente : "—"}</td>
                            <td className="small">
                              <div className="font-monospace text-break">{row.deudor?.trim() ? row.deudor : "—"}</div>
                              {row.mail_deudor?.trim() ? (
                                <div className="text-muted text-break" style={{ fontSize: "0.72rem" }}>
                                  {row.mail_deudor}
                                </div>
                              ) : null}
                            </td>
                            <td className="font-monospace text-break">{row.folio_doc ?? "—"}</td>
                            <td className="text-break small">{docLabel}</td>
                            <td className="text-nowrap small">
                              {formatCesionesCampoDisplay(row.fch_emis_dte, "date")}
                            </td>
                            <td className="text-end font-monospace small">
                              {formatCesionesCampoDisplay(row.mnt_total, "amount")}
                            </td>
                            <td className="text-end font-monospace small">
                              {formatCesionesCampoDisplay(row.mnt_cesion, "amount")}
                            </td>
                            <td className="font-monospace text-break small">{idc || "—"}</td>
                            <td className="small">{row.estado_cesion ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {masivoPageCount > 1 ? (
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 px-2 py-2 border-top bg-body-secondary">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={masivoLoading || masivoPage <= 1}
                        onClick={() => setMasivoPage((p) => Math.max(1, p - 1))}
                      >
                        Anterior
                      </button>
                      <span className="small text-muted">
                        Pagina {masivoPage} de {masivoPageCount} ({MASIVO_TABLE_PAGE_SIZE} filas por pagina)
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={masivoLoading || masivoPage >= masivoPageCount}
                        onClick={() => setMasivoPage((p) => Math.min(masivoPageCount, p + 1))}
                      >
                        Siguiente
                      </button>
                    </div>
                  ) : null}
                </div>
                )}
                {masivoRequestId ? (
                  <p className="small text-muted mt-2 mb-0">
                    Por si necesitas revisar este tramite despues, quedo registrado con el numero{" "}
                    <span className="font-monospace">{masivoRequestId}</span>. Lo encuentras en <strong>Solicitudes</strong>
                    {!isRestrictedUser ? (
                      <>
                        {" "}
                        o, si tienes permisos de administracion, en <strong>Historial cesiones</strong>
                      </>
                    ) : null}
                    .
                  </p>
                ) : null}
                <div className="mt-3">
                  <button
                    type="button"
                    className="btn btn-success d-inline-flex align-items-center gap-2"
                    disabled={masivoLoading || masivoSelectedIds.length === 0}
                    onClick={() => obtenerCertificadoMasivo()}
                  >
                    {masivoLoading && <Spinner />}
                    Obtener certificado(s)
                  </button>
                  <span className="small text-muted ms-2">
                    {masivoSelectedIds.length} fila(s) marcada(s) para el certificado
                  </span>
                </div>
              </>
            ) : (
              <p className="text-secondary small mb-0">
                Aqui aparecera el listado cuando completes el formulario de arriba y pulses <strong>Consultar cesiones</strong>.
              </p>
            )}
          </div>
        </section>
      )}

      {view === "config" && canView("view_configuracion") && (
        <section className="card border-0 shadow-sm mb-4">
          <div className="card-body">
          <h2 className="h5 mb-3">Configuracion</h2>
          <form onSubmit={saveSettings} className="row g-3">
            <div className="col-12"><input className="form-control" value={settings.access_token} placeholder="Access token" onChange={(e) => setSettings({ ...settings, access_token: e.target.value })} /></div>
            <div className="col-12"><input className="form-control" value={settings.refresh_token} placeholder="Refresh token" onChange={(e) => setSettings({ ...settings, refresh_token: e.target.value })} /></div>
            <div className="col-12 col-md-8"><input className="form-control" value={settings.base_url} placeholder="Base URL" onChange={(e) => setSettings({ ...settings, base_url: e.target.value })} /></div>
            <div className="col-12 col-md-4"><input className="form-control" value={settings.timeout} placeholder="Timeout" onChange={(e) => setSettings({ ...settings, timeout: e.target.value })} /></div>
            <div className="col-12">
              <button className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={loading} type="submit">
                {loading && <Spinner />}
                {loading ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
          </div>
        </section>
      )}

      {view === "solicitudes" && canView("view_solicitudes") && (
        <section className="card border-0 shadow-sm mb-4">
          <div className="card-body position-relative">
          <LoadingOverlay
            show={listLoading || (detailLoading && view === "solicitudes")}
            message={detailLoading && view === "solicitudes" ? "Abriendo solicitud..." : "Cargando solicitudes..."}
          />
          <h2 className="h5 mb-2">Solicitudes</h2>
          <p className="small text-muted mb-3">
            Listado de tus solicitudes de certificados y tramites similares.
            {isRestrictedUser ? (
              <> Las consultas de cesiones las haces desde <strong>Inicio</strong>, pestaña Consulta cesiones.</>
            ) : (
              <>
                {" "}
                Las consultas de cesiones estan en <strong>Historial cesiones</strong>.
              </>
            )}
          </p>
          <div className="d-flex gap-2 mb-3">
            <input className="form-control" value={q} placeholder="Buscar" onChange={(e) => setQ(e.target.value)} disabled={listLoading} />
            <button
              className="btn btn-outline-primary d-inline-flex align-items-center gap-2"
              disabled={listLoading}
              onClick={() => loadRequests(1)}
              type="button"
            >
              {listLoading && <Spinner />}
              Buscar
            </button>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead className="table-light">
                <tr>
                  <th>Fechas ingresadas</th>
                  <th>RUT tarea</th>
                  <th>Deudor</th>
                  <th>Cliente</th>
                  <th>Cesionario</th>
                  <th>Fecha solicitud (hora Chile)</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {requestsData.items.map((item) => {
                  const ruts = getRequestRutCells(item);
                  const rowBusy = listPipelineLoadingId === item.id;
                  return (
                  <tr key={item.id}>
                    <td>{getRequestDateRange(item)}</td>
                    <td className="small text-nowrap font-monospace">{ruts.tarea}</td>
                    <td className="small text-nowrap font-monospace">{ruts.deudor}</td>
                    <td className="small text-nowrap font-monospace">{ruts.cliente}</td>
                    <td className="small text-nowrap font-monospace">{ruts.cesionario}</td>
                    <td>{formatChileDateTime(item.created_at)}</td>
                    <td className="text-nowrap">
                      {!isRestrictedUser && (
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          disabled={detailLoading}
                          onClick={() => openRequest(item.id)}
                          type="button"
                        >
                          Ver
                        </button>
                      )}
                      {isRestrictedUser && (
                        <button
                          className="btn btn-sm btn-primary d-inline-flex align-items-center justify-content-center gap-1"
                          disabled={detailLoading || listLoading || rowBusy}
                          onClick={() => openRequest(item.id)}
                          type="button"
                        >
                          Ver detalle
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-end align-items-center gap-2">
            <button
              className="btn btn-sm btn-outline-secondary"
              disabled={requestsData.page <= 1 || listLoading}
              onClick={() => loadRequests(requestsData.page - 1)}
              type="button"
            >
              Anterior
            </button>
            <span className="small text-muted d-inline-flex align-items-center gap-2">
              {listLoading && <Spinner />}
              {requestsData.page} / {requestsData.total_pages}
            </span>
            <button
              className="btn btn-sm btn-outline-secondary"
              disabled={requestsData.page >= requestsData.total_pages || listLoading}
              onClick={() => loadRequests(requestsData.page + 1)}
              type="button"
            >
              Siguiente
            </button>
          </div>
          </div>
        </section>
      )}

      {view === "historialCesiones" && canView("view_solicitudes") && !isRestrictedUser && (
        <section className="card border-0 shadow-sm mb-4">
          <div className="card-body position-relative">
            <LoadingOverlay
              show={cesionesListLoading || (detailLoading && view === "historialCesiones")}
              message={detailLoading && view === "historialCesiones" ? "Abriendo solicitud..." : "Cargando historial..."}
            />
            <h2 className="h5 mb-2">Historial cesiones</h2>
            <p className="small text-muted mb-3">
              Aqui ves las consultas de cesiones que has realizado. Si vuelves a consultar los mismos datos, los resultados
              mostrados corresponden a la ultima vez que se completo la consulta.
            </p>
            <div className="d-flex gap-2 mb-3">
              <input
                className="form-control"
                value={cesionesQ}
                placeholder="Buscar"
                onChange={(e) => setCesionesQ(e.target.value)}
                disabled={cesionesListLoading}
              />
              <button
                className="btn btn-outline-primary d-inline-flex align-items-center gap-2"
                disabled={cesionesListLoading}
                onClick={() => loadCesionesRequests(1)}
                type="button"
              >
                {cesionesListLoading && <Spinner />}
                Buscar
              </button>
            </div>
            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead className="table-light">
                  <tr>
                    <th>ID</th>
                    <th>Operacion</th>
                    <th>Periodo</th>
                    <th>RUT tarea</th>
                    <th>Cedente</th>
                    <th>Folio</th>
                    <th>Resultado</th>
                    <th>Fecha (Chile)</th>
                    <th>{isRestrictedUser ? "Acciones" : "Detalle"}</th>
                  </tr>
                </thead>
                <tbody>
                  {cesionesListData.items.map((item) => {
                    const ruts = getRequestRutCells(item);
                    const p = getRequestPayload(item);
                    const estadoRes = getCesionesEstadoResultado(item);
                    const hasTaskId = Boolean(item.task_id && String(item.task_id).trim());
                    const rowBusy = listPipelineLoadingId === item.id;
                    const cedenteFmt = formatRutDvDisplay(p.rut_cedente, p.dv_cedente);
                    return (
                      <tr key={item.id}>
                        <td className="font-monospace small">{item.id}</td>
                        <td className="small">{item.operation}</td>
                        <td className="small">{getRequestDateRange(item)}</td>
                        <td className="small text-nowrap font-monospace">{ruts.tarea}</td>
                        <td className="small text-nowrap font-monospace">{cedenteFmt !== "—" ? cedenteFmt : "—"}</td>
                        <td className="small font-monospace">{p.folio_doc != null && p.folio_doc !== "" ? String(p.folio_doc) : "—"}</td>
                        <td className="small">
                          <CesionesResultadoCelda estado={estadoRes} />
                        </td>
                        <td>{formatChileDateTime(item.created_at)}</td>
                        <td className="text-nowrap">
                          {!isRestrictedUser && (
                            <div className="d-flex flex-wrap gap-1">
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                disabled={detailLoading}
                                onClick={() => openRequest(item.id)}
                                type="button"
                              >
                                Ver
                              </button>
                              {estadoRes.puedeDetalle ? (
                                <button
                                  className="btn btn-sm btn-outline-primary"
                                  disabled={cesionesDetalleLoading || rowBusy}
                                  onClick={() => openCesionesDetalle(item)}
                                  type="button"
                                >
                                  Detalle filas
                                </button>
                              ) : null}
                            </div>
                          )}
                          {isRestrictedUser && (
                            <div className="d-flex flex-column flex-xl-row gap-1 align-items-stretch align-items-xl-center">
                              {estadoRes.puedeDetalle ? (
                                <button
                                  className="btn btn-sm btn-outline-primary d-inline-flex align-items-center justify-content-center gap-1"
                                  disabled={cesionesDetalleLoading || rowBusy}
                                  onClick={() => openCesionesDetalle(item)}
                                  type="button"
                                >
                                  Ver detalle
                                </button>
                              ) : null}
                              <button
                                className="btn btn-sm btn-primary d-inline-flex align-items-center justify-content-center gap-1"
                                disabled={cesionesListLoading || !hasTaskId || rowBusy}
                                onClick={() => runPipelineFromList(item.id)}
                                title={
                                  hasTaskId
                                    ? "Actualizar el estado de la consulta y los datos mostrados"
                                    : "Aun no hay numero de seguimiento para esta solicitud"
                                }
                                type="button"
                              >
                                {listPipelineLoadingId === item.id && <Spinner />}
                                Actualizar solicitud
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-end align-items-center gap-2">
              <button
                className="btn btn-sm btn-outline-secondary"
                disabled={cesionesListData.page <= 1 || cesionesListLoading}
                onClick={() => loadCesionesRequests(cesionesListData.page - 1)}
                type="button"
              >
                Anterior
              </button>
              <span className="small text-muted d-inline-flex align-items-center gap-2">
                {cesionesListLoading && <Spinner />}
                {cesionesListData.page} / {cesionesListData.total_pages}
              </span>
              <button
                className="btn btn-sm btn-outline-secondary"
                disabled={cesionesListData.page >= cesionesListData.total_pages || cesionesListLoading}
                onClick={() => loadCesionesRequests(cesionesListData.page + 1)}
                type="button"
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>
      )}

      {view === "detalleCesiones" &&
        canView("view_solicitudes") &&
        !isRestrictedUser &&
        cesionesDetalleRequest && (
        <section className="card border-0 shadow-sm mb-4">
          <div className="card-body position-relative">
            <LoadingOverlay show={cesionesDetalleLoading} message="Cargando filas guardadas..." />
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h2 className="h5 mb-0">Detalle cesiones (filas en base)</h2>
              <button className="btn btn-outline-secondary btn-sm" type="button" onClick={volverHistorialCesiones}>
                Volver al historial
              </button>
            </div>
            <div className="alert alert-light border small mb-3">
              <p className="mb-1">
                <strong>Solicitud ID:</strong> {cesionesDetalleRequest.id} · <strong>Operación:</strong>{" "}
                {cesionesDetalleRequest.operation}
              </p>
              <p className="mb-1">
                <strong>Periodo:</strong> {getRequestDateRange(cesionesDetalleRequest)}
              </p>
              <div className="mb-0">
                <strong className="d-block mb-1">Estado</strong>
                <CesionesResultadoCelda estado={getCesionesEstadoResultado(cesionesDetalleRequest)} />
              </div>
            </div>
            <p className="small text-muted mb-3">
              Por cada registro se muestran el <strong>folio</strong> y los <strong>RUT</strong> de deudor, cedente y
              cesionario.
            </p>
            {!cesionesDetalleLoading && cesionesDetalleRows.length === 0 ? (
              <p className="text-muted mb-0">No hay registros guardados para esta solicitud.</p>
            ) : null}
            {cesionesDetalleRows.length > 0 ? (
              <CesionesResultadosOrdenados rows={cesionesDetalleRows} variant="busqueda" />
            ) : null}
          </div>
        </section>
      )}

      {view === "detalle" && selectedRequest && canView("view_solicitudes") && (
        <section className="card border-0 shadow-sm mb-4">
          <div className="card-body position-relative">
          <LoadingOverlay show={showDetailOverlay} message={detailOverlayMessage} />
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <h2 className="h5 mb-0">Detalle solicitud</h2>
            {isRestrictedUser ? (
              <button className="btn btn-outline-secondary btn-sm" type="button" onClick={volverSolicitudes}>
                Volver a Solicitudes
              </button>
            ) : null}
          </div>
          <div className="alert alert-secondary border mb-3">
            <h3 className="h6 mb-2">Datos de la consulta solicitada</h3>
            <p className="small text-muted mb-2">
              Corresponden al periodo y RUTs que ingresaste al ejecutar la solicitud (mismo criterio que en el listado).
            </p>
            {(() => {
              const ruts = getRequestRutCells(selectedRequest);
              return (
                <>
                  <p className="mb-1">
                    <strong>Periodo:</strong> {getRequestDateRange(selectedRequest)}
                  </p>
                  <p className="mb-1">
                    <strong>RUT tarea:</strong> <span className="font-monospace">{ruts.tarea}</span>
                  </p>
                  <p className="mb-1">
                    <strong>Deudor:</strong> <span className="font-monospace">{ruts.deudor}</span>
                  </p>
                  <p className="mb-1">
                    <strong>Cliente:</strong> <span className="font-monospace">{ruts.cliente}</span>
                  </p>
                  <p className="mb-0">
                    <strong>Cesionario:</strong> <span className="font-monospace">{ruts.cesionario}</span>
                  </p>
                </>
              );
            })()}
          </div>
          <div className="alert alert-light border mb-3">
            <h3 className="h6 mb-2">Como usar esta pantalla</h3>
            <ol className="mb-2 ps-3">
              <li>Comprueba el <strong>ID</strong> y el tipo de <strong>Operacion</strong> para asegurarte de que es la solicitud correcta.</li>
              <li>
                Pulsa <strong>Obtener documento</strong> para actualizar el estado del tramite y abrir el documento cuando
                este disponible.
              </li>
              <li>Si el documento aun no esta listo, aparecera un aviso; puedes intentar de nuevo mas tarde.</li>
              <li>
                Al final de la pantalla puedes desplegar <strong>Informacion adicional</strong> para ver los datos enviados y
                recibidos.
              </li>
            </ol>
            <p className="small text-muted mb-0">
              Si algo falla, vuelve a Solicitudes y abre de nuevo la solicitud.
            </p>
          </div>
          <p><strong>ID:</strong> {selectedRequest.id}</p>
          <p><strong>Operacion:</strong> {selectedRequest.operation}</p>
          <p><strong>Task ID:</strong> {selectedRequest.task_id || "-"}</p>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <button
              className="btn btn-primary d-inline-flex align-items-center gap-2"
              disabled={
                Boolean(detailActionPending) ||
                detailLoading ||
                !String(selectedRequest.task_id || "").trim()
              }
              onClick={runObtenerDocumentoSecuencia}
              title={
                String(selectedRequest.task_id || "").trim()
                  ? "Actualizar el tramite y descargar el documento si esta disponible"
                  : "Aun no hay numero de seguimiento para esta solicitud"
              }
              type="button"
            >
              {detailActionPending === "pipeline" && <Spinner />}
              Obtener documento
            </button>
          </div>
          {!String(selectedRequest.task_id || "").trim() && (
            <p className="small text-muted mt-n2 mb-3">
              Cuando el tramite tenga numero de seguimiento, podras usar Obtener documento.
            </p>
          )}

          <div className="alert alert-primary mb-3">
            {(() => {
              const info = buildFriendlySummary(selectedRequest);
              return (
                <>
                  <p className="mb-1"><strong>Estado:</strong> {info.statusText}</p>
                  {info.rut && <p className="mb-1"><strong>RUT consultado:</strong> {info.rut}</p>}
                  {info.dateRange && <p className="mb-1"><strong>Periodo consultado:</strong> {info.dateRange}</p>}
                  <p className="mb-0"><strong>Que hacer ahora:</strong> {info.recommendation}</p>
                </>
              );
            })()}
          </div>

          <button
            className="btn btn-sm btn-outline-secondary mb-3"
            onClick={() => setShowTechnicalDetail((prev) => !prev)}
            type="button"
          >
            {showTechnicalDetail ? "Ocultar informacion adicional" : "Ver informacion adicional"}
          </button>

          <div className="row g-3" style={{ display: showTechnicalDetail ? "flex" : "none" }}>
            <article className="col-12 col-lg-6">
              <h3 className="h6">Datos enviados</h3>
              <pre>{JSON.stringify(selectedRequest.payload || {}, null, 2)}</pre>
            </article>
            <article className="col-12 col-lg-6">
              <h3 className="h6">Datos recibidos</h3>
              <pre>{JSON.stringify(selectedRequest.response_data || {}, null, 2)}</pre>
            </article>
          </div>
          </div>
        </section>
      )}

      {view === "usuarios" && canView("view_usuarios") && (
        <section className="card border-0 shadow-sm mb-4">
          <div className="card-body position-relative">
          <LoadingOverlay show={usersLoading} message="Cargando usuarios..." />
          <h2 className="h5 mb-3">Mantenedor de Usuarios</h2>
          <form onSubmit={saveUser} className="row g-3">
            <div className="col-12 col-md-6"><input className="form-control" placeholder="Username" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} /></div>
            <div className="col-12 col-md-6"><input className="form-control" placeholder="Nombre completo" value={userForm.full_name} onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} /></div>
            <div className="col-12 col-md-6"><input className="form-control" type="password" placeholder="Password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} /></div>
            <div className="col-12 col-md-6"><input className="form-control" placeholder="Profile ID" value={userForm.profile_id} onChange={(e) => setUserForm({ ...userForm, profile_id: e.target.value })} /></div>
            <div className="col-12">
              <button className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={loading} type="submit">
                {loading && <Spinner />}
                {loading ? "Guardando..." : "Crear usuario"}
              </button>
            </div>
          </form>
          <div className="table-responsive mt-3">
            <table className="table table-hover align-middle">
              <thead className="table-light"><tr><th>ID</th><th>Username</th><th>Nombre</th><th>Perfil</th><th>Activo</th></tr></thead>
              <tbody>
                {usersData.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td><td>{u.username}</td><td>{u.full_name || "-"}</td><td>{u.profile_name}</td><td>{u.is_active ? "Si" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </section>
      )}

      {view === "perfiles" && canView("view_perfiles") && (
        <section className="card border-0 shadow-sm mb-4">
          <div className="card-body position-relative">
          <LoadingOverlay show={profilesLoading} message="Cargando perfiles..." />
          <h2 className="h5 mb-3">Mantenedor de Perfiles</h2>
          <form onSubmit={saveProfile} className="row g-3">
            <div className="col-12 col-md-6"><input className="form-control" placeholder="Nombre perfil" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} /></div>
            <div className="col-12 col-md-6"><input className="form-control" placeholder="Descripcion" value={profileForm.description} onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })} /></div>
            <div className="col-12"><input className="form-control" placeholder="Permisos (coma separado)" onChange={(e) => setProfileForm({ ...profileForm, permissions: e.target.value.split(",").map((x) => x.trim()) })} /></div>
            <div className="col-12">
              <button className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={loading} type="submit">
                {loading && <Spinner />}
                {loading ? "Guardando..." : "Crear perfil"}
              </button>
            </div>
          </form>
          <div className="table-responsive mt-3">
            <table className="table table-hover align-middle">
              <thead className="table-light"><tr><th>ID</th><th>Nombre</th><th>Descripcion</th><th>Permisos</th></tr></thead>
              <tbody>
                {profilesData.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td><td>{p.name}</td><td>{p.description || "-"}</td><td>{(p.permissions || []).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </section>
      )}
      </div>
      </main>
        </>
      )}
    </div>
  );
}

export default App;
