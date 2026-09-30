const creditStorageKey = "qrs-flasher-demo-credits-v1";
const topupForm = document.querySelector("#topup-form");
const ownerAdjustmentForm = document.querySelector("#owner-adjustment-form");
const clientBalance = document.querySelector("#client-credit-balance");
const ownerBalance = document.querySelector("#owner-credit-balance");
const ownerPendingCount = document.querySelector("#owner-pending-count");
const ownerApprovedCount = document.querySelector("#owner-approved-count");
const clientRequestList = document.querySelector("#client-request-list");
const ownerRequestList = document.querySelector("#owner-request-list");
const clientRequestCount = document.querySelector("#client-request-count");
const ownerRequestCount = document.querySelector("#owner-request-count");
const clientFeedback = document.querySelector("#client-feedback");
const ownerFeedback = document.querySelector("#owner-feedback");
const ownerLoginForm = document.querySelector("#owner-login-form");
const ownerLoginPanel = document.querySelector("#owner-login-panel");
const ownerLoginFeedback = document.querySelector("#owner-login-feedback");
const ownerDashboard = document.querySelector("#owner-dashboard");
const ownerLogoutButton = document.querySelector("#owner-logout-button");

const packages = {
  "one-credit": { label: "1 credit", credits: 1, price: 200, unlimited: false },
  "five-credits": { label: "5 credits", credits: 5, price: 700, unlimited: false },
  unlimited: { label: "Unlimited lifetime", credits: 0, price: 5_000, unlimited: true },
};
const ownerSessionKey = "qrs-owner-demo-session-v1";
const ownerPasswordDigest = "7e071fd9b023ed8f18458a73613a0834f6220bd5cc50357ba3493c6040a9ea8c";

let creditState = { balance: 0, unlimited: false, requests: [] };
let creditStorageReady = true;

function isCreditState(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Number.isSafeInteger(value.balance) &&
    value.balance >= 0 &&
    value.balance <= 100_000 &&
    Array.isArray(value.requests) &&
    value.requests.every(
      (request) =>
        request !== null &&
        typeof request === "object" &&
        typeof request.id === "string" &&
        (request.unlimited === true
          ? request.credits === 0
          : Number.isSafeInteger(request.credits) && request.credits > 0 && request.credits <= 10_000) &&
        ["GCash", "Palawan Pay", "GoTyme Bank", "PayMaya", "USDT"].includes(request.method) &&
        typeof request.reference === "string" &&
        ["pending", "approved", "rejected"].includes(request.status) &&
        typeof request.submittedAt === "string",
    )
  );
}

function showFeedback(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.hidden = false;
}

function makeEmptyRequestsMessage() {
  const message = document.createElement("p");
  message.className = "empty-requests";
  message.textContent = "No top-up requests yet.";
  return message;
}

function createRequestCard(request, isOwnerPage) {
  const card = document.createElement("article");
  card.className = "request-card";

  const details = document.createElement("div");
  details.className = "request-details";
  const title = document.createElement("strong");
  const packageLabel = request.packageId && packages[request.packageId]
    ? packages[request.packageId].label
    : `${request.credits} credits`;
  const methodLabel = request.method === "USDT" ? "USDT (legacy request)" : request.method;
  title.textContent = `${packageLabel} · ₱${Number(request.price || 0).toLocaleString()} · ${methodLabel}`;
  const reference = document.createElement("span");
  reference.textContent = `Reference: ${request.reference}`;
  const submitted = document.createElement("span");
  submitted.textContent = `Submitted: ${new Date(request.submittedAt).toLocaleString()}`;
  const status = document.createElement("span");
  status.className = `request-status ${request.status}`;
  status.textContent = request.status.toUpperCase();
  details.append(title, reference, submitted, status);
  card.append(details);

  if (isOwnerPage && request.status === "pending") {
    const actions = document.createElement("div");
    actions.className = "request-actions";
    const approve = document.createElement("button");
    approve.className = "button button-connect";
    approve.type = "button";
    approve.textContent = "APPROVE";
    approve.disabled = !creditStorageReady;
    approve.addEventListener("click", () => updatePaymentRequest(request.id, "approved"));
    const reject = document.createElement("button");
    reject.className = "button reject-request";
    reject.type = "button";
    reject.textContent = "REJECT";
    reject.disabled = !creditStorageReady;
    reject.addEventListener("click", () => updatePaymentRequest(request.id, "rejected"));
    actions.append(approve, reject);
    card.append(actions);
  }

  return card;
}

