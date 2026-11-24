const cleanFeedToggle = document.getElementById("cleanFeedToggle");
const hideStoriesToggle = document.getElementById("hideStoriesToggle");
const blockMessengerToggle = document.getElementById("blockMessengerToggle");

const messengerDuration = document.getElementById("messengerDuration");
const messengerCustomRow = document.getElementById("messengerCustomRow");
const messengerCustomValue = document.getElementById("messengerCustomValue");
const messengerCustomUnit = document.getElementById("messengerCustomUnit");
const applyMessengerTimerBtn = document.getElementById("applyMessengerTimerBtn");
const messengerLimitMsg = document.getElementById("messengerLimitMsg");
const messengerTimerBanner = document.getElementById("messengerTimerBanner");
const messengerRemainingEl = document.getElementById("messengerRemaining");

const focusDuration = document.getElementById("focusDuration");
const customTimeRow = document.getElementById("customTimeRow");
const customTimeValue = document.getElementById("customTimeValue");
const customTimeUnit = document.getElementById("customTimeUnit");
const startStrictBtn = document.getElementById("startStrictBtn");
const timerBanner = document.getElementById("timerBanner");
const remainingTimeEl = document.getElementById("remainingTime");

const MAX_MESSENGER_MINUTES = 180; // 3 hours max

let countdownInterval = null;
let currentState = {
  cleanFeedMode: false,
  hideStories: true,
  blockMessenger: false,
  messengerBlockEndTime: 0,
  focusEndTime: 0
};

function isStrictActive() {
  return typeof currentState.focusEndTime === "number" && currentState.focusEndTime > Date.now();
}

function isMessengerTimerActive() {
  return (
    typeof currentState.messengerBlockEndTime === "number" &&
    currentState.messengerBlockEndTime > Date.now()
  );
}

function isMessengerBlockedNow() {
  return Boolean(currentState.blockMessenger) || isMessengerTimerActive();
}

function setToggleVisual(btn, isOn) {
  btn.classList.toggle("active", Boolean(isOn));
  btn.setAttribute("aria-pressed", String(Boolean(isOn)));
  btn.textContent = isOn ? "ON" : "OFF";
}

