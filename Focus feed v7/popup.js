const cleanFeedToggle = document.getElementById("cleanFeedToggle");
const hideStoriesToggle = document.getElementById("hideStoriesToggle");
const focusDuration = document.getElementById("focusDuration");
const customTimeRow = document.getElementById("customTimeRow");
const customTimeValue = document.getElementById("customTimeValue");
const customTimeUnit = document.getElementById("customTimeUnit");
const startFocusBtn = document.getElementById("startFocusBtn");
const timerBanner = document.getElementById("timerBanner");
const remainingTimeEl = document.getElementById("remainingTime");

let countdownInterval = null;

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

function updateLockUI(focusEndTime) {
  const now = Date.now();
  const isLocked = typeof focusEndTime === "number" && focusEndTime > now;

  cleanFeedToggle.disabled = isLocked;
  hideStoriesToggle.disabled = isLocked;
  focusDuration.disabled = isLocked;
  customTimeValue.disabled = isLocked;
  customTimeUnit.disabled = isLocked;
  startFocusBtn.disabled = isLocked;

  if (isLocked) {
    timerBanner.style.display = "block";
    startFocusBtn.textContent = "Locked";

    const tick = () => {
      const left = focusEndTime - Date.now();
      if (left <= 0) {
        clearInterval(countdownInterval);
        chrome.storage.local.set({ focusEndTime: 0 }, () => {
          updateLockUI(0);
        });
        return;
      }
      remainingTimeEl.textContent = formatRemaining(left);
    };

    clearInterval(countdownInterval);
    tick();
    countdownInterval = setInterval(tick, 1000);
  } else {
    clearInterval(countdownInterval);
    timerBanner.style.display = "none";
    startFocusBtn.textContent = "Start Focus";
  }
}

function loadState() {
  chrome.storage.local.get(
    {
      cleanFeedMode: true,
      hideStories: true,
      focusEndTime: 0
    },
    (data) => {
      const now = Date.now();
      const activeLock = data.focusEndTime > now;

      const effectiveCleanFeed = activeLock ? true : data.cleanFeedMode;
      const effectiveHideStories = activeLock ? true : data.hideStories;

      cleanFeedToggle.checked = effectiveCleanFeed;
      hideStoriesToggle.checked = effectiveHideStories;

      if (activeLock && (!data.cleanFeedMode || !data.hideStories)) {
        chrome.storage.local.set({
          cleanFeedMode: true,
          hideStories: true
        });
      }

      toggleCustomTimeRow();
      updateLockUI(activeLock ? data.focusEndTime : 0);
    }
  );
}

focusDuration.addEventListener("change", toggleCustomTimeRow);

cleanFeedToggle.addEventListener("change", () => {
  chrome.storage.local.get({ focusEndTime: 0 }, (data) => {
    if (data.focusEndTime > Date.now()) {
      cleanFeedToggle.checked = true;
      return;
    }
    chrome.storage.local.set({ cleanFeedMode: cleanFeedToggle.checked });
  });
});

hideStoriesToggle.addEventListener("change", () => {
  chrome.storage.local.get({ focusEndTime: 0 }, (data) => {
    if (data.focusEndTime > Date.now()) {
      hideStoriesToggle.checked = true;
      return;
    }
    chrome.storage.local.set({ hideStories: hideStoriesToggle.checked });
  });
});

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

startFocusBtn.addEventListener("click", () => {
  chrome.storage.local.get({ focusEndTime: 0 }, (data) => {
    if (data.focusEndTime > Date.now()) return;

    const minutes = getSelectedDurationMinutes();
    if (!minutes) {
      customTimeValue.focus();
      return;
    }

    const endTime = Date.now() + minutes * 60 * 1000;

    chrome.storage.local.set(
      {
        focusEndTime: endTime,
        cleanFeedMode: true,
        hideStories: true
      },
      () => {
        cleanFeedToggle.checked = true;
        hideStoriesToggle.checked = true;
        updateLockUI(endTime);
      }
    );
  });
});

customTimeValue.addEventListener("keypress", (e) => {
  if (e.key === "Enter") startFocusBtn.click();
});

document.addEventListener("DOMContentLoaded", loadState);
