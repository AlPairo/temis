export const FRONTEND_TEXT = {
  shared: {
    serviceErrorMessage: "Actualmente el servicio se encuentra con errores, contactar con soporte técnico."
  },
  appHome: {
    streamProgressSteps: [
      { delayMs: 0, text: "Procesando..." },
      { delayMs: 900, text: "Analizando petición..." },
      { delayMs: 1900, text: "Buscando contexto relevante..." },
      { delayMs: 3100, text: "Preparando respuesta..." }
    ],
    fallbackSessionTitle: "Nueva sesión",
    mobileNav: {
      sessions: "Sesiones",
      chat: "Chat",
      config: "Config"
    },
    sessionMessages: {
      renameSnackbarError: "No fue posible eliminar la sesión",
      renameAssistantError: "No fue posible renombrar la sesión en este momento.",
      deleteAssistantError: "No fue posible eliminar la sesión en este momento.",
      deleteSuccess: "Sesión eliminada"
    },
    userPanel: {
      dialogAriaLabel: "Panel de usuario",
      overlayCloseAriaLabel: "Cerrar panel de usuario",
      headingEyebrow: "Panel",
      headingTitle: "Usuario y configuración",
      closeButtonAriaLabel: "Cerrar panel"
    }
  },
  landing: {
    brandInitial: "T",
    brandName: "Temis",
    brandTagline: "Asistente legal seguro",
    nav: {
      signIn: "Iniciar sesión",
      createAccount: "Crear cuenta"
    },
    hero: {
      badge: "Diseñado para firmas",
      title: "Inteligencia legal con el rigor que tu firma exige.",
      body: "Temis centraliza tus sesiones, materias y permisos en un entorno seguro, listo para trabajo colaborativo y supervisión.",
      primaryCta: "Empezar ahora",
      secondaryCta: "Ver demo",
      highlights: ["Control granular de permisos", "SSE chat seguro", "Auditoría de sesiones"]
    },
    preview: {
      heading: "Vista previa",
      sessionsTitle: "Sesiones",
      roleLabel: "Supervisor",
      items: ["Audiencia", "Contrato", "Estrategia"],
      itemMessagesLabel: "3 mensajes",
      quickConfigTitle: "Config rápida",
      quickConfigChips: ["Materias", "Cuota 80%"]
    },
    features: [
      {
        title: "Confidencialidad",
        body: "Infraestructura alineada con firmas: sesiones privadas y control de acceso granular."
      },
      {
        title: "Trazabilidad",
        body: "Historial de conversaciones y materias disponibles para auditoría y revisión."
      },
      {
        title: "Control operativo",
        body: "Cuotas, fechas habilitadas y permisos por rol para cada usuario."
      }
    ]
  },
  topbar: {
    welcomeEyebrow: "Bienvenido/a",
    welcomePrefix: "",
    openUserPanelAriaLabel: "Abrir panel de usuario",
    signOut: "Salir"
  },
  sessionList: {
    heading: "Sesiones",
    refreshAriaLabel: "Refrescar",
    newSessionAriaLabel: "Nueva sesión",
    newSessionButton: "Nueva",
    scopeLabel: "Alcance",
    scopeMine: "Mis sesiones",
    scopeVisible: "Visibles",
    showDeleted: "Mostrar eliminadas",
    deletedBadge: "Eliminada",
    noMessages: "Sin mensajes",
    renamePromptTitle: "Nuevo nombre de la sesión",
    deleteConfirm: "¿Eliminar lógicamente esta sesión?",
    emptyState: "No hay sesiones aún."
  },
  chatView: {
    sessionPrefix: "Sesión: ",
    newSessionTitle: "Nueva sesión",
    analysisLabel: "Análisis Profundo",
    emptyStateIntro:
      "Soy Temis, tu agente especializado en Jurisprudencia Uruguaya. Si deseas buscar jurisprudencia, comenta un poco acerca del caso. Si quieres un analisis mas profundo, recuerda activar el modo analisis con el boton antes de enviar el mensaje.",
    emptyStateExamplesTitle: "Ejemplos de busqueda",
    emptyStateExamples: [
      "Despido indirecto por cambios unilaterales en condiciones laborales",
      "Responsabilidad civil por mala praxis medica en Uruguay",
      "Nulidad de clausulas abusivas en contratos de consumo"
    ],
    sessionIdTitlePrefix: "ID de sesión: ",
    sessionIdMissingTitle: "Sin ID de sesión",
    sessionIdShowAriaPrefix: "Ver ID de sesión: ",
    sessionIdMissingAria: "Sin ID de sesión",
    cancel: "Cancelar",
    textareaPlaceholder: "Escribe tu consulta legal...",
    sending: "Respondiendo...",
    send: "Enviar",
    referencesTitle: "Referencias",
    referencedDocumentsTitle: "Documentos referenciados",
    openDocumentAction: "Descargar documento",
    resolvingDocumentAction: "Descargando...",
    documentUnavailableMessage: "Documento no disponible.",
    noDocumentLinksAvailable: "No hay enlaces de documentos disponibles.",
    lowConfidenceBadge: "Baja confianza",
    citationNoDetail: "Documento sin detalle",
    citationScorePrefix: "score ",
    citationSourcePrefix: "Fuente: ",
    noReferencesReturned: "Sin referencias devueltas."
  },
  configPanel: {
    cards: {
      userConfig: "Config. de usuario",
      materias: "Materias",
      usersAndPermissions: "Usuarios y permisos"
    },
    fields: {
      role: "Rol",
      name: "Nombre",
      dateAccessPrefix: "Acceso: ",
      dateAccessNoRestrictions: "sin restricciones",
      dateAccessUnlimited: "ilimitado",
      quotaRemaining: "Cupo restante"
    },
    roleOptions: {
      basic: "Básico",
      supervisor: "Supervisor",
      admin: "Admin"
    },
    quotaSuffix: "consultas",
    materiasEmpty: "Sin materias asignadas.",
    addMateriaPlaceholder: "Agregar materia",
    permissions: {
      userManagementTitle: "Gestión de usuarios",
      supervisorPlus: "Supervisor+",
      readOnly: "Solo lectura",
      summary:
        "Los supervisores pueden crear, editar o eliminar usuarios. Los administradores también pueden cambiar roles y permisos.",
      chips: [
        "Asignar/editar materias",
        "Filtrar fechas",
        "Asignar cuotas",
        "Cambiar rol",
        "Editar permisos",
        "Eliminar usuarios"
      ]
    }
  },
  userManagement: {
    title: "Usuarios",
    subtitle: "Crea, edita y elimina usuarios según tu rol.",
    newUser: "Nuevo usuario",
    readOnly: "Solo lectura",
    materiasPrefix: "Materias: ",
    materiasEmpty: "N/A",
    edit: "Editar",
    permissions: "Permisos",
    seedUsers: [
      { id: "u1", name: "Ana Ruiz", role: "basic", materias: ["Civil"], quota: 80 },
      { id: "u2", name: "Carlos Pérez", role: "supervisor", materias: ["Laboral", "Civil"], quota: 150 },
      { id: "u3", name: "Lucía Fernández", role: "admin", materias: ["Mercantil"], quota: 200 }
    ]
  },
  defaults: {
    user: {
      id: "u-demo",
      name: "Felipe",
      role: "basic",
      materias: ["Civil", "Laboral"],
      quota: 120
    }
  },
  services: {
    chat: {
      mockStreamResponse: "Claro, aquí tienes un resumen ejecutivo con los puntos clave."
    },
    documents: {
      resolvePathPrefix: "/documents/",
      resolvePathSuffix: "/resolve"
    },
    sessions: {
      mockDeleteDetailPrefix: "Sesión '",
      mockDeleteDetailSuffix: "' eliminada"
    }
  },
  mocks: {
    sessions: [
      {
        session_id: "mock-1",
        title: "Contrato de arrendamiento",
        turns: 3,
        last_message: "Resumen del contrato"
      },
      {
        session_id: "mock-2",
        title: "Agenda audiencia",
        turns: 1,
        last_message: "Agenda audiencia"
      }
    ],
    histories: {
      "mock-1": {
        user: "Necesito un resumen breve del contrato de arrendamiento.",
        assistant: "Claro, incluye duración, canon, reajuste y garantías."
      },
      "mock-2": {
        user: "¿Cuándo es la próxima audiencia?"
      }
    }
  }
} as const;

export const formatSessionTurnsLabel = (turns: number): string => `${turns} mensajes`;

export const formatDeleteSessionAriaLabel = (title: string): string => `Eliminar sesión ${title}`;

export const formatMockDeleteSessionDetail = (id: string): string =>
  `${FRONTEND_TEXT.services.sessions.mockDeleteDetailPrefix}${id}${FRONTEND_TEXT.services.sessions.mockDeleteDetailSuffix}`;