function renderCreditDashboard() {
  const pendingCount = creditState.requests.filter((request) => request.status === "pending").length;
  const approvedCount = creditState.requests.filter((request) => request.status === "approved").length;
  const newestFirst = [...creditState.requests].reverse();
  const requestList = clientRequestList || ownerRequestList;
  const feedback = clientFeedback || ownerFeedback;

  if (clientBalance) clientBalance.textContent = creditState.unlimited ? "UNLIMITED" : String(creditState.balance);
  if (ownerBalance) ownerBalance.textContent = creditState.unlimited ? "UNLIMITED" : String(creditState.balance);
  if (ownerPendingCount) ownerPendingCount.textContent = String(pendingCount);
  if (ownerApprovedCount) ownerApprovedCount.textContent = String(approvedCount);
  if (clientRequestCount) {
    clientRequestCount.textContent = `${newestFirst.length} ${newestFirst.length === 1 ? "REQUEST" : "REQUESTS"}`;
  }
  if (ownerRequestCount) ownerRequestCount.textContent = `${pendingCount} PENDING`;

  requestList.replaceChildren();
  if (newestFirst.length === 0) {
    requestList.append(makeEmptyRequestsMessage());
  } else {
    newestFirst.forEach((request) => {
      requestList.append(createRequestCard(request, Boolean(ownerRequestList)));
    });
  }

  const submitButton = topupForm?.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = !creditStorageReady;
  const adjustmentButton = ownerAdjustmentForm?.querySelector('button[type="submit"]');
  if (adjustmentButton) adjustmentButton.disabled = !creditStorageReady;
  if (!creditStorageReady) {
    showFeedback(
      feedback,
      "Demo credit storage is unavailable. Changes are disabled; no credit updates were saved.",
      true,
    );
  }
}

function saveCreditState(nextState) {
  if (!creditStorageReady) {
    throw new Error("Demo storage is unavailable. Credit changes have been disabled.");
  }
  try {
    localStorage.setItem(creditStorageKey, JSON.stringify(nextState));
  } catch (error) {
    creditStorageReady = false;
    renderCreditDashboard();
    throw new Error(`Could not save demo credit data: ${error.message}`);
  }
  creditState = nextState;
  renderCreditDashboard();
}

function loadCreditState() {
  try {
    const savedState = localStorage.getItem(creditStorageKey);
    if (savedState === null) {
      creditState = { balance: 0, unlimited: false, requests: [] };
    } else {
      const parsedState = JSON.parse(savedState);
      if (!isCreditState(parsedState)) {
        throw new Error("Saved demo credit data is invalid. Clear this site's local storage to restart the demo.");
      }
      creditState = { ...parsedState, unlimited: parsedState.unlimited === true };
    }
  } catch (error) {
    creditStorageReady = false;
    const feedback = clientFeedback || ownerFeedback;
    showFeedback(feedback, error.message, true);
  }
  renderCreditDashboard();
}

function updatePaymentRequest(requestId, status) {
  const request = creditState.requests.find((item) => item.id === requestId);
  if (!request || request.status !== "pending") {
    showFeedback(ownerFeedback, "This request is no longer pending.", true);
    return;
  }

  const nextBalance = status === "approved" ? creditState.balance + request.credits : creditState.balance;
  if (nextBalance > 100_000) {
    showFeedback(ownerFeedback, "Approving this request would exceed the 100,000-credit demo limit.", true);
    return;
  }

  const nextState = {
    ...creditState,
    balance: request.unlimited === true ? creditState.balance : nextBalance,
    unlimited: creditState.unlimited || request.unlimited === true,
    requests: creditState.requests.map((item) =>
      item.id === requestId ? { ...item, status } : item,
    ),
  };
  try {
    saveCreditState(nextState);
    showFeedback(
      ownerFeedback,
      status === "approved"
        ? request.unlimited === true
          ? "Demo unlimited lifetime package approved."
          : `Demo request approved; ${request.credits} credits added to the demo client balance.`
        : "Demo request rejected. No credits were added.",
    );
  } catch (error) {
    showFeedback(ownerFeedback, error.message, true);
  }
}

