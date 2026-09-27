(function () {
  const IS_LOCAL_DEV_HOST = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const API_BASE = IS_LOCAL_DEV_HOST
    ? "http://127.0.0.1:8080"
    : "https://api.omnyid.com";
  const SESSION_STORAGE_KEY = "omnyid.preview.session";
  const TRIAL_FINGERPRINT_KEY = "omnyid.python.trial.fingerprint";
  let googleClientId = "";
  let googleInitialized = false;

  const authModal = document.getElementById("auth-modal");
  const authKicker = document.getElementById("auth-kicker");
  const authTitle = document.getElementById("auth-title");
  const authDescription = document.getElementById("auth-description");
  const privacyModePanel = document.getElementById("privacy-mode-panel");
  const platformEstimate = document.getElementById("platform-estimate");
  const privacyPathSummary = document.getElementById("privacy-path-summary");
  const authFeedback = document.getElementById("auth-feedback");
  const loginFeedback = document.getElementById("login-feedback");
  const waitlistFeedback = document.getElementById("waitlist-feedback");
  const trialUsageSummary = document.getElementById("trial-usage-summary");
  const trialFeedback = document.getElementById("trial-feedback");
  const trialMessages = document.getElementById("trial-messages");
  const trialTemplates = document.getElementById("trial-templates");
  const trialTraces = document.getElementById("trial-traces");
  const trialHistory = document.getElementById("trial-history");
  const trialReviewQueue = document.getElementById("trial-review-queue");
  const trialLogs = document.getElementById("trial-logs");
  const trialStudentValuePanel = document.getElementById("trial-student-value-panel");
  const trialStudentValueContent = document.getElementById("trial-student-value-content");
  const trialChatForm = document.getElementById("trial-chat-form");
  const trialChatInput = document.getElementById("trial-chat-input");
  const trialChatInputDefaultPlaceholder = trialChatInput ? trialChatInput.placeholder : "";
  const trialConvertButton = document.getElementById("trial-convert-button");
  const trialTemplateButtons = Array.prototype.slice.call(document.querySelectorAll("[data-trial-template]"));
  const trialSampleSourceButtons = Array.prototype.slice.call(document.querySelectorAll("[data-trial-sample-source]"));
  const sessionSummary = document.getElementById("session-summary");
  const sessionList = document.getElementById("session-list");
  const sessionSecurityFeedback = document.getElementById("session-security-feedback");
  const revokeOtherSessionsButton = document.getElementById("revoke-other-sessions-button");
  const exportDashboardButton = document.getElementById("export-dashboard-button");
  const exportDashboardFeedback = document.getElementById("export-dashboard-feedback");
  const agentConsole = document.getElementById("agent-console");
  const agentsGrid = document.getElementById("agents-grid");
  const messagesList = document.getElementById("messages-list");
  const actionLogList = document.getElementById("action-log-list");
  const demoFromAgent = document.getElementById("demo-from-agent");
  const demoToAgent = document.getElementById("demo-to-agent");
  const demoSendFeedback = document.getElementById("demo-send-feedback");
  const deployRuntimeButton = document.getElementById("deploy-runtime-button");
  const deployRuntimeFeedback = document.getElementById("deploy-runtime-feedback");
  const deployPythonRunnerButton = document.getElementById("deploy-python-runner-button");
  const deployPythonRunnerFeedback = document.getElementById("deploy-python-runner-feedback");
  const deployOpenClawButton = document.getElementById("deploy-openclaw-button");
  const deployOpenClawFeedback = document.getElementById("deploy-openclaw-feedback");
  const runtimeStartButton = document.getElementById("runtime-start-button");
  const runtimeStopButton = document.getElementById("runtime-stop-button");
  const runtimeRestartButton = document.getElementById("runtime-restart-button");
  const runtimeDestroyButton = document.getElementById("runtime-destroy-button");
  const runtimeRefreshLogsButton = document.getElementById("runtime-refresh-logs-button");
  const runtimeStatusFeedback = document.getElementById("runtime-status-feedback");
  const runtimeLogsMeta = document.getElementById("runtime-logs-meta");
  const runtimeLogsOutput = document.getElementById("runtime-logs-output");
  const runtimeRunnerConfigRefreshButton = document.getElementById("runtime-runner-config-refresh-button");
  const runtimeRunnerConfigSaveButton = document.getElementById("runtime-runner-config-save-button");
  const runtimeRunnerConfigFeedback = document.getElementById("runtime-runner-config-feedback");
  const runtimeRunnerStarterTemplate = document.getElementById("runtime-runner-starter-template");
  const runtimeRunnerModelMode = document.getElementById("runtime-runner-model-mode");
  const runtimeRunnerDefaultModel = document.getElementById("runtime-runner-default-model");
  const runtimeRunnerInputCap = document.getElementById("runtime-runner-input-cap");
  const runtimeRunnerOutputCap = document.getElementById("runtime-runner-output-cap");
  const runtimeRunnerDailyCap = document.getElementById("runtime-runner-daily-cap");
  const runtimeRunnerMonthlyCap = document.getElementById("runtime-runner-monthly-cap");
  const runtimeRunnerPolicyHistory = document.getElementById("runtime-runner-policy-history");
  const runtimeToolWebAllowlist = document.getElementById("runtime-tool-web-allowlist");
  const runtimeToolWeb = document.getElementById("runtime-tool-web");
  const runtimeToolGoogle = document.getElementById("runtime-tool-google");
  const runtimeToolStripe = document.getElementById("runtime-tool-stripe");
  const runtimeToolFiles = document.getElementById("runtime-tool-files");
  const runtimeToolVector = document.getElementById("runtime-tool-vector");
  const runtimeToolDb = document.getElementById("runtime-tool-db");
  const runtimeToolScheduler = document.getElementById("runtime-tool-scheduler");
  const runtimeToolAfp = document.getElementById("runtime-tool-afp");
  const runtimeChannelWebChat = document.getElementById("runtime-channel-web-chat");
  const runtimeChannelApiEndpoint = document.getElementById("runtime-channel-api-endpoint");
  const runtimeChannelAfpEndpoint = document.getElementById("runtime-channel-afp-endpoint");
  const runtimeUpdateChannel = document.getElementById("runtime-update-channel");
  const runtimeUpdateAutoApply = document.getElementById("runtime-update-auto-apply");
  const runtimeUpdateSavePolicyButton = document.getElementById("runtime-update-save-policy-button");
  const runtimeUpdateCheckButton = document.getElementById("runtime-update-check-button");
  const runtimeUpdateApplyButton = document.getElementById("runtime-update-apply-button");
  const runtimeUpdateFeedback = document.getElementById("runtime-update-feedback");
  const runtimeUpdateCurrentVersion = document.getElementById("runtime-update-current-version");
  const runtimeUpdateLatestVersion = document.getElementById("runtime-update-latest-version");
  const runtimeUpdateState = document.getElementById("runtime-update-state");
  const runtimeUpdateLastApplied = document.getElementById("runtime-update-last-applied");
  const runtimeUpdateHistory = document.getElementById("runtime-update-history");
  const runtimeBackupRetention = document.getElementById("runtime-backup-retention");
  const runtimeRecoveryPacketButton = document.getElementById("runtime-recovery-packet-button");
  const runtimeBackupSavePolicyButton = document.getElementById("runtime-backup-save-policy-button");
  const runtimeBackupSnapshotButton = document.getElementById("runtime-backup-snapshot-button");
  const runtimeBackupFeedback = document.getElementById("runtime-backup-feedback");
  const runtimeBackupPolicyRetention = document.getElementById("runtime-backup-policy-retention");
  const runtimeBackupPolicyStorage = document.getElementById("runtime-backup-policy-storage");
  const runtimeBackupPolicyLast = document.getElementById("runtime-backup-policy-last");
  const runtimeBackupList = document.getElementById("runtime-backup-list");
  const runtimeRestoreFeedback = document.getElementById("runtime-restore-feedback");
  const runtimeRestoreDrillList = document.getElementById("runtime-restore-drill-list");
  const downloadOnboardingBundleButton = document.getElementById("download-onboarding-bundle-button");
  const downloadServiceAdapterBundleButton = document.getElementById("download-service-adapter-bundle-button");
  const copyOnboardingCommandButton = document.getElementById("copy-onboarding-command-button");
  const onboardingBundleFeedback = document.getElementById("onboarding-bundle-feedback");
  const deviceBootstrapDesktopButton = document.getElementById("device-bootstrap-desktop-button");
  const deviceBootstrapMobileButton = document.getElementById("device-bootstrap-mobile-button");
  const deviceBootstrapWatchButton = document.getElementById("device-bootstrap-watch-button");
  const deviceBootstrapFeedback = document.getElementById("device-bootstrap-feedback");
  const deviceSyncPolicyList = document.getElementById("device-sync-policy-list");
  const onboardingCommandOutput = document.getElementById("onboarding-command-output");
  const onboardingDownloadLinks = document.getElementById("onboarding-download-links");
  const onboardingSummaryMode = document.getElementById("onboarding-summary-mode");
  const onboardingSummaryTarget = document.getElementById("onboarding-summary-target");
  const onboardingSummaryTime = document.getElementById("onboarding-summary-time");
  const onboardingNextSteps = document.getElementById("onboarding-next-steps");
  const supportAccessForm = document.getElementById("support-access-form");
  const supportAccessDuration = document.getElementById("support-access-duration");
  const supportAccessScope = document.getElementById("support-access-scope");
  const supportAccessReason = document.getElementById("support-access-reason");
  const supportAccessStatus = document.getElementById("support-access-status");
  const supportAccessDetails = document.getElementById("support-access-details");
  const supportAccessHistory = document.getElementById("support-access-history");
  const supportAccessFeedback = document.getElementById("support-access-feedback");
  const supportAccessRevokeButton = document.getElementById("support-access-revoke-button");
  const accountDeleteForm = document.getElementById("account-delete-form");
  const accountDeleteEmail = document.getElementById("account-delete-email");
  const accountDeleteConfirmation = document.getElementById("account-delete-confirmation");
  const accountDeleteFeedback = document.getElementById("account-delete-feedback");
  const setupForm = document.getElementById("setup-form");
  const setupFeedback = document.getElementById("setup-feedback");
  const setupEmailProvider = document.getElementById("setup-email-provider");
  const setupEmailAddress = document.getElementById("setup-email-address");
  const setupIdentityConfirmed = document.getElementById("setup-identity-confirmed");
  const setupEmailConnected = document.getElementById("setup-email-connected");
  const setupLlmMode = document.getElementById("setup-llm-mode");
  const setupPrivacyMode = document.getElementById("setup-privacy-mode");
  const setupDeploymentTarget = document.getElementById("setup-deployment-target");
  let session = readSession();
  let currentOnboarding = null;
  let currentRuntimeDeployment = null;
  let currentRunnerConfig = null;
  let currentRuntimeUpdates = null;
  let currentOnboardingBundle = null;
  let currentServiceAdapterBundle = null;
  let currentSupportAccess = null;
  let currentSupportAccessHistory = [];
  let currentDeviceSyncPolicies = [];
  let currentSessions = [];
  let currentRuntimeBackups = null;
  let currentRuntimeRestoreDrills = null;
  let authModeContext = "private-assistant";
  let selectedPrivacyMode = "managed_private";
  // Kept in sync with selectedPrivacyMode's default (managed_private -> OmnyID Cloud,
  // hosted on Oracle Cloud today) now that the privacy-mode picker is hidden and users
  // can no longer pick a deployment target by hand before their first sign-in.
  let selectedDeploymentTarget = "managed_omnyid";
  let currentTrialSession = null;
  let pendingResetToken = null;

  function readSession() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeSession(nextSession) {
    session = nextSession;
    // Written to sessionStorage (not localStorage) so it matches how the
    // /workspace/ SolidJS app (solid-ui/src/lib/api.ts) reads the session
    // after this page redirects there post sign-in.
    if (!nextSession) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  function readTrialFingerprint() {
    try {
      const existing = window.localStorage.getItem(TRIAL_FINGERPRINT_KEY);
      if (existing) {
        return existing;
      }
      const next = (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : ("trial-" + Date.now())).slice(0, 32);
      window.localStorage.setItem(TRIAL_FINGERPRINT_KEY, next);
      return next;
    } catch {
      return "trial-browser";
    }
  }

  async function apiFetch(path, options) {
    const headers = new Headers(options && options.headers ? options.headers : {});
    headers.set("Content-Type", "application/json");
    if (session && session.token) {
      headers.set("Authorization", "Bearer " + session.token);
    }

    let response;
    try {
      response = await fetch(API_BASE + path, {
        method: options && options.method ? options.method : "GET",
        headers,
        body: options && options.body ? JSON.stringify(options.body) : undefined
      });
    } catch {
      throw new Error(
        window.location.protocol === "file:"
          ? "This page was opened directly as a local file, so the browser blocks it from reaching " + API_BASE + ". Serve docs/ from a local web server (or use the hosted site) to use the trial runner."
          : "Cannot reach the OmnyID API right now. Check " + API_BASE + " and try again."
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || ("Request failed with " + response.status));
    }

    return response.json();
  }

  function setFeedback(target, text, tone) {
    if (!target) {
      return;
    }
    target.textContent = text;
    target.className = tone === "error"
      ? "text-sm text-error"
      : tone === "success"
        ? "text-sm text-secondary"
        : "text-sm text-on-surface-variant";
  }

  function startInlineGenesisLoader(feedbackEl) {
    if (!feedbackEl || !feedbackEl.parentNode || !window.OmnyIDGenesisLogo) {
      return function stop() {};
    }
    const canvas = document.createElement("canvas");
    canvas.className = "mt-2";
    canvas.style.display = "block";
    canvas.setAttribute("aria-hidden", "true");
    feedbackEl.insertAdjacentElement("afterend", canvas);
    const handle = window.OmnyIDGenesisLogo.mount(canvas, { size: 20, mode: "idle" });
    return function stop() {
      handle.stop();
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    };
  }

  function setTrialFeedback(text, tone) {
    if (!trialFeedback) {
      return;
    }
    trialFeedback.textContent = text;
    trialFeedback.className = tone === "error"
      ? "rounded-xl bg-red-50 px-4 py-3 text-sm text-error"
      : tone === "success"
        ? "rounded-xl bg-secondary-container/50 px-4 py-3 text-sm text-secondary"
        : "rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant";
    if (tone === "error") {
      trialFeedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function openAuthModal(event, modeOverride) {
    if (!authModal) {
      return;
    }
    const trigger = event && event.currentTarget ? event.currentTarget : null;
    authModeContext = modeOverride || (trigger && trigger.dataset && trigger.dataset.authMode
      ? trigger.dataset.authMode
      : "private-assistant");
    renderAuthMode();
    authModal.classList.remove("hidden");
    authModal.classList.add("flex");
    authModal.classList.add("items-start", "justify-center");
    document.body.classList.add("overflow-hidden");
  }

  function closeAuthModal() {
    if (!authModal) {
      return;
    }
    authModal.classList.add("hidden");
    authModal.classList.remove("flex");
    authModal.classList.remove("items-start", "justify-center");
    document.body.classList.remove("overflow-hidden");
  }

  function authModeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("auth");
    if (requestedMode === "agent-id" || requestedMode === "advanced-agent-id") {
      return "advanced-agent-id";
    }
    if (requestedMode === "signin" || requestedMode === "register") {
      return "private-assistant";
    }
    return null;
  }

  function focusAuthTargetFromUrl() {
    const requestedMode = new URLSearchParams(window.location.search).get("auth");
    const target = requestedMode === "register"
      ? document.getElementById("register-display-name")
      : document.getElementById("login-email");
    if (target) {
      setTimeout(() => target.focus(), 0);
    }
  }

  function openAuthModalFromUrl() {
    if (window.location.hash !== "#login" && window.location.hash !== "#auth") {
      return;
    }
    openAuthModal(null, authModeFromUrl() || "private-assistant");
    focusAuthTargetFromUrl();
  }

  // Run this as early as possible (right after its dependencies are defined),
  // not after the rest of this file's init code, so an unrelated error later
  // in the script can never silently prevent external links like
  // ".../index.html?auth=register#login" (used by the wedding site's sign-up
  // buttons) from opening the auth modal.
  try {
    openAuthModalFromUrl();
  } catch (err) {
    console.error("openAuthModalFromUrl failed", err);
  }

  function openResetPasswordFromUrl() {
    if (window.location.pathname !== "/reset-password") {
      return;
    }
    const token = new URLSearchParams(window.location.search).get("token");
    openAuthModal(null, "private-assistant");
    if (loginForm) loginForm.classList.add("hidden");
    if (forgotPasswordForm) forgotPasswordForm.classList.add("hidden");
    if (resetPasswordForm) resetPasswordForm.classList.remove("hidden");
    if (!token) {
      pendingResetToken = null;
      setFeedback(authFeedback, "Password reset link is incomplete. Request a fresh reset link and try again.", "error");
      return;
    }
    pendingResetToken = token;
  }

  function detectPlatformLabel() {
    const ua = navigator.userAgent || "";
    if (/Windows/i.test(ua)) {
      return "Windows";
    }
    if (/Macintosh|Mac OS X/i.test(ua)) {
      return "macOS";
    }
    if (/Linux/i.test(ua)) {
      return "Linux";
    }
    return "your device";
  }

  function renderPlatformEstimate() {
    if (!platformEstimate) {
      return;
    }
    const platform = detectPlatformLabel();
    const downlink = navigator.connection && typeof navigator.connection.downlink === "number"
      ? navigator.connection.downlink
      : null;
    let estimate = "Local private install usually takes 15 to 50 minutes.";
    if (downlink && downlink >= 50) {
      estimate = "Fast connection detected. Local private install will usually land closer to 15 to 25 minutes.";
    } else if (downlink && downlink >= 15) {
      estimate = "Moderate connection detected. Local private install will usually take about 20 to 35 minutes.";
    } else if (downlink && downlink > 0) {
      estimate = "Slower connection detected. Local private install may take 35 to 60 minutes depending on Docker downloads.";
    }
    platformEstimate.textContent = platform + " detected. " + estimate;
  }

  function privacyModeSummary(mode) {
    if (mode === "private_hosted") {
      return "Private Cloud in Your Account keeps the strongest hosted boundary. OmnyID helps provision the runtime into your Oracle, UpCloud, or OVHcloud account.";
    }
    if (mode === "managed_private") {
      return "OmnyID Cloud is the fastest path to your first running agent. OmnyID hosts the runtime with one isolated runtime, storage volume, and secret boundary per customer.";
    }
    return "Local Private runs on your own machine. OmnyID will keep the website as your control plane and guide the runtime setup after signup.";
  }

  function suggestedDeploymentTarget(mode) {
    if (mode === "private_hosted") {
      return "oracle_cloud";
    }
    if (mode === "managed_private") {
      return "managed_omnyid";
    }
    return "local_machine";
  }

  function renderSelectedPrivacyMode() {
    if (privacyPathSummary) {
      privacyPathSummary.textContent = privacyModeSummary(selectedPrivacyMode);
    }
    if (setupPrivacyMode) {
      setupPrivacyMode.value = selectedPrivacyMode;
    }
    if (setupDeploymentTarget && (!setupDeploymentTarget.value || setupDeploymentTarget.value === "local_machine" || setupDeploymentTarget.value === "managed_omnyid" || setupDeploymentTarget.value === "oracle_cloud")) {
      setupDeploymentTarget.value = selectedDeploymentTarget;
    }
  }

  function renderAuthMode() {
    if (!authTitle || !authDescription || !authKicker) {
      return;
    }
    renderPlatformEstimate();
    if (authModeContext === "advanced-agent-id") {
      authKicker.textContent = "Agent ID only";
      authTitle.textContent = "Create identity without replacing your existing agent stack.";
      authDescription.textContent = "Use this route if you already built agents elsewhere and only want OmnyID identity, discovery, and encrypted relay infrastructure.";
      if (privacyModePanel) {
        privacyModePanel.classList.add("hidden");
      }
      return;
    }

    authKicker.textContent = "Start your private assistant";
    authTitle.textContent = "Sign in to the private preview.";
    authDescription.textContent = "Use a custom email and password or continue with Google. After signup, OmnyID will seed a private agent workspace. OmnyID Cloud is the fastest path to your first running agent.";
    renderSelectedPrivacyMode();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isStudentTrialTemplate(templateId) {
    return templateId === "student_day_planner";
  }

  function lastMessageByRole(messages, role) {
    const list = Array.isArray(messages) ? messages : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i] && list[i].role === role) {
        return list[i];
      }
    }
    return null;
  }

  function trialSampleSourceText(kind) {
    if (kind === "reading") {
      return [
        "Reading excerpt: Week 3 decision-making and opportunity cost.",
        "The author argues that students often underestimate opportunity cost because the cost is invisible at the moment of choosing.",
        "A decision can look cheap in dollars but expensive in attention, sleep, and future study time.",
        "",
        "Question: Turn this into connected notes. Show the core concepts, what overlaps with lecture content, and what I should revise first."
      ].join("\n");
    }
    if (kind === "assignment") {
      return [
        "Assignment brief: 1200-word essay due next Friday.",
        "Prompt: Explain how opportunity cost affects everyday decision-making, using one economic theory and one real student example.",
        "Marking criteria: clear thesis, two academic sources, applied example, concise conclusion.",
        "",
        "Question: Break this into a stress-reducing study plan and create connected notes for the thesis, concepts, weak points, and next actions."
      ].join("\n");
    }
    return [
      "Lecture notes: Week 3 microeconomics.",
      "Topic: opportunity cost, scarcity, tradeoffs, marginal thinking.",
      "Professor emphasized that opportunity cost is the value of the next-best alternative, not just money spent.",
      "Example discussed: choosing an extra work shift before an exam can cost revision time and lower performance.",
      "",
      "Question: Organize this into connected notes, identify the likely exam points, and tell me what to revise first."
    ].join("\n");
  }

  function renderTrialStudentValuePanel(payload) {
    if (!trialStudentValuePanel || !trialStudentValueContent) {
      return;
    }
    if (!payload || !isStudentTrialTemplate(payload.active_template_id)) {
      trialStudentValuePanel.classList.add("hidden");
      trialStudentValueContent.innerHTML = '<p class="text-sm leading-6 text-on-surface-variant">Choose the Connected Study Workspace starter to see how a first run turns class material into reusable study structure.</p>';
      return;
    }

    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const lastUser = lastMessageByRole(messages, "user");
    const lastAssistant = lastMessageByRole(messages, "assistant");
    const turnCount = Math.max(
      0,
      messages.filter(function (entry) { return entry && entry.role === "user"; }).length - 1,
    );
    const hasGroundedExchange = Boolean(lastUser && lastAssistant && turnCount > 0);
    const remainingTurns = typeof payload.remaining_turns === "number" ? payload.remaining_turns : 0;
    const nextMove = remainingTurns > 0
      ? "Ask one narrower follow-up from the same study topic so the preview behaves like a connected thread instead of a one-off summary."
      : "The preview turn limit is spent. Sign in to keep the study thread, retained notes, and follow-up retrieval alive.";

    trialStudentValuePanel.classList.remove("hidden");
    trialStudentValueContent.innerHTML = [
      '<div class="rounded-2xl border border-white/80 bg-white/90 p-4">',
      '<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700/80">Immediate value</p>',
      '<p class="mt-2 text-sm leading-6 text-on-surface-variant">',
      escapeHtml(
        hasGroundedExchange
          ? "This run has already shown the student path: use class material, get a grounded answer back, then keep studying from the same topic instead of restarting."
          : "The fastest proof here is one real lecture note, reading, or rough study prompt that turns into a grounded answer in the first exchange."
      ),
      '</p>',
      '</div>',
      '<div class="rounded-2xl border border-emerald-200/40 bg-emerald-50/70 p-4">',
      '<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800">What the full workspace would keep</p>',
      '<div class="mt-3 space-y-2 text-sm leading-6 text-on-surface-variant">',
      '<p>Extracted study content so the first useful answer does not disappear after the session.</p>',
      '<p>Supertags and academic metadata so later search can narrow by topic, course, week, lecture, and study intent.</p>',
      '<p>Linked ideas or Zettelkasten branches so the same material compounds instead of turning into another isolated upload.</p>',
      '</div>',
      '</div>',
      '<div class="rounded-2xl border border-sky-200/40 bg-sky-50/70 p-4">',
      '<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800">Best next move</p>',
      '<p class="mt-2 text-sm leading-6 text-on-surface-variant">',
      escapeHtml(nextMove),
      '</p>',
      lastAssistant && lastAssistant.content
        ? '<p class="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-on-surface-variant"><span class="font-mono uppercase tracking-[0.14em] text-outline">Latest answer signal</span><br>' + escapeHtml(String(lastAssistant.content).slice(0, 180)) + (String(lastAssistant.content).length > 180 ? "&hellip;" : "") + '</p>'
        : '',
      '</div>',
      '<p class="text-xs leading-5 text-on-surface-variant">This anonymous preview does not retain files or memory. It is showing the workflow shape the signed-in workspace would preserve through Files, search, supertags, and linked study retrieval.</p>'
    ].join("");
  }

  function renderTrialSession(payload) {
    currentTrialSession = payload || null;
    if (!trialUsageSummary || !trialMessages) {
      return;
    }

    if (!payload) {
      trialUsageSummary.textContent = "Choose a starter to begin. OmnyID will keep this trial ephemeral and ask you to sign in before anything becomes persistent.";
      trialMessages.innerHTML = "<p>Pick a starter to begin the anonymous runner trial.</p>";
      if (trialTemplates) {
        trialTemplates.innerHTML = "<p>Template details appear here after the first session is created.</p>";
      }
      if (trialTraces) {
        trialTraces.innerHTML = "<p>No traces yet.</p>";
      }
      if (trialHistory) {
        trialHistory.innerHTML = "<p>No prompt history yet.</p>";
      }
      if (trialReviewQueue) {
        trialReviewQueue.innerHTML = "<p>No review items yet.</p>";
      }
      if (trialLogs) {
        trialLogs.innerHTML = "<p>No runner logs yet.</p>";
      }
      renderTrialStudentValuePanel(null);
      if (trialChatInput) {
        trialChatInput.placeholder = trialChatInputDefaultPlaceholder;
      }
      return;
    }

    trialUsageSummary.textContent =
      "Remaining runs: " + payload.remaining_runs +
      " of " + payload.max_runs +
      " - Remaining turns in this run: " + payload.remaining_turns +
      " of " + payload.max_turns +
      (payload.requires_signup ? " - Trial limit reached. Sign in to keep going." : "");

    trialMessages.innerHTML = (payload.messages || []).slice(-10).map(function (message) {
      const tone = message.role === "assistant"
        ? "bg-secondary-container/45"
        : message.role === "user"
          ? "bg-primary-fixed/45"
          : "bg-surface-container-high";
      return [
        '<article class="rounded-2xl border border-outline-variant/15 ', tone, ' p-4">',
        '<div class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline">', escapeHtml(message.role || "system"), '</div>',
        '<p class="mt-3 text-sm leading-7 text-on-surface-variant">', escapeHtml(message.content || ""), '</p>',
        '</article>'
      ].join("");
    }).join("");

    if (trialTemplates) {
      trialTemplates.innerHTML = (payload.starter_templates || []).map(function (template) {
        const active = payload.active_template_id === template.id;
        return [
          '<article class="rounded-xl border border-outline-variant/15 bg-surface-container-low p-3">',
          '<div class="flex items-center justify-between gap-3">',
          '<div><h4 class="text-sm font-semibold">', escapeHtml(template.name || template.id), '</h4>',
          '<p class="mt-1 text-xs leading-6 text-on-surface-variant">', escapeHtml(template.summary || ""), '</p></div>',
          active ? '<span class="rounded-full bg-primary-fixed px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">active</span>' : '',
          '</div>',
          '</article>'
        ].join("");
      }).join("");
    }

    if (trialChatInput) {
      const activeTemplate = (payload.starter_templates || []).find(function (template) {
        return template.id === payload.active_template_id;
      });
      const nextPrompt = activeTemplate && Array.isArray(activeTemplate.suggested_prompts)
        ? activeTemplate.suggested_prompts[0]
        : null;
      trialChatInput.placeholder = nextPrompt
        ? "Try: \"" + nextPrompt + "\""
        : trialChatInputDefaultPlaceholder;
    }

    if (trialTraces) {
      trialTraces.innerHTML = (payload.traces || []).slice(-6).map(function (trace) {
        return '<div class="rounded-xl bg-surface-container-low px-3 py-2 font-mono text-xs leading-6 text-on-surface-variant">' +
          escapeHtml(trace.tool || "tool") + " - " + escapeHtml(trace.status || "unknown") +
          (trace.host ? " - " + escapeHtml(trace.host) : "") +
          (trace.blocked_reason ? " - " + escapeHtml(trace.blocked_reason) : "") +
          "</div>";
      }).join("") || "<p>No traces yet.</p>";
    }

    if (trialHistory) {
      const promptVersions = Array.isArray(payload.prompt_versions) ? payload.prompt_versions : [];
      const savedTests = Array.isArray(payload.saved_tests) ? payload.saved_tests : [];
      trialHistory.innerHTML = [
        '<p class="font-mono text-xs uppercase tracking-[0.18em] text-outline">Prompt versions: ' + escapeHtml(String(promptVersions.length)) + '</p>',
        savedTests.length
          ? savedTests.slice(-5).map(function (entry) {
              return '<div class="rounded-xl bg-surface-container-low px-3 py-2 font-mono text-xs leading-6 text-on-surface-variant">' + escapeHtml(entry.input || "") + "</div>";
            }).join("")
          : "<p>No prompt history yet.</p>"
      ].join("");
    }

    if (trialReviewQueue) {
      trialReviewQueue.innerHTML = (payload.review_queue || []).slice(-5).map(function (entry) {
        return '<div class="rounded-xl bg-surface-container-low px-3 py-2 font-mono text-xs leading-6 text-on-surface-variant">' +
          escapeHtml(entry.tool || "review") + " - " + escapeHtml(entry.reason || entry.status || "queued") +
          "</div>";
      }).join("") || "<p>No review items yet.</p>";
    }

    if (trialLogs) {
      trialLogs.innerHTML = (payload.logs || []).slice(-6).map(function (entry) {
        return '<div class="rounded-xl bg-surface-container-low px-3 py-2 font-mono text-xs leading-6 text-on-surface-variant">' +
          escapeHtml(entry.level || "info") + " - " + escapeHtml(entry.message || "") +
          "</div>";
      }).join("") || "<p>No runner logs yet.</p>";
    }

    renderTrialStudentValuePanel(payload);

    // Calendar view
    const calendarViewEl = document.getElementById("trial-calendar-view");
    if (calendarViewEl) {
      const cv = payload.calendar_view;
      if (cv && cv.slots && cv.slots.length) {
        calendarViewEl.innerHTML = renderCalendarView(cv);
        calendarViewEl.classList.remove("hidden");
        // Wire confirm button
        const confirmBtn = document.getElementById("trial-calendar-confirm");
        if (confirmBtn && cv.pending_confirmation) {
          confirmBtn.addEventListener("click", function () {
            if (!currentTrialSession || !currentTrialSession.session_id) { return; }
            trialChatInput.value = "confirm this draft calendar plan";
            if (trialChatForm) {
              trialChatForm.dispatchEvent(new Event("submit", { cancelable: true }));
            }
          });
        }
      } else {
        calendarViewEl.classList.add("hidden");
        calendarViewEl.innerHTML = "";
      }
    }

    if (trialFeedback) {
      setTrialFeedback(
        payload.requires_signup
          ? "Anonymous limit reached. Sign in or create an Agent ID to keep going."
          : isStudentTrialTemplate(payload.active_template_id)
            ? "Connected Study Workspace preview is ready. This trial stays ephemeral, but the signed-in product would keep extracted study content, supertags, and linked retrieval after the run."
          : (payload.calendar_view && payload.calendar_view.confirmed
            ? "Preview draft reviewed. It was added only to this anonymous trial calendar view; nothing was booked, synced, or persisted."
            : "Anonymous runner ready. Appointment and calendar flows stay in preview mode here, and nothing is persisted once the trial expires."),
        payload.requires_signup ? "error" : "neutral"
      );
    }
  }

  function renderCalendarView(cv) {
    const slots = cv.slots || [];
    const startHour = cv.start_hour || 14;
    const endHour = cv.end_hour || 24;
    const totalMinutes = (endHour - startHour) * 60;
    const colorMap = {
      flight: "bg-primary-fixed/60 text-primary border-primary/20",
      lodging: "bg-secondary-container/60 text-secondary border-secondary/20",
      free: "bg-surface-container-high text-on-surface-variant border-outline-variant/20"
    };
    const slotBlocks = slots.map(function (slot) {
      const parts = function (t) { const p = t.split(":"); return parseInt(p[0]) * 60 + parseInt(p[1] || 0); };
      const slotStart = parts(slot.start || "17:00");
      const slotEnd = parts(slot.end || "18:00");
      const offset = slotStart - startHour * 60;
      const duration = slotEnd - slotStart;
      const top = ((offset / totalMinutes) * 100).toFixed(1);
      const height = Math.max(((duration / totalMinutes) * 100), 5).toFixed(1);
      const color = colorMap[slot.type] || "bg-surface-container-low text-on-surface border-outline-variant/20";
      return [
        '<div class="absolute left-0 right-0 rounded-lg border px-3 py-1 text-xs ' + color + '"',
        ' style="top: ' + top + '%; height: ' + height + '%; min-height: 28px;">',
        '<span class="font-semibold">' + escapeHtml(slot.label || "") + '</span>',
        ' <span class="opacity-60 font-mono">' + escapeHtml(slot.start || "") + '–' + escapeHtml(slot.end || "") + '</span>',
        '</div>'
      ].join("");
    }).join("");
    const timeLabels = [];
    for (let h = startHour; h <= endHour; h++) {
      const pct = (((h - startHour) / (endHour - startHour)) * 100).toFixed(1);
      timeLabels.push('<span class="absolute text-[10px] font-mono text-on-surface-variant/50" style="top: ' + pct + '%;">' + h + ':00</span>');
    }
    return [
      '<div class="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-3">Draft Trip Plan</div>',
      cv.preview_notice ? '<p class="mb-3 rounded-xl border border-outline-variant/15 bg-surface-container-low px-3 py-2 text-xs leading-6 text-on-surface-variant">' + escapeHtml(cv.preview_notice) + '</p>' : '',
      '<div class="flex gap-3">',
      '<div class="relative w-10 flex-shrink-0" style="height: 280px;">' + timeLabels.join("") + '</div>',
      '<div class="relative flex-1" style="height: 280px;">' + slotBlocks + '</div>',
      '</div>',
      cv.pending_confirmation ? [
        '<button id="trial-calendar-confirm" type="button" ',
        'class="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">',
        'Review draft and add it to my preview calendar',
        '</button>'
      ].join("") : (cv.confirmed ? '<p class="mt-3 text-sm font-medium text-green-400">✓ Reviewed draft added to your preview calendar.</p>' : "")
    ].join("");
  }

  async function ensureTrialSession(forceNew) {
    if (!forceNew && currentTrialSession && currentTrialSession.session_id && !currentTrialSession.requires_signup) {
      return currentTrialSession;
    }
    const payload = await apiFetch("/trial/python-runner/session", {
      method: "POST",
      body: {
        fingerprint: readTrialFingerprint()
      }
    });
    renderTrialSession(payload);
    return payload;
  }

  function isTrialSessionNotFoundError(error) {
    return String((error && error.message) || "").toLowerCase().includes("trial session not found");
  }

  // A backend redeploy wipes in-memory trial sessions mid-use. Rather than
  // dead-ending on a raw "trial session not found" error, transparently
  // start a fresh session and retry the action once.
  async function withTrialSessionRetry(action) {
    try {
      const sessionPayload = await ensureTrialSession();
      return await action(sessionPayload);
    } catch (error) {
      if (!isTrialSessionNotFoundError(error)) {
        throw error;
      }
      currentTrialSession = null;
      const freshSession = await ensureTrialSession(true);
      return action(freshSession);
    }
  }

  async function handleTrialTemplateSelect(templateId) {
    // Highlight selected template button with thicker border
    trialTemplateButtons.forEach(function(btn) {
      if (btn.dataset.trialTemplate === templateId) {
        btn.classList.add("ring-2", "ring-primary", "!border-primary/60");
      } else {
        btn.classList.remove("ring-2", "ring-primary", "!border-primary/60");
      }
    });
    const payload = await withTrialSessionRetry((sessionPayload) => apiFetch("/trial/python-runner/run", {
      method: "POST",
      body: {
        session_id: sessionPayload.session_id,
        template_id: templateId,
        fingerprint: readTrialFingerprint()
      }
    }));
    renderTrialSession(payload);
  }

  async function handleTrialSampleSource(kind) {
    if (!trialChatInput) {
      return;
    }
    trialChatInput.value = trialSampleSourceText(kind);
    trialChatInput.focus();
    setTrialFeedback("Running the sample through the Connected Study Workspace preview...", "neutral");
    try {
      if (!currentTrialSession || currentTrialSession.active_template_id !== "student_day_planner") {
        await handleTrialTemplateSelect("student_day_planner");
      } else {
        renderTrialStudentValuePanel(currentTrialSession);
      }
      // A quota-exhausted session resolves without throwing (requires_signup
      // is just a flag on the payload), so requestSubmit() below would silently
      // fail server-side instead of visibly explaining why nothing ran.
      if (!currentTrialSession || currentTrialSession.active_template_id !== "student_day_planner" || currentTrialSession.requires_signup) {
        setTrialFeedback(
          currentTrialSession && currentTrialSession.requires_signup
            ? "Anonymous trial limit reached. Sign in or create an Agent ID to keep going."
            : "Could not start the Connected Study Workspace preview. Try again in a moment.",
          "error"
        );
        return;
      }
      if (trialChatForm) {
        if (typeof trialChatForm.requestSubmit === "function") {
          trialChatForm.requestSubmit();
        } else {
          trialChatForm.dispatchEvent(new Event("submit", { cancelable: true }));
        }
      }
    } catch (error) {
      setTrialFeedback(error.message, "error");
    }
  }

  async function handleTrialChatSubmit(event) {
    event.preventDefault();
    if (!trialChatInput) {
      return;
    }
    const content = trialChatInput.value.trim();
    if (!content) {
      setTrialFeedback("Enter a prompt for the anonymous runner first.", "error");
      return;
    }
    try {
      const payload = await withTrialSessionRetry((sessionPayload) => apiFetch("/trial/python-runner/chat", {
        method: "POST",
        body: {
          session_id: sessionPayload.session_id,
          content: content,
          fingerprint: readTrialFingerprint()
        }
      }));
      trialChatInput.value = "";
      renderTrialSession(payload);
    } catch (error) {
      setTrialFeedback(error.message, "error");
      if (String(error.message || "").toLowerCase().includes("sign")) {
        openAuthModal();
      }
    }
  }

  async function handleTrialConvert() {
    if (!currentTrialSession || !currentTrialSession.session_id) {
      openAuthModal();
      return;
    }
    try {
      await apiFetch("/trial/python-runner/convert", {
        method: "POST",
        body: {
          session_id: currentTrialSession.session_id,
          fingerprint: readTrialFingerprint()
        }
      });
    } catch {
      // The upgrade path is the auth modal, so a failed helper call should not block it.
    }
    openAuthModal();
  }

  function renderAgents(agents) {
    if (!agentsGrid) {
      return;
    }
    agentsGrid.innerHTML = agents.map((agent) => [
      '<article class="rounded-xl border border-outline-variant/15 bg-surface p-5">',
      '<div class="flex items-center justify-between gap-3">',
      `<div><h4 class="text-lg font-semibold">${escapeHtml(agent.label)}</h4><p class="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-on-surface-variant">${escapeHtml(agent.kind)}</p></div>`,
      `<span class="rounded-full bg-surface-container-low px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">${escapeHtml(agent.email)}</span>`,
      "</div>",
      `<p class="mt-4 break-all font-mono text-xs leading-6 text-on-surface-variant">${escapeHtml(agent.agent_id)}</p>`,
      "</article>"
    ].join("")).join("");
  }

  function setCheckboxValue(target, value) {
    if (!target) {
      return;
    }
    target.checked = Boolean(value);
  }

  function renderRunnerPolicyHistory(entries) {
    if (!runtimeRunnerPolicyHistory) {
      return;
    }
    if (!Array.isArray(entries) || !entries.length) {
      runtimeRunnerPolicyHistory.innerHTML = '<div class="rounded-xl bg-surface px-4 py-3 text-sm text-on-surface-variant">No policy changes recorded yet.</div>';
      return;
    }

    runtimeRunnerPolicyHistory.innerHTML = entries.map((entry) => {
      const summary = entry && entry.summary ? entry.summary : {};
      const enabledTools = Array.isArray(summary.enabled_tools) ? summary.enabled_tools.join(", ") : "";
      const enabledChannels = Array.isArray(summary.enabled_channels) ? summary.enabled_channels.join(", ") : "";
      return [
        '<article class="rounded-xl bg-surface px-4 py-4">',
        '<div class="flex flex-wrap items-center justify-between gap-3">',
        `<div><p class="text-sm font-semibold text-on-surface">${escapeHtml(entry.event_kind || "policy_saved")}</p>`,
        `<p class="mt-1 text-xs text-on-surface-variant">${escapeHtml(entry.created_at || "")}</p></div>`,
        `<span class="rounded-full bg-primary-fixed px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-primary">${escapeHtml(String(summary.starter_template_id || "travel_planner"))}</span>`,
        '</div>',
        `<p class="mt-3 text-sm leading-6 text-on-surface-variant">Model: <span class="font-medium text-on-surface">${escapeHtml(String(summary.default_model || "gpt-5.4-mini"))}</span> via ${escapeHtml(String(summary.model_mode || "omnyid_managed_default"))}</p>`,
        `<p class="mt-2 text-xs leading-6 text-on-surface-variant">Tools: ${escapeHtml(enabledTools || "none")}<br>Channels: ${escapeHtml(enabledChannels || "none")}<br>Daily / Monthly caps: ${escapeHtml(String(summary.daily_spend_cap_usd ?? "n/a"))} / ${escapeHtml(String(summary.monthly_spend_cap_usd ?? "n/a"))} USD</p>`,
        '</article>'
      ].join("");
    }).join("");
  }

  function parseHostList(raw) {
    return String(raw || "")
      .split(/[\n,]/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  function renderRunnerConfig(payload) {
    currentRunnerConfig = payload || null;
    const active = Boolean(payload && currentRuntimeDeployment && currentRuntimeDeployment.framework === "python-runner-chat");

    if (runtimeRunnerConfigRefreshButton) {
      runtimeRunnerConfigRefreshButton.disabled = !session || !session.token;
    }
    if (runtimeRunnerConfigSaveButton) {
      runtimeRunnerConfigSaveButton.disabled = !active;
      runtimeRunnerConfigSaveButton.className = active
        ? "rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        : "rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white opacity-60";
    }

    if (!active) {
      if (runtimeRunnerConfigFeedback) {
        setFeedback(runtimeRunnerConfigFeedback, "Deploy a Python runner to manage its policy here.", "neutral");
      }
      if (runtimeRunnerStarterTemplate) runtimeRunnerStarterTemplate.value = "travel_planner";
      if (runtimeRunnerModelMode) runtimeRunnerModelMode.value = "omnyid_managed_default";
      if (runtimeRunnerDefaultModel) runtimeRunnerDefaultModel.value = "gpt-5.4-mini";
      if (runtimeRunnerInputCap) runtimeRunnerInputCap.value = "16000";
      if (runtimeRunnerOutputCap) runtimeRunnerOutputCap.value = "4000";
      if (runtimeRunnerDailyCap) runtimeRunnerDailyCap.value = "5";
      if (runtimeRunnerMonthlyCap) runtimeRunnerMonthlyCap.value = "25";
      setCheckboxValue(runtimeToolWeb, false);
      setCheckboxValue(runtimeToolGoogle, false);
      setCheckboxValue(runtimeToolStripe, false);
      setCheckboxValue(runtimeToolFiles, false);
      setCheckboxValue(runtimeToolVector, false);
      setCheckboxValue(runtimeToolDb, false);
      setCheckboxValue(runtimeToolScheduler, false);
      setCheckboxValue(runtimeToolAfp, false);
      if (runtimeToolWebAllowlist) runtimeToolWebAllowlist.value = "";
      setCheckboxValue(runtimeChannelWebChat, false);
      setCheckboxValue(runtimeChannelApiEndpoint, false);
      setCheckboxValue(runtimeChannelAfpEndpoint, false);
      renderRunnerPolicyHistory([]);
      return;
    }

    const modelPolicy = payload && payload.model_policy ? payload.model_policy : {};
    const toolPolicy = payload && payload.tool_policy ? payload.tool_policy : {};
    const channelPolicy = payload && payload.channel_policy ? payload.channel_policy : {};

    if (runtimeRunnerStarterTemplate) {
      runtimeRunnerStarterTemplate.value = payload.starter_template_id || "travel_planner";
    }
    if (runtimeRunnerModelMode) {
      runtimeRunnerModelMode.value = modelPolicy.mode || "omnyid_managed_default";
    }
    if (runtimeRunnerDefaultModel) {
      runtimeRunnerDefaultModel.value = modelPolicy.default_model || "gpt-5.4-mini";
    }
    if (runtimeRunnerInputCap) {
      runtimeRunnerInputCap.value = String(modelPolicy.per_run_input_token_cap || 16000);
    }
    if (runtimeRunnerOutputCap) {
      runtimeRunnerOutputCap.value = String(modelPolicy.per_run_output_token_cap || 4000);
    }
    if (runtimeRunnerDailyCap) {
      runtimeRunnerDailyCap.value = String(modelPolicy.daily_spend_cap_usd || 5);
    }
    if (runtimeRunnerMonthlyCap) {
      runtimeRunnerMonthlyCap.value = String(modelPolicy.monthly_spend_cap_usd || 25);
    }
    setCheckboxValue(runtimeToolWeb, toolPolicy.web && toolPolicy.web.enabled);
    setCheckboxValue(runtimeToolGoogle, toolPolicy.google_api && toolPolicy.google_api.enabled);
    setCheckboxValue(runtimeToolStripe, toolPolicy.stripe && toolPolicy.stripe.enabled);
    setCheckboxValue(runtimeToolFiles, toolPolicy.file_access && toolPolicy.file_access.enabled);
    setCheckboxValue(runtimeToolVector, toolPolicy.vector_store && toolPolicy.vector_store.enabled);
    setCheckboxValue(runtimeToolDb, toolPolicy.simple_db && toolPolicy.simple_db.enabled);
    setCheckboxValue(runtimeToolScheduler, toolPolicy.scheduler && toolPolicy.scheduler.enabled);
    setCheckboxValue(runtimeToolAfp, toolPolicy.afp_agent && toolPolicy.afp_agent.enabled);
    if (runtimeToolWebAllowlist) {
      runtimeToolWebAllowlist.value = Array.isArray(toolPolicy.web && toolPolicy.web.allowlisted_hosts)
        ? toolPolicy.web.allowlisted_hosts.join("\n")
        : "";
    }
    setCheckboxValue(runtimeChannelWebChat, channelPolicy.web_chat && channelPolicy.web_chat.enabled);
    setCheckboxValue(runtimeChannelApiEndpoint, channelPolicy.api_endpoint && channelPolicy.api_endpoint.enabled);
    setCheckboxValue(runtimeChannelAfpEndpoint, channelPolicy.afp_agent_endpoint && channelPolicy.afp_agent_endpoint.enabled);
    renderRunnerPolicyHistory(payload.policy_events);

    if (runtimeRunnerConfigFeedback) {
      const templates = Array.isArray(payload.starter_templates) ? payload.starter_templates.length : 0;
      const historyCount = Array.isArray(payload.policy_events) ? payload.policy_events.length : 0;
      setFeedback(
        runtimeRunnerConfigFeedback,
        "Python runner policy loaded. Starter templates: " + templates + ". Recent policy events: " + historyCount + ". Changes here sync back into the hosted scaffold policy file.",
        "neutral"
      );
    }
  }

  async function loadRunnerConfig() {
    if (!session || !session.token || !currentRuntimeDeployment || currentRuntimeDeployment.framework !== "python-runner-chat") {
      renderRunnerConfig(null);
      return;
    }
    try {
      const payload = await apiFetch("/runtime/runner-config");
      renderRunnerConfig(payload);
    } catch (error) {
      setFeedback(runtimeRunnerConfigFeedback, error.message, "error");
    }
  }

  function runnerToolPolicyPayload() {
    return {
      web: {
        enabled: Boolean(runtimeToolWeb && runtimeToolWeb.checked),
        allowlisted_hosts: parseHostList(runtimeToolWebAllowlist ? runtimeToolWebAllowlist.value : "")
      },
      google_api: { enabled: Boolean(runtimeToolGoogle && runtimeToolGoogle.checked), allowlisted_hosts: ["googleapis.com", "www.googleapis.com"] },
      stripe: { enabled: Boolean(runtimeToolStripe && runtimeToolStripe.checked), allowlisted_hosts: ["api.stripe.com"] },
      file_access: { enabled: Boolean(runtimeToolFiles && runtimeToolFiles.checked) },
      vector_store: { enabled: Boolean(runtimeToolVector && runtimeToolVector.checked), engine: "chromadb" },
      simple_db: { enabled: Boolean(runtimeToolDb && runtimeToolDb.checked), engine: "duckdb" },
      scheduler: { enabled: Boolean(runtimeToolScheduler && runtimeToolScheduler.checked) },
      afp_agent: { enabled: Boolean(runtimeToolAfp && runtimeToolAfp.checked) }
    };
  }

  function runnerChannelPolicyPayload() {
    return {
      web_chat: { enabled: Boolean(runtimeChannelWebChat && runtimeChannelWebChat.checked) },
      api_endpoint: { enabled: Boolean(runtimeChannelApiEndpoint && runtimeChannelApiEndpoint.checked) },
      afp_agent_endpoint: { enabled: Boolean(runtimeChannelAfpEndpoint && runtimeChannelAfpEndpoint.checked) }
    };
  }

  async function handleRunnerConfigSave() {
    if (!currentRuntimeDeployment || currentRuntimeDeployment.framework !== "python-runner-chat") {
      setFeedback(runtimeRunnerConfigFeedback, "Deploy a Python runner first.", "error");
      return;
    }
    setFeedback(runtimeRunnerConfigFeedback, "Saving Python runner policy...", "neutral");
    try {
      const payload = await apiFetch("/runtime/runner-config", {
        method: "POST",
        body: {
          action: "save_policies",
          model_policy: {
            mode: runtimeRunnerModelMode ? runtimeRunnerModelMode.value : "omnyid_managed_default",
            byok_available: true,
            trial_mode: false,
            default_provider: runtimeRunnerModelMode && runtimeRunnerModelMode.value === "local_ollama" ? "ollama" : "omnyid_managed",
            default_model: runtimeRunnerDefaultModel ? runtimeRunnerDefaultModel.value : "gpt-5.4-mini",
            allowed_providers: ["omnyid_managed", "openai", "ollama"],
            allowed_models: ["gpt-5.4-mini", "gpt-5.4", "ollama/local"],
            per_run_input_token_cap: runtimeRunnerInputCap ? Number(runtimeRunnerInputCap.value || 16000) : 16000,
            per_run_output_token_cap: runtimeRunnerOutputCap ? Number(runtimeRunnerOutputCap.value || 4000) : 4000,
            daily_spend_cap_usd: runtimeRunnerDailyCap ? Number(runtimeRunnerDailyCap.value || 5) : 5.0,
            monthly_spend_cap_usd: runtimeRunnerMonthlyCap ? Number(runtimeRunnerMonthlyCap.value || 25) : 25.0
          },
          tool_policy: runnerToolPolicyPayload(),
          channel_policy: runnerChannelPolicyPayload(),
          starter_template_id: runtimeRunnerStarterTemplate ? runtimeRunnerStarterTemplate.value : "travel_planner"
        }
      });
      renderRuntimeDeployment(payload);
      await loadRunnerConfig();
      setFeedback(runtimeRunnerConfigFeedback, "Python runner policy saved and synced back into the hosted scaffold.", "success");
    } catch (error) {
      setFeedback(runtimeRunnerConfigFeedback, error.message, "error");
    }
  }

  function renderMessages(messages) {
    if (!messagesList) {
      return;
    }
    const recentMessages = messages.slice(0, 10);
    if (!recentMessages.length) {
      messagesList.innerHTML = '<div class="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-sm text-on-surface-variant">No messages yet.</div>';
      return;
    }

    messagesList.innerHTML = recentMessages.map((message) => {
      const isEncrypted = Boolean(message.encryption && typeof message.encryption === "object");
      const body = isEncrypted
        ? "Encrypted relay payload. OmnyID is storing and routing ciphertext here for test visibility only."
        : message.content && typeof message.content === "object"
          ? message.content.body || message.content.subject || JSON.stringify(message.content)
          : JSON.stringify(message.content);
      const envelope = message.encryption && typeof message.encryption === "object"
        ? `<div class="mt-4 rounded-xl bg-surface-container-high p-3 font-mono text-[11px] leading-6 text-on-surface-variant">scheme=${escapeHtml(message.encryption.scheme || "")}<br>nonce=${escapeHtml(message.encryption.nonce || "")}<br>ciphertext=${escapeHtml((message.encryption.ciphertext || "").slice(0, 56))}...</div>`
        : "";

      return [
        '<article class="rounded-xl border border-outline-variant/15 bg-surface p-5">',
        `<div class="flex flex-wrap items-center justify-between gap-3"><div><h4 class="text-sm font-semibold">${escapeHtml(message.type)}</h4><p class="mt-1 font-mono text-[11px] text-on-surface-variant">${escapeHtml(message.thread_id)}</p></div><span class="font-mono text-[11px] text-on-surface-variant">${escapeHtml(message.timestamp)}</span></div>`,
        `<p class="mt-4 text-sm leading-7 text-on-surface-variant">${escapeHtml(body)}</p>`,
        envelope,
        `<div class="mt-4 flex flex-wrap gap-3 font-mono text-[11px] text-on-surface-variant"><span>from ${escapeHtml(message.from)}</span><span>to ${escapeHtml((message.to || []).join(", "))}</span></div>`,
        "</article>"
      ].join("");
    }).join("");
  }

  function renderActionLog(entries) {
    if (!actionLogList) {
      return;
    }
    if (!entries.length) {
      actionLogList.innerHTML = '<div class="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-sm text-on-surface-variant">No action log entries yet.</div>';
      return;
    }

    actionLogList.innerHTML = entries.map((entry) => {
      const summary = entry.output && typeof entry.output === "object"
        ? JSON.stringify(entry.output)
        : String(entry.output || "");
      return [
        '<article class="rounded-xl border border-outline-variant/15 bg-surface p-5">',
        `<div class="flex items-center justify-between gap-3"><h4 class="text-sm font-semibold">${escapeHtml(entry.capability_id)}</h4><span class="rounded-full bg-surface-container-low px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">${escapeHtml(entry.status)}</span></div>`,
        `<p class="mt-3 break-all font-mono text-xs leading-6 text-on-surface-variant">${escapeHtml(entry.thread_id)}</p>`,
        `<p class="mt-4 text-sm leading-7 text-on-surface-variant">${escapeHtml(summary)}</p>`,
        `<p class="mt-4 font-mono text-[11px] text-on-surface-variant">${escapeHtml(entry.recorded_at)}</p>`,
        "</article>"
      ].join("");
    }).join("");
  }

  function renderAgentSelectors(agents) {
    if (!demoFromAgent || !demoToAgent) {
      return;
    }
    const options = agents.map((agent) =>
      `<option value="${escapeHtml(agent.agent_id)}">${escapeHtml(agent.label)} - ${escapeHtml(agent.kind)}</option>`
    ).join("");
    demoFromAgent.innerHTML = options;
    demoToAgent.innerHTML = options;
    const alpha = agents.find((agent) => agent.kind === "demo" && agent.label.toLowerCase().includes("alpha"));
    const beta = agents.find((agent) => agent.kind === "demo" && agent.label.toLowerCase().includes("beta"));
    if (alpha) {
      demoFromAgent.value = alpha.agent_id;
    }
    if (beta) {
      demoToAgent.value = beta.agent_id;
    }
  }

  function renderOnboarding(onboarding, user) {
    currentOnboarding = onboarding;
    if (!setupForm) {
      return;
    }

    const safeOnboarding = onboarding || {
      identity_confirmed: false,
      notes: {},
      email_provider: "",
      email_address: user ? user.email : "",
      email_connected: false,
      llm_mode: "byo_or_local",
      completed_at: null
    };

    const onboardingNotes = safeOnboarding.notes && typeof safeOnboarding.notes === "object"
      ? safeOnboarding.notes
      : {};

    selectedPrivacyMode = onboardingNotes.privacy_mode || selectedPrivacyMode;
    selectedDeploymentTarget = onboardingNotes.deployment_target || selectedDeploymentTarget;

    if (setupEmailProvider) {
      setupEmailProvider.value = safeOnboarding.email_provider || "";
    }
    if (setupEmailAddress) {
      setupEmailAddress.value = safeOnboarding.email_address || (user ? user.email : "");
    }
    if (setupIdentityConfirmed) {
      setupIdentityConfirmed.checked = Boolean(safeOnboarding.identity_confirmed);
    }
    if (setupEmailConnected) {
      setupEmailConnected.checked = Boolean(safeOnboarding.email_connected);
    }
    if (setupLlmMode) {
      setupLlmMode.value = safeOnboarding.llm_mode || "byo_or_local";
    }
    if (setupPrivacyMode) {
      setupPrivacyMode.value = selectedPrivacyMode;
    }
    if (setupDeploymentTarget) {
      setupDeploymentTarget.value = selectedDeploymentTarget;
    }
    if (accountDeleteEmail && user && !accountDeleteEmail.value) {
      accountDeleteEmail.value = user.email || "";
    }
    renderSelectedPrivacyMode();

    if (safeOnboarding.completed_at) {
      setFeedback(setupFeedback, "Setup complete. Your private runtime can now be planned safely.", "success");
    } else {
      setFeedback(setupFeedback, "Finish setup to unlock private runtime deployment.", "neutral");
    }
  }

  function renderSessions(entries) {
    currentSessions = Array.isArray(entries) ? entries : [];
    if (!sessionList) {
      return;
    }

    if (!currentSessions.length) {
      sessionList.innerHTML = '<p class="text-sm text-on-surface-variant">No active sessions loaded yet.</p>';
      if (revokeOtherSessionsButton) {
        revokeOtherSessionsButton.disabled = true;
        revokeOtherSessionsButton.className = "rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm font-semibold text-on-surface opacity-60";
      }
      return;
    }

    const otherSessions = currentSessions.filter(function (entry) { return !entry.current; });
    if (revokeOtherSessionsButton) {
      revokeOtherSessionsButton.disabled = !otherSessions.length;
      revokeOtherSessionsButton.className = otherSessions.length
        ? "rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm font-semibold text-on-surface transition hover:bg-surface-container-low"
        : "rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm font-semibold text-on-surface opacity-60";
    }

    sessionList.innerHTML = currentSessions.map(function (entry) {
      return [
        '<article class="rounded-xl border border-outline-variant/15 bg-surface p-4">',
        '<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">',
        '<div>',
        '<div class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline">', escapeHtml(entry.current ? "current session" : "other session"), '</div>',
        '<h4 class="mt-2 text-sm font-semibold text-on-surface">', escapeHtml(entry.token_preview || "session"), '</h4>',
        '<p class="mt-2 text-xs leading-6 text-on-surface-variant">Created: ', escapeHtml(entry.created_at || "unknown"), '</p>',
        '<p class="text-xs leading-6 text-on-surface-variant">Expires: ', escapeHtml(entry.expires_at || "unknown"), '</p>',
        '</div>',
        entry.current
          ? '<div class="rounded-full bg-secondary-container px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-secondary">This browser</div>'
          : '<button type="button" data-revoke-session="' + escapeHtml(entry.token_preview) + '" class="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2 text-sm font-semibold text-on-surface transition hover:bg-surface">Revoke</button>',
        '</div>',
        '</article>'
      ].join("");
    }).join("");

    sessionList.querySelectorAll("[data-revoke-session]").forEach(function (button, index) {
      const sessionEntry = currentSessions.filter(function (entry) { return !entry.current; })[index];
      if (!sessionEntry) {
        return;
      }
      button.addEventListener("click", function () {
        handleSessionAction("revoke", sessionEntry.token_preview);
      });
    });
  }

  function renderRuntimeBackups(payload) {
    currentRuntimeBackups = payload || null;
    const policy = payload && payload.policy ? payload.policy : {
      retention_days: 14,
      storage_mode: "metadata_only_hosted",
      last_snapshot_at: null
    };
    const entries = payload && Array.isArray(payload.entries) ? payload.entries : [];

    if (runtimeBackupRetention) {
      runtimeBackupRetention.value = String(policy.retention_days || 14);
    }
    if (runtimeBackupPolicyRetention) {
      runtimeBackupPolicyRetention.textContent = (policy.retention_days || 14) + " days";
    }
    if (runtimeBackupPolicyStorage) {
      runtimeBackupPolicyStorage.textContent = policy.storage_mode || "metadata_only_hosted";
    }
    if (runtimeBackupPolicyLast) {
      runtimeBackupPolicyLast.textContent = policy.last_snapshot_at || "No snapshot yet";
    }

    const hasRuntime = Boolean(currentRuntimeDeployment);
    if (runtimeBackupSavePolicyButton) {
      runtimeBackupSavePolicyButton.disabled = !session || !session.token;
      runtimeBackupSavePolicyButton.className = !session || !session.token
        ? "rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface opacity-60"
        : "rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface";
    }
    if (runtimeBackupSnapshotButton) {
      runtimeBackupSnapshotButton.disabled = !hasRuntime;
      runtimeBackupSnapshotButton.className = hasRuntime
        ? "rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface"
        : "rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface opacity-60";
    }
    if (!runtimeBackupList) {
      return;
    }
    if (!entries.length) {
      runtimeBackupList.innerHTML = "<p>No metadata snapshots yet. Create one after your private runtime is live.</p>";
      if (runtimeBackupFeedback) {
        setFeedback(
          runtimeBackupFeedback,
          hasRuntime
            ? "Snapshots here are metadata only and keep content out of the hosted dashboard."
            : "Deploy a private runtime first, then create metadata-only snapshots here.",
          "neutral"
        );
      }
      return;
    }

    runtimeBackupList.innerHTML = entries.slice(0, 6).map(function (entry) {
      const coverage = entry.manifest_summary && entry.manifest_summary.coverage
        ? String(entry.manifest_summary.coverage)
        : "runtime_metadata_only";
      const runtimeStatus = entry.manifest_summary && entry.manifest_summary.runtime_status
        ? String(entry.manifest_summary.runtime_status)
        : "unknown";
      return [
        '<article class="rounded-xl border border-outline-variant/15 bg-surface px-4 py-3">',
        '<div class="flex flex-wrap items-center justify-between gap-3">',
        '<div>',
        '<div class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline">', escapeHtml(entry.snapshot_type || "metadata_snapshot"), '</div>',
        '<h4 class="mt-2 text-sm font-semibold text-on-surface">', escapeHtml(entry.id || "snapshot"), '</h4>',
        '</div>',
        '<span class="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant">', escapeHtml(entry.status || "ready"), '</span>',
        '</div>',
        '<p class="mt-3 text-xs leading-6 text-on-surface-variant">Coverage: ', escapeHtml(coverage), ' - Runtime: ', escapeHtml(runtimeStatus), '</p>',
        '<p class="text-xs leading-6 text-on-surface-variant">Files: ', escapeHtml(entry.file_count), ' - Workspace bytes: ', escapeHtml(entry.total_workspace_bytes), ' - Manifest bytes: ', escapeHtml(entry.artifact_size_bytes), '</p>',
        '<p class="text-xs leading-6 text-on-surface-variant">Created: ', escapeHtml(entry.created_at || "unknown"), ' - Expires: ', escapeHtml(entry.expires_at || "unknown"), '</p>',
        '<div class="mt-3 flex flex-wrap gap-2">',
        '<button type="button" data-download-backup-manifest="', escapeHtml(entry.id || ""), '" class="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface">Download manifest</button>',
        '<button type="button" data-run-restore-drill="', escapeHtml(entry.id || ""), '" class="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface">Run restore drill</button>',
        '<button type="button" data-delete-backup-snapshot="', escapeHtml(entry.id || ""), '" class="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface">Delete snapshot</button>',
        '</div>',
        '</article>'
      ].join("");
    }).join("");

    runtimeBackupList.querySelectorAll("[data-download-backup-manifest]").forEach(function (button) {
      button.addEventListener("click", function () {
        handleRuntimeBackupManifestDownload(button.getAttribute("data-download-backup-manifest") || "");
      });
    });
    runtimeBackupList.querySelectorAll("[data-delete-backup-snapshot]").forEach(function (button) {
      button.addEventListener("click", function () {
        handleRuntimeBackupDelete(button.getAttribute("data-delete-backup-snapshot") || "");
      });
    });
    runtimeBackupList.querySelectorAll("[data-run-restore-drill]").forEach(function (button) {
      button.addEventListener("click", function () {
        handleRuntimeRestoreDrill(button.getAttribute("data-run-restore-drill") || "");
      });
    });
  }

  function renderRuntimeRestoreDrills(payload) {
    currentRuntimeRestoreDrills = payload || null;
    const entries = payload && Array.isArray(payload.entries) ? payload.entries : [];
    if (!runtimeRestoreDrillList) {
      return;
    }
    if (!entries.length) {
      runtimeRestoreDrillList.innerHTML = "<p>No restore drills yet.</p>";
      if (runtimeRestoreFeedback) {
        setFeedback(runtimeRestoreFeedback, "Run a restore drill from one of your metadata snapshots to build recovery discipline early.", "neutral");
      }
      return;
    }

    runtimeRestoreDrillList.innerHTML = entries.slice(0, 6).map(function (entry) {
      const checklist = entry.notes_summary && Array.isArray(entry.notes_summary.checklist)
        ? entry.notes_summary.checklist
        : [];
      return [
        '<article class="rounded-xl border border-outline-variant/15 bg-surface px-4 py-3">',
        '<div class="flex flex-wrap items-center justify-between gap-3">',
        '<div>',
        '<div class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline">restore drill</div>',
        '<h4 class="mt-2 text-sm font-semibold text-on-surface">', escapeHtml(entry.id || "drill"), '</h4>',
        '</div>',
        '<span class="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-on-surface-variant">', escapeHtml(entry.status || "rehearsed"), '</span>',
        '</div>',
        '<p class="mt-3 text-xs leading-6 text-on-surface-variant">Backup: ', escapeHtml(entry.backup_id || "unknown"), ' - Started: ', escapeHtml(entry.started_at || "unknown"), '</p>',
        checklist.length
          ? '<ul class="mt-2 space-y-1 text-xs leading-6 text-on-surface-variant">' + checklist.slice(0, 3).map(function (step) { return "<li>- " + escapeHtml(step) + "</li>"; }).join("") + "</ul>"
          : "",
        '</article>'
      ].join("");
    }).join("");
  }

  function renderRuntimeDeployment(runtimeDeployment) {
    currentRuntimeDeployment = runtimeDeployment || null;
    if (!deployRuntimeButton || !deployRuntimeFeedback) {
      return;
    }

    const onboardingComplete = Boolean(currentOnboarding && currentOnboarding.completed_at);
    if (deployOpenClawButton && deployOpenClawFeedback) {
      deployOpenClawButton.disabled = true;
      deployOpenClawButton.className = onboardingComplete
        ? "rounded-xl border border-outline-variant bg-surface-container-low px-5 py-3 text-sm font-semibold text-on-surface opacity-60"
        : "rounded-xl border border-outline-variant bg-surface px-5 py-3 text-sm font-semibold text-on-surface opacity-60";
      deployOpenClawFeedback.textContent = onboardingComplete
        ? "OpenClaw will appear here after its runtime isolation, audit trail, and approval model reach the same standard as Crew."
        : "Finish setup first. OpenClaw is planned, but not available yet.";
    }
    if (deployPythonRunnerButton && deployPythonRunnerFeedback) {
      const hasPythonRunner = runtimeDeployment && runtimeDeployment.framework === "python-runner-chat";
      const modelMode = hasPythonRunner && runtimeDeployment.config_json && runtimeDeployment.config_json.model_policy
        ? runtimeDeployment.config_json.model_policy.mode
        : null;
      deployPythonRunnerButton.disabled = !onboardingComplete && !hasPythonRunner;
      deployPythonRunnerButton.className = onboardingComplete || hasPythonRunner
        ? "rounded-xl bg-secondary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        : "rounded-xl border border-outline-variant bg-surface px-5 py-3 text-sm font-semibold text-on-surface opacity-60";
      deployPythonRunnerButton.textContent = hasPythonRunner && runtimeDeployment.status === "running"
        ? "Redeploy Python runner"
        : "One-click deploy Python runner";
      deployPythonRunnerFeedback.textContent = hasPythonRunner
        ? "Framework: " + runtimeDeployment.framework + " - Status: " + runtimeDeployment.status + " - GUI: " + (runtimeDeployment.gui || "builtin chat") + " - Model mode: " + (modelMode || "omnyid_managed_default")
        : onboardingComplete
          ? "This creates a private Python runner with sandbox defaults, prewired tools, logs, traces, replay, and optional BYOK."
          : "Complete the setup checklist before the isolated Python runner is unlocked.";
    }

    if (!runtimeDeployment) {
      deployRuntimeButton.disabled = !onboardingComplete;
      deployRuntimeButton.className = onboardingComplete
        ? "rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        : "rounded-xl border border-outline-variant bg-surface px-5 py-3 text-sm font-semibold text-on-surface opacity-60";
      deployRuntimeButton.textContent = "One-click deploy Crew runtime";
      deployRuntimeFeedback.textContent = onboardingComplete
        ? "This creates a private per-user Crew runtime plan using isolated secrets, logs, and message scope."
        : "Complete the setup checklist before private runtime planning is unlocked.";
      renderRuntimeMonitor(null);
      renderRunnerConfig(null);
      renderRuntimeBackups(currentRuntimeBackups);
      return;
    }

    deployRuntimeButton.disabled = false;
    deployRuntimeButton.className = "rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90";
    deployRuntimeButton.textContent = runtimeDeployment.status === "running"
      ? "Redeploy Crew runtime"
      : "Deploy or refresh Crew runtime";
    const runtimeState = runtimeDeployment.config_json && typeof runtimeDeployment.config_json === "object"
      ? runtimeDeployment.config_json.runtime_state
      : null;
    const scaffoldSummary = runtimeState && runtimeState.scaffolded
      ? " - Files: compose, env, workspace, logs"
      : "";
    deployRuntimeFeedback.textContent =
      "Framework: " + runtimeDeployment.framework +
      " - Status: " + runtimeDeployment.status +
      " - Python: " + runtimeDeployment.python_version +
      " - GUI: " + (runtimeDeployment.gui || "none") +
      scaffoldSummary;
    if (deployPythonRunnerButton && deployPythonRunnerFeedback && runtimeDeployment.framework !== "python-runner-chat") {
      deployPythonRunnerButton.disabled = false;
      deployPythonRunnerButton.className = "rounded-xl bg-secondary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90";
      deployPythonRunnerButton.textContent = "One-click deploy Python runner";
      deployPythonRunnerFeedback.textContent = "A separate private Python runner + chat option is also available for bring-your-own API key workflows.";
    }
    renderRuntimeMonitor(runtimeDeployment);
    if (runtimeDeployment.framework === "python-runner-chat") {
      loadRunnerConfig();
    } else {
      renderRunnerConfig(null);
    }
    renderRuntimeBackups(currentRuntimeBackups);
  }

  function renderRuntimeMonitor(runtimeDeployment, logsPayload) {
    const hasRuntime = Boolean(runtimeDeployment);
    if (runtimeStartButton) {
      runtimeStartButton.disabled = !hasRuntime;
    }
    if (runtimeStopButton) {
      runtimeStopButton.disabled = !hasRuntime;
    }
    if (runtimeRestartButton) {
      runtimeRestartButton.disabled = !hasRuntime;
    }
    if (runtimeDestroyButton) {
      runtimeDestroyButton.disabled = !hasRuntime;
      runtimeDestroyButton.className = hasRuntime
        ? "rounded-xl border border-error/30 bg-white px-4 py-3 text-sm font-semibold text-error transition hover:bg-red-50"
        : "rounded-xl border border-error/30 bg-white px-4 py-3 text-sm font-semibold text-error opacity-60";
    }
    if (runtimeRefreshLogsButton) {
      runtimeRefreshLogsButton.disabled = !hasRuntime;
    }

    if (!hasRuntime) {
      setFeedback(runtimeStatusFeedback, "Deploy a private runtime to begin monitoring its status here.", "neutral");
      if (runtimeLogsMeta) {
        runtimeLogsMeta.textContent = "Log source will appear here when a runtime starts.";
      }
      if (runtimeLogsOutput) {
        runtimeLogsOutput.textContent = "No runtime logs yet.";
      }
      return;
    }

    const runtimeState = runtimeDeployment.config_json && typeof runtimeDeployment.config_json === "object"
      ? runtimeDeployment.config_json.runtime_state || {}
      : {};
    const runtimeMonitor = runtimeDeployment.runtime_monitor && typeof runtimeDeployment.runtime_monitor === "object"
      ? runtimeDeployment.runtime_monitor
      : null;
    const dockerState = runtimeState.docker_cli_available === false
      ? " - Docker socket not wired yet"
      : "";
    const statusNote = runtimeState && runtimeState.status_note
      ? " - " + runtimeState.status_note
      : "";
    const runtimeError = runtimeDeployment.config_json && runtimeDeployment.config_json.runtime_error
      ? " - " + runtimeDeployment.config_json.runtime_error
      : "";
    const modelPolicy = runtimeDeployment.config_json && runtimeDeployment.config_json.model_policy
      ? runtimeDeployment.config_json.model_policy
      : null;
    const channelPolicy = runtimeDeployment.config_json && runtimeDeployment.config_json.channel_policy
      ? runtimeDeployment.config_json.channel_policy
      : null;
    const toolPolicy = runtimeDeployment.config_json && runtimeDeployment.config_json.tool_policy
      ? runtimeDeployment.config_json.tool_policy
      : null;
    const enabledChannels = channelPolicy
      ? Object.keys(channelPolicy).filter(function (key) { return channelPolicy[key] && channelPolicy[key].enabled; }).join(", ")
      : "";
    const enabledTools = toolPolicy
      ? Object.keys(toolPolicy).filter(function (key) { return toolPolicy[key] && toolPolicy[key].enabled; }).slice(0, 4).join(", ")
      : "";
    setFeedback(
      runtimeStatusFeedback,
      "Runtime status: " + runtimeDeployment.status +
      (modelPolicy ? " - Model mode: " + modelPolicy.mode : "") +
      (enabledChannels ? " - Channels: " + enabledChannels : "") +
      (enabledTools ? " - Tools: " + enabledTools : "") +
      dockerState + statusNote + runtimeError,
      runtimeDeployment.status === "running" ? "success" : runtimeDeployment.status === "starting" ? "neutral" : "neutral"
    );

    if (runtimeLogsMeta) {
      if (logsPayload) {
        const updatedAt = logsPayload.updated_at ? " - Updated " + logsPayload.updated_at : "";
        runtimeLogsMeta.textContent = "Log source: " + (logsPayload.source || "none") + updatedAt;
      } else if (runtimeMonitor) {
        const updatedAt = runtimeMonitor.updated_at ? " - Updated " + runtimeMonitor.updated_at : "";
        runtimeLogsMeta.textContent = "Bootstrap log source: " + (runtimeMonitor.source || "none") + updatedAt;
      } else if (runtimeState && runtimeState.log_source_hint) {
        runtimeLogsMeta.textContent = "Expected bootstrap log: " + runtimeState.log_source_hint;
      } else {
        runtimeLogsMeta.textContent = "Log source will appear here when runtime output is available.";
      }
    }

    if (runtimeLogsOutput) {
      const lines = logsPayload && Array.isArray(logsPayload.lines)
        ? logsPayload.lines
        : runtimeMonitor && Array.isArray(runtimeMonitor.lines)
          ? runtimeMonitor.lines
          : [];
      runtimeLogsOutput.textContent = lines.length
        ? lines.join("\n")
        : "No runtime logs yet.";
    }
  }

  function renderRuntimeUpdates(payload) {
    currentRuntimeUpdates = payload || null;
    const hasRuntime = Boolean(currentRuntimeDeployment);

    if (runtimeUpdateSavePolicyButton) {
      runtimeUpdateSavePolicyButton.disabled = !session || !session.token;
    }
    if (runtimeUpdateCheckButton) {
      runtimeUpdateCheckButton.disabled = !session || !session.token;
    }
    if (runtimeUpdateApplyButton) {
      runtimeUpdateApplyButton.disabled = !hasRuntime;
      runtimeUpdateApplyButton.className = hasRuntime
        ? "rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface"
        : "rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface opacity-60";
    }

    if (!payload) {
      if (runtimeUpdateCurrentVersion) runtimeUpdateCurrentVersion.textContent = "Not deployed yet";
      if (runtimeUpdateLatestVersion) runtimeUpdateLatestVersion.textContent = "Waiting for first check";
      if (runtimeUpdateState) runtimeUpdateState.textContent = "No update state yet";
      if (runtimeUpdateLastApplied) runtimeUpdateLastApplied.textContent = "No scaffold update applied yet";
      if (runtimeUpdateHistory) runtimeUpdateHistory.innerHTML = "<p>No runtime update checks yet.</p>";
      setFeedback(runtimeUpdateFeedback, "Update checks compare scaffold template versions only and stay out of tenant content.", "neutral");
      return;
    }

    if (runtimeUpdateChannel) {
      runtimeUpdateChannel.value = payload.policy && payload.policy.update_channel ? payload.policy.update_channel : "stable";
    }
    if (runtimeUpdateAutoApply) {
      runtimeUpdateAutoApply.value = payload.policy && payload.policy.auto_apply ? payload.policy.auto_apply : "manual_only";
    }
    if (runtimeUpdateCurrentVersion) {
      runtimeUpdateCurrentVersion.textContent = payload.current_version || "unknown";
    }
    if (runtimeUpdateLatestVersion) {
      runtimeUpdateLatestVersion.textContent = payload.latest_version || "unknown";
    }
    if (runtimeUpdateState) {
      runtimeUpdateState.textContent = payload.update_available
        ? "Update available for " + (payload.framework || "runtime")
        : "Scaffold is current";
    }
    if (runtimeUpdateLastApplied) {
      runtimeUpdateLastApplied.textContent = payload.last_applied_at || "No scaffold update applied yet";
    }
    if (runtimeUpdateHistory) {
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      runtimeUpdateHistory.innerHTML = entries.length
        ? entries.slice(0, 5).map(function (entry) {
          return [
            '<article class="rounded-xl border border-outline-variant/15 bg-white px-4 py-3">',
            '<div class="flex flex-wrap items-center justify-between gap-2">',
            '<span class="font-semibold text-on-surface">', escapeHtml(entry.action || "check"), '</span>',
            '<span class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline">', escapeHtml(entry.status || "checked"), '</span>',
            '</div>',
            '<p class="mt-2 text-xs leading-6 text-on-surface-variant">', escapeHtml((entry.from_version || "unknown") + " -> " + (entry.to_version || "unknown")), '</p>',
            '<p class="mt-1 text-xs leading-6 text-on-surface-variant">', escapeHtml(entry.created_at || "recently"), '</p>',
            '</article>'
          ].join("");
        }).join("")
        : "<p>No runtime update checks yet.</p>";
    }

    setFeedback(
      runtimeUpdateFeedback,
      payload.update_available
        ? "A scaffold update is available. Applying it refreshes hosted runtime files only, not tenant content."
        : "Hosted scaffold is already current. Checks stay limited to template-version drift.",
      payload.update_available ? "neutral" : "success"
    );
  }

  function renderSupportAccess(state) {
    currentSupportAccess = state || null;
    if (!supportAccessStatus || !supportAccessDetails) {
      return;
    }

    const supportState = state || {
      status: "disabled",
      access_scope: "runtime_metadata_only",
      support_disabled_by_default: true
    };

    if (supportState.status === "active") {
      supportAccessStatus.textContent = "Temporary support access is active.";
      supportAccessDetails.textContent =
        "Scope: " + (supportState.access_scope || "runtime_metadata_only") +
        " - Expires: " + (supportState.expires_at || "soon") +
        (supportState.reason ? " - Reason: " + supportState.reason : "");
      setFeedback(supportAccessFeedback, "Support access is active only for the consent window shown here.", "success");
    } else if (supportState.status === "revoked") {
      supportAccessStatus.textContent = "Support access was revoked.";
      supportAccessDetails.textContent = supportState.revoked_at
        ? "Revoked at " + supportState.revoked_at + "."
        : "No active support window is open.";
      setFeedback(supportAccessFeedback, "Support access is disabled again.", "neutral");
    } else if (supportState.status === "expired") {
      supportAccessStatus.textContent = "A previous support window expired automatically.";
      supportAccessDetails.textContent = supportState.expires_at
        ? "The last window expired at " + supportState.expires_at + "."
        : "No active support window is open.";
      setFeedback(supportAccessFeedback, "Support access is disabled unless you grant it again.", "neutral");
    } else {
      supportAccessStatus.textContent = "Support access is disabled.";
      supportAccessDetails.textContent = "No active support window is open.";
      setFeedback(supportAccessFeedback, "Keep this disabled unless you explicitly want support help.", "neutral");
    }

    if (supportAccessRevokeButton) {
      supportAccessRevokeButton.disabled = supportState.status !== "active";
      supportAccessRevokeButton.className = supportState.status === "active"
        ? "rounded-xl border border-outline-variant bg-surface px-5 py-3 text-sm font-semibold text-on-surface transition hover:bg-surface-container-low"
        : "rounded-xl border border-outline-variant bg-surface px-5 py-3 text-sm font-semibold text-on-surface opacity-60";
    }
  }

  function renderSupportAccessHistory(entries) {
    currentSupportAccessHistory = Array.isArray(entries) ? entries : [];
    if (!supportAccessHistory) {
      return;
    }

    if (!currentSupportAccessHistory.length) {
      supportAccessHistory.innerHTML = "<p>No support access history yet.</p>";
      return;
    }

    supportAccessHistory.innerHTML = currentSupportAccessHistory.slice(0, 5).map(function (entry) {
      const timing = entry.status === "revoked"
        ? "Revoked " + (entry.revoked_at || "later")
        : entry.status === "expired"
          ? "Expired " + (entry.expires_at || "later")
          : entry.status === "active"
            ? "Expires " + (entry.expires_at || "soon")
            : "Granted " + (entry.granted_at || "recently");
      return [
        '<article class="rounded-xl border border-outline-variant/15 bg-white px-4 py-3">',
        '<div class="flex flex-wrap items-center justify-between gap-2">',
        '<span class="font-semibold text-on-surface">', escapeHtml(entry.access_scope || "runtime_metadata_only"), '</span>',
        '<span class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline">', escapeHtml(entry.status || "disabled"), "</span>",
        "</div>",
        '<p class="mt-2 text-xs leading-6 text-on-surface-variant">', escapeHtml(timing), "</p>",
        entry.reason
          ? '<p class="mt-1 text-xs leading-6 text-on-surface-variant">Reason: ' + escapeHtml(entry.reason) + "</p>"
          : ""
        ,
        "</article>"
      ].join("");
    }).join("");
  }

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      window.URL.revokeObjectURL(url);
    }, 500);
  }

  function renderOnboardingBundle(bundle) {
    currentOnboardingBundle = bundle || null;
    const ready = Boolean(bundle);

    if (downloadOnboardingBundleButton) {
      downloadOnboardingBundleButton.disabled = !ready;
      downloadOnboardingBundleButton.className = ready
        ? "rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface transition hover:bg-surface"
        : "rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface opacity-60";
    }
    if (copyOnboardingCommandButton) {
      copyOnboardingCommandButton.disabled = !ready;
      copyOnboardingCommandButton.className = ready
        ? "rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface transition hover:bg-surface"
        : "rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface opacity-60";
    }
    if (downloadServiceAdapterBundleButton) {
      downloadServiceAdapterBundleButton.disabled = !ready;
      downloadServiceAdapterBundleButton.className = ready
        ? "rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm font-semibold text-on-surface transition hover:bg-surface-container-low"
        : "rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm font-semibold text-on-surface opacity-60";
    }

    if (!ready) {
      setFeedback(onboardingBundleFeedback, "Finish setup first, then download a personalized bundle for Local Private or Private Cloud.", "neutral");
      if (onboardingCommandOutput) {
        onboardingCommandOutput.textContent = "Save setup to generate an installer command.";
      }
      if (onboardingDownloadLinks) {
        onboardingDownloadLinks.innerHTML = "<p>Installer links will appear here once your setup bundle is ready.</p>";
      }
      if (onboardingSummaryMode) {
        onboardingSummaryMode.textContent = "Save setup to choose a path.";
      }
      if (onboardingSummaryTarget) {
        onboardingSummaryTarget.textContent = "No deployment target selected yet.";
      }
      if (onboardingSummaryTime) {
        onboardingSummaryTime.textContent = "Setup timing appears after the bundle is generated.";
      }
      if (onboardingNextSteps) {
        onboardingNextSteps.innerHTML = [
          "<li>1. Save setup to unlock your personalized bundle.</li>",
          "<li>2. Download the right installer for your machine or cloud path.</li>",
          "<li>3. Return here to verify runtime status and logs.</li>"
        ].join("");
      }
      return;
    }

    const modeLabels = {
      local_private: "Local Private",
      private_hosted: "Private Cloud in Your Account",
      managed_private: "Managed Private"
    };
    const targetLabels = {
      local_machine: "This device",
      oracle_cloud: "Oracle Cloud",
      upcloud: "UpCloud",
      ovhcloud: "OVHcloud",
      managed_omnyid: "Managed by OmnyID"
    };
    const nextStepSets = {
      local_private: [
        "1. Download the installer that matches your operating system.",
        "2. Run the command below on your own machine and let the preflight check Docker, disk, and bandwidth.",
        "3. Return here to confirm the runtime comes online."
      ],
      private_hosted: [
        "1. Pick Oracle Cloud, UpCloud, or OVHcloud as your runtime boundary.",
        "2. Run the generated installer so OmnyID can prepare the dedicated private host path.",
        "3. Return here to validate the runtime and audit its status."
      ],
      managed_private: [
        "1. Download the bundle so you have a local copy of your privacy plan.",
        "2. Use the installer command only if you want a mirrored private setup outside the managed path.",
        "3. Return here to verify the runtime lifecycle and logs."
      ]
    };

    setFeedback(
      onboardingBundleFeedback,
      "Bundle ready. This path is estimated at about " + bundle.estimated_minutes + " minutes and stays aligned with your chosen privacy boundary.",
      "success"
    );

    if (onboardingCommandOutput) {
      onboardingCommandOutput.textContent = Array.isArray(bundle.commands) && bundle.commands.length
        ? bundle.commands[0]
        : "No installer command available.";
    }

    if (onboardingDownloadLinks) {
      const links = Array.isArray(bundle.installer_downloads) ? bundle.installer_downloads : [];
      onboardingDownloadLinks.innerHTML = links.map(function (download) {
        const href = API_BASE + download.url;
        return [
          '<div class="flex flex-col gap-2 rounded-xl border border-outline-variant/15 bg-surface px-4 py-3">',
          '<div class="flex items-center justify-between gap-3">',
          '<span class="font-semibold text-on-surface">', escapeHtml(download.label), '</span>',
          '<a class="text-primary transition hover:underline" href="', escapeHtml(href), '" download="', escapeHtml(download.filename), '">Download</a>',
          "</div>",
          '<p class="font-mono text-[11px] leading-6 text-on-surface-variant">', escapeHtml(download.filename), "</p>",
          "</div>"
        ].join("");
      }).join("");
    }
    if (onboardingSummaryMode) {
      onboardingSummaryMode.textContent = modeLabels[bundle.privacy_mode] || bundle.privacy_mode;
    }
    if (onboardingSummaryTarget) {
      onboardingSummaryTarget.textContent = targetLabels[bundle.deployment_target] || bundle.deployment_target;
    }
    if (onboardingSummaryTime) {
      onboardingSummaryTime.textContent = "About " + bundle.estimated_minutes + " minutes with the current path.";
    }
    if (onboardingNextSteps) {
      const steps = nextStepSets[bundle.privacy_mode] || nextStepSets.local_private;
      onboardingNextSteps.innerHTML = steps.map(function (step) {
        return "<li>" + escapeHtml(step) + "</li>";
      }).join("");
    }
  }

  function renderDeviceSyncPolicies(payload) {
    currentDeviceSyncPolicies = payload && Array.isArray(payload.entries) ? payload.entries : [];
    if (!deviceSyncPolicyList) {
      return;
    }
    if (!currentDeviceSyncPolicies.length) {
      deviceSyncPolicyList.innerHTML = "<p>No local-first devices registered yet.</p>";
      return;
    }

    deviceSyncPolicyList.innerHTML = currentDeviceSyncPolicies.slice(0, 8).map(function (entry) {
      const slices = Array.isArray(entry.sync_slices) ? entry.sync_slices : [];
      const sliceSummary = slices.map(function (slice) {
        return slice && slice.name ? String(slice.name) : "";
      }).filter(Boolean).join(", ");
      const note = entry.notes_summary && entry.notes_summary.policy_note
        ? String(entry.notes_summary.policy_note)
        : "Local-first sync policy is active for this device.";
      return [
        '<article class="rounded-xl border border-outline-variant/15 bg-white px-4 py-3">',
        '<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">',
        '<div>',
        '<div class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline">', escapeHtml(entry.device_class || "device"), "</div>",
        '<h4 class="mt-2 text-sm font-semibold text-on-surface">', escapeHtml(entry.device_id || "device"), "</h4>",
        '<p class="mt-2 break-all text-xs leading-6 text-on-surface-variant">', escapeHtml(entry.agent_id || "agent"), "</p>",
        '<p class="mt-2 text-xs leading-6 text-on-surface-variant">Profile: ', escapeHtml(entry.policy_profile || "balanced"), " - Local keys: ", escapeHtml(entry.requires_local_key_material ? "required" : "not required"), "</p>",
        '<p class="text-xs leading-6 text-on-surface-variant">Slices: ', escapeHtml(sliceSummary || "none"), "</p>",
        '<p class="mt-2 text-xs leading-6 text-on-surface-variant">', escapeHtml(note), "</p>",
        '<p class="mt-1 text-[11px] leading-6 text-on-surface-variant">Bundle updated: ', escapeHtml(entry.last_bundle_at || "unknown"), "</p>",
        '</div>',
        '<div class="flex flex-wrap gap-2">',
        '<button type="button" data-sync-profile-device="', escapeHtml(entry.device_id || ""), '" data-sync-profile="full" class="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface">Full</button>',
        '<button type="button" data-sync-profile-device="', escapeHtml(entry.device_id || ""), '" data-sync-profile="balanced" class="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface">Balanced</button>',
        '<button type="button" data-sync-profile-device="', escapeHtml(entry.device_id || ""), '" data-sync-profile="lightweight" class="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface">Lightweight</button>',
        '</div>',
        '</div>',
        '</article>'
      ].join("");
    }).join("");

    deviceSyncPolicyList.querySelectorAll("[data-sync-profile-device]").forEach(function (button) {
      button.addEventListener("click", function () {
        handleDeviceSyncPolicyUpdate(
          button.getAttribute("data-sync-profile-device") || "",
          button.getAttribute("data-sync-profile") || ""
        );
      });
    });
  }

  async function loadOnboardingBundle() {
    if (!session || !session.token || !currentOnboarding || !currentOnboarding.completed_at) {
      renderOnboardingBundle(null);
      currentServiceAdapterBundle = null;
      return;
    }
    try {
      const payload = await apiFetch("/dashboard/onboarding-bundle");
      renderOnboardingBundle(payload);
      currentServiceAdapterBundle = await apiFetch("/dashboard/service-adapter-bundle");
    } catch (error) {
      currentServiceAdapterBundle = null;
      setFeedback(onboardingBundleFeedback, error.message, "error");
    }
  }

  async function loadRuntimeLogs() {
    if (!session || !session.token || !currentRuntimeDeployment) {
      renderRuntimeMonitor(currentRuntimeDeployment || null, null);
      return;
    }
    try {
      const payload = await apiFetch("/runtime/logs");
      renderRuntimeMonitor(currentRuntimeDeployment, payload);
    } catch (error) {
      setFeedback(runtimeStatusFeedback, error.message, "error");
    }
  }

  async function loadDashboard() {
    if (!session || !session.token) {
      if (agentConsole) {
        agentConsole.classList.add("hidden");
        agentConsole.style.display = "none";
      }
      return;
    }

    const payload = await apiFetch("/dashboard/bootstrap");
    if (sessionSummary) {
      sessionSummary.textContent = payload.user.display_name + " - " + payload.user.email + " - " + payload.user.auth_provider;
    }
    renderAgents(payload.agents || []);
    renderAgentSelectors(payload.agents || []);
    renderMessages(payload.messages || []);
    renderActionLog(payload.action_log || []);
    renderOnboarding(payload.onboarding || null, payload.user || null);
    renderDeviceSyncPolicies(payload.device_sync_policies || null);
    renderSupportAccess(payload.support_access || null);
    renderSupportAccessHistory(payload.support_access_history || []);
    renderSessions(payload.sessions || []);
    renderRuntimeDeployment(payload.runtime_deployment || null);
    renderRuntimeBackups(payload.runtime_backups || null);
    renderRuntimeRestoreDrills(payload.runtime_restore_drills || null);
    renderRuntimeUpdates(payload.runtime_updates || null);
    await loadOnboardingBundle();
    await loadRuntimeLogs();
    if (agentConsole) {
      agentConsole.classList.remove("hidden");
      agentConsole.style.display = "block";
    }
  }

  async function completeAuth(payload, successMessage) {
    writeSession(payload);
    setFeedback(authFeedback, successMessage, "success");
    closeAuthModal();
    window.location.href = "/workspace/";
  }

  function handleGuestAccess() {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.location.href = "/workspace/";
  }

  async function handleRegister(event) {
    event.preventDefault();
    setFeedback(
      authFeedback,
      authModeContext === "advanced-agent-id"
        ? "Creating your Agent ID..."
        : "Creating your private workspace...",
      "neutral"
    );
    try {
      const payload = await apiFetch("/auth/register", {
        method: "POST",
        body: {
          display_name: document.getElementById("register-display-name").value,
          email: document.getElementById("register-email").value,
          password: document.getElementById("register-password").value
        }
      });
      if (payload.verification_required) {
        setFeedback(
          authFeedback,
          payload.message || "Check your email for a link to verify your address and finish setting up your account.",
          "success"
        );
        return;
      }
      await completeAuth(
        payload,
        authModeContext === "advanced-agent-id"
          ? "Agent ID created. Loading your console."
          : "Private workspace created. Loading your console."
      );
    } catch (error) {
      setFeedback(authFeedback, error.message, "error");
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setFeedback(loginFeedback, "Signing you in...", "neutral");
    try {
      const payload = await apiFetch("/auth/login", {
        method: "POST",
        body: {
          email: document.getElementById("login-email").value,
          password: document.getElementById("login-password").value
        }
      });
      setFeedback(loginFeedback, "", "neutral");
      await completeAuth(payload, "Sign-in complete. Loading your console.");
    } catch (error) {
      setFeedback(
        loginFeedback,
        error.message + " If you just signed up, verify your email first — check your inbox for the link.",
        "error"
      );
    }
  }

  function showForgotPasswordForm() {
    if (loginForm) loginForm.classList.add("hidden");
    if (forgotPasswordForm) forgotPasswordForm.classList.remove("hidden");
    setFeedback(authFeedback, "", "neutral");
    setFeedback(loginFeedback, "", "neutral");
    const loginEmail = document.getElementById("login-email");
    const forgotEmail = document.getElementById("forgot-password-email");
    if (loginEmail && forgotEmail && loginEmail.value) {
      forgotEmail.value = loginEmail.value;
    }
  }

  function showLoginForm() {
    if (forgotPasswordForm) forgotPasswordForm.classList.add("hidden");
    if (resetPasswordForm) resetPasswordForm.classList.add("hidden");
    if (loginForm) loginForm.classList.remove("hidden");
    setFeedback(authFeedback, "", "neutral");
    setFeedback(loginFeedback, "", "neutral");
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById("forgot-password-email").value;
    setFeedback(authFeedback, "Sending reset link...", "neutral");
    try {
      const payload = await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: { email }
      });
      setFeedback(
        authFeedback,
        payload.message || "If that email is registered, a reset link has been sent.",
        "success"
      );
    } catch (error) {
      setFeedback(authFeedback, error.message, "error");
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    if (!pendingResetToken) {
      setFeedback(authFeedback, "Password reset link is incomplete. Request a fresh reset link and try again.", "error");
      return;
    }
    const newPassword = document.getElementById("reset-password-new").value;
    setFeedback(authFeedback, "Resetting your password...", "neutral");
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: { token: pendingResetToken, new_password: newPassword }
      });
      pendingResetToken = null;
      window.history.replaceState({}, "", window.location.pathname === "/reset-password" ? "/#login" : window.location.pathname);
      setFeedback(
        authFeedback,
        "Your password has been reset. All existing sessions were signed out for safety — sign in below with your new password.",
        "success"
      );
      showLoginForm();
    } catch (error) {
      setFeedback(authFeedback, error.message, "error");
    }
  }

  async function handleGoogleCredential(response) {
    setFeedback(authFeedback, "Verifying Google sign-in...", "neutral");
    try {
      const payload = await apiFetch("/auth/google", {
        method: "POST",
        body: { id_token: response.credential }
      });
      await completeAuth(payload, "Google sign-in complete. Loading your console.");
    } catch (error) {
      setFeedback(authFeedback, error.message, "error");
    }
  }

  async function loadGoogleAuthConfig() {
    if (googleClientId) {
      return googleClientId;
    }
    try {
      const response = await fetch(API_BASE + "/auth/google/config");
      if (!response.ok) {
        return "";
      }
      const payload = await response.json();
      if (!payload || !payload.enabled || typeof payload.client_id !== "string") {
        return "";
      }
      googleClientId = payload.client_id.trim();
      return googleClientId;
    } catch {
      return "";
    }
  }

  async function handleSetup(event) {
    event.preventDefault();
    setFeedback(setupFeedback, "Saving setup state...", "neutral");
    try {
      const onboarding = await apiFetch("/dashboard/onboarding", {
        method: "POST",
        body: {
          identity_confirmed: setupIdentityConfirmed ? setupIdentityConfirmed.checked : false,
          email_provider: setupEmailProvider ? setupEmailProvider.value : "",
          email_address: setupEmailAddress ? setupEmailAddress.value : "",
          email_connected: setupEmailConnected ? setupEmailConnected.checked : false,
          llm_mode: setupLlmMode ? setupLlmMode.value : "byo_or_local",
          notes: {
            source: "landing_setup",
            privacy_mode: setupPrivacyMode ? setupPrivacyMode.value : selectedPrivacyMode,
            deployment_target: setupDeploymentTarget ? setupDeploymentTarget.value : selectedDeploymentTarget,
            detected_platform: detectPlatformLabel(),
            rough_browser_downlink_mbps: navigator.connection && typeof navigator.connection.downlink === "number"
              ? navigator.connection.downlink
              : null
          }
        }
      });
      renderOnboarding(onboarding, session ? session.user : null);
      renderRuntimeDeployment(null);
      await loadOnboardingBundle();
      setFeedback(
        setupFeedback,
        onboarding.completed_at
          ? "Setup saved. Runtime deployment is now available."
          : "Setup saved. Confirm your Agent ID to unlock runtime deployment.",
        onboarding.completed_at ? "success" : "neutral"
      );
    } catch (error) {
      setFeedback(setupFeedback, error.message, "error");
    }
  }

  async function handleDemoSend(event) {
    event.preventDefault();
    setFeedback(demoSendFeedback, "Sending test message...", "neutral");
    try {
      await apiFetch("/dashboard/demo/send", {
        method: "POST",
        body: {
          from_agent_id: demoFromAgent.value,
          to_agent_id: demoToAgent.value,
          body: document.getElementById("demo-message-body").value
        }
      });
      document.getElementById("demo-message-body").value = "";
      setFeedback(demoSendFeedback, "Test message sent. Refreshing thread activity.", "success");
      await loadDashboard();
    } catch (error) {
      setFeedback(demoSendFeedback, error.message, "error");
    }
  }

  async function handleWaitlist(event) {
    event.preventDefault();
    const email = document.getElementById("waitlist-email").value.trim();
    if (!email) {
      setFeedback(waitlistFeedback, "Enter an email address for the waitlist.", "error");
      return;
    }
    setFeedback(waitlistFeedback, "Sending your request to hello@omnyid.com...", "neutral");
    try {
      const response = await apiFetch("/waitlist", {
        method: "POST",
        body: { email }
      });
      document.getElementById("waitlist-email").value = "";
      if (response.status === "sent") {
        setFeedback(waitlistFeedback, "Request sent to hello@omnyid.com. We will reach out from the private beta queue.", "success");
      } else {
        setFeedback(waitlistFeedback, "Request recorded for hello@omnyid.com. Delivery is queued while outbound mail is being finalized.", "success");
      }
    } catch (error) {
      setFeedback(waitlistFeedback, error.message, "error");
    }
  }

  function handleSignOut() {
    currentOnboarding = null;
    currentRuntimeBackups = null;
    currentRuntimeRestoreDrills = null;
    currentRuntimeUpdates = null;
    currentServiceAdapterBundle = null;
    writeSession(null);
    if (agentConsole) {
      agentConsole.classList.add("hidden");
      agentConsole.style.display = "none";
    }
    renderRuntimeUpdates(null);
    setFeedback(authFeedback, "", "neutral");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleDeployRuntime() {
    if (!session || !session.token) {
      setFeedback(deployRuntimeFeedback, "Sign in first to create a private runtime plan.", "error");
      return;
    }
    if (!currentOnboarding || !currentOnboarding.completed_at) {
      setFeedback(deployRuntimeFeedback, "Finish the setup checklist before deploying a runtime.", "error");
      return;
    }

    setFeedback(deployRuntimeFeedback, "Creating a private Crew runtime plan...", "neutral");
    const stopRuntimeLoader = startInlineGenesisLoader(deployRuntimeFeedback);
    apiFetch("/runtime/deploy", {
      method: "POST",
      body: {
        framework: "crewai",
        gui: "crewai-studio"
      }
    }).then(async function () {
      stopRuntimeLoader();
      setFeedback(deployRuntimeFeedback, "Private Crew runtime plan created. Refreshing dashboard state.", "success");
      await loadDashboard();
    }).catch(function (error) {
      stopRuntimeLoader();
      setFeedback(deployRuntimeFeedback, error.message, "error");
    });
  }

  function handleDeployPythonRunner() {
    if (!session || !session.token) {
      setFeedback(deployPythonRunnerFeedback, "Sign in first to create a private runtime plan.", "error");
      return;
    }
    if (!currentOnboarding || !currentOnboarding.completed_at) {
      setFeedback(deployPythonRunnerFeedback, "Finish the setup checklist before deploying a runtime.", "error");
      return;
    }

    setFeedback(deployPythonRunnerFeedback, "Creating a private Python runner + chat runtime plan...", "neutral");
    const stopPythonRunnerLoader = startInlineGenesisLoader(deployPythonRunnerFeedback);
    apiFetch("/runtime/deploy", {
      method: "POST",
      body: {
        framework: "python-runner-chat",
        gui: "builtin-chat-window"
      }
    }).then(async function () {
      stopPythonRunnerLoader();
      setFeedback(deployPythonRunnerFeedback, "Private Python runner plan created. Refreshing dashboard state.", "success");
      await loadDashboard();
    }).catch(function (error) {
      stopPythonRunnerLoader();
      setFeedback(deployPythonRunnerFeedback, error.message, "error");
    });
  }

  function handleDeployOpenClaw() {
    if (!deployOpenClawFeedback) {
      return;
    }
    setFeedback(
      deployOpenClawFeedback,
      "OpenClaw deployment is not available yet. It will be enabled only after the same per-user privacy boundary is in place.",
      "neutral"
    );
  }

  function handleDownloadOnboardingBundle() {
    if (!currentOnboardingBundle || !Array.isArray(currentOnboardingBundle.files)) {
      setFeedback(onboardingBundleFeedback, "Save setup first so OmnyID can generate a personalized bundle.", "error");
      return;
    }

    currentOnboardingBundle.files.forEach(function (file) {
      const mimeType = file.name.endsWith(".json")
        ? "application/json;charset=utf-8"
        : "text/plain;charset=utf-8";
      downloadTextFile(file.name, file.content, mimeType);
    });

    setFeedback(onboardingBundleFeedback, "Bundle downloaded. Use the installer link and command shown here to continue setup.", "success");
  }

  function handleDownloadServiceAdapterBundle() {
    if (!currentServiceAdapterBundle || !Array.isArray(currentServiceAdapterBundle.files)) {
      setFeedback(onboardingBundleFeedback, "Sign in and save setup first so OmnyID can generate the AFP service adapter starter.", "error");
      return;
    }

    currentServiceAdapterBundle.files.forEach(function (file) {
      const mimeType = file.name.endsWith(".json")
        ? "application/json;charset=utf-8"
        : "text/plain;charset=utf-8";
      downloadTextFile(file.name, file.content, mimeType);
    });

    setFeedback(
      onboardingBundleFeedback,
      "Service adapter starter downloaded. Hand it to your university or business systems team to expose signed AFP capability endpoints over HTTPS.",
      "success"
    );
  }

  async function handleCopyOnboardingCommand() {
    if (!currentOnboardingBundle || !Array.isArray(currentOnboardingBundle.commands) || !currentOnboardingBundle.commands.length) {
      setFeedback(onboardingBundleFeedback, "Save setup first so OmnyID can generate a copyable installer command.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(currentOnboardingBundle.commands[0]);
      setFeedback(onboardingBundleFeedback, "Installer command copied. You can paste it directly into your terminal.", "success");
    } catch {
      setFeedback(onboardingBundleFeedback, "Clipboard access is unavailable here. You can still copy the command manually from the panel.", "error");
    }
  }

  async function handleDeviceBootstrapDownload(deviceClass) {
    if (!session || !session.token) {
      setFeedback(deviceBootstrapFeedback, "Sign in first to prepare a device bootstrap.", "error");
      return;
    }
    setFeedback(deviceBootstrapFeedback, "Preparing " + deviceClass + " bootstrap...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/device-bootstrap-bundle", {
        method: "POST",
        body: { device_class: deviceClass }
      });
      payload.files.forEach(function (file) {
        const mimeType = file.name.endsWith(".json")
          ? "application/json;charset=utf-8"
          : "text/plain;charset=utf-8";
        downloadTextFile(file.name, file.content, mimeType);
      });
      const devicePolicies = await apiFetch("/dashboard/device-sync-policies");
      renderDeviceSyncPolicies(devicePolicies);
      setFeedback(deviceBootstrapFeedback, "Downloaded " + deviceClass + " bootstrap. Keep the seed reference and local key material on the device side.", "success");
    } catch (error) {
      setFeedback(deviceBootstrapFeedback, error.message, "error");
    }
  }

  async function handleDeviceSyncPolicyUpdate(deviceId, policyProfile) {
    if (!session || !session.token) {
      setFeedback(deviceBootstrapFeedback, "Sign in first to manage device sync policy.", "error");
      return;
    }
    if (!deviceId || !policyProfile) {
      setFeedback(deviceBootstrapFeedback, "Device policy target is missing.", "error");
      return;
    }
    setFeedback(deviceBootstrapFeedback, "Updating " + deviceId + " to " + policyProfile + " sync...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/device-sync-policies", {
        method: "POST",
        body: {
          action: "set_profile",
          device_id: deviceId,
          policy_profile: policyProfile
        }
      });
      renderDeviceSyncPolicies(payload);
      setFeedback(deviceBootstrapFeedback, "Device sync policy updated to " + policyProfile + ".", "success");
    } catch (error) {
      setFeedback(deviceBootstrapFeedback, error.message, "error");
    }
  }

  async function handleRuntimeAction(action) {
    if (!currentRuntimeDeployment) {
      setFeedback(runtimeStatusFeedback, "Deploy a private runtime first.", "error");
      return;
    }
    setFeedback(runtimeStatusFeedback, "Applying runtime action: " + action + "...", "neutral");
    try {
      const payload = await apiFetch("/runtime/action", {
        method: "POST",
        body: { action }
      });
      renderRuntimeDeployment(payload);
      await loadRuntimeLogs();
    } catch (error) {
      setFeedback(runtimeStatusFeedback, error.message, "error");
    }
  }

  async function handleRuntimeDestroy() {
    if (!currentRuntimeDeployment) {
      setFeedback(runtimeStatusFeedback, "No runtime exists to destroy.", "error");
      return;
    }
    const confirmed = window.confirm("Destroy this private runtime and remove its hosted workspace files from OmnyID?");
    if (!confirmed) {
      return;
    }
    setFeedback(runtimeStatusFeedback, "Destroying private runtime...", "neutral");
    try {
      const payload = await apiFetch("/runtime/destroy", {
        method: "POST",
        body: {}
      });
      currentRuntimeDeployment = null;
      renderRuntimeDeployment(null);
      renderRuntimeMonitor(null, null);
      if (runtimeLogsOutput) {
        runtimeLogsOutput.textContent = "Runtime destroyed. No runtime logs remain on the hosted side.";
      }
      setFeedback(runtimeStatusFeedback, payload.message || "Private runtime destroyed.", "success");
    } catch (error) {
      setFeedback(runtimeStatusFeedback, error.message, "error");
    }
  }

  async function handleRuntimeBackupPolicySave() {
    if (!session || !session.token) {
      setFeedback(runtimeBackupFeedback, "Sign in first to manage backup retention.", "error");
      return;
    }
    const retentionDays = runtimeBackupRetention ? Number(runtimeBackupRetention.value) : 14;
    setFeedback(runtimeBackupFeedback, "Saving backup retention policy...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/runtime-backups", {
        method: "POST",
        body: {
          action: "set_retention",
          retention_days: retentionDays
        }
      });
      renderRuntimeBackups(payload);
      setFeedback(runtimeBackupFeedback, "Retention policy saved.", "success");
    } catch (error) {
      setFeedback(runtimeBackupFeedback, error.message, "error");
    }
  }

  async function handleRuntimeRecoveryPacketDownload() {
    if (!session || !session.token) {
      setFeedback(runtimeBackupFeedback, "Sign in first to export your runtime recovery packet.", "error");
      return;
    }
    setFeedback(runtimeBackupFeedback, "Preparing metadata-only recovery packet...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/runtime-recovery-packet");
      const stamp = (payload.generated_at || new Date().toISOString()).replaceAll(":", "-");
      downloadTextFile(
        payload.packet_name || ("omnyid-runtime-recovery-" + stamp + ".json"),
        JSON.stringify(payload, null, 2),
        "application/json;charset=utf-8"
      );
      setFeedback(runtimeBackupFeedback, "Recovery packet downloaded. Keep it somewhere only you control.", "success");
    } catch (error) {
      setFeedback(runtimeBackupFeedback, error.message, "error");
    }
  }

  async function handleRuntimeBackupSnapshot() {
    if (!session || !session.token) {
      setFeedback(runtimeBackupFeedback, "Sign in first to create a metadata snapshot.", "error");
      return;
    }
    if (!currentRuntimeDeployment) {
      setFeedback(runtimeBackupFeedback, "Deploy a private runtime first.", "error");
      return;
    }
    setFeedback(runtimeBackupFeedback, "Creating metadata-only snapshot...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/runtime-backups", {
        method: "POST",
        body: {
          action: "create_snapshot"
        }
      });
      renderRuntimeBackups(payload);
      setFeedback(runtimeBackupFeedback, "Metadata snapshot created.", "success");
    } catch (error) {
      setFeedback(runtimeBackupFeedback, error.message, "error");
    }
  }

  async function handleRuntimeBackupManifestDownload(backupId) {
    if (!backupId) {
      setFeedback(runtimeBackupFeedback, "Backup manifest id is missing.", "error");
      return;
    }
    if (!session || !session.token) {
      setFeedback(runtimeBackupFeedback, "Sign in first to download snapshot manifests.", "error");
      return;
    }
    setFeedback(runtimeBackupFeedback, "Preparing metadata manifest download...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/runtime-backups/" + encodeURIComponent(backupId));
      downloadTextFile(
        "omnyid-runtime-backup-" + backupId + ".json",
        JSON.stringify(payload, null, 2),
        "application/json;charset=utf-8"
      );
      setFeedback(runtimeBackupFeedback, "Metadata manifest downloaded.", "success");
    } catch (error) {
      setFeedback(runtimeBackupFeedback, error.message, "error");
    }
  }

  async function handleRuntimeBackupDelete(backupId) {
    if (!backupId) {
      setFeedback(runtimeBackupFeedback, "Backup snapshot id is missing.", "error");
      return;
    }
    if (!session || !session.token) {
      setFeedback(runtimeBackupFeedback, "Sign in first to manage snapshots.", "error");
      return;
    }
    const confirmed = window.confirm("Delete this hosted metadata snapshot now?");
    if (!confirmed) {
      return;
    }
    setFeedback(runtimeBackupFeedback, "Deleting metadata snapshot...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/runtime-backups", {
        method: "POST",
        body: {
          action: "delete_snapshot",
          backup_id: backupId
        }
      });
      renderRuntimeBackups(payload);
      setFeedback(runtimeBackupFeedback, "Metadata snapshot deleted.", "success");
    } catch (error) {
      setFeedback(runtimeBackupFeedback, error.message, "error");
    }
  }

  async function handleRuntimeRestoreDrill(backupId) {
    if (!backupId) {
      setFeedback(runtimeRestoreFeedback, "Backup snapshot id is missing.", "error");
      return;
    }
    if (!session || !session.token) {
      setFeedback(runtimeRestoreFeedback, "Sign in first to run a restore drill.", "error");
      return;
    }
    setFeedback(runtimeRestoreFeedback, "Running restore drill from metadata snapshot...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/runtime-restore-drills", {
        method: "POST",
        body: {
          backup_id: backupId
        }
      });
      renderRuntimeRestoreDrills(payload);
      setFeedback(runtimeRestoreFeedback, "Restore drill recorded. Review the checklist below.", "success");
    } catch (error) {
      setFeedback(runtimeRestoreFeedback, error.message, "error");
    }
  }

  async function handleRuntimeUpdatePolicySave() {
    if (!session || !session.token) {
      setFeedback(runtimeUpdateFeedback, "Sign in first to manage runtime update policy.", "error");
      return;
    }
    setFeedback(runtimeUpdateFeedback, "Saving hosted runtime update policy...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/runtime-updates", {
        method: "POST",
        body: {
          action: "set_policy",
          update_channel: runtimeUpdateChannel ? runtimeUpdateChannel.value : "stable",
          auto_apply: runtimeUpdateAutoApply ? runtimeUpdateAutoApply.value : "manual_only"
        }
      });
      renderRuntimeUpdates(payload);
      setFeedback(runtimeUpdateFeedback, "Runtime update policy saved.", "success");
    } catch (error) {
      setFeedback(runtimeUpdateFeedback, error.message, "error");
    }
  }

  async function handleRuntimeUpdateCheck() {
    if (!session || !session.token) {
      setFeedback(runtimeUpdateFeedback, "Sign in first to check runtime updates.", "error");
      return;
    }
    setFeedback(runtimeUpdateFeedback, "Checking hosted scaffold version...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/runtime-updates", {
        method: "POST",
        body: { action: "check_updates" }
      });
      renderRuntimeUpdates(payload);
    } catch (error) {
      setFeedback(runtimeUpdateFeedback, error.message, "error");
    }
  }

  async function handleRuntimeUpdateApply() {
    if (!currentRuntimeDeployment) {
      setFeedback(runtimeUpdateFeedback, "Deploy a private runtime first.", "error");
      return;
    }
    setFeedback(runtimeUpdateFeedback, "Refreshing the hosted runtime scaffold...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/runtime-updates", {
        method: "POST",
        body: { action: "apply_update" }
      });
      renderRuntimeUpdates(payload);
      await loadDashboard();
    } catch (error) {
      setFeedback(runtimeUpdateFeedback, error.message, "error");
    }
  }

  async function handleSupportAccess(event) {
    event.preventDefault();
    setFeedback(supportAccessFeedback, "Granting temporary support access...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/support-access", {
        method: "POST",
        body: {
          action: "grant",
          duration_hours: supportAccessDuration ? Number(supportAccessDuration.value) : 1,
          access_scope: supportAccessScope ? supportAccessScope.value : "runtime_metadata_only",
          reason: supportAccessReason ? supportAccessReason.value : ""
        }
      });
      renderSupportAccess(payload);
      const historyPayload = await apiFetch("/dashboard/support-access/history");
      renderSupportAccessHistory(historyPayload.entries || []);
    } catch (error) {
      setFeedback(supportAccessFeedback, error.message, "error");
    }
  }

  async function handleSupportAccessRevoke() {
    setFeedback(supportAccessFeedback, "Revoking support access...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/support-access", {
        method: "POST",
        body: {
          action: "revoke",
          reason: "revoked_from_dashboard"
        }
      });
      renderSupportAccess(payload);
      const historyPayload = await apiFetch("/dashboard/support-access/history");
      renderSupportAccessHistory(historyPayload.entries || []);
    } catch (error) {
      setFeedback(supportAccessFeedback, error.message, "error");
    }
  }

  async function handleDashboardExport() {
    if (!session || !session.token) {
      setFeedback(exportDashboardFeedback, "Sign in first to export your workspace state.", "error");
      return;
    }
    setFeedback(exportDashboardFeedback, "Preparing your bounded workspace export...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/export");
      const stamp = (payload.exported_at || new Date().toISOString()).replaceAll(":", "-");
      downloadTextFile(
        "omnyid-dashboard-export-" + stamp + ".json",
        JSON.stringify(payload, null, 2),
        "application/json;charset=utf-8"
      );
      setFeedback(exportDashboardFeedback, "Workspace export downloaded. It includes a scope summary so you can see what is and is not covered.", "success");
    } catch (error) {
      setFeedback(exportDashboardFeedback, error.message, "error");
    }
  }

  async function handleSessionAction(action, tokenPreview) {
    if (!session || !session.token) {
      setFeedback(sessionSecurityFeedback, "Sign in first to manage sessions.", "error");
      return;
    }

    const targetSession = currentSessions.find(function (entry) {
      return entry.token_preview === tokenPreview;
    });
    const body = { action: action };
    if (action === "revoke" && targetSession) {
      body.token = targetSession.token_preview || null;
    }

    setFeedback(
      sessionSecurityFeedback,
      action === "revoke_others" ? "Revoking other sessions..." : "Revoking selected session...",
      "neutral"
    );

    try {
      const payload = await apiFetch("/dashboard/sessions", {
        method: "POST",
        body
      });
      renderSessions(payload.sessions || []);
      setFeedback(
        sessionSecurityFeedback,
        action === "revoke_others" ? "Other sessions revoked." : "Session revoked.",
        "success"
      );
    } catch (error) {
      setFeedback(sessionSecurityFeedback, error.message, "error");
    }
  }

  async function handleAccountDelete(event) {
    event.preventDefault();
    if (!session || !session.token) {
      setFeedback(accountDeleteFeedback, "Sign in first to manage account deletion.", "error");
      return;
    }

    const email = accountDeleteEmail ? accountDeleteEmail.value.trim() : "";
    const confirmation = accountDeleteConfirmation ? accountDeleteConfirmation.value.trim() : "";
    if (!email || !confirmation) {
      setFeedback(accountDeleteFeedback, "Enter your email and the exact confirmation phrase before deleting the account.", "error");
      return;
    }

    const confirmed = window.confirm("This will delete the hosted OmnyID account, hosted runtime, and server-side Agent-ID-scoped history for this account. Continue?");
    if (!confirmed) {
      return;
    }

    setFeedback(accountDeleteFeedback, "Deleting hosted account data...", "neutral");
    try {
      const payload = await apiFetch("/dashboard/account/delete", {
        method: "POST",
        body: {
          email,
          confirmation
        }
      });
      currentRuntimeDeployment = null;
      currentOnboarding = null;
      currentOnboardingBundle = null;
      currentSupportAccess = null;
      currentSupportAccessHistory = [];
      currentRuntimeBackups = null;
      currentRuntimeRestoreDrills = null;
      writeSession(null);
      if (agentConsole) {
        agentConsole.classList.add("hidden");
        agentConsole.style.display = "none";
      }
      if (sessionSummary) {
        sessionSummary.textContent = "Hosted account deleted.";
      }
      setFeedback(accountDeleteFeedback, payload.message || "Hosted account data deleted.", "success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setFeedback(accountDeleteFeedback, error.message, "error");
    }
  }

  // The preview sign-in/register popup that used to live in #auth-modal on this
  // page is commented out — "Offload my stress" and every other data-open-auth
  // trigger now go straight to the real sign-in form in the /workspace/ app,
  // the same way the wedding site's CTAs already link to
  // "../workspace/?auth=signin&source=wedding" instead of this page's modal.
  function redirectToActualSignIn(event) {
    const trigger = event && event.currentTarget ? event.currentTarget : null;
    const mode = trigger && trigger.dataset && trigger.dataset.authMode === "advanced-agent-id"
      ? "agent-id"
      : "signin";
    window.location.href = "/workspace/?auth=" + mode + "&source=marketing";
  }
  document.querySelectorAll("[data-open-auth]").forEach((button) => {
    button.addEventListener("click", redirectToActualSignIn);
  });
  document.querySelectorAll("[data-select-privacy-mode]").forEach((button) => {
    button.addEventListener("click", function () {
      selectedPrivacyMode = button.dataset.selectPrivacyMode || "local_private";
      selectedDeploymentTarget = suggestedDeploymentTarget(selectedPrivacyMode);
      renderSelectedPrivacyMode();
    });
  });
  document.querySelectorAll("[data-close-auth]").forEach((button) => {
    button.addEventListener("click", closeAuthModal);
  });

  const registerForm = document.getElementById("register-form");
  const loginForm = document.getElementById("login-form");
  const forgotPasswordForm = document.getElementById("forgot-password-form");
  const forgotPasswordLink = document.getElementById("forgot-password-link");
  const backToSignInLink = document.getElementById("back-to-sign-in-link");
  const resetPasswordForm = document.getElementById("reset-password-form");
  const demoSendForm = document.getElementById("demo-send-form");
  const waitlistForm = document.getElementById("waitlist-form");
  const signOutButton = document.getElementById("sign-out-button");
  const refreshButton = document.getElementById("refresh-dashboard");

  if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
  }
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", showForgotPasswordForm);
  }
  if (backToSignInLink) {
    backToSignInLink.addEventListener("click", showLoginForm);
  }
  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", handleForgotPassword);
  }
  if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", handleResetPassword);
  }
  openResetPasswordFromUrl();
  if (setupForm) {
    setupForm.addEventListener("submit", handleSetup);
  }
  if (supportAccessForm) {
    supportAccessForm.addEventListener("submit", handleSupportAccess);
  }
  if (supportAccessRevokeButton) {
    supportAccessRevokeButton.addEventListener("click", handleSupportAccessRevoke);
  }
  if (accountDeleteForm) {
    accountDeleteForm.addEventListener("submit", handleAccountDelete);
  }
  if (setupPrivacyMode) {
    setupPrivacyMode.addEventListener("change", function () {
      selectedPrivacyMode = setupPrivacyMode.value;
      renderSelectedPrivacyMode();
    });
  }
  if (setupDeploymentTarget) {
    setupDeploymentTarget.addEventListener("change", function () {
      selectedDeploymentTarget = setupDeploymentTarget.value;
    });
  }
  if (demoSendForm) {
    demoSendForm.addEventListener("submit", handleDemoSend);
  }
  if (waitlistForm) {
    waitlistForm.addEventListener("submit", handleWaitlist);
  }
  const continueAsGuestButton = document.getElementById("continue-as-guest-button");
  if (continueAsGuestButton) {
    continueAsGuestButton.addEventListener("click", handleGuestAccess);
  }
  if (signOutButton) {
    signOutButton.addEventListener("click", handleSignOut);
  }
  if (exportDashboardButton) {
    exportDashboardButton.addEventListener("click", handleDashboardExport);
  }
  if (refreshButton) {
    refreshButton.addEventListener("click", loadDashboard);
  }
  if (deployRuntimeButton) {
    deployRuntimeButton.addEventListener("click", handleDeployRuntime);
  }
  if (deployOpenClawButton) {
    deployOpenClawButton.addEventListener("click", handleDeployOpenClaw);
  }
  if (deployPythonRunnerButton) {
    deployPythonRunnerButton.addEventListener("click", handleDeployPythonRunner);
  }
  if (downloadServiceAdapterBundleButton) {
    downloadServiceAdapterBundleButton.addEventListener("click", handleDownloadServiceAdapterBundle);
  }
  if (deviceBootstrapDesktopButton) {
    deviceBootstrapDesktopButton.addEventListener("click", function () {
      handleDeviceBootstrapDownload("desktop");
    });
  }
  if (deviceBootstrapMobileButton) {
    deviceBootstrapMobileButton.addEventListener("click", function () {
      handleDeviceBootstrapDownload("mobile");
    });
  }
  if (deviceBootstrapWatchButton) {
    deviceBootstrapWatchButton.addEventListener("click", function () {
      handleDeviceBootstrapDownload("watch");
    });
  }
  if (runtimeStartButton) {
    runtimeStartButton.addEventListener("click", function () {
      handleRuntimeAction("start");
    });
  }
  if (runtimeStopButton) {
    runtimeStopButton.addEventListener("click", function () {
      handleRuntimeAction("stop");
    });
  }
  if (runtimeRestartButton) {
    runtimeRestartButton.addEventListener("click", function () {
      handleRuntimeAction("restart");
    });
  }
  if (runtimeDestroyButton) {
    runtimeDestroyButton.addEventListener("click", handleRuntimeDestroy);
  }
  if (runtimeRefreshLogsButton) {
    runtimeRefreshLogsButton.addEventListener("click", function () {
      loadRuntimeLogs();
    });
  }
  if (runtimeRunnerConfigRefreshButton) {
    runtimeRunnerConfigRefreshButton.addEventListener("click", loadRunnerConfig);
  }
  if (runtimeRunnerConfigSaveButton) {
    runtimeRunnerConfigSaveButton.addEventListener("click", handleRunnerConfigSave);
  }
  if (runtimeBackupSavePolicyButton) {
    runtimeBackupSavePolicyButton.addEventListener("click", handleRuntimeBackupPolicySave);
  }
  if (runtimeRecoveryPacketButton) {
    runtimeRecoveryPacketButton.addEventListener("click", handleRuntimeRecoveryPacketDownload);
  }
  if (runtimeBackupSnapshotButton) {
    runtimeBackupSnapshotButton.addEventListener("click", handleRuntimeBackupSnapshot);
  }
  if (runtimeUpdateSavePolicyButton) {
    runtimeUpdateSavePolicyButton.addEventListener("click", handleRuntimeUpdatePolicySave);
  }
  if (runtimeUpdateCheckButton) {
    runtimeUpdateCheckButton.addEventListener("click", handleRuntimeUpdateCheck);
  }
  if (runtimeUpdateApplyButton) {
    runtimeUpdateApplyButton.addEventListener("click", handleRuntimeUpdateApply);
  }
  if (downloadOnboardingBundleButton) {
    downloadOnboardingBundleButton.addEventListener("click", handleDownloadOnboardingBundle);
  }
  if (copyOnboardingCommandButton) {
    copyOnboardingCommandButton.addEventListener("click", handleCopyOnboardingCommand);
  }
  if (trialChatForm) {
    trialChatForm.addEventListener("submit", handleTrialChatSubmit);
  }
  if (trialConvertButton) {
    trialConvertButton.addEventListener("click", handleTrialConvert);
  }
  if (trialTemplateButtons.length) {
    trialTemplateButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        const templateId = button.dataset.trialTemplate;
        if (!templateId) {
          return;
        }
        handleTrialTemplateSelect(templateId).catch(function (error) {
          setTrialFeedback(error.message, "error");
        });
      });
    });
  }
  if (trialSampleSourceButtons.length) {
    trialSampleSourceButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        const sourceKind = button.dataset.trialSampleSource || "lecture";
        handleTrialSampleSource(sourceKind);
      });
    });
  }
  if (authModal) {
    authModal.addEventListener("click", function (event) {
      if (event.target === authModal) {
        closeAuthModal();
      }
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && authModal && !authModal.classList.contains("hidden")) {
      closeAuthModal();
    }
  });

  async function maybeInitGoogle() {
    if (!window.google || !window.google.accounts || googleInitialized) {
      return;
    }
    const clientId = await loadGoogleAuthConfig();
    if (!clientId) {
      return;
    }
    googleInitialized = true;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
      ux_mode: "popup"
    });
    const googleButton = document.getElementById("google-signin-button");
    if (googleButton) {
      window.google.accounts.id.renderButton(googleButton, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 320
      });
    }
  }

  window.addEventListener("load", function () {
    maybeInitGoogle();
    renderAuthMode();
    renderTrialSession(null);
    if (session && session.token) {
      loadDashboard().catch((error) => {
        writeSession(null);
        setFeedback(authFeedback, error.message, "error");
      });
    }
  });
})();