function formatRemaining(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

function toggleCustomTimeRow() {
  customTimeRow.style.display = focusDuration.value === "custom" ? "flex" : "none";
}

function toggleMessengerCustomRow() {
  messengerCustomRow.style.display = messengerDuration.value === "custom" ? "flex" : "none";
  messengerLimitMsg.style.display = "none";
}

function getMessengerDurationMinutes() {
  const val = messengerDuration.value;
  if (val === "0") return 0;

  let mins = 0;
  if (val !== "custom") {
    mins = parseInt(val, 10) || 0;
  } else {
    const rawNum = parseFloat(messengerCustomValue.value);
    if (!Number.isFinite(rawNum) || rawNum <= 0) {
      return -1;
    }
    mins = messengerCustomUnit.value === "hours" ? rawNum * 60 : rawNum;
  }

  if (mins > MAX_MESSENGER_MINUTES) {
    messengerLimitMsg.style.display = "block";
    return -1;
  }

  messengerLimitMsg.style.display = "none";
  return Math.max(1, Math.round(mins));
}

function updateTimersAndLockUI() {
  const strictLocked = isStrictActive();
  const messengerTimerOn = isMessengerTimerActive();

  cleanFeedToggle.disabled = strictLocked;
  hideStoriesToggle.disabled = strictLocked;
  blockMessengerToggle.disabled = strictLocked;
  messengerDuration.disabled = strictLocked;
  messengerCustomValue.disabled = strictLocked;
  messengerCustomUnit.disabled = strictLocked;
  applyMessengerTimerBtn.disabled = strictLocked;
  focusDuration.disabled = strictLocked;
  customTimeValue.disabled = strictLocked;
  customTimeUnit.disabled = strictLocked;
  startStrictBtn.disabled = strictLocked;

  setToggleVisual(cleanFeedToggle, currentState.cleanFeedMode);
  setToggleVisual(hideStoriesToggle, currentState.hideStories);
  setToggleVisual(blockMessengerToggle, isMessengerBlockedNow());

  if (strictLocked) {
    timerBanner.style.display = "block";
    startStrictBtn.textContent = "Strict ON";
    startStrictBtn.classList.add("locked-active");
  } else {
    timerBanner.style.display = "none";
    startStrictBtn.textContent = "Strict Mode";
    startStrictBtn.classList.remove("locked-active");
  }

  if (messengerTimerOn) {
    messengerTimerBanner.style.display = "block";
  } else {
    messengerTimerBanner.style.display = "none";
  }

  clearInterval(countdownInterval);

  const tick = () => {
    const now = Date.now();
    let anyExpired = false;

    if (currentState.focusEndTime > 0) {
      const leftStrict = currentState.focusEndTime - now;
      if (leftStrict <= 0) {
        currentState.focusEndTime = 0;
        anyExpired = true;
      } else if (strictLocked) {
        remainingTimeEl.textContent = formatRemaining(leftStrict);
      }
    }

    if (currentState.messengerBlockEndTime > 0) {
      const leftMsg = currentState.messengerBlockEndTime - now;
      if (leftMsg <= 0) {
        currentState.messengerBlockEndTime = 0;
        currentState.blockMessenger = false;
        anyExpired = true;
      } else {
        messengerRemainingEl.textContent = formatRemaining(leftMsg);
      }
    }

    if (anyExpired) {
      chrome.storage.local.set(
        {
          focusEndTime: currentState.focusEndTime,
          messengerBlockEndTime: currentState.messengerBlockEndTime,
          blockMessenger: currentState.blockMessenger
        },
        updateTimersAndLockUI
      );
    }
  };

  tick();
  countdownInterval = setInterval(tick, 1000);
}

function loadState() {
  chrome.storage.local.get(
    {
      cleanFeedMode: false,
      hideStories: true,
      blockMessenger: false,
      messengerBlockEndTime: 0,
      focusEndTime: 0
    },
    (data) => {
      currentState = { ...data };

      if (isStrictActive()) {
        currentState.cleanFeedMode = true;
        currentState.hideStories = true;
        chrome.storage.local.set({
          cleanFeedMode: true,
          hideStories: true
        });
      }

      if (isMessengerTimerActive()) {
        currentState.blockMessenger = true;
        chrome.storage.local.set({ blockMessenger: true });
      }

      toggleCustomTimeRow();
      toggleMessengerCustomRow();
      updateTimersAndLockUI();
    }
  );
}

cleanFeedToggle.addEventListener("click", () => {
  if (isStrictActive()) return;
  currentState.cleanFeedMode = !currentState.cleanFeedMode;
  setToggleVisual(cleanFeedToggle, currentState.cleanFeedMode);
  chrome.storage.local.set({ cleanFeedMode: currentState.cleanFeedMode });
});

hideStoriesToggle.addEventListener("click", () => {
  if (isStrictActive()) return;
  currentState.hideStories = !currentState.hideStories;
  setToggleVisual(hideStoriesToggle, currentState.hideStories);
  chrome.storage.local.set({ hideStories: currentState.hideStories });
});

blockMessengerToggle.addEventListener("click", () => {
  if (isStrictActive()) return;
  const nextVal = !isMessengerBlockedNow();
  currentState.blockMessenger = nextVal;
  if (!nextVal) {
    currentState.messengerBlockEndTime = 0;
  }
  setToggleVisual(blockMessengerToggle, nextVal);
  chrome.storage.local.set(
    {
      blockMessenger: currentState.blockMessenger,
      messengerBlockEndTime: currentState.messengerBlockEndTime
    },
    updateTimersAndLockUI
  );
});

messengerDuration.addEventListener("change", toggleMessengerCustomRow);

applyMessengerTimerBtn.addEventListener("click", () => {
  if (isStrictActive()) return;
  const mins = getMessengerDurationMinutes();
  if (mins < 0) {
    messengerCustomValue.focus();
    return;
  }

  if (mins === 0) {
    currentState.messengerBlockEndTime = 0;
    chrome.storage.local.set({ messengerBlockEndTime: 0 }, updateTimersAndLockUI);
    return;
  }

  const endTime = Date.now() + mins * 60 * 1000;
  currentState.blockMessenger = true;
  currentState.messengerBlockEndTime = endTime;

  chrome.storage.local.set(
    {
      blockMessenger: true,
      messengerBlockEndTime: endTime
    },
    updateTimersAndLockUI
  );
});

messengerCustomValue.addEventListener("keypress", (e) => {
  if (e.key === "Enter") applyMessengerTimerBtn.click();
});

focusDuration.addEventListener("change", toggleCustomTimeRow);

function getSelectedDurationMinutes() {
  if (focusDuration.value !== "custom") {
    return parseInt(focusDuration.value, 10);
  }

  const rawNum = parseFloat(customTimeValue.value);
  if (!Number.isFinite(rawNum) || rawNum <= 0) {
    return null;
  }

  const minutes = customTimeUnit.value === "hours" ? rawNum * 60 : rawNum;
  return Math.max(1, Math.round(minutes));
}

startStrictBtn.addEventListener("click", () => {
  if (isStrictActive()) return;

  const minutes = getSelectedDurationMinutes();
  if (!minutes) {
    customTimeValue.focus();
    return;
  }

  const endTime = Date.now() + minutes * 60 * 1000;
  currentState.focusEndTime = endTime;
  currentState.cleanFeedMode = true;
  currentState.hideStories = true;

  chrome.storage.local.set(
    {
      focusEndTime: endTime,
      cleanFeedMode: true,
      hideStories: true
    },
    updateTimersAndLockUI
  );
});

customTimeValue.addEventListener("keypress", (e) => {
  if (e.key === "Enter") startStrictBtn.click();
});

document.addEventListener("DOMContentLoaded", loadState);


// ---------------------------------------------------------------
// Interactive lamp: pull the cord to switch the light on/off.
// Light ON  -> settings panel is revealed.
// Light OFF -> settings panel is hidden again.
// ---------------------------------------------------------------
(function lampInit() {
  const grab = document.getElementById("cordGrab");
  const line = document.getElementById("cordLine");
  const bead = document.getElementById("cordBead");
  const panel = document.getElementById("panel");
  const hint = document.getElementById("lampHint");

  const CORD_END = 96; // resting y of the cord end
  const PULL_TRIGGER = 14; // px you must pull down to toggle
  let on = false;
  let dy = 0;
  let startY = 0;
  let dragging = false;
  let travelled = 0;
  let raf = null;

  function setCord(d) {
    line.setAttribute("y2", String(CORD_END + d));
    bead.setAttribute("cy", String(CORD_END + d + 5));
  }

  function springBack() {
    cancelAnimationFrame(raf);
    let v = 0;
    const step = () => {
      v = (v + -dy * 0.28) * 0.72;
      dy += v;
      setCord(dy);
      if (Math.abs(dy) > 0.25 || Math.abs(v) > 0.25) {
        raf = requestAnimationFrame(step);
      } else {
        dy = 0;
        setCord(0);
      }
    };
    raf = requestAnimationFrame(step);
  }

  function setLamp(next) {
    on = next;
    document.body.classList.toggle("lamp-on", on);
    panel.inert = !on;
    hint.textContent = on
      ? "Pull again to turn off the light"
      : "Pull the cord to turn on the light";
    document.body.classList.remove("flicker");
    void document.body.offsetWidth;
    if (on) document.body.classList.add("flicker");
  }

  grab.addEventListener("pointerdown", (e) => {
    dragging = true;
    travelled = 0;
    startY = e.clientY;
    cancelAnimationFrame(raf);
    grab.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  grab.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const raw = e.clientY - startY;
    travelled = Math.max(travelled, Math.abs(raw));
    dy = Math.max(0, Math.min(34, raw));
    setCord(dy);
  });

  function release() {
    if (!dragging) return;
    dragging = false;
    const pulled = dy >= PULL_TRIGGER || travelled < 4; // pull OR simple tap
    if (pulled) setLamp(!on);
    springBack();
  }
  grab.addEventListener("pointerup", release);
  grab.addEventListener("pointercancel", release);

  grab.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      dy = 22;
      setCord(dy);
      setLamp(!on);
      springBack();
    }
  });
})();


// Tiny floating lights (nur) inside the light beam
(function spawnMotes() {
  const g = document.getElementById("motes");
  if (!g) return;
  const NS = "http://www.w3.org/2000/svg";
  for (let i = 0; i < 24; i++) {
    const y = 52 + Math.random() * 94;
    const left = 18 - ((y - 41) * 53) / 109;
    const right = 72 + ((y - 41) * 53) / 109;
    const x = left + Math.random() * (right - left);
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("class", "mote");
    c.setAttribute("cx", x.toFixed(1));
    c.setAttribute("cy", y.toFixed(1));
    c.setAttribute("r", (0.8 + Math.random() * 1.5).toFixed(2));
    c.style.setProperty("--d", (3 + Math.random() * 3.5).toFixed(1) + "s");
    c.style.setProperty("--delay", (-Math.random() * 5).toFixed(1) + "s");
    c.style.setProperty("--dx", (Math.random() * 10 - 5).toFixed(1) + "px");
    g.appendChild(c);
  }
})();