if (topupForm) {
  topupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const packageId = document.querySelector("#topup-package").value;
    const selectedPackage = packages[packageId];
    const method = document.querySelector("#payment-method").value;
    const reference = document.querySelector("#payment-reference").value.trim();
    if (
      !selectedPackage ||
      !["GCash", "Palawan Pay", "GoTyme Bank", "PayMaya"].includes(method) ||
      reference.length === 0
    ) {
      showFeedback(clientFeedback, "Choose a listed payment method and enter a demo payment reference.", true);
      return;
    }

    const request = {
      id: `TOP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      packageId,
      credits: selectedPackage.credits,
      unlimited: selectedPackage.unlimited,
      price: selectedPackage.price,
      method,
      reference,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };
    try {
      saveCreditState({ ...creditState, requests: [...creditState.requests, request] });
      topupForm.reset();
      showFeedback(clientFeedback, "Demo request submitted and waiting for owner review. No payment was processed.");
    } catch (error) {
      showFeedback(clientFeedback, error.message, true);
    }
  });
}

if (ownerAdjustmentForm) {
  ownerAdjustmentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const adjustment = Number(document.querySelector("#owner-credit-adjustment").value);
    const note = document.querySelector("#owner-adjustment-note").value.trim();
    if (!Number.isSafeInteger(adjustment) || adjustment === 0 || Math.abs(adjustment) > 10_000) {
      showFeedback(ownerFeedback, "Enter a non-zero whole number between -10,000 and 10,000.", true);
      return;
    }
    const nextBalance = creditState.balance + adjustment;
    if (nextBalance < 0 || nextBalance > 100_000) {
      showFeedback(ownerFeedback, "The adjustment must keep the demo balance between 0 and 100,000 credits.", true);
      return;
    }
    if (!note) {
      showFeedback(ownerFeedback, "Enter a note explaining the adjustment.", true);
      return;
    }

    try {
      saveCreditState({ ...creditState, balance: nextBalance });
      ownerAdjustmentForm.reset();
      showFeedback(ownerFeedback, `${adjustment > 0 ? "Added" : "Removed"} ${Math.abs(adjustment)} demo credits. Note: ${note}`);
    } catch (error) {
      showFeedback(ownerFeedback, error.message, true);
    }
  });
}

window.addEventListener("storage", (event) => {
  if (event.key === creditStorageKey) loadCreditState();
});

function setOwnerUnlocked(unlocked) {
  if (!ownerDashboard || !ownerLoginPanel) return;
  ownerDashboard.hidden = !unlocked;
  ownerLoginPanel.hidden = unlocked;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

if (ownerLoginForm) {
  try {
    setOwnerUnlocked(sessionStorage.getItem(ownerSessionKey) === "unlocked");
  } catch (error) {
    showFeedback(ownerLoginFeedback, `Could not read the owner session: ${error.message}`, true);
  }

  ownerLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.querySelector("#owner-password").value;
    try {
      if (!globalThis.crypto?.subtle) {
        throw new Error("Secure password hashing is unavailable in this browser context.");
      }
      const digest = bytesToHex(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password)),
        ),
      );
      if (digest !== ownerPasswordDigest) {
        showFeedback(ownerLoginFeedback, "Incorrect password.", true);
        return;
      }
      sessionStorage.setItem(ownerSessionKey, "unlocked");
      setOwnerUnlocked(true);
      ownerLoginForm.reset();
    } catch (error) {
      showFeedback(ownerLoginFeedback, error.message, true);
    }
  });
}

if (ownerLogoutButton) {
  ownerLogoutButton.addEventListener("click", () => {
    try {
      sessionStorage.removeItem(ownerSessionKey);
      setOwnerUnlocked(false);
    } catch (error) {
      showFeedback(ownerFeedback, `Could not lock the owner dashboard: ${error.message}`, true);
    }
  });
}

export function getFlashCreditStatus() {
  let latestState = { balance: 0, unlimited: false, requests: [] };
  try {
    const savedState = localStorage.getItem(creditStorageKey);
    if (savedState !== null) {
      const parsedState = JSON.parse(savedState);
      if (!isCreditState(parsedState)) {
        throw new Error("Saved demo credit data is invalid. Cannot verify flash credits.");
      }
      latestState = { ...parsedState, unlimited: parsedState.unlimited === true };
    }
  } catch (error) {
    throw new Error(`Could not verify demo credits: ${error.message}`);
  }
  creditState = latestState;
  renderCreditDashboard();
  return {
    unlimited: latestState.unlimited,
    balance: latestState.balance,
    canFlash: latestState.unlimited || latestState.balance > 0,
  };
}

export function consumeFlashCredit() {
  const status = getFlashCreditStatus();
  if (status.unlimited) return status;
  if (status.balance < 1) {
    throw new Error("No credits remain. Submit a top-up request before flashing again.");
  }
  saveCreditState({ ...creditState, balance: creditState.balance - 1 });
  return getFlashCreditStatus();
}

loadCreditState();
